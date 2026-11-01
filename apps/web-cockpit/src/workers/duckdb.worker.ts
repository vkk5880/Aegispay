import * as duckdb from '@duckdb/duckdb-wasm';

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

  // In a real scenario, this would query an in-memory Arrow table
  // constructed from live SSE webhook deltas, stripping PII.
  // We simulate a fast OLAP query here.

  const stmt = await conn.prepare(query);
  const result = await stmt.query();

  await stmt.close();
  await conn.close();

  return result.toArray();
}
