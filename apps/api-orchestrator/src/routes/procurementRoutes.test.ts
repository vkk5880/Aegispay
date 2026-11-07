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
