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

export async function initDuckDbWorker() {
  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

  return db;
}

export async function queryAnonymizedFinancialLedger(db: duckdb.AsyncDuckDB, query: string) {
  const conn = await db.connect();

  const stmt = await conn.prepare(query);
  const result = await stmt.query();

  await stmt.close();
  await conn.close();

  return result.toArray();
}
