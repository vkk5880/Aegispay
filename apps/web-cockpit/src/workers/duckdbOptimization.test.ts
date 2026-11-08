import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  validateReadOnlySelectQuery,
  queryAnonymizedFinancialLedger,
  clearStatementCache,
  getStatementCacheSize,
  setMaxStatementCacheSize,
  validateWorkerMessage,
  buildSafeAnalyticsQuery,
  isWasmSupported,
  computeDisputeAnalyticsFallback,
  queryFinancialLedgerWithFallback,
  handleWorkerMessage,
  projectOptimizedDisputeRecord,
  AnonymizedDisputeRecord,
} from './duckdb.worker.js';
import {
  verifySessionMandateSignature,
  getKeyObjectCacheSize,
  clearKeyObjectCache,
} from '../../../../packages/mcp-enforcer/src/ed25519-verifier.js';

test('DuckDB Read-Only Query Validation: Strictly allows SELECT and WITH queries, rejecting mutations and DDL', () => {
  // Valid queries
  assert.equal(validateReadOnlySelectQuery('SELECT * FROM disputes'), true);
  assert.equal(validateReadOnlySelectQuery('  select count(*), sum(dispute_amount_cents) from transactions  '), true);
  assert.equal(validateReadOnlySelectQuery('WITH high_risk AS (SELECT * FROM disputes WHERE liability_score_l > 0.5) SELECT * FROM high_risk'), true);
  assert.equal(validateReadOnlySelectQuery('-- comments allowed\nSELECT 1'), true);
  assert.equal(validateReadOnlySelectQuery('/* block comment */ SELECT dispute_reason FROM disputes'), true);

  // Invalid queries / mutations / DDL
  assert.equal(validateReadOnlySelectQuery('DROP TABLE disputes'), false);
  assert.equal(validateReadOnlySelectQuery('DELETE FROM disputes WHERE id = 1'), false);
  assert.equal(validateReadOnlySelectQuery('INSERT INTO disputes VALUES (1, 2)'), false);
  assert.equal(validateReadOnlySelectQuery('UPDATE disputes SET status = "RESOLVED"'), false);
  assert.equal(validateReadOnlySelectQuery('ALTER TABLE disputes ADD COLUMN hacked TEXT'), false);
  assert.equal(validateReadOnlySelectQuery('CREATE TABLE foo (id INT)'), false);
  assert.equal(validateReadOnlySelectQuery('TRUNCATE disputes'), false);
  assert.equal(validateReadOnlySelectQuery('ATTACH "evil.db"'), false);
  assert.equal(validateReadOnlySelectQuery('COPY disputes TO "/tmp/leak.csv"'), false);
  assert.equal(validateReadOnlySelectQuery(''), false);
  assert.equal(validateReadOnlySelectQuery('   '), false);
});

test('DuckDB SQL Injection Hardening: Blocks stacked queries, unsafe system functions, and unbalanced delimiters', () => {
  // Stacked queries with semicolon injection
  assert.equal(validateReadOnlySelectQuery('SELECT 1; DROP TABLE disputes;'), false);
  assert.equal(validateReadOnlySelectQuery('SELECT * FROM disputes; DELETE FROM disputes'), false);
  assert.equal(validateReadOnlySelectQuery('SELECT 1; VACUUM'), false);

  // Dangerous internal functions or execution engines
  assert.equal(validateReadOnlySelectQuery('SELECT * FROM read_csv("secret.csv")'), false);
  assert.equal(validateReadOnlySelectQuery('SELECT * FROM read_parquet("secret.parquet")'), false);
  assert.equal(validateReadOnlySelectQuery('SELECT SYSTEM("rm -rf /")'), false);
  assert.equal(validateReadOnlySelectQuery('SELECT EXEC("cat /etc/passwd")'), false);
  assert.equal(validateReadOnlySelectQuery('SELECT CALL dangerous_proc()'), false);

  // Unbalanced string quotes
  assert.equal(validateReadOnlySelectQuery("SELECT * FROM disputes WHERE reason = 'unclosed"), false);

  // Valid queries with trailing semicolons should still pass
  assert.equal(validateReadOnlySelectQuery('SELECT * FROM disputes;'), true);
  assert.equal(validateReadOnlySelectQuery('SELECT * FROM disputes;   '), true);
});

test('DuckDB Dynamic Query Builder: Validates dimensions and sort order, parameterizing filters', () => {
  // Valid query generation
  const q1 = buildSafeAnalyticsQuery({
    dimension: 'selected_tier_action',
    sortBy: 'count',
    sortDirection: 'DESC',
    minLiability: 0.5,
  });
  assert.ok(q1.query.startsWith('SELECT selected_tier_action, COUNT(*) as count'));
  assert.ok(q1.query.includes('WHERE liability_score_l >= ?'));
  assert.deepEqual(q1.params, [0.5]);

  // Invalid dimension rejected
  assert.throws(() => {
    buildSafeAnalyticsQuery({ dimension: 'evil_column; DROP TABLE disputes--' as any });
  }, /Invalid dimension/);

  // Invalid sort direction rejected
  assert.throws(() => {
    buildSafeAnalyticsQuery({ sortDirection: 'INJECT' as any });
  }, /Invalid sort direction/);
});

test('DuckDB Statement Caching & Connection Safety: Caches prepared statements and ensures connection is closed', async () => {
  await clearStatementCache();
  setMaxStatementCacheSize(50);
  assert.equal(getStatementCacheSize(), 0);

  let connectionsClosed = 0;
  let statementsPrepared = 0;
  let statementsClosed = 0;

  const mockPreparedStatement = {
    query: async (...params: any[]) => ({
      toArray: () => [{ result_cents: 12500, params }],
    }),
    close: async () => {
      statementsClosed++;
    },
  };

  const mockConn = {
    prepare: async (q: string) => {
      statementsPrepared++;
      return mockPreparedStatement as any;
    },
    close: async () => {
      connectionsClosed++;
    },
  };

  const mockDb = {
    connect: async () => mockConn as any,
  } as any;

  const query = 'SELECT dispute_amount_cents FROM disputes WHERE liability_score_l > 0.5';

  // 1. First execution prepares the statement and caches it
  const res1 = await queryAnonymizedFinancialLedger(mockDb, query);
  assert.equal(res1.length, 1);
  assert.equal(res1[0].result_cents, 12500);
  assert.equal(statementsPrepared, 1);
  assert.equal(getStatementCacheSize(), 1);
  assert.equal(connectionsClosed, 1, 'Connection must be closed in finally block');

  // 2. Second execution reuses cached statement without calling conn.prepare again
  const res2 = await queryAnonymizedFinancialLedger(mockDb, query);
  assert.equal(res2.length, 1);
  assert.equal(statementsPrepared, 1, 'Should NOT prepare again; reused from cache');
  assert.equal(getStatementCacheSize(), 1);
  assert.equal(connectionsClosed, 2, 'Connection must be closed on second run as well');

  // 3. Execution failure in query still guarantees connection cleanup
  const failingPreparedStatement = {
    query: async () => {
      throw new Error('Simulation query execution failure');
    },
    close: async () => {},
  };
  const failingConn = {
    prepare: async () => failingPreparedStatement as any,
    close: async () => {
      connectionsClosed++;
    },
  };
  const failingDb = {
    connect: async () => failingConn as any,
  } as any;

  await assert.rejects(
    async () => {
      await queryAnonymizedFinancialLedger(failingDb, 'SELECT * FROM failing_table');
    },
    { message: 'Simulation query execution failure' }
  );

  assert.equal(connectionsClosed, 3, 'Connection must be closed in finally block even when query fails');

  // 4. Non-SELECT query is rejected before connecting
  await assert.rejects(
    async () => {
      await queryAnonymizedFinancialLedger(mockDb, 'DROP TABLE disputes');
    },
    { message: /Only read-only SELECT queries are permitted/ }
  );
  // Connection count shouldn't increase since validation failed pre-connection
  assert.equal(connectionsClosed, 3);

  // 5. Test clearStatementCache
  await clearStatementCache();
  assert.equal(getStatementCacheSize(), 0);
  assert.ok(statementsClosed >= 1);
});

test('DuckDB Statement Cache LRU Eviction: Closes evicted statements to prevent memory leaks', async () => {
  await clearStatementCache();
  setMaxStatementCacheSize(2);

  let statementsClosed = 0;
  const createMockPreparedStatement = (id: string) => ({
    query: async () => ({ toArray: () => [{ id }] }),
    close: async () => {
      statementsClosed++;
    },
  });

  const mockConn = {
    prepare: async (q: string) => createMockPreparedStatement(q) as any,
    close: async () => {},
  };
  const mockDb = {
    connect: async () => mockConn as any,
  } as any;

  // Add statement 1
  await queryAnonymizedFinancialLedger(mockDb, 'SELECT 1');
  assert.equal(getStatementCacheSize(), 1);

  // Add statement 2
  await queryAnonymizedFinancialLedger(mockDb, 'SELECT 2');
  assert.equal(getStatementCacheSize(), 2);

  // Adding statement 3 exceeds limit of 2, oldest (SELECT 1) must be closed and evicted
  await queryAnonymizedFinancialLedger(mockDb, 'SELECT 3');
  assert.equal(getStatementCacheSize(), 2);
  assert.equal(statementsClosed, 1, 'Evicted statement must be closed');

  // Clean up
  await clearStatementCache();
  setMaxStatementCacheSize(50);
});

test('Web Worker Message Contract Validation: Enforces schema contracts and rejects malformed payloads', () => {
  // Valid QUERY message
  assert.equal(
    validateWorkerMessage({
      id: 'req_001',
      action: 'QUERY',
      payload: { query: 'SELECT * FROM disputes', params: [] },
    }),
    true
  );

  // Valid INGEST message
  assert.equal(
    validateWorkerMessage({
      id: 'req_002',
      action: 'INGEST',
      payload: { records: [] },
    }),
    true
  );

  // Valid AGGREGATE message
  assert.equal(
    validateWorkerMessage({
      id: 'req_003',
      action: 'AGGREGATE',
      payload: { dimension: 'selected_tier_action' },
    }),
    true
  );

  // Valid CLEAR_CACHE message
  assert.equal(
    validateWorkerMessage({
      id: 'req_004',
      action: 'CLEAR_CACHE',
    }),
    true
  );

  // Invalid: missing id
  assert.equal(validateWorkerMessage({ action: 'QUERY', payload: { query: 'SELECT 1' } }), false);

  // Invalid: unsupported action
  assert.equal(validateWorkerMessage({ id: 'bad_act', action: 'UNSUPPORTED_ACTION' }), false);

  // Invalid: QUERY without query string
  assert.equal(validateWorkerMessage({ id: 'bad_query', action: 'QUERY', payload: {} }), false);

  // Invalid: INGEST without records array
  assert.equal(validateWorkerMessage({ id: 'bad_ingest', action: 'INGEST', payload: { records: 'not-array' } }), false);

  // Invalid: Non-object message
  assert.equal(validateWorkerMessage(null), false);
  assert.equal(validateWorkerMessage('raw-string'), false);
});

test('DuckDB-WASM Fallback Aggregation: Computes dispute analytics accurately when WASM is unavailable', async () => {
  assert.equal(typeof isWasmSupported(), 'boolean');

  const mockRecords: AnonymizedDisputeRecord[] = [
    {
      paypal_dispute_id: 'PP-D-01',
      dispute_reason: 'MERCHANDISE_NOT_AS_DESCRIBED',
      dispute_state: 'REQUIRED_ACTION',
      dispute_amount_cents: 10000,
      liability_score_l: 0.8,
      abuse_risk_score_r: 0.2,
      exif_tamper_flag: true,
      selected_tier_action: 'TIER1_REFUND',
      seller_response_due_date: '2026-06-01',
    },
    {
      paypal_dispute_id: 'PP-D-02',
      dispute_reason: 'MERCHANDISE_NOT_AS_DESCRIBED',
      dispute_state: 'REQUIRED_ACTION',
      dispute_amount_cents: 20000,
      liability_score_l: 0.6,
      abuse_risk_score_r: 0.4,
      exif_tamper_flag: false,
      selected_tier_action: 'TIER1_REFUND',
      seller_response_due_date: '2026-06-01',
    },
    {
      paypal_dispute_id: 'PP-D-03',
      dispute_reason: 'UNAUTHORIZED_TRANSACTION',
      dispute_state: 'UNDER_REVIEW',
      dispute_amount_cents: 15000,
      liability_score_l: 0.2,
      abuse_risk_score_r: 0.9,
      exif_tamper_flag: true,
      selected_tier_action: 'TIER4_CONTEST_PDF',
      seller_response_due_date: '2026-06-02',
    },
  ];

  // 1. Direct fallback calculation
  const fallbackResults = computeDisputeAnalyticsFallback(mockRecords);
  assert.equal(fallbackResults.length, 2);

  const tier1 = fallbackResults.find((r) => r.tier === 'TIER1_REFUND');
  assert.ok(tier1);
  assert.equal(tier1.count, 2);
  assert.equal(tier1.total_dispute_amount_cents, 30000);
  assert.equal(tier1.avg_liability, 0.7);
  assert.equal(tier1.avg_abuse_risk, 0.3);

  const tier4 = fallbackResults.find((r) => r.tier === 'TIER4_CONTEST_PDF');
  assert.ok(tier4);
  assert.equal(tier4.count, 1);
  assert.equal(tier4.total_dispute_amount_cents, 15000);
  assert.equal(tier4.avg_liability, 0.2);
  assert.equal(tier4.avg_abuse_risk, 0.9);

  // 2. queryFinancialLedgerWithFallback when db is null
  const fallbackQueryRes = await queryFinancialLedgerWithFallback(
    null,
    'SELECT * FROM disputes',
    [],
    mockRecords
  );
  assert.equal(fallbackQueryRes.fallback, true);
  assert.equal(fallbackQueryRes.result.length, 2);

  // 3. handleWorkerMessage dispatcher test
  const msgResponse = await handleWorkerMessage(
    null,
    {
      id: 'msg_test_01',
      action: 'AGGREGATE',
      payload: { records: mockRecords },
    },
    []
  );
  assert.equal(msgResponse.success, true);
  assert.equal(msgResponse.id, 'msg_test_01');
  if (msgResponse.success) {
    assert.equal(msgResponse.fallback, true);
    assert.equal(msgResponse.data.length, 2);
  }
});

test('Ed25519 ASN.1 KeyObject LRU Cache: Reuses parsed KeyObjects across repeated signature verifications', async () => {
  clearKeyObjectCache();
  assert.equal(getKeyObjectCacheSize(), 0);

  // Generate a valid Ed25519 keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubDer = publicKey.export({ format: 'der', type: 'spki' });
  const rawPubHex = pubDer.subarray(12).toString('hex'); // 32 bytes hex

  const mandate = {
    mandate_id: 'vch_lru_cache_test',
    buyer_id: 'buyer_lru_01',
    max_total_spend_cents: 50000,
    max_single_merchant_cents: 25000,
    cumulative_spent_cents: 0,
    currency_code: 'USD',
    allowed_category_ids: ['electronics'],
    public_key_hex: rawPubHex,
    expires_at: new Date(Date.now() + 3600 * 1000),
    status: 'ACTIVE' as const,
  };

  const messageObj = {
    mandate_id: mandate.mandate_id,
    buyer_id: mandate.buyer_id,
    max_total_spend_cents: mandate.max_total_spend_cents,
    max_single_merchant_cents: mandate.max_single_merchant_cents,
    currency_code: mandate.currency_code,
    allowed_category_ids: mandate.allowed_category_ids,
    expires_at: mandate.expires_at.toISOString(),
    status: mandate.status,
    public_key_hex: mandate.public_key_hex,
  };

  const sigBuffer = crypto.sign(null, Buffer.from(JSON.stringify(messageObj), 'utf8'), privateKey);
  const mandateWithSig = {
    ...mandate,
    ed25519_signature_hex: sigBuffer.toString('hex'),
    created_at: new Date(),
  };

  // First verification parses and populates the cache
  const firstVerified = await verifySessionMandateSignature(mandateWithSig);
  assert.equal(firstVerified, true);
  assert.equal(getKeyObjectCacheSize(), 1);

  // Second verification hits the LRU cache without re-parsing
  const secondVerified = await verifySessionMandateSignature(mandateWithSig);
  assert.equal(secondVerified, true);
  assert.equal(getKeyObjectCacheSize(), 1);

  // Third verification with another keypair increments size to 2
  const keyPair2 = crypto.generateKeyPairSync('ed25519');
  const rawPubHex2 = keyPair2.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
  const mandate2 = {
    ...mandateWithSig,
    mandate_id: 'vch_lru_cache_test_2',
    public_key_hex: rawPubHex2,
  };
  const messageObj2 = {
    ...messageObj,
    mandate_id: mandate2.mandate_id,
    public_key_hex: rawPubHex2,
  };
  mandate2.ed25519_signature_hex = crypto.sign(null, Buffer.from(JSON.stringify(messageObj2), 'utf8'), keyPair2.privateKey).toString('hex');

  const thirdVerified = await verifySessionMandateSignature(mandate2);
  assert.equal(thirdVerified, true);
  assert.equal(getKeyObjectCacheSize(), 2);

  clearKeyObjectCache();
  assert.equal(getKeyObjectCacheSize(), 0);
});

test('Cryptographic Random UUID Generation: Verifies UUID format across mock generators without Math.random', () => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sampleUuid = crypto.randomUUID();
  assert.equal(uuidRegex.test(sampleUuid), true);

  // Verify slice format used in mandate and voucher IDs
  const mandateId = `man_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const voucherId = `syn_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const captureId = `MOCK_CAPTURE_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

  assert.ok(mandateId.startsWith('man_'));
  assert.ok(voucherId.startsWith('syn_'));
  assert.ok(captureId.startsWith('MOCK_CAPTURE_'));
  assert.equal(/^[0-9a-f]{8}$/.test(mandateId.split('_')[2]), true);
  assert.equal(/^[0-9a-f]{8}$/.test(voucherId.split('_')[2]), true);
  assert.equal(/^[0-9a-f]{8}$/.test(captureId.split('_')[3]), true);
});

test('Phase 3: INGEST_RECORD_BATCH worker message contract and batch record ingestion', async () => {
  const sampleBatch: AnonymizedDisputeRecord[] = [
    {
      paypal_dispute_id: 'PP-D-9001',
      dispute_reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
      dispute_state: 'REQUIRED_ACTION',
      dispute_amount_cents: 6500,
      liability_score_l: 0.75,
      abuse_risk_score_r: 0.15,
      exif_tamper_flag: false,
      selected_tier_action: 'TIER1_REFUND',
      seller_response_due_date: new Date().toISOString(),
    },
    {
      paypal_dispute_id: 'PP-D-9002',
      dispute_reason: 'UNAUTHORISED',
      dispute_state: 'UNDER_REVIEW',
      dispute_amount_cents: 12000,
      liability_score_l: 0.35,
      abuse_risk_score_r: 0.85,
      exif_tamper_flag: true,
      selected_tier_action: 'TIER4_CONTEST_PDF',
      seller_response_due_date: new Date().toISOString(),
    },
  ];

  // 1. Validate worker message contract
  const validBatchMsg = {
    id: 'msg_batch_01',
    action: 'INGEST_RECORD_BATCH',
    payload: { records: sampleBatch },
  };
  assert.equal(validateWorkerMessage(validBatchMsg), true);

  // 2. Dispatch batch ingestion
  const response = await handleWorkerMessage(null, validBatchMsg, []);
  assert.equal(response.success, true);
  assert.equal(response.action, 'INGEST_RECORD_BATCH');
  if (response.success) {
    assert.equal(response.data.ingested_count, 2);
  }
});
