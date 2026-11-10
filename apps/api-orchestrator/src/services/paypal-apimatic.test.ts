import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PayPalApimaticClient,
  mapPayPalError,
  parseRetryAfter,
  ensureRequestId,
  normalizeCarrierCode,
  defaultPayPalClient,
} from './paypal-apimatic.js';

test('PayPalApimaticClient: getAuthorizedPayment returns authorization details for unknown outcomes settlement', async () => {
  const client = new PayPalApimaticClient();
  const authId = 'AUTH-SAMPLE-998811';
  const auth = await client.getAuthorizedPayment(authId);

  assert.ok(auth);
  assert.equal(auth.id, authId);
  assert.equal(auth.status, 'CREATED');
  assert.ok(auth.amount);
  assert.equal(auth.amount?.value, '100.00');
  assert.equal((auth.amount as any)?.currencyCode || (auth.amount as any)?.currency_code, 'USD');
  assert.ok(Array.isArray(auth.links));
});

test('PayPalApimaticClient: getSetupToken resolves Vault v3 setup token details (Table 1b.1 Unknown Outcomes)', async () => {
  const client = new PayPalApimaticClient();
  const setupTokenId = 'vault_setup_test_token_123';
  const token = await client.getSetupToken(setupTokenId);

  assert.ok(token);
  assert.equal(token.id, setupTokenId);
  assert.equal(token.status, 'CREATED');
});

test('PayPalApimaticClient: getPaymentToken retrieves vaulted payment token details', async () => {
  const client = new PayPalApimaticClient();
  const paymentTokenId = 'pm_tok_buyer_wallet_88';
  const token = await client.getPaymentToken(paymentTokenId);

  assert.ok(token);
  assert.equal(token.id, paymentTokenId);
  assert.ok(token.customer);
});

test('PayPalApimaticClient: getRefund retrieves payment capture refund status', async () => {
  const client = new PayPalApimaticClient();
  const refundId = 'REF-CAPTURE-12345';
  const refund = await client.getRefund(refundId);

  assert.ok(refund);
  assert.equal(refund.id, refundId);
  assert.equal(refund.status, 'COMPLETED');
});

test('PayPalApimaticClient: patchOrder updates Orders v2 attributes', async () => {
  const client = new PayPalApimaticClient();
  const success = await client.patchOrder('MOCK_ORDER_PATCH_1', [
    { op: 'replace', path: '/purchase_units/@reference_id==\'default\'/description', value: 'Updated description' },
  ]);

  assert.equal(success, true);
});

test('PayPalApimaticClient: confirmOrder confirms order payment source', async () => {
  const client = new PayPalApimaticClient();
  const res = await client.confirmOrder('MOCK_ORDER_CONFIRM_1', {
    payment_source: {
      token: {
        id: 'pm_tok_test_01',
        type: 'PAYMENT_METHOD_TOKEN',
      },
    },
  });

  assert.ok(res);
  assert.equal(res.id, 'MOCK_ORDER_CONFIRM_1');
  assert.equal(res.status, 'APPROVED');
});

test('PayPalApimaticClient: createOrderTracking and updateOrderTracking track order fulfillment', async () => {
  const client = new PayPalApimaticClient();
  const createRes = await client.createOrderTracking('MOCK_ORDER_TRK_1', {
    capture_id: 'CAP_TRK_01',
    tracking_number: '9400111899220011223344',
    carrier: 'USPS',
    status: 'SHIPPED',
  });
  assert.ok(createRes);
  assert.equal(createRes.id, 'MOCK_ORDER_TRK_1');

  const updateSuccess = await client.updateOrderTracking('MOCK_ORDER_TRK_1', 'TRK_01', [
    { op: 'replace', path: '/status', value: 'DELIVERED' },
  ]);
  assert.equal(updateSuccess, true);
});

test('APIMatic Table 1b.4 Error Mapper: mapPayPalError conforms to HTTP response contracts', () => {
  // 1. 400 Bad Request
  const err400 = {
    statusCode: 400,
    result: { details: [{ description: 'Invalid postal code format' }] },
  };
  const mapped400 = mapPayPalError(err400);
  assert.equal(mapped400.statusCode, 400);
  assert.equal(mapped400.error, 'BAD_REQUEST');
  assert.equal(mapped400.message, 'Invalid postal code format');

  // 2. 401/403 Upstream Authentication/Authorization
  const err401 = { statusCode: 401 };
  const mapped401 = mapPayPalError(err401);
  assert.equal(mapped401.statusCode, 502);
  assert.equal(mapped401.error, 'UPSTREAM_AUTH_ERROR');
  assert.equal(mapped401.message, 'Upstream payment provider authorization error');

  const err403 = { status: 403 };
  const mapped403 = mapPayPalError(err403);
  assert.equal(mapped403.statusCode, 502);
  assert.equal(mapped403.error, 'UPSTREAM_AUTH_ERROR');
  assert.equal(mapped403.message, 'Upstream payment provider authorization error');

  // 3. 422 Unprocessable Entity
  const err422 = {
    statusCode: 422,
    result: { details: [{ issue: 'INSTRUMENT_DECLINED', description: 'The payment source was declined.' }] },
  };
  const mapped422 = mapPayPalError(err422);
  assert.equal(mapped422.statusCode, 422);
  assert.equal(mapped422.error, 'INSTRUMENT_DECLINED');
  assert.equal(mapped422.message, 'The payment source was declined.');

  // 4. 429 Too Many Requests
  const err429 = { statusCode: 429 };
  const mapped429 = mapPayPalError(err429);
  assert.equal(mapped429.statusCode, 503);
  assert.equal(mapped429.error, 'RATE_LIMIT_EXCEEDED');
  assert.equal(mapped429.message, 'Rate limit reached on payment clearinghouse');

  // 5. 5xx Server Error
  const err500 = { statusCode: 500 };
  const mapped500 = mapPayPalError(err500);
  assert.equal(mapped500.statusCode, 502);
  assert.equal(mapped500.error, 'UPSTREAM_SERVER_ERROR');
  assert.equal(mapped500.message, 'Payment clearinghouse temporary error');

  // 6. Timeout Error
  const errTimeout = { name: 'TIMEOUT', message: 'ETIMEDOUT: Connection to PayPal payment processor timed out.' };
  const mappedTimeout = mapPayPalError(errTimeout);
  assert.equal(mappedTimeout.statusCode, 504);
  assert.equal(mappedTimeout.error, 'UPSTREAM_TIMEOUT');
  assert.equal(mappedTimeout.message, 'Connection to PayPal payment processor timed out');
});

test('APIMatic Idempotency & Resiliency Utilities: ensureRequestId and parseRetryAfter', () => {
  // ensureRequestId preserves valid IDs and generates UUID v4 when omitted
  const customId = 'custom-request-uuid-1234';
  assert.equal(ensureRequestId(customId), customId);

  const generatedId = ensureRequestId();
  assert.ok(generatedId);
  // Verify standard UUID format
  assert.match(generatedId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  // parseRetryAfter handles seconds integer and invalid/null headers
  assert.equal(parseRetryAfter('10'), 10000);
  assert.equal(parseRetryAfter('0'), 0);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter(undefined), null);
  assert.equal(parseRetryAfter('invalid'), null);
});

test('APIMatic Carrier Registry Normalization: normalizeCarrierCode handles global carriers', () => {
  assert.equal(normalizeCarrierCode('usps'), 'USPS');
  assert.equal(normalizeCarrierCode('United States Postal Service'), 'USPS');
  assert.equal(normalizeCarrierCode('ups ground'), 'UPS');
  assert.equal(normalizeCarrierCode('FedEx Express'), 'FEDEX');
  assert.equal(normalizeCarrierCode('dhl express'), 'DHL');
  assert.equal(normalizeCarrierCode('Royal Mail 48'), 'ROYAL_MAIL');
  assert.equal(normalizeCarrierCode('Australia Post Express'), 'AUSTRALIA_POST');
  assert.equal(normalizeCarrierCode('Canada Post Standard'), 'CANADA_POST');
  assert.equal(normalizeCarrierCode('Hermes UK'), 'HERMES');
  assert.equal(normalizeCarrierCode('DPD Direct'), 'DPD');
});
