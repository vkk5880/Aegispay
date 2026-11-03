import test from 'node:test';
import assert from 'node:assert/strict';
import { disputeForensicsTask } from './disputeForensicsTask.js';
import { priceDropWatcherTask } from './priceDropWatcher.js';
import {
  disputeArbitrations,
  purchaseUnitHolds,
  syntheticIntentVouchers,
  spendMandates,
  escrowOrders,
  createDb,
} from '@aegispay/database';
// @ts-ignore
import { getTableConfig } from 'drizzle-orm/pg-core';

const getTableCfg = (t: any) => getTableConfig(t as any);

test('Task 23: disputeForensicsTask executes paired-vision-forensics and carrier-telemetry concurrently via Promise.all', async () => {
  const stepStartTimes: Record<string, number> = {};
  const stepEndTimes: Record<string, number> = {};
  const stepExecutionOrder: string[] = [];

  const mockCtx: any = {
    step: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      stepStartTimes[name] = Date.now();
      stepExecutionOrder.push(`start:${name}`);

      // Add a simulated artificial delay to verify concurrent overlap
      if (name === 'paired-vision-forensics' || name === 'carrier-telemetry') {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const res = await fn();
      stepEndTimes[name] = Date.now();
      stepExecutionOrder.push(`end:${name}`);
      return res;
    },
  };

  const forensicsFn = (disputeForensicsTask as any).func || disputeForensicsTask;
  const result = await forensicsFn(mockCtx, {
    paypal_dispute_id: 'PP-D-CONCURRENCY-TEST-123',
    autonomy_mode: 'SUPERVISED',
  });

  assert.ok(result);
  assert.equal(result.paypal_dispute_id, 'PP-D-CONCURRENCY-TEST-123');

  // Both steps must have started before either step finished, proving Promise.all concurrency
  const visionStartIndex = stepExecutionOrder.indexOf('start:paired-vision-forensics');
  const telemetryStartIndex = stepExecutionOrder.indexOf('start:carrier-telemetry');
  const visionEndIndex = stepExecutionOrder.indexOf('end:paired-vision-forensics');
  const telemetryEndIndex = stepExecutionOrder.indexOf('end:carrier-telemetry');

  assert.ok(visionStartIndex !== -1, 'paired-vision-forensics must start');
  assert.ok(telemetryStartIndex !== -1, 'carrier-telemetry must start');
  assert.ok(
    visionStartIndex < telemetryEndIndex,
    'paired-vision-forensics started before carrier-telemetry completed'
  );
  assert.ok(
    telemetryStartIndex < visionEndIndex,
    'carrier-telemetry started before paired-vision-forensics completed'
  );

  // Assert concurrent execution span: both steps were in-flight at the same time
  const visionStart = stepStartTimes['paired-vision-forensics'];
  const visionEnd = stepEndTimes['paired-vision-forensics'];
  const telemetryStart = stepStartTimes['carrier-telemetry'];
  const telemetryEnd = stepEndTimes['carrier-telemetry'];

  assert.ok(
    visionStart <= telemetryEnd && telemetryStart <= visionEnd,
    'paired-vision-forensics and carrier-telemetry time intervals must overlap'
  );
});

test('Task 23: priceDropWatcher batches purchase unit hold queries using inArray', async () => {
  let fetchPuHoldsStepCalls = 0;
  const mockCtx: any = {
    step: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      if (name === 'fetch-pu-holds') {
        fetchPuHoldsStepCalls++;
      }
      return await fn();
    },
  };

  const targetUnitIds = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ];

  const watcherFn = (priceDropWatcherTask as any).func || priceDropWatcherTask;
  const watcherResult = await watcherFn(mockCtx, {
    purchase_unit_ids: targetUnitIds,
    escrow_order_id: 'escrow_batch_test',
  });

  assert.ok(watcherResult);
  assert.equal(fetchPuHoldsStepCalls, 1, 'fetch-pu-holds must execute exactly once as a single batch step');
  assert.equal(watcherResult.total_units, 3, 'Must resolve all 3 target unit IDs');
  assert.equal(watcherResult.resolutions.length, 3);
});

test('Task 23: PostgreSQL schema defines B-Tree indexes and CHECK constraints', () => {
  // 1. dispute_arbitrations indexes and checks
  const disputeConfig = getTableCfg(disputeArbitrations);
  const disputeIndexNames = disputeConfig.indexes.map((idx: any) => idx.config.name);
  assert.ok(
    disputeIndexNames.includes('idx_dispute_arbitrations_purchase_unit_id'),
    'dispute_arbitrations must index purchase_unit_id'
  );
  assert.ok(
    disputeIndexNames.includes('idx_dispute_arbitrations_dispute_state'),
    'dispute_arbitrations must index dispute_state'
  );
  assert.ok(
    disputeIndexNames.includes('idx_dispute_arbitrations_selected_tier_action'),
    'dispute_arbitrations must index selected_tier_action'
  );
  const disputeCheckNames = disputeConfig.checks.map((chk: any) => chk.name);
  assert.ok(
    disputeCheckNames.includes('check_dispute_arbitrations_dispute_amount_cents_positive'),
    'dispute_arbitrations must have check_dispute_arbitrations_dispute_amount_cents_positive'
  );

  // 2. purchase_unit_holds indexes and checks
  const holdConfig = getTableCfg(purchaseUnitHolds);
  const holdIndexNames = holdConfig.indexes.map((idx: any) => idx.config.name);
  assert.ok(
    holdIndexNames.includes('idx_purchase_unit_holds_escrow_order_id'),
    'purchase_unit_holds must index escrow_order_id'
  );
  assert.ok(
    holdIndexNames.includes('idx_purchase_unit_holds_merchant_domain'),
    'purchase_unit_holds must index merchant_domain'
  );
  assert.ok(
    holdIndexNames.includes('idx_purchase_unit_holds_hold_status'),
    'purchase_unit_holds must index hold_status'
  );
  const holdCheckNames = holdConfig.checks.map((chk: any) => chk.name);
  assert.ok(
    holdCheckNames.includes('check_purchase_unit_holds_authorized_cents_positive'),
    'purchase_unit_holds must check authorized_cents > 0'
  );
  assert.ok(
    holdCheckNames.includes('check_purchase_unit_holds_target_price_drop_cents_positive'),
    'purchase_unit_holds must check target_price_drop_cents > 0'
  );

  // 3. synthetic_intent_vouchers indexes and checks
  const voucherConfig = getTableCfg(syntheticIntentVouchers);
  const voucherIndexNames = voucherConfig.indexes.map((idx: any) => idx.config.name);
  assert.ok(
    voucherIndexNames.includes('idx_synthetic_intent_vouchers_mandate_id'),
    'synthetic_intent_vouchers must index mandate_id'
  );
  assert.ok(
    voucherIndexNames.includes('idx_synthetic_intent_vouchers_negotiation_status'),
    'synthetic_intent_vouchers must index negotiation_status'
  );
  const voucherCheckNames = voucherConfig.checks.map((chk: any) => chk.name);
  assert.ok(
    voucherCheckNames.includes('check_synthetic_intent_vouchers_retail_offer_cents_positive'),
    'synthetic_intent_vouchers must check retail_offer_cents > 0'
  );
  assert.ok(
    voucherCheckNames.includes('check_synthetic_intent_vouchers_buyer_bid_cents_positive'),
    'synthetic_intent_vouchers must check buyer_bid_cents > 0'
  );

  // 4. spend_mandates and escrow_orders checks
  const mandateConfig = getTableCfg(spendMandates);
  const mandateCheckNames = mandateConfig.checks.map((chk: any) => chk.name);
  assert.ok(
    mandateCheckNames.includes('check_spend_mandates_max_total_spend_cents_positive')
  );

  const escrowConfig = getTableCfg(escrowOrders);
  const escrowCheckNames = escrowConfig.checks.map((chk: any) => chk.name);
  assert.ok(
    escrowCheckNames.includes('check_escrow_orders_gross_authorized_cents_positive')
  );
});

test('Task 23: PostgreSQL connection pool limits configured with max 20, idle 30s, timeout 5s', () => {
  const db = createDb('postgresql://user:pass@localhost:5432/test_pool');
  const pool = (db as any).session.client;
  assert.equal(pool.options.max, 20);
  assert.equal(pool.options.idleTimeoutMillis, 30000);
  assert.equal(pool.options.connectionTimeoutMillis, 5000);
});
