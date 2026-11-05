import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeReverseShippingLabel,
  reverseShippingLabelTask,
  syncTrackingToPayPal,
} from './reverseShippingLabelTask.js';
import { disputeForensicsTask } from './disputeForensicsTask.js';
import { ReturnLabelInfoSchema } from '@aegispay/shared-types';

test('Task 4: executeReverseShippingLabel generates valid 4x6 PDF label and mobile QR tracking payload', async () => {
  const result = await executeReverseShippingLabel({
    disputeId: 'PP-D-8823901',
    transactionId: 'TX-987654321',
    carrier: 'USPS',
    buyerAddress: {
      name: 'Jane Doe',
      street: '123 Market St Apt 4B',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94103',
    },
    merchantAddress: {
      name: 'Aegis Returns Depot',
      street: '2211 N First Street',
      city: 'San Jose',
      state: 'CA',
      postalCode: '95131',
    },
  });

  // Verify against shared Zod schema
  const parsed = ReturnLabelInfoSchema.safeParse(result);
  assert.ok(parsed.success, `Result must conform to ReturnLabelInfoSchema: ${JSON.stringify(parsed)}`);

  // Verify carrier and tracking number structure
  assert.equal(result.carrier, 'USPS');
  assert.ok(result.tracking_number.startsWith('940011189922'));
  assert.ok(result.tracking_number.length >= 22);

  // Verify Base64 PDF data URL format and valid PDF magic bytes
  assert.ok(result.label_url.startsWith('data:application/pdf;base64,'));
  const base64Data = result.label_url.replace('data:application/pdf;base64,', '');
  const pdfBuffer = Buffer.from(base64Data, 'base64');
  assert.ok(pdfBuffer.length > 500, 'PDF buffer must have reasonable size');
  const pdfHeader = pdfBuffer.subarray(0, 5).toString('ascii');
  assert.equal(pdfHeader, '%PDF-', 'PDF data must start with valid PDF magic bytes %PDF-');

  // Verify Mobile QR code payload
  assert.ok(result.qr_code_base64.startsWith('data:image/svg+xml;utf8,'));
  assert.ok(result.qr_code_base64.includes(result.tracking_number), 'QR payload must embed tracking number');
});

test('Task 4: syncTrackingToPayPal synchronizes return tracking to PayPal Shipment Tracking v1', async () => {
  // Test simulated / sandbox mode
  const simTracker = {
    transaction_id: 'TRX-TEST-001',
    tracking_number: '94001118992200000001',
    status: 'SHIPPED' as const,
    carrier: 'USPS',
  };

  const simResult = await syncTrackingToPayPal(simTracker);
  assert.ok(simResult.tracker_identifiers);
  assert.equal(simResult.tracker_identifiers.length, 1);
  assert.equal(simResult.tracker_identifiers[0].transaction_id, 'TRX-TEST-001');
  assert.equal(simResult.tracker_identifiers[0].tracking_number, '94001118992200000001');
  assert.equal(simResult.tracker_identifiers[0].status, 'SHIPPED');

  // Test live fetch interception to PayPal /v1/shipping/trackers-batch
  const origFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  let interceptedAuthUrl = '';
  let interceptedTrackersUrl = '';
  let interceptedPayload: any = null;
  let interceptedAuthHeader = '';

  try {
    process.env.PAYPAL_CLIENT_ID = 'test_live_client_id';
    process.env.PAYPAL_CLIENT_SECRET = 'test_live_client_secret';
    process.env.PAYPAL_ENVIRONMENT = 'sandbox';

    globalThis.fetch = (async (url: any, init?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/v1/oauth2/token')) {
        interceptedAuthUrl = urlStr;
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'MOCK_BEARER_TOKEN_ABC123' }),
        } as any;
      }
      if (urlStr.includes('/v1/shipping/trackers-batch')) {
        interceptedTrackersUrl = urlStr;
        interceptedAuthHeader = init?.headers?.Authorization;
        interceptedPayload = JSON.parse(init?.body || '{}');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tracker_identifiers: [
              {
                transaction_id: interceptedPayload.trackers[0].transaction_id,
                tracking_number: interceptedPayload.trackers[0].tracking_number,
                status: 'SHIPPED',
                links: [],
              },
            ],
            errors: [],
          }),
        } as any;
      }
      return { ok: false, status: 404 } as any;
    }) as any;

    const liveTracker = {
      transaction_id: 'TRX-LIVE-888',
      tracking_number: '94001118992299887766',
      status: 'SHIPPED' as const,
      carrier: 'USPS',
    };

    const liveResult = await syncTrackingToPayPal(liveTracker);

    assert.equal(interceptedAuthUrl, 'https://api-m.sandbox.paypal.com/v1/oauth2/token');
    assert.equal(interceptedTrackersUrl, 'https://api-m.sandbox.paypal.com/v1/shipping/trackers-batch');
    assert.equal(interceptedAuthHeader, 'Bearer MOCK_BEARER_TOKEN_ABC123');
    assert.deepEqual(interceptedPayload.trackers, [liveTracker]);
    assert.equal(liveResult.tracker_identifiers[0].tracking_number, '94001118992299887766');
  } finally {
    globalThis.fetch = origFetch;
    process.env = originalEnv;
  }
});

test('Task 4: reverseShippingLabelTask executes inside workflow step harness', async () => {
  const stepsExecuted: string[] = [];
  const mockCtx: any = {
    step: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      stepsExecuted.push(name);
      return await fn();
    },
  };

  const taskFn = (reverseShippingLabelTask as any).func || reverseShippingLabelTask;
  const label = await taskFn(mockCtx, {
    disputeId: 'PP-D-445566',
    carrier: 'UPS',
  });

  assert.ok(label);
  assert.equal(label.carrier, 'UPS');
  assert.ok(stepsExecuted.includes('generate-return-shipping-label'));
  assert.ok(label.tracking_number.length > 0);
  assert.ok(label.label_url.startsWith('data:application/pdf;base64,'));
});

test('Task 4: disputeForensicsTask wires Tier 3 adjudication to automated return label issuance', async () => {
  const stepExecutions: string[] = [];
  const mockCtx: any = {
    step: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      stepExecutions.push(name);
      return await fn();
    },
  };

  const forensicsFn = (disputeForensicsTask as any).func || disputeForensicsTask;
  const response = await forensicsFn(mockCtx, {
    paypal_dispute_id: 'PP-D-TIER3-VERIFY',
    force_tier: 'TIER3_RETURN_OFFER',
    autonomy_mode: 'SUPERVISED',
  });

  // Verify response fields
  assert.equal(response.paypal_dispute_id, 'PP-D-TIER3-VERIFY');
  assert.equal(response.selected_tier_action, 'TIER3_RETURN_OFFER');
  assert.equal(response.execution_status, 'RETURN_LABEL_ISSUED');

  // Verify return label is populated and conformant
  assert.ok(response.return_label);
  assert.ok(response.return_label.tracking_number.startsWith('940011189922'));
  assert.ok(response.return_label.label_url.startsWith('data:application/pdf;base64,'));
  assert.ok(response.return_label.qr_code_base64.length > 0);

  // Verify buyer response payload includes return logistics details
  assert.equal(response.buyer_response.offer_type, 'REFUND_WITH_RETURN');
  assert.equal(response.buyer_response.return_tracking_number, response.return_label.tracking_number);
  assert.equal(response.buyer_response.return_label_url, response.return_label.label_url);
  assert.equal(response.buyer_response.return_carrier, 'USPS');
  assert.ok(response.buyer_response.return_qr_code_base64);

  // Verify workflow steps executed
  assert.ok(stepExecutions.includes('generate-return-shipping-label'));
});

test('Task 4: disputeForensicsTask executes paired-vision-forensics and carrier-telemetry concurrently via Promise.all', async () => {
  const stepStartTimes: Record<string, number> = {};
  const stepEndTimes: Record<string, number> = {};
  const stepExecutionOrder: string[] = [];

  const mockCtx: any = {
    step: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
      stepStartTimes[name] = Date.now();
      stepExecutionOrder.push(`start:${name}`);

      if (name === 'paired-vision-forensics' || name === 'carrier-telemetry') {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      const res = await fn();
      stepEndTimes[name] = Date.now();
      stepExecutionOrder.push(`end:${name}`);
      return res;
    },
  };

  const forensicsFn = (disputeForensicsTask as any).func || disputeForensicsTask;
  const result = await forensicsFn(mockCtx, {
    paypal_dispute_id: 'PP-D-CONCURRENT-TELEMETRY',
    autonomy_mode: 'AUTONOMOUS',
  });

  assert.ok(result);

  const visionStart = stepStartTimes['paired-vision-forensics'];
  const visionEnd = stepEndTimes['paired-vision-forensics'];
  const telemetryStart = stepStartTimes['carrier-telemetry'];
  const telemetryEnd = stepEndTimes['carrier-telemetry'];

  // Assert both steps were executing concurrently during the same time interval
  assert.ok(
    visionStart <= telemetryEnd && telemetryStart <= visionEnd,
    'paired-vision-forensics and carrier-telemetry must execute concurrently via Promise.all'
  );
});
