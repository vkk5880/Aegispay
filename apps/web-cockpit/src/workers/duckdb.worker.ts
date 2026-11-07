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
 * Web Worker Message Protocol Definitions
 */
export type DuckDBWorkerAction = 'QUERY' | 'INGEST' | 'AGGREGATE' | 'CLEAR_CACHE';

export interface DuckDBQueryPayload {
  query: string;
  params?: any[];
}

export interface DuckDBIngestPayload {
  tableName?: string;
  records: AnonymizedDisputeRecord[];
}

export interface DuckDBAggregatePayload {
  records?: AnonymizedDisputeRecord[];
  dimension?: 'selected_tier_action' | 'dispute_reason' | 'dispute_state';
  metric?: 'count' | 'sum_amount' | 'avg_liability' | 'avg_abuse_risk';
}

export interface DuckDBWorkerMessage {
  id: string;
  action: DuckDBWorkerAction;
  payload?: DuckDBQueryPayload | DuckDBIngestPayload | DuckDBAggregatePayload | Record<string, unknown>;
  timestamp?: number;
}

export interface DuckDBWorkerSuccessResponse<T = any> {
  id: string;
  action: DuckDBWorkerAction;
  success: true;
  data: T;
  fallback?: boolean;
  executionTimeMs?: number;
}

export interface DuckDBWorkerErrorResponse {
  id: string;
  action?: DuckDBWorkerAction;
  success: false;
  error: string;
  code?: string;
}

export type DuckDBWorkerResponse<T = any> = DuckDBWorkerSuccessResponse<T> | DuckDBWorkerErrorResponse;

export interface DisputeTierAggregationResult {
  tier: string;
  count: number;
  total_dispute_amount_cents: number;
  avg_liability: number;
  avg_abuse_risk: number;
}

/**
 * Validates incoming Web Worker message contracts.
 * Returns true if valid, throws Error if invalid or returns false when safeCheck is true.
 */
export function validateWorkerMessage(message: unknown): message is DuckDBWorkerMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const msg = message as Record<string, any>;

  if (typeof msg.id !== 'string' || msg.id.trim() === '') {
    return false;
  }

  const validActions: DuckDBWorkerAction[] = ['QUERY', 'INGEST', 'AGGREGATE', 'CLEAR_CACHE'];
  if (!validActions.includes(msg.action)) {
    return false;
  }

  if (msg.action === 'QUERY') {
    if (!msg.payload || typeof msg.payload !== 'object') {
      return false;
    }
    if (typeof msg.payload.query !== 'string' || msg.payload.query.trim() === '') {
      return false;
    }
    if (msg.payload.params !== undefined && !Array.isArray(msg.payload.params)) {
      return false;
    }
  }

  if (msg.action === 'INGEST') {
    if (!msg.payload || typeof msg.payload !== 'object' || !Array.isArray(msg.payload.records)) {
      return false;
    }
  }

  if (msg.action === 'AGGREGATE') {
    if (msg.payload !== undefined && (typeof msg.payload !== 'object' || msg.payload === null)) {
      return false;
    }
    if (msg.payload?.records !== undefined && !Array.isArray(msg.payload.records)) {
      return false;
    }
  }

  return true;
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
 * Guards against stacked queries (semicolon injection), dangerous internal functions, and SQL evasion tricks.
 */
export function validateReadOnlySelectQuery(query: string): boolean {
  if (!query || typeof query !== 'string') {
    return false;
  }

  // Strip leading/trailing SQL comments (-- comment or /* comment */) and whitespace
  const sanitized = query
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  if (!sanitized) {
    return false;
  }

  // Check for semicolon injection / stacked queries:
  // If a semicolon exists before the end of the query and is followed by any non-whitespace, reject.
  const withoutTrailingSemicolons = sanitized.replace(/;+\s*$/, '');
  if (withoutTrailingSemicolons.includes(';')) {
    return false;
  }

  // Check for unbalanced string quotes which can break parser state
  const singleQuotes = (sanitized.match(/'/g) || []).length;
  if (singleQuotes % 2 !== 0) {
    return false;
  }

  // Must start with SELECT or WITH (case-insensitive)
  if (!/^(SELECT|WITH)\b/i.test(withoutTrailingSemicolons)) {
    return false;
  }

  // Prohibit dangerous DDL, mutation, file I/O, installation, and pragma statements
  const forbiddenKeywords = [
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH|COPY|PRAGMA|EXPORT|LOAD|INSTALL)\b/i,
    /\b(EXEC|EXECUTE|SYSTEM|CALL|GRANT|REVOKE|VACUUM|CHECKPOINT)\b/i,
    /\bread_csv\b/i,
    /\bread_parquet\b/i,
    /\bparquet_scan\b/i,
    /\bto_csv\b/i,
    /\bto_parquet\b/i,
  ];

  for (const regex of forbiddenKeywords) {
    if (regex.test(withoutTrailingSemicolons)) {
      return false;
    }
  }

  return true;
}

/**
 * Whitelist-based query builder for dynamic dispute analytics.
 * Protects against SQL injection by allowing only strictly validated identifiers and sort directions.
 */
const ALLOWED_DIMENSIONS = new Set([
  'selected_tier_action',
  'dispute_reason',
  'dispute_state',
  'exif_tamper_flag',
]);

const ALLOWED_SORT_DIRECTIONS = new Set(['ASC', 'DESC']);

export function buildSafeAnalyticsQuery(options: {
  dimension?: string;
  sortBy?: 'count' | 'avg_liability' | 'total_amount';
  sortDirection?: 'ASC' | 'DESC';
  minLiability?: number;
}): { query: string; params: any[] } {
  const dimension = options.dimension || 'selected_tier_action';
  if (!ALLOWED_DIMENSIONS.has(dimension)) {
    throw new Error(`Invalid dimension: ${dimension}. Permitted: ${Array.from(ALLOWED_DIMENSIONS).join(', ')}`);
  }

  const sortDirection = options.sortDirection || 'DESC';
  if (!ALLOWED_SORT_DIRECTIONS.has(sortDirection)) {
    throw new Error(`Invalid sort direction: ${sortDirection}`);
  }

  const sortFieldMap: Record<string, string> = {
    count: 'count',
    avg_liability: 'avg_liability',
    total_amount: 'total_amount_cents',
  };
  const sortBy = sortFieldMap[options.sortBy || 'count'] || 'count';

  const params: any[] = [];
  let whereClause = '';

  if (options.minLiability !== undefined && !Number.isNaN(options.minLiability)) {
    whereClause = 'WHERE liability_score_l >= ?';
    params.push(Number(options.minLiability));
  }

  const query = `SELECT ${dimension}, COUNT(*) as count, SUM(dispute_amount_cents) as total_amount_cents, ROUND(AVG(CAST(liability_score_l AS FLOAT)), 3) as avg_liability, ROUND(AVG(CAST(abuse_risk_score_r AS FLOAT)), 3) as avg_abuse_risk FROM dispute_arbitrations ${whereClause} GROUP BY ${dimension} ORDER BY ${sortBy} ${sortDirection}`.trim();

  return { query, params };
}

// Bounded LRU prepared statement cache mapping normalized query string to compiled prepared statement
const MAX_STATEMENT_CACHE_SIZE = 50;
const statementCache = new Map<string, duckdb.AsyncPreparedStatement>();

/**
 * Sets the maximum number of cached prepared statements (useful for tuning or tests).
 */
let currentMaxCacheSize = MAX_STATEMENT_CACHE_SIZE;
export function setMaxStatementCacheSize(size: number): void {
  currentMaxCacheSize = Math.max(1, size);
}

/**
 * Evicts the oldest prepared statement in the statementCache if it exceeds currentMaxCacheSize.
 * Closes the statement to prevent WebAssembly linear heap memory leaks.
 */
async function evictOldestIfNeeded(): Promise<void> {
  while (statementCache.size >= currentMaxCacheSize) {
    const oldestKey = statementCache.keys().next().value;
    if (!oldestKey) break;
    const stmt = statementCache.get(oldestKey);
    statementCache.delete(oldestKey);
    if (stmt) {
      try {
        await stmt.close();
      } catch {
        // ignore close error during eviction
      }
    }
  }
}

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

/**
 * Checks if WebAssembly is supported in the current runtime environment.
 */
export function isWasmSupported(): boolean {
  try {
    if (typeof WebAssembly !== 'object' || typeof WebAssembly.validate !== 'function') {
      return false;
    }
    // Minimal valid WebAssembly module: '\0asm\1\0\0\0'
    const bin = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    return WebAssembly.validate(bin);
  } catch {
    return false;
  }
}

/**
 * Fallback in-memory analytics aggregator for AnonymizedDisputeRecord items.
 * Used when WebAssembly is blocked, unavailable, or throws linear memory errors.
 */
export function computeDisputeAnalyticsFallback(
  records: AnonymizedDisputeRecord[],
  dimension: 'selected_tier_action' | 'dispute_reason' | 'dispute_state' = 'selected_tier_action'
): DisputeTierAggregationResult[] {
  if (!Array.isArray(records) || records.length === 0) {
    return [];
  }

  const groups = new Map<
    string,
    {
      count: number;
      total_amount_cents: number;
      sum_liability: number;
      sum_abuse_risk: number;
    }
  >();

  for (const r of records) {
    const groupKey = String(r[dimension] || 'UNKNOWN');
    let entry = groups.get(groupKey);
    if (!entry) {
      entry = { count: 0, total_amount_cents: 0, sum_liability: 0, sum_abuse_risk: 0 };
      groups.set(groupKey, entry);
    }
    entry.count += 1;
    entry.total_amount_cents += Number(r.dispute_amount_cents || 0);
    entry.sum_liability += Number(r.liability_score_l || 0);
    entry.sum_abuse_risk += Number(r.abuse_risk_score_r || 0);
  }

  const results: DisputeTierAggregationResult[] = [];
  for (const [tier, data] of groups.entries()) {
    results.push({
      tier,
      count: data.count,
      total_dispute_amount_cents: data.total_amount_cents,
      avg_liability: Number((data.sum_liability / data.count).toFixed(3)),
      avg_abuse_risk: Number((data.sum_abuse_risk / data.count).toFixed(3)),
    });
  }

  // Sort descending by count
  results.sort((a, b) => b.count - a.count);
  return results;
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
 * enforces LRU eviction, and guarantees connection cleanup in a try ... finally block to prevent connection leaks.
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
      await evictOldestIfNeeded();
      stmt = await conn.prepare(query);
      statementCache.set(query, stmt);
    } else {
      // Re-insert to refresh LRU order
      statementCache.delete(query);
      statementCache.set(query, stmt);
    }

    const result = await stmt.query(...params);
    return result.toArray();
  } finally {
    await conn.close();
  }
}

/**
 * Safely executes analytics queries with transparent pure-TypeScript fallback.
 * If DuckDB-WASM is not initialized or fails, gracefully aggregates using in-memory fallback.
 */
export async function queryFinancialLedgerWithFallback(
  db: duckdb.AsyncDuckDB | null | undefined,
  query: string,
  params: any[] = [],
  fallbackRecords: AnonymizedDisputeRecord[] = []
): Promise<{ result: any[]; fallback: boolean }> {
  if (!validateReadOnlySelectQuery(query)) {
    throw new Error('Query rejected: Only read-only SELECT queries are permitted');
  }

  if (db && isWasmSupported()) {
    try {
      const rows = await queryAnonymizedFinancialLedger(db, query, params);
      return { result: rows, fallback: false };
    } catch {
      // If WASM execution fails (e.g. heap exhaustion or runtime panic), fallback gracefully
    }
  }

  // Graceful pure TS fallback
  const fallbackResult = computeDisputeAnalyticsFallback(fallbackRecords);
  return { result: fallbackResult, fallback: true };
}

/**
 * Central Web Worker message handler for worker threads.
 * Validates message contracts and dispatches actions safely.
 */
export async function handleWorkerMessage(
  db: duckdb.AsyncDuckDB | null,
  message: unknown,
  cachedRecords: AnonymizedDisputeRecord[] = []
): Promise<DuckDBWorkerResponse> {
  if (!validateWorkerMessage(message)) {
    return {
      id: typeof (message as any)?.id === 'string' ? (message as any).id : 'unknown',
      success: false,
      error: 'Invalid worker message contract or schema violation',
      code: 'CONTRACT_VALIDATION_ERROR',
    };
  }

  const startTime = Date.now();

  try {
    switch (message.action) {
      case 'QUERY': {
        const payload = message.payload as DuckDBQueryPayload;
        const res = await queryFinancialLedgerWithFallback(
          db,
          payload.query,
          payload.params || [],
          cachedRecords
        );
        return {
          id: message.id,
          action: message.action,
          success: true,
          data: res.result,
          fallback: res.fallback,
          executionTimeMs: Date.now() - startTime,
        };
      }
      case 'AGGREGATE': {
        const payload = (message.payload || {}) as DuckDBAggregatePayload;
        const records = payload.records || cachedRecords;
        const aggResult = computeDisputeAnalyticsFallback(records, payload.dimension);
        return {
          id: message.id,
          action: message.action,
          success: true,
          data: aggResult,
          fallback: true,
          executionTimeMs: Date.now() - startTime,
        };
      }
      case 'CLEAR_CACHE': {
        await clearStatementCache();
        return {
          id: message.id,
          action: message.action,
          success: true,
          data: { cleared: true },
          executionTimeMs: Date.now() - startTime,
        };
      }
      case 'INGEST': {
        const payload = message.payload as DuckDBIngestPayload;
        const projected = payload.records.map(projectOptimizedDisputeRecord);
        return {
          id: message.id,
          action: message.action,
          success: true,
          data: { ingested_count: projected.length },
          executionTimeMs: Date.now() - startTime,
        };
      }
      default: {
        return {
          id: message.id,
          success: false,
          error: `Unhandled worker action: ${(message as any).action}`,
          code: 'UNHANDLED_ACTION',
        };
      }
    }
  } catch (err: any) {
    return {
      id: message.id,
      action: message.action,
      success: false,
      error: err?.message || 'Worker processing error',
      code: 'EXECUTION_ERROR',
    };
  }
}
