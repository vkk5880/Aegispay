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

test('ACP Endpoint 1: GET /.well-known/acp.json returns standard RFC discovery manifest with carts & MCP', async () => {
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
  assert.ok(manifest.protocol.supported_versions.includes('2026-04-17'));
  assert.ok(manifest.api_base_url);
  assert.ok(manifest.transports.includes('rest'));
  assert.ok(manifest.transports.includes('mcp'));
  assert.ok(manifest.capabilities.services.includes('checkout'));
  assert.ok(manifest.capabilities.services.includes('carts'));
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

test('ACP Endpoint 2b: POST /checkout_sessions creates session, validates API-Version & write-only affiliate attribution', async () => {
  const app = await buildTestApp();

  // Test version rejection
  const badVerRes = await app.inject({
    method: 'POST',
    url: '/checkout_sessions',
    headers: {
      'api-version': '1999-01-01',
    },
    payload: {
      currency: 'USD',
      items: [{ id: 'item_1', quantity: 1, unit_price_cents: 5000 }],
    },
  });
  assert.equal(badVerRes.statusCode, 400);
  const badVerJson = badVerRes.json();
  assert.equal(badVerJson.code, 'unsupported_api_version');
  assert.ok(Array.isArray(badVerJson.supported_versions));

  // Valid create with affiliate attribution
  const res = await app.inject({
    method: 'POST',
    url: '/checkout_sessions',
    headers: {
      'api-version': '2026-01-30',
      'idempotency-key': 'idemp_unique_test_123',
    },
    payload: {
      currency: 'USD',
      items: [
        { id: 'item_prod_1', name: 'Ergonomic Desk', quantity: 1, unit_price_cents: 12000 },
      ],
      fulfillment_details: {
        address: {
          line_one: '123 Market St',
          city: 'Austin',
          state: 'TX',
          postal_code: '78701',
        },
      },
      affiliate_attribution: {
        provider: 'channel3.ai',
        token: 'atp_tok_secret_affiliate_123',
        touchpoint: 'first',
      },
    },
  });

  assert.equal(res.statusCode, 201);
  const session = res.json();
  assert.ok(session.id.startsWith('cs_'));
  assert.equal(session.status, 'ready_for_payment');
  assert.equal(session.line_items[0].subtotal, 12000);
  // Verify shipping waived for >= $100
  const shippingTotal = session.totals.find((t: any) => t.type === 'shipping');
  assert.equal(shippingTotal.amount, 0);

  // Crucial Security & Privacy Check: Affiliate Attribution must NOT be echoed in public response
  assert.equal(session.affiliate_attribution, undefined);

  // Test Idempotency replay with identical payload
  const replayPayload = {
    currency: 'USD',
    items: [
      { id: 'item_prod_1', name: 'Ergonomic Desk', quantity: 1, unit_price_cents: 12000 },
    ],
    fulfillment_details: {
      address: {
        line_one: '123 Market St',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
      },
    },
    affiliate_attribution: {
      provider: 'channel3.ai',
      token: 'atp_tok_secret_affiliate_123',
      touchpoint: 'first',
    },
  };

  const replayRes = await app.inject({
    method: 'POST',
    url: '/checkout_sessions',
    headers: {
      'idempotency-key': 'idemp_unique_test_123',
    },
    payload: replayPayload,
  });
  assert.equal(replayRes.statusCode, 201);
  assert.equal(replayRes.json().id, session.id);

  // Test Idempotency conflict with different payload returns 422
  const conflictRes = await app.inject({
    method: 'POST',
    url: '/checkout_sessions',
    headers: {
      'idempotency-key': 'idemp_unique_test_123',
    },
    payload: {
      currency: 'USD',
      items: [{ id: 'different_payload', quantity: 1 }],
    },
  });
  assert.equal(conflictRes.statusCode, 422);
  assert.equal(conflictRes.json().code, 'idempotency_conflict');
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

test('ACP Endpoint 3b: Full Lifecycle: GET, UPDATE, COMPLETE, CANCEL', async () => {
  const app = await buildTestApp();

  // 1. Create session
  const createRes = await app.inject({
    method: 'POST',
    url: '/checkout_sessions',
    payload: {
      currency: 'USD',
      items: [{ id: 'chair_1', quantity: 1, unit_price_cents: 8000 }],
    },
  });
  const created = createRes.json();
  const sessionId = created.id;

  // 2. GET session
  const getRes = await app.inject({
    method: 'GET',
    url: `/checkout_sessions/${sessionId}`,
  });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.json().id, sessionId);

  // 3. UPDATE session (full replacement items)
  const updateRes = await app.inject({
    method: 'POST',
    url: `/checkout_sessions/${sessionId}`,
    payload: {
      items: [{ id: 'chair_premium', quantity: 2, unit_price_cents: 9500 }],
    },
  });
  assert.equal(updateRes.statusCode, 200);
  const updated = updateRes.json();
  assert.equal(updated.line_items[0].subtotal, 19000);

  // 4. COMPLETE session
  const completeRes = await app.inject({
    method: 'POST',
    url: `/checkout_sessions/${sessionId}/complete`,
    payload: {
      payment_method: {
        type: 'vault_token',
        token: 'vault_tok_12345',
      },
      affiliate_attribution: {
        provider: 'channel3.ai',
        publisher_id: 'pub_top_picks',
        touchpoint: 'last',
      },
    },
  });
  assert.equal(completeRes.statusCode, 200);
  const completed = completeRes.json();
  assert.equal(completed.status, 'completed');
  assert.ok(completed.order);
  assert.ok(completed.order.order_id.startsWith('ord_'));

  // 5. CANCEL test on separate session
  const session2Res = await app.inject({
    method: 'POST',
    url: '/checkout_sessions',
    payload: {
      currency: 'USD',
      items: [{ id: 'lamp_1', quantity: 1, unit_price_cents: 3000 }],
    },
  });
  const session2Id = session2Res.json().id;

  const cancelRes = await app.inject({
    method: 'POST',
    url: `/checkout_sessions/${session2Id}/cancel`,
    payload: {
      reason: 'buyer_found_better_price',
      intent_trace: { trace_id: 'tr_test_1', stage: 'comparison' },
    },
  });
  assert.equal(cancelRes.statusCode, 200);
  assert.equal(cancelRes.json().status, 'cancelled');
  assert.equal(cancelRes.json().cancellation_reason, 'buyer_found_better_price');
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

test('SEP #187: Pre-Checkout Cart Capability (/carts)', async () => {
  const app = await buildTestApp();

  // 1. Create pre-checkout cart
  const createCartRes = await app.inject({
    method: 'POST',
    url: '/carts',
    payload: {
      items: [
        { id: 'item_a', name: 'Mechanical Keyboard', quantity: 1, unit_price_cents: 15000 },
        { id: 'item_b', name: 'Keycap Set', quantity: 1, unit_price_cents: 4500 },
      ],
      buyer: { email: 'shopper@example.com' },
    },
  });

  assert.equal(createCartRes.statusCode, 201);
  const cart = createCartRes.json();
  assert.ok(cart.id.startsWith('cart_'));
  assert.equal(cart.totals.subtotal_cents, 19500);
  assert.ok(cart.continue_url.includes(cart.id));
  assert.ok(cart.expires_at);

  // 2. GET cart
  const getCartRes = await app.inject({
    method: 'GET',
    url: `/carts/${cart.id}`,
  });
  assert.equal(getCartRes.statusCode, 200);
  assert.equal(getCartRes.json().id, cart.id);

  // 3. PUT cart update
  const putCartRes = await app.inject({
    method: 'PUT',
    url: `/carts/${cart.id}`,
    payload: {
      items: [
        { id: 'item_a', name: 'Mechanical Keyboard', quantity: 2, unit_price_cents: 15000 },
      ],
    },
  });
  assert.equal(putCartRes.statusCode, 200);
  assert.equal(putCartRes.json().totals.subtotal_cents, 30000);

  // 4. CANCEL cart
  const cancelCartRes = await app.inject({
    method: 'POST',
    url: `/carts/${cart.id}/cancel`,
  });
  assert.equal(cancelCartRes.statusCode, 200);
  assert.equal(cancelCartRes.json().status, 'cancelled');

  // Verify 404 after cancellation
  const getAfterCancel = await app.inject({
    method: 'GET',
    url: `/carts/${cart.id}`,
  });
  assert.equal(getAfterCancel.statusCode, 404);
});

test('MCP Transport Binding: POST /mcp JSON-RPC 2.0 tool executions', async () => {
  const app = await buildTestApp();

  // Test create_checkout_session via MCP
  const mcpCreateRes = await app.inject({
    method: 'POST',
    url: '/mcp',
    payload: {
      jsonrpc: '2.0',
      id: 101,
      method: 'create_checkout_session',
      params: {
        meta: {
          api_version: '2026-01-30',
          request_id: 'req_mcp_test_1',
        },
        payload: {
          currency: 'usd',
          items: [{ id: 'mcp_item_1', name: 'MCP Widget', quantity: 2, unit_price_cents: 3500 }],
        },
      },
    },
  });

  assert.equal(mcpCreateRes.statusCode, 200);
  const mcpCreateBody = mcpCreateRes.json();
  assert.equal(mcpCreateBody.jsonrpc, '2.0');
  assert.equal(mcpCreateBody.id, 101);
  assert.ok(mcpCreateBody.result);
  assert.ok(mcpCreateBody.result.id.startsWith('cs_'));

  // Test get_checkout_session with non-existent ID returning uniform -32000 error
  const mcpErrRes = await app.inject({
    method: 'POST',
    url: '/mcp',
    payload: {
      jsonrpc: '2.0',
      id: 102,
      method: 'get_checkout_session',
      params: {
        meta: { api_version: '2026-01-30' },
        id: 'cs_nonexistent_999',
      },
    },
  });

  assert.equal(mcpErrRes.statusCode, 200);
  const mcpErrBody = mcpErrRes.json();
  assert.equal(mcpErrBody.jsonrpc, '2.0');
  assert.equal(mcpErrBody.id, 102);
  assert.ok(mcpErrBody.error);
  assert.equal(mcpErrBody.error.code, -32000);
  assert.equal(mcpErrBody.error.data.code, 'session_not_found');
});

test('Batch 2: Capability Negotiation — Computes strict intersection of interventions', async () => {
  const app = await buildTestApp();

  // Agent requests 3ds and biometric
  const res = await app.inject({
    method: 'POST',
    url: '/checkout_sessions',
    payload: {
      currency: 'USD',
      items: [{ id: 'item_cap_1', quantity: 1, unit_price_cents: 6000 }],
      capabilities: {
        interventions: {
          supported: ['3ds', 'biometric'],
          display_context: 'webview',
        },
      },
    },
  });

  assert.equal(res.statusCode, 201);
  const session = res.json();
  assert.ok(session.capabilities.interventions);
  // Server supports ['3ds', 'biometric', 'address_verification']. Intersection must be ['3ds', 'biometric']
  assert.deepEqual(session.capabilities.interventions.supported, ['3ds', 'biometric']);
  assert.ok(session.capabilities.extensions.some((e: any) => e.name === 'discount'));
});

test('Batch 2: Discount Extension — Validates code application, automatic allocations & rejection', async () => {
  const app = await buildTestApp();

  const res = await app.inject({
    method: 'POST',
    url: '/checkout_sessions',
    payload: {
      currency: 'USD',
      items: [{ id: 'item_disc_1', quantity: 1, unit_price_cents: 10000 }],
      discounts: {
        codes: ['PAYPAL-HACKATHON-2026', 'EXPIRED10', 'BOGUS99'],
      },
    },
  });

  assert.equal(res.statusCode, 201);
  const session = res.json();
  assert.ok(session.discounts);
  assert.equal(session.discounts.applied.length, 1);
  assert.equal(session.discounts.applied[0].code, 'PAYPAL-HACKATHON-2026');
  assert.equal(session.discounts.applied[0].amount, 2000);
  assert.equal(session.discounts.rejected.length, 2);
  assert.equal(session.discounts.rejected.find((r: any) => r.code === 'EXPIRED10')?.reason, 'expired_code');
  assert.equal(session.discounts.rejected.find((r: any) => r.code === 'BOGUS99')?.reason, 'invalid_code');

  const discountTotal = session.totals.find((t: any) => t.type === 'discount');
  assert.ok(discountTotal);
  assert.equal(discountTotal.amount, 2000);
});

test('Batch 2: Delegate Consumer Authentication (3DS2) Endpoints', async () => {
  const app = await buildTestApp();

  // 1. Create 3DS authentication session with challenge preference
  const createRes = await app.inject({
    method: 'POST',
    url: '/delegate_authentication',
    payload: {
      merchant_id: 'merchant_aegis_test',
      payment_method: {
        type: 'card',
        number: '4111111111111111',
        exp_month: '12',
        exp_year: '2028',
      },
      amount: {
        value: 15000,
        currency: 'USD',
      },
      flow_preference: {
        type: 'challenge',
      },
    },
  });

  assert.equal(createRes.statusCode, 201);
  const authSession = createRes.json();
  assert.ok(authSession.authentication_session_id.startsWith('auth_sess_'));
  assert.equal(authSession.status, 'action_required');
  assert.equal(authSession.action.type, 'fingerprint');
  assert.ok(authSession.action.fingerprint.three_ds_method_url);

  // 2. Submit fingerprint result
  const authRes = await app.inject({
    method: 'POST',
    url: `/delegate_authentication/${authSession.authentication_session_id}/authenticate`,
    payload: {
      fingerprint_completion: 'Y',
    },
  });
  assert.equal(authRes.statusCode, 200);
  assert.equal(authRes.json().status, 'authenticated');

  // 3. Retrieve final authentication result
  const getRes = await app.inject({
    method: 'GET',
    url: `/delegate_authentication/${authSession.authentication_session_id}`,
  });
  assert.equal(getRes.statusCode, 200);
  const finalResult = getRes.json();
  assert.equal(finalResult.status, 'authenticated');
  assert.equal(finalResult.authentication_result.trans_status, 'Y');
  assert.equal(finalResult.authentication_result.electronic_commerce_indicator, '05');
  assert.ok(finalResult.authentication_result.three_ds_cryptogram);
});

test('Batch 2: Delegate Payment API — Issues vault token with allowance and risk signals', async () => {
  const app = await buildTestApp();

  // Rejection when Idempotency-Key is missing
  const missingIdempRes = await app.inject({
    method: 'POST',
    url: '/agentic_commerce/delegate_payment',
    payload: {
      payment_method: { type: 'card', number: '4111' },
    },
  });
  assert.equal(missingIdempRes.statusCode, 400);
  assert.equal(missingIdempRes.json().code, 'idempotency_key_required');

  // Valid delegate payment request
  const validRes = await app.inject({
    method: 'POST',
    url: '/agentic_commerce/delegate_payment',
    headers: {
      'idempotency-key': 'idemp_delpay_unique_99',
      'api-version': '2025-09-29',
    },
    payload: {
      payment_method: {
        type: 'card',
        card_number_type: 'fpan',
        virtual: true,
        number: '4111111111111111',
        exp_month: '11',
        exp_year: '2027',
        display_card_funding_type: 'credit',
      },
      allowance: {
        reason: 'one_time',
        max_amount: 25000,
        currency: 'usd',
        checkout_session_id: 'cs_test_session_1',
        merchant_id: 'merchant_test_1',
        expires_at: '2026-12-31T23:59:59Z',
      },
      risk_signals: [
        {
          type: 'card_testing',
          score: 5,
          action: 'authorized',
        },
      ],
      metadata: {
        partner_agent: 'chatgpt',
      },
    },
  });

  assert.equal(validRes.statusCode, 201);
  const tokenBody = validRes.json();
  assert.ok(tokenBody.id.startsWith('vt_'));
  assert.equal(tokenBody.metadata.merchant_id, 'merchant_test_1');
  assert.equal(tokenBody.metadata.max_amount, '25000');

  // Verify Idempotency replay
  const replayRes = await app.inject({
    method: 'POST',
    url: '/agentic_commerce/delegate_payment',
    headers: {
      'idempotency-key': 'idemp_delpay_unique_99',
    },
    payload: {
      different: 'data',
    },
  });
  assert.equal(replayRes.statusCode, 201);
  assert.equal(replayRes.json().id, tokenBody.id);
});

test('Batch 3: Intent Traces on cancellation (rfc.intent_traces.md)', async () => {
  const app = await buildTestApp();

  const sessionRes = await app.inject({
    method: 'POST',
    url: '/checkout_sessions',
    payload: {
      currency: 'USD',
      items: [{ id: 'chair_cancel_test', quantity: 1, unit_price_cents: 9000 }],
    },
  });
  const sessionId = sessionRes.json().id;

  const cancelRes = await app.inject({
    method: 'POST',
    url: `/checkout_sessions/${sessionId}/cancel`,
    payload: {
      intent_trace: {
        reason_code: 'price_sensitivity',
        trace_summary: 'User found identical item for $15 less on another retailer',
        metadata: {
          competitor_price: 7500,
          target_discount_pct: 15,
        },
      },
    },
  });

  assert.equal(cancelRes.statusCode, 200);
  const cancelJson = cancelRes.json();
  assert.equal(cancelJson.status, 'cancelled');
  // Intent trace must NOT be leaked back in public response (write-only privacy rule)
  assert.equal(cancelJson.intent_trace, undefined);
  assert.equal(cancelJson.cancellation_reason, 'price_sensitivity');
});

test('Batch 3: Marketing Consent capture and Enhanced Order tracking (rfc.marketing_consent.md & rfc.orders.md)', async () => {
  const app = await buildTestApp();

  // 1. Create session and verify marketing_consent_options declaration
  const sessionRes = await app.inject({
    method: 'POST',
    url: '/checkout_sessions',
    payload: {
      currency: 'USD',
      items: [{ id: 'shoes_123', name: 'Running Shoes', quantity: 1, unit_price_cents: 11000 }],
    },
  });
  const session = sessionRes.json();
  assert.ok(session.marketing_consent_options);
  assert.ok(session.marketing_consent_options.some((o: any) => o.channel === 'email'));

  // 2. Complete session with marketing consent decisions
  const completeRes = await app.inject({
    method: 'POST',
    url: `/checkout_sessions/${session.id}/complete`,
    payload: {
      payment_method: { type: 'vault_token', token: 'vault_tok_test_999' },
      marketing_consents: [
        { channel: 'email', opted_in: true },
        { channel: 'sms', opted_in: false },
      ],
    },
  });
  assert.equal(completeRes.statusCode, 200);
  const orderInfo = completeRes.json().order;
  assert.ok(orderInfo);

  // 3. Retrieve Enhanced Order via GET /orders/:id
  const orderRes = await app.inject({
    method: 'GET',
    url: `/orders/${orderInfo.order_id}`,
  });
  assert.equal(orderRes.statusCode, 200);
  const order = orderRes.json();
  assert.equal(order.type, 'order');
  assert.equal(order.status, 'confirmed');
  assert.ok(order.line_items);
  assert.equal(order.line_items[0].quantity.ordered, 1);
  assert.equal(order.line_items[0].quantity.current, 1);
  assert.equal(order.line_items[0].quantity.fulfilled, 0);
  assert.equal(order.line_items[0].status, 'processing');
  assert.ok(order.fulfillments);
  assert.equal(order.fulfillments[0].type, 'shipping');
  assert.ok(order.fulfillments[0].tracking_number);
});

test('Batch 4 & 5: Product Feeds API lifecycle (rfc.product_feeds.md)', async () => {
  const app = await buildTestApp();

  // 1. Create product feed
  const createFeedRes = await app.inject({
    method: 'POST',
    url: '/feeds',
    payload: { target_country: 'US' },
  });
  assert.equal(createFeedRes.statusCode, 201);
  const feed = createFeedRes.json();
  assert.ok(feed.id.startsWith('feed_'));

  // 2. Upsert items into feed
  const upsertRes = await app.inject({
    method: 'POST',
    url: `/feeds/${feed.id}/items`,
    payload: {
      items: [
        {
          id: 'prod_wireless_earbuds',
          title: 'Active Noise Canceling Earbuds',
          variants: [
            {
              id: 'var_white',
              title: 'Matte White',
              price: { amount_cents: 9900, currency: 'USD' },
              availability: 'in_stock',
            },
          ],
        },
      ],
    },
  });
  assert.equal(upsertRes.statusCode, 200);
  assert.equal(upsertRes.json().accepted, true);
  assert.ok(upsertRes.json().feed_update_id);
  assert.equal(upsertRes.json().upserted_count, 1);

  // 3. List items in feed
  const listItemsRes = await app.inject({
    method: 'GET',
    url: `/feeds/${feed.id}/items`,
  });
  assert.equal(listItemsRes.statusCode, 200);
  assert.equal(listItemsRes.json().items.length, 1);
  assert.equal(listItemsRes.json().items[0].id, 'prod_wireless_earbuds');
});

test('Batch 6 & 7: ACP Webhooks and OpenRPC endpoints', async () => {
  const app = await buildTestApp();

  // 1. Test Webhook order_create reception
  const whRes = await app.inject({
    method: 'POST',
    url: '/api/webhooks/acp',
    payload: {
      event: 'order_create',
      event_id: 'evt_test_create_99',
      created_at: new Date().toISOString(),
      order: {
        type: 'order',
        id: 'ord_wh_test_1',
        checkout_session_id: 'cs_wh_test_1',
        permalink_url: 'https://aegispay.dev/orders/ord_wh_test_1',
        status: 'confirmed',
      },
    },
  });
  assert.equal(whRes.statusCode, 200);
  assert.equal(whRes.json().received, true);
  assert.equal(whRes.json().event, 'order_create');

  // 2. Test OpenRPC metadata endpoint
  const rpcRes = await app.inject({
    method: 'GET',
    url: '/.well-known/openrpc.json',
  });
  assert.equal(rpcRes.statusCode, 200);
  const rpcJson = rpcRes.json();
  assert.equal(rpcJson.openrpc, '1.3.2');
  assert.equal(rpcJson.info.version, '2026-04-17');
  assert.equal(rpcJson.methods.length, 5);
});

test('Batch 6 OpenAPI Audit: Canonical webhook endpoint /agentic_checkout/webhooks/order_events', async () => {
  const app = await buildTestApp();

  const whRes = await app.inject({
    method: 'POST',
    url: '/agentic_checkout/webhooks/order_events',
    payload: {
      event: 'order_update',
      event_id: 'evt_canonical_webhook_1',
      updated_at: new Date().toISOString(),
      order_id: 'ord_canonical_test_1',
      status: 'shipped',
    },
  });

  assert.equal(whRes.statusCode, 200);
  assert.equal(whRes.json().received, true);
  assert.equal(whRes.json().event, 'order_update');
});

test("Batch 3 A2A Protocol: GET /.well-known/agent-card.json returns valid AgentCard with x402 extension", async () => {
  const app = await buildTestApp();

  const res = await app.inject({
    method: "GET",
    url: "/.well-known/agent-card.json",
  });

  assert.equal(res.statusCode, 200);
  const card = res.json();
  assert.equal(card.name, "AegisPay Agentic Merchant");
  assert.equal(card.capabilities.streaming, true);
  assert.equal(card.capabilities.extensions[0].required, true);
  assert.equal(card.capabilities.extensions[0].uri, "https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.2");
});
