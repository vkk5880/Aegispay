import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../index.js';
import { generatePaymentReceipt } from '../middleware/http402-interceptor.js';

test('Procurement API: POST /api/buyer/vault/setup creates ephemeral setup session', async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: 'POST',
    url: '/api/buyer/vault/setup',
    payload: {
      customer_id: 'cust_procure_001',
      mandate_id: 'mandate_procure_001',
      return_url: 'https://aegispay.dev/checkout/return',
      cancel_url: 'https://aegispay.dev/checkout/cancel',
    },
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  const session = json.session || json;
  assert.ok(session.setup_token_id);
  assert.equal(session.customer_id, 'cust_procure_001');
  assert.equal(session.status, 'CREATED');
  assert.ok(session.approve_url);
});

test('Procurement API: POST /api/buyer/vault/confirm converts setup token to durable payment token', async () => {
  const app = await buildApp();

  const setupRes = await app.inject({
    method: 'POST',
    url: '/api/buyer/vault/setup',
    payload: {
      customer_id: 'cust_procure_002',
      mandate_id: 'mandate_procure_002',
    },
  });
  const setupJson = setupRes.json();
  const setupTokenId = setupJson.session ? setupJson.session.setup_token_id : setupJson.setup_token_id;

  const confirmRes = await app.inject({
    method: 'POST',
    url: '/api/buyer/vault/confirm',
    payload: {
      setup_token_id: setupTokenId,
      customer_id: 'cust_procure_002',
      mandate_id: 'mandate_procure_002',
    },
  });

  assert.equal(confirmRes.statusCode, 200);
  const confirmJson = confirmRes.json();
  const vault = confirmJson.vault || confirmJson;
  assert.ok(vault.paypal_payment_token_id);
  assert.equal(vault.status, 'VAULTED');
});

test('Procurement API: POST /api/buyer/authorize enforces schema and creates authorization hold', async () => {
  const app = await buildApp();
  const validReceipt = generatePaymentReceipt('ct_procure_auth_01', 7500, 'USD');

  const response = await app.inject({
    method: 'POST',
    url: '/api/buyer/authorize',
    headers: {
      'x-payment-receipt': validReceipt,
    },
    payload: {
      mandate_id: 'mandate_procure_auth_01',
      purchase_units: [
        {
          reference_id: 'pu_test_1',
          description: 'Synthetic Order Item A',
          amount: {
            currency_code: 'USD',
            value: '75.00',
            breakdown: {
              item_total: { currency_code: 'USD', value: '75.00' },
            },
          },
          items: [
            {
              name: 'Anker Power Bank',
              quantity: '1',
              unit_amount: { currency_code: 'USD', value: '75.00' },
            },
          ],
        },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.ok(json.order_id);
  assert.ok(json.authorization_id);
  assert.ok(json.status === 'CREATED' || json.status === 'AUTHORIZED');
});

test('Procurement API: Rejects malformed authorization request with 400 INVALID_REQUEST', async () => {
  const app = await buildApp();
  const validReceipt = generatePaymentReceipt('ct_procure_auth_err', 5000, 'USD');

  const response = await app.inject({
    method: 'POST',
    url: '/api/buyer/authorize',
    headers: {
      'x-payment-receipt': validReceipt,
    },
    payload: {
      mandate_id: '', // Empty mandate ID violates schema
      purchase_units: [],
    },
  });

  assert.equal(response.statusCode, 400);
  const json = response.json();
  assert.equal(json.error, 'INVALID_REQUEST');
});

test('Procurement API: POST /api/buyer/capture captures approved order and triggers rollback on decline', async () => {
  const app = await buildApp();
  const validReceipt = generatePaymentReceipt('ct_procure_cap_01', 5000, 'USD');

  // Success case
  const responseSuccess = await app.inject({
    method: 'POST',
    url: '/api/buyer/capture',
    headers: {
      'x-payment-receipt': validReceipt,
    },
    payload: {
      order_id: 'MOCK_ORDER_CAP_SUCCESS',
      mandate_id: 'mandate_procure_cap_01',
      amount_cents: 5000,
      merchant_domain: 'sound-gear.com',
    },
  });

  assert.equal(responseSuccess.statusCode, 200);
  const jsonSuccess = responseSuccess.json();
  assert.equal(jsonSuccess.status, 'COMPLETED');
  assert.equal(jsonSuccess.order_id, 'MOCK_ORDER_CAP_SUCCESS');
  assert.ok(jsonSuccess.capture);
  assert.ok(jsonSuccess.order);

  // Capture denial case (INSTRUMENT_DECLINED triggering compensating rollback)
  const responseDecline = await app.inject({
    method: 'POST',
    url: '/api/buyer/capture',
    headers: {
      'x-payment-receipt': validReceipt,
    },
    payload: {
      order_id: 'MOCK_ORDER_DECLINE',
      mandate_id: 'mandate_procure_decline_01',
      amount_cents: 5000,
      merchant_domain: 'sound-gear.com',
    },
  });

  assert.equal(responseDecline.statusCode, 500);
  const jsonDecline = responseDecline.json();
  assert.equal(jsonDecline.error, 'INSTRUMENT_DECLINED');
  assert.ok(jsonDecline.compensating_rollback);
  assert.equal(jsonDecline.restored_cents, 5000);
});

test('Intent Voucher API: POST and GET intent vouchers', async () => {
  const app = await buildApp();

  // Test broadcast overage handling
  const broadcastRes = await app.inject({
    method: 'POST',
    url: '/api/intent-vouchers/broadcast',
    payload: {
      mandate_id: 'mandate_voucher_01',
      channel3_product_id: 'ch3_prod_audio',
      merchant_domain: 'sound-gear.com',
      retail_offer_cents: 29900,
      buyer_budget_cap_cents: 25000,
      buyer_bid_cents: 24000,
    },
  });
  assert.equal(broadcastRes.statusCode, 200);
  const broadcastJson = broadcastRes.json();
  assert.equal(broadcastJson.eligible_for_synthetic_intent, false);

  // Test schema rejection
  const invalidBroadcastRes = await app.inject({
    method: 'POST',
    url: '/api/intent-vouchers/broadcast',
    payload: {
      mandate_id: '',
    },
  });
  assert.equal(invalidBroadcastRes.statusCode, 400);

  // Test GET voucher by id
  const getVoucherRes = await app.inject({
    method: 'GET',
    url: '/api/intent-vouchers/vch_sample_123',
  });
  assert.equal(getVoucherRes.statusCode, 200);
  const getVoucherJson = getVoucherRes.json();
  assert.equal(getVoucherJson.voucher_id, 'vch_sample_123');
  assert.equal(getVoucherJson.status, 'ACTIVE_PRICE_LOCK');
});
