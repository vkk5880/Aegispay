import test from 'node:test';
import assert from 'node:assert/strict';
import { priceDropWatcherTask, executeUnitPartialCapture, executeUnitPartialVoid } from './tasks/priceDropWatcher.js';
import { syntheticBidMatcherTask } from './tasks/syntheticBidMatcher.js';
import { executeReverseShippingLabel, reverseShippingLabelTask } from './tasks/reverseShippingLabelTask.js';
import { disputeForensicsTask } from './tasks/disputeForensicsTask.js';

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

test('reverseShippingLabelTask: generates prepaid return shipping label and scannable QR/barcode with PayPal tracking v1', async () => {
  // Test executeReverseShippingLabel directly
  const labelRes = await executeReverseShippingLabel({
    disputeId: 'PP-D-TEST-REVERSE-123',
    transactionId: 'TX-REV-001',
    carrier: 'USPS',
  });

  assert.ok(labelRes);
  assert.ok(labelRes.label_url.startsWith('data:application/pdf;base64,'));
  assert.ok(labelRes.tracking_number.startsWith('940011189922'));
  assert.equal(labelRes.carrier, 'USPS');
  assert.ok(labelRes.qr_code_base64.includes('QR:'));

  // Test reverseShippingLabelTask workflow execution
  const mockCtx: any = {
    step: async <T>(_name: string, fn: () => Promise<T> | T): Promise<T> => {
      return await fn();
    },
  };

  const taskFn = (reverseShippingLabelTask as any).func || reverseShippingLabelTask;
  const workflowRes = await taskFn(mockCtx, {
    disputeId: 'PP-D-TEST-WF-456',
    carrier: 'USPS',
  });

  assert.ok(workflowRes);
  assert.equal(workflowRes.carrier, 'USPS');
  assert.ok(workflowRes.tracking_number.length > 10);
});

test('disputeForensicsTask: wires Tier 3 dispute trigger directly to return label generation and attaches label URL', async () => {
  const stepsExecuted: string[] = [];
  const mockCtx: any = {
    step: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      stepsExecuted.push(name);
      return await fn();
    },
  };

  const forensicsFn = (disputeForensicsTask as any).func || disputeForensicsTask;
  const result = await forensicsFn(mockCtx, {
    paypal_dispute_id: 'PP-D-TIER3-RETURN-TEST',
    autonomy_mode: 'SUPERVISED',
    force_tier: 'TIER3_RETURN_OFFER',
  });

  assert.ok(result);
  assert.equal(result.selected_tier_action, 'TIER3_RETURN_OFFER');
  assert.equal(result.execution_status, 'RETURN_LABEL_ISSUED');
  assert.ok(stepsExecuted.includes('generate-return-shipping-label'));

  // Check buyer response payload contains return label info
  assert.ok(result.return_label);
  assert.ok(result.buyer_response.return_label_url);
  assert.ok(result.buyer_response.return_tracking_number);
  assert.equal(result.buyer_response.offer_type, 'REFUND_WITH_RETURN');
  assert.equal(result.buyer_response.return_carrier, 'USPS');
});
