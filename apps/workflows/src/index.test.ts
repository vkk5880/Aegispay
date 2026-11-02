import test from 'node:test';
import assert from 'node:assert/strict';
import { priceDropWatcherTask, executeUnitPartialCapture, executeUnitPartialVoid } from './tasks/priceDropWatcher.js';
import { syntheticBidMatcherTask } from './tasks/syntheticBidMatcher.js';

test('priceDropWatcher: executes independent unit partial capture / void split without collapsing order', async () => {
  // Test unit partial capture helper
  const captureRes = await executeUnitPartialCapture({
    authorizationId: 'MOCK_AUTH_UNIT_1',
    amountCents: 8500,
  }) as any;
  assert.equal(captureRes.status, 'COMPLETED');
  assert.equal(captureRes.amount.value, '85.00');

  // Test unit partial void helper
  const voidRes = await executeUnitPartialVoid({
    authorizationId: 'MOCK_AUTH_UNIT_2',
  }) as any;
  assert.equal(voidRes.status, 'VOIDED');

  // Test durable priceDropWatcher task execution
  const mockCtx: any = {
    step: async <T>(_name: string, fn: () => Promise<T> | T): Promise<T> => {
      return await fn();
    },
  };

  const taskFn = (priceDropWatcherTask as any).func || priceDropWatcherTask;
  const watcherResult = await taskFn(mockCtx, {
    purchase_unit_ids: ['pu_unit_a', 'pu_unit_b'],
    escrow_order_id: 'mock_escrow_123',
  });

  assert.ok(watcherResult);
  assert.equal(watcherResult.total_units, 2);
  assert.equal(watcherResult.resolutions.length, 2);
});

test('syntheticBidMatcher: runs durable evaluate-counter-bid step checkpoint', async () => {
  const stepsExecuted: string[] = [];
  const mockCtx: any = {
    step: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      stepsExecuted.push(name);
      return await fn();
    },
  };

  const matcherFn = (syntheticBidMatcherTask as any).func || syntheticBidMatcherTask;
  await matcherFn(mockCtx, {
    voucher_id: 'voucher_synthetic_test',
  });

  assert.ok(stepsExecuted.includes('fetch-voucher'));
  assert.ok(stepsExecuted.includes('evaluate-bid'));
  // Either capture-vaulted-token was executed (if accepted) or evaluate-counter-bid
  assert.ok(
    stepsExecuted.includes('capture-vaulted-token') ||
    stepsExecuted.includes('evaluate-counter-bid')
  );
});
