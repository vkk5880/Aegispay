import test from 'node:test';
import assert from 'node:assert/strict';
import fastifyModule from 'fastify';
import { acpRoutes } from './acp.routes.js';

async function buildTestApp() {
  const app = fastifyModule({ logger: false });
  await app.register(acpRoutes);
  await app.ready();
  return app;
}

test('ACP Endpoint 1: GET /.well-known/acp.json returns standard RFC discovery manifest', async () => {
  const app = await buildTestApp();

  const res = await app.inject({
    method: 'GET',
    url: '/.well-known/acp.json',
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'public, max-age=3600');

  const manifest = res.json();
  assert.equal(manifest.protocol.name, 'acp');
  assert.ok(manifest.protocol.supported_versions.includes('2026-01-30'));
  assert.ok(manifest.protocol.supported_versions.includes('2025-09-29'));
  assert.ok(manifest.api_base_url);
  assert.ok(manifest.transports.includes('rest'));
  assert.ok(manifest.transports.includes('mcp'));
  assert.ok(manifest.capabilities.services.includes('checkout'));
  assert.ok(manifest.capabilities.services.includes('delegate_payment'));
  assert.ok(manifest.capabilities.payment_handlers.length > 0);
  assert.equal(manifest.capabilities.payment_handlers[0].id, 'paypal_vault_v3');
  assert.equal(manifest.capabilities.payment_handlers[0].psp, 'paypal');

  // Backwards compatibility with OpenAI ACP format
  assert.equal(manifest.name_for_model, 'aegispay_agentic_commerce');
  assert.ok(manifest.actions.some((a: any) => a.name === 'discover_products'));
});

test('ACP Endpoint 2: POST /acp/checkout_session creates session and calculates postal tax & shipping', async () => {
  const app = await buildTestApp();

  // 1. Test California zip code (tax ~8.63%)
  const caRes = await app.inject({
    method: 'POST',
    url: '/acp/checkout_session',
    headers: {
      'Idempotency-Key': 'idemp_test_ca_01',
      'API-Version': '2026-01-30',
    },
    payload: {
      currency: 'usd',
      items: [
        {
          id: 'item_headphones_123',
          name: 'Sony WH-1000XM5 Noise Cancelling Headphones',
          quantity: 1,
          unit_price_cents: 34800, // $348.00
        },
      ],
      fulfillment_details: {
        name: 'Jane Doe',
        address: {
          line_one: '555 Market St',
          city: 'San Francisco',
          state: 'CA',
          country: 'US',
          postal_code: '94105',
        },
      },
      order_notes: 'Leave at front desk',
    },
  });

  assert.equal(caRes.statusCode, 201);
  assert.equal(caRes.headers['idempotency-key'], 'idemp_test_ca_01');
  assert.equal(caRes.headers['api-version'], '2026-01-30');

  const caBody = caRes.json();
  assert.ok(caBody.id.startsWith('cs_'));
  assert.equal(caBody.status, 'ready_for_payment');
  assert.equal(caBody.currency, 'usd');
  assert.equal(caBody.line_items.length, 1);
  assert.equal(caBody.line_items[0].item.id, 'item_headphones_123');

  // Verify tax calculation for 94105 (CA: 863 bps = 8.63%)
  // $348.00 * 8.63% = ~3003 cents ($30.03)
  const taxTotal = caBody.totals.find((t: any) => t.type === 'tax');
  assert.ok(taxTotal);
  assert.equal(taxTotal.amount, 3003);

  // Subtotal $348 >= $100 -> standard shipping waived ($0)
  const shippingTotal = caBody.totals.find((t: any) => t.type === 'fulfillment');
  assert.ok(shippingTotal);
  assert.equal(shippingTotal.amount, 0);

  const finalTotal = caBody.totals.find((t: any) => t.type === 'total');
  assert.ok(finalTotal);
  assert.equal(finalTotal.amount, 34800 + 3003 + 0);

  // 2. Test Oregon zero tax zip code (97201 - 0% sales tax) and under $100 shipping fee ($5.00)
  const orRes = await app.inject({
    method: 'POST',
    url: '/acp/checkout_session',
    payload: {
      currency: 'usd',
      items: [
        {
          id: 'item_case_456',
          name: 'Protective Headphone Case',
          quantity: 1,
          unit_price_cents: 2500, // $25.00
        },
      ],
      fulfillment_details: {
        address: {
          line_one: '100 Main St',
          city: 'Portland',
          state: 'OR',
          country: 'US',
          postal_code: '97201',
        },
      },
    },
  });

  assert.equal(orRes.statusCode, 201);
  const orBody = orRes.json();
  const orTax = orBody.totals.find((t: any) => t.type === 'tax');
  assert.equal(orTax.amount, 0); // 0% tax in Oregon

  const orShipping = orBody.totals.find((t: any) => t.type === 'fulfillment');
  assert.equal(orShipping.amount, 500); // $5.00 shipping for under $100

  const orFinalTotal = orBody.totals.find((t: any) => t.type === 'total');
  assert.equal(orFinalTotal.amount, 2500 + 0 + 500); // 3000 cents ($30.00)

  // 3. Test invalid request payload schema validation
  const invalidRes = await app.inject({
    method: 'POST',
    url: '/acp/checkout_session',
    payload: {
      currency: 'usd',
      items: [], // requires min 1
    },
  });
  assert.equal(invalidRes.statusCode, 400);
  assert.equal(invalidRes.json().type, 'invalid_request');
});

test('ACP Endpoint 3: POST /acp/payment_handler executes delegated payment using PayPal Vault', async () => {
  const app = await buildTestApp();

  // Step 1: Create checkout session
  const sessionRes = await app.inject({
    method: 'POST',
    url: '/acp/checkout_session',
    payload: {
      currency: 'usd',
      items: [
        {
          id: 'item_tablet_88',
          name: 'Android Tablet Pro',
          quantity: 1,
          unit_price_cents: 19900,
        },
      ],
      fulfillment_details: {
        address: {
          line_one: '789 Elm St',
          city: 'Austin',
          state: 'TX',
          country: 'US',
          postal_code: '78701',
        },
      },
    },
  });

  assert.equal(sessionRes.statusCode, 201);
  const session = sessionRes.json();
  const sessionId = session.id;

  // Step 2: Execute delegated payment
  const payRes = await app.inject({
    method: 'POST',
    url: '/acp/payment_handler',
    headers: {
      'Idempotency-Key': 'idemp_pay_test_01',
    },
    payload: {
      checkout_session_id: sessionId,
      payment_handler_id: 'paypal_vault_v3',
      payment_token_id: 'vault_token_preauth_991',
      buyer_id: 'buyer_cust_123',
    },
  });

  assert.equal(payRes.statusCode, 200);
  const payBody = payRes.json();
  assert.equal(payBody.status, 'SUCCESS');
  assert.equal(payBody.checkout_session_id, sessionId);
  assert.ok(payBody.order.id);
  assert.ok(payBody.order.capture_id);
  assert.equal(payBody.order.status, 'COMPLETED');
  assert.equal(payBody.order.intent, 'CAPTURE');
  assert.equal(payBody.read_back_verified, true);
  assert.equal(payBody.payment_handler.vault_payment_token_id, 'vault_token_preauth_991');

  // Step 3: Repeated payment returns 409 conflict
  const repeatPayRes = await app.inject({
    method: 'POST',
    url: '/acp/payment_handler',
    payload: {
      checkout_session_id: sessionId,
      payment_handler_id: 'paypal_vault_v3',
    },
  });
  assert.equal(repeatPayRes.statusCode, 409);
  assert.equal(repeatPayRes.json().code, 'session_already_completed');

  // Step 4: Unknown session returns 404
  const notFoundRes = await app.inject({
    method: 'POST',
    url: '/acp/payment_handler',
    payload: {
      checkout_session_id: 'cs_non_existent',
      payment_handler_id: 'paypal_vault_v3',
    },
  });
  assert.equal(notFoundRes.statusCode, 404);
  assert.equal(notFoundRes.json().code, 'session_not_found');
});

test('ACP Endpoint 4: POST /api/acp/actions executes standardized ACP actions with 402 guardrails', async () => {
  const app = await buildTestApp();

  // 1. discover_products action
  const discoverRes = await app.inject({
    method: 'POST',
    url: '/api/acp/actions',
    payload: {
      action: 'discover_products',
      parameters: {
        query: 'noise cancelling wireless headphones',
      },
    },
  });

  assert.equal(discoverRes.statusCode, 200);
  const discoverBody = discoverRes.json();
  assert.equal(discoverBody.status, 'SUCCESS');
  assert.equal(discoverBody.action, 'discover_products');
  assert.ok(discoverBody.result);

  // 2. request_purchase_quote action
  const quoteRes = await app.inject({
    method: 'POST',
    url: '/api/acp/actions',
    payload: {
      action: 'request_purchase_quote',
      parameters: {
        mandate_id: 'mandate_acp_quote_01',
        channel3_product_id: 'ch3_prod_headphones',
        merchant_domain: 'sound-gear.com',
        retail_offer_cents: 34900,
        buyer_bid_cents: 30000,
      },
    },
  });

  assert.equal(quoteRes.statusCode, 200);
  const quoteBody = quoteRes.json();
  assert.equal(quoteBody.status, 'SUCCESS');
  assert.equal(quoteBody.action, 'request_purchase_quote');
  assert.ok(quoteBody.result.voucher_id);

  // 3. confirm_payment_hold without mandate credentials triggers HTTP 402 Payment Required
  const unauthHoldRes = await app.inject({
    method: 'POST',
    url: '/api/acp/actions',
    payload: {
      action: 'confirm_payment_hold',
      parameters: {
        merchant_domain: 'sound-gear.com',
        requested_cents: 30000,
        category_id: 'electronics',
        items: [{ product_id: 'ch3_prod_headphones', price_cents: 30000, quantity: 1 }],
      },
    },
  });

  assert.equal(unauthHoldRes.statusCode, 402);
  assert.equal(unauthHoldRes.json().error, 'PAYMENT_REQUIRED');
  assert.ok(unauthHoldRes.headers['x-payment-contract-id']);
  assert.ok(unauthHoldRes.headers['x-paypal-vault-setup-url']);

  // 4. confirm_payment_hold with header X-Spend-Mandate-Id succeeds
  const authHoldRes = await app.inject({
    method: 'POST',
    url: '/api/acp/actions',
    headers: {
      'X-Spend-Mandate-Id': 'mandate_acp_valid_99',
    },
    payload: {
      action: 'confirm_payment_hold',
      parameters: {
        mandate_id: 'mandate_acp_valid_99',
        merchant_domain: 'sound-gear.com',
        requested_cents: 30000,
        category_id: 'electronics',
        items: [{ product_id: 'ch3_prod_headphones', price_cents: 30000, quantity: 1 }],
      },
    },
  });

  assert.equal(authHoldRes.statusCode, 200);
  const authHoldBody = authHoldRes.json();
  assert.equal(authHoldBody.status, 'SUCCESS');
  assert.equal(authHoldBody.action, 'confirm_payment_hold');
  assert.ok(authHoldBody.result.paypal_order_id);
});
