import * as duckdb from '@duckdb/duckdb-wasm';

export interface AnonymizedDisputeRecord {
  paypal_dispute_id: string;
  dispute_reason: string;
  dispute_state: string;
  dispute_amount_cents: number;
  liability_score_l: number;
  abuse_risk_score_r: number;
  exif_tamper_flag: boolean;
  selected_tier_action: string;
  seller_response_due_date: string;
  // NOTE: compiled_evidence_pdf_base64 is deliberately EXCLUDED from the in-browser Arrow schema
  // to avoid WebAssembly linear memory heap exhaustion across high dispute volumes.
}

/**
 * Projects a raw dispute database record or webhook delta into an optimized DuckDB-WASM Arrow row,
 * explicitly stripping heavy binary payloads like compiled_evidence_pdf_base64.
 */
export function projectOptimizedDisputeRecord(rawRecord: any): AnonymizedDisputeRecord {
  return {
    paypal_dispute_id: String(rawRecord.paypal_dispute_id),
    dispute_reason: String(rawRecord.dispute_reason || 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED'),
    dispute_state: String(rawRecord.dispute_state || 'REQUIRED_ACTION'),
    dispute_amount_cents: Number(rawRecord.dispute_amount_cents || 0),
    liability_score_l: Number(rawRecord.liability_score_l || 0),
    abuse_risk_score_r: Number(rawRecord.abuse_risk_score_r || 0),
    exif_tamper_flag: Boolean(rawRecord.exif_tamper_flag),
    selected_tier_action: String(rawRecord.selected_tier_action || 'TIER1_REFUND'),
    seller_response_due_date: String(rawRecord.seller_response_due_date || new Date().toISOString()),
  };
}

/**
 * Helper to assert whether an Arrow/DuckDB record contains bulky PDF base64 blobs.
 */
export function hasPdfBase64Payload(record: any): boolean {
  return 'compiled_evidence_pdf_base64' in record && Boolean(record.compiled_evidence_pdf_base64);
}

/**
 * Loads the heavy compiled forensic PDF dossier on-demand via the dedicated REST endpoint,
 * keeping the WebAssembly linear memory lean and decoupled.
 */
export async function fetchDisputeDossier(disputeId: string, apiBaseUrl = ''): Promise<{
  dispute_id: string;
  compiled_evidence_pdf_base64?: string;
  dossier_url?: string;
  status: string;
}> {
  const url = `${apiBaseUrl}/api/disputes/${encodeURIComponent(disputeId)}/dossier`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch dispute dossier for ${disputeId}: ${res.status}`);
  }
  return await res.json();
}

/**
 * Validates that an incoming query is strictly a read-only SELECT or WITH statement.
 * Rejects non-read-only queries (e.g. INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, ATTACH, COPY).
 */
export function validateReadOnlySelectQuery(query: string): boolean {
  if (!query || typeof query !== 'string') {
    return false;
  }

  // Strip leading SQL comments (-- comment or /* comment */) and whitespace
  const sanitized = query
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  if (!sanitized) {
    return false;
  }

  // Must start with SELECT or WITH (case-insensitive)
  if (!/^(SELECT|WITH)\b/i.test(sanitized)) {
    return false;
  }

  // Prohibit dangerous DDL and mutation statements even within compound statements or CTEs
  const forbiddenKeywords = [
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH|COPY|PRAGMA|EXPORT|LOAD|INSTALL)\b/i,
  ];

  for (const regex of forbiddenKeywords) {
    if (regex.test(sanitized)) {
      return false;
    }
  }

  return true;
}

// Global prepared statement cache mapping normalized query string to compiled prepared statement
const statementCache = new Map<string, duckdb.AsyncPreparedStatement>();

/**
 * Clears the prepared statement cache and closes each prepared statement.
 */
export async function clearStatementCache(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const stmt of statementCache.values()) {
    try {
      closePromises.push(stmt.close().catch(() => {}));
    } catch {
      // ignore close failures
    }
  }
  await Promise.all(closePromises);
  statementCache.clear();
}

/**
 * Returns the current number of cached prepared statements.
 */
export function getStatementCacheSize(): number {
  return statementCache.size;
}

export async function initDuckDbWorker() {
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  return db;
}

/**
 * Executes a read-only query against the in-memory DuckDB ledger.
 * Validates query is read-only SELECT, reuses cached prepared statements for repeated queries,
 * and guarantees connection cleanup in a try ... finally block to prevent connection leaks.
 */
export async function queryAnonymizedFinancialLedger(
  db: duckdb.AsyncDuckDB,
  query: string,
  params: any[] = []
) {
  if (!validateReadOnlySelectQuery(query)) {
    throw new Error('Query rejected: Only read-only SELECT queries are permitted');
  }

  const conn = await db.connect();

  try {
    let stmt = statementCache.get(query);
    if (!stmt) {
      stmt = await conn.prepare(query);
      statementCache.set(query, stmt);
    }

    const result = await stmt.query(...params);
    return result.toArray();
  } finally {
    await conn.close();
  }
}
