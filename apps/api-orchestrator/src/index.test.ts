import test from 'node:test';
import assert from 'node:assert/strict';
import { CartSolver } from './services/cart-solver.js';
import { Channel3ProductDetail, Channel3Client } from './services/channel3.client.js';
import { TaxEstimatorService } from './services/tax-estimator.js';
import { DisputeMatrixService } from './services/dispute-matrix.js';
import { SyntheticIntentEngine } from './services/synthetic-intent.js';
import { CounterBidEngine } from './services/counter-bid-engine.js';
import { PayPalApimaticClient } from './services/paypal-apimatic.js';
import crypto from 'node:crypto';
import { AtomicSpendEnforcer } from '@aegispay/mcp-enforcer';
import { buildApp } from './index.js';

test('CartSolver: minimizes net expenditure across multi-merchant offers with rebate', () => {
  const solver = new CartSolver({ alpha: 0.75, lambdaAnomaly: 5000 });
  const mockProducts: Channel3ProductDetail[] = [
    {
      product_id: 'p1',
      title: 'Item 1',
      description: 'Desc 1',
      category_id: 'c1',
      offers: [
        {
          id: 'o1',
          product_id: 'p1',
          domain: 'merchant-a.com',
          price: 10000, // $100
          compare_at_price: 12000,
          max_commission_rate: 0.10, // 10% -> 0.75 * 10% = $7.50 rebate
          shipping_fee_cents: 1000,
          shipping_waiver_threshold_cents: 15000,
          merchant_anomaly_score: 0.0,
        },
        {
          id: 'o2',
          product_id: 'p1',
          domain: 'merchant-b.com',
          price: 9500, // $95
          compare_at_price: 12000,
          max_commission_rate: 0.05, // 5% -> 0.75 * 5% = $3.56 rebate
          shipping_fee_cents: 1000,
          shipping_waiver_threshold_cents: 15000,
          merchant_anomaly_score: 0.0,
        },
      ],
      images: [{ url: 'http://img.com/1', cleaned_url: 'http://img.com/1-clean' }],
    },
    {
      product_id: 'p2',
      title: 'Item 2',
      description: 'Desc 2',
      category_id: 'c1',
      offers: [
        {
          id: 'o3',
          product_id: 'p2',
          domain: 'merchant-a.com',
          price: 6000, // $60 (Together with p1 at merchant-a = $160 >= $150 waiver -> $0 shipping)
          compare_at_price: 7000,
          max_commission_rate: 0.10,
          shipping_fee_cents: 1000,
          shipping_waiver_threshold_cents: 15000,
          merchant_anomaly_score: 0.0,
        },
        {
          id: 'o4',
          product_id: 'p2',
          domain: 'merchant-b.com',
          price: 6000,
          compare_at_price: 7000,
          max_commission_rate: 0.05,
          shipping_fee_cents: 1000,
          shipping_waiver_threshold_cents: 15000,
          merchant_anomaly_score: 0.0,
        },
      ],
      images: [{ url: 'http://img.com/2', cleaned_url: 'http://img.com/2-clean' }],
    },
  ];

  const result = solver.solve(mockProducts, [
    { product_id: 'p1', quantity: 1 },
    { product_id: 'p2', quantity: 1 },
  ]);

  assert.ok(result.assigned_merchants.length > 0);
  // Bundling at merchant-a waives shipping because $100 + $60 = $160 >= $150 threshold
  assert.equal(result.assigned_merchants[0].merchant_domain, 'merchant-a.com');
  assert.equal(result.assigned_merchants[0].shipping_waived, true);
  assert.ok(result.total_commission_rebate_cents > 0);
  assert.ok(result.paypal_purchase_units.length > 0);
});

test('DisputeMatrixService: correctly calculates (L, R) and selects deterministic tiers', async () => {
  const service = new DisputeMatrixService();

  // Tier 1 test (L >= 0.75, R < 0.20, Amount <= $50)
  const t1 = service.calculateLiabilityAndAbuse({
    defect_severity_score: 0.9,
    non_delivery_score: 0.9,
    policy_valid_score: 0.9,
    exif_tamper_flag: false,
    identity_match_score: 1.0,
    buyer_dispute_velocity_score: 0.0,
    dispute_amount_cents: 4000,
  });
  assert.equal(t1.selected_tier_action, 'TIER1_REFUND');
  assert.ok(t1.liability_score_l >= 0.75);
  assert.ok(t1.abuse_risk_score_r < 0.20);

  // Tier 4 test (EXIF tamper detected, high R)
  const t4 = service.calculateLiabilityAndAbuse({
    defect_severity_score: 0.3,
    non_delivery_score: 0.0,
    policy_valid_score: 0.5,
    exif_tamper_flag: true, // 0.50 + 0.30*(1-0.2) = 0.74 => R >= 0.60
    identity_match_score: 0.2,
    buyer_dispute_velocity_score: 0.5,
    dispute_amount_cents: 12000,
  });
  assert.equal(t4.selected_tier_action, 'TIER4_CONTEST_PDF');
  assert.ok(t4.abuse_risk_score_r >= 0.60);

  // PDF dossier builder
  const dossier = await service.buildForensicPdfDossier({
    dispute_id: 'PP-TEST-DISPUTE-101',
    merchant_domain: 'techmerchant.com',
    product_id: 'ch3_prod_9921',
    dispute_reason: 'MERCHANDISE_NOT_AS_DESCRIBED',
    dispute_amount_cents: 12000,
    decision: t4,
  });
  assert.ok(dossier.buffer.length > 500);
  assert.ok(dossier.base64.length > 500);
});

test('SyntheticIntentEngine: triggers on 5%-18% overage and produces Vault v3 setup token', async () => {
  const engine = new SyntheticIntentEngine();

  // 10% overage: Retail $440 on $400 budget
  const res = await engine.processSyntheticBid({
    mandate_id: 'mandate_test_123',
    channel3_product_id: 'ch3_prod_9921',
    merchant_domain: 'techmerchant.com',
    retail_offer_cents: 44000,
    buyer_budget_cap_cents: 40000,
  });

  assert.equal(res.eligible_for_synthetic_intent, true);
  assert.equal(res.overage_percentage, 10);
  assert.ok(res.paypal_vault_setup_token_id);
  assert.ok(res.voucher_id);
});

test('PayPalApimaticClient: creates multi-purchase unit payload and validates read-back', async () => {
  const client = new PayPalApimaticClient();
  const token = await client.getAccessToken();
  assert.ok(token);

  const order = await client.createMultiPurchaseUnitOrder({
    intent: 'AUTHORIZE',
    purchaseUnits: [
      {
        reference_id: 'PU_TEST_1',
        amount: {
          currency_code: 'USD',
          value: '45.00',
        },
      },
    ],
  }) as any;

  assert.ok(order?.id);

  const readback = await client.getOrder(order.id) as any;
  assert.ok(readback);
  assert.equal(readback.server_readback_verified, true);
});

test('HTTP Routes: Fastify endpoints respond accurately', async () => {
  const app = await buildApp();

  // Root health
  const rootRes = await app.inject({ method: 'GET', url: '/' });
  assert.equal(rootRes.statusCode, 200);

  // Integrations verify
  const verifyRes = await app.inject({ method: 'GET', url: '/api/integrations/verify' });
  assert.equal(verifyRes.statusCode, 200);
  const verifyBody = verifyRes.json();
  assert.equal(verifyBody.status, 'HEALTHY');
  assert.ok(verifyBody.integrations.paypal);

  // Knapsack endpoint
  const knapsackRes = await app.inject({
    method: 'POST',
    url: '/api/buyer/knapsack',
    payload: {
      query: 'headphones',
    },
  });
  assert.equal(knapsackRes.statusCode, 200);
  assert.ok(knapsackRes.json().optimization);

  // Synthetic bid endpoint
  const bidRes = await app.inject({
    method: 'POST',
    url: '/api/buyer/synthetic-bid',
    payload: {
      mandate_id: 'vch_test_999',
      channel3_product_id: 'ch3_prod_9921',
      merchant_domain: 'techmerchant.com',
      retail_offer_cents: 44000,
      buyer_budget_cap_cents: 40000,
    },
  });
  assert.equal(bidRes.statusCode, 200);
  assert.equal(bidRes.json().evaluation.eligible_for_synthetic_intent, true);

  // PayPal webhook signature check
  const webhookRes = await app.inject({
    method: 'POST',
    url: '/api/webhooks/paypal',
    headers: {
      'paypal-transmission-sig': 'mock_sig_test',
    },
    payload: {
      event_type: 'CUSTOMER.DISPUTE.CREATED',
      resource: { dispute_id: 'PP-D-123' },
    },
  });
  assert.equal(webhookRes.statusCode, 200);
  assert.equal(webhookRes.json().status, 'PROCESSED');

  // HTTP 402 Gateway Interceptor: unauthenticated call without X-Spend-Mandate-Id or X-Synthetic-Voucher-Id
  const unauthCheckoutRes = await app.inject({
    method: 'POST',
    url: '/api/buyer/authorize',
    payload: {
      mandate_id: 'mandate_123',
      purchase_units: [],
    },
  });
  assert.equal(unauthCheckoutRes.statusCode, 402);
  assert.ok(unauthCheckoutRes.headers['x-payment-contract-id']);
  assert.ok(unauthCheckoutRes.headers['x-paypal-vault-setup-url']);
  assert.ok(unauthCheckoutRes.headers['x-aegis-spend-policy']);
  const challengeBody = unauthCheckoutRes.json();
  assert.equal(challengeBody.error, 'PAYMENT_REQUIRED');
  assert.equal(challengeBody.status, 402);
  assert.equal(challengeBody.challenge.type, 'https://aegispay.dev/protocols/http402');

  // HTTP 402 Gateway Interceptor: authenticated call with X-Spend-Mandate-Id header passes interceptor
  const authCheckoutRes = await app.inject({
    method: 'POST',
    url: '/api/buyer/authorize',
    headers: {
      'x-spend-mandate-id': 'mandate_123',
    },
    payload: {
      mandate_id: 'mandate_123',
      purchase_units: [
        {
          reference_id: 'pu_test',
          amount: { currency_code: 'USD', value: '50.00' },
        },
      ],
    },
  });
  assert.equal(authCheckoutRes.statusCode, 200);
  assert.equal(authCheckoutRes.json().status, 'AUTHORIZED');
  assert.equal(authCheckoutRes.json().stock_reservation_status, 'HELD_2PC');

  // ACP Manifest discovery
  const acpManifestRes = await app.inject({
    method: 'GET',
    url: '/.well-known/acp.json',
  });
  assert.equal(acpManifestRes.statusCode, 200);
  const manifest = acpManifestRes.json();
  assert.equal(manifest.protocol, 'OPENAI_ACP_v1');
  assert.equal(manifest.name_for_model, 'aegispay_agentic_commerce');
  assert.ok(manifest.actions.some((a: any) => a.name === 'discover_products'));
  assert.ok(manifest.actions.some((a: any) => a.name === 'request_purchase_quote'));
  assert.ok(manifest.actions.some((a: any) => a.name === 'confirm_payment_hold'));

  // ACP Action execution: discover_products
  const acpDiscoverRes = await app.inject({
    method: 'POST',
    url: '/api/acp/actions',
    payload: {
      action: 'discover_products',
      parameters: {
        query: 'mechanical keyboard',
      },
    },
  });
  assert.equal(acpDiscoverRes.statusCode, 200);
  assert.equal(acpDiscoverRes.json().status, 'SUCCESS');
  assert.equal(acpDiscoverRes.json().action, 'discover_products');

  // ACP Action execution: request_purchase_quote
  const acpQuoteRes = await app.inject({
    method: 'POST',
    url: '/api/acp/actions',
    payload: {
      action: 'request_purchase_quote',
      parameters: {
        mandate_id: 'vch_test_999',
        channel3_product_id: 'ch3_prod_9921',
        merchant_domain: 'techmerchant.com',
        retail_offer_cents: 44000,
        buyer_bid_cents: 40000,
      },
    },
  });
  assert.equal(acpQuoteRes.statusCode, 200);
  assert.equal(acpQuoteRes.json().status, 'SUCCESS');
  assert.equal(acpQuoteRes.json().action, 'request_purchase_quote');

  // ACP Action execution: confirm_payment_hold without auth header returns 402
  const acpHoldUnauthRes = await app.inject({
    method: 'POST',
    url: '/api/acp/actions',
    payload: {
      action: 'confirm_payment_hold',
      parameters: {
        merchant_domain: 'techmerchant.com',
        requested_cents: 10000,
        category_id: 'cat_electronics',
        items: [{ product_id: 'p1', price_cents: 10000, quantity: 1 }],
      },
    },
  });
  assert.equal(acpHoldUnauthRes.statusCode, 402);
  assert.equal(acpHoldUnauthRes.json().error, 'PAYMENT_REQUIRED');

  // ACP Action execution: confirm_payment_hold with header succeeds
  const acpHoldAuthRes = await app.inject({
    method: 'POST',
    url: '/api/acp/actions',
    headers: {
      'x-spend-mandate-id': 'mandate_123',
    },
    payload: {
      action: 'confirm_payment_hold',
      parameters: {
        mandate_id: 'mandate_123',
        merchant_domain: 'techmerchant.com',
        requested_cents: 10000,
        category_id: 'cat_electronics',
        items: [{ product_id: 'p1', price_cents: 10000, quantity: 1 }],
      },
    },
  });
  assert.equal(acpHoldAuthRes.statusCode, 200);
  assert.equal(acpHoldAuthRes.json().status, 'SUCCESS');
  assert.equal(acpHoldAuthRes.json().action, 'confirm_payment_hold');
});

test('TaxEstimatorService: resolves postal tax rates in basis points and computes jurisdictional tax', () => {
  const estimator = new TaxEstimatorService();

  // California 94103 -> CA 863 bps (8.63%)
  const caTax = estimator.calculateTax(10000, '94103');
  assert.equal(caTax.state_code, 'CA');
  assert.equal(caTax.tax_rate_bps, 863);
  assert.equal(caTax.tax_cents, 863);

  // Oregon 97201 -> OR 0 bps (0%)
  const orTax = estimator.calculateTax(10000, '97201');
  assert.equal(orTax.state_code, 'OR');
  assert.equal(orTax.tax_rate_bps, 0);
  assert.equal(orTax.tax_cents, 0);

  // Default fallback for unknown or empty zip
  const defTax = estimator.calculateTax(10000);
  assert.equal(defTax.state_code, 'US_DEFAULT');
  assert.equal(defTax.tax_rate_bps, 700);
  assert.equal(defTax.tax_cents, 700);
});

test('CartSolver with zip tax: incorporates estimated tax into merchant groups & PayPal purchase units', () => {
  const solver = new CartSolver();
  const mockProducts: Channel3ProductDetail[] = [
    {
      product_id: 'prod_tax_1',
      title: 'Taxable Monitor',
      description: '4K Display',
      category_id: 'xoN',
      offers: [
        {
          id: 'off_tax_1',
          product_id: 'prod_tax_1',
          domain: 'displays-direct.com',
          price: 50000, // $500.00
          compare_at_price: 55000,
          max_commission_rate: 0.10, // 10%
          shipping_fee_cents: 1500,
          shipping_waiver_threshold_cents: 40000, // shipping waived
          merchant_anomaly_score: 0.0,
        },
      ],
      images: [{ url: 'http://img.com/mon', cleaned_url: 'http://img.com/mon-clean' }],
    },
  ];

  // Run with Texas zip 78701 (825 bps = 8.25%)
  const result = solver.solve(
    mockProducts,
    [{ product_id: 'prod_tax_1', quantity: 1 }],
    { zipCode: '78701' }
  );

  assert.equal(result.zip_code, '78701');
  assert.ok(result.total_tax_cents > 0);
  // Subtotal $500.00 * 8.25% = $41.25 -> 4125 cents
  assert.equal(result.total_tax_cents, 4125);

  const pu = result.paypal_purchase_units[0];
  assert.ok(pu.amount.breakdown.tax_total);
  assert.equal(pu.amount.breakdown.tax_total.value, '41.25');
});

test('Channel3Client verifyAndHoldStock: executes 2PC pre-flight check and provides fallback re-optimization', async () => {
  const ch3 = new Channel3Client();

  // Test successful 2PC reservation with existing items
  const holdRes = await ch3.verifyAndHoldStock(['ch3_prod_9921', 'ch3_prod_9922']);
  assert.equal(holdRes.all_held, true);
  assert.ok(holdRes.reservation_id.startsWith('res_2pc_'));
  assert.equal(holdRes.verified_items.length, 2);
  assert.equal(holdRes.verified_items[0].status, 'RESERVED_2PC');

  // Test stock failure when SKU is out of stock / unknown
  const mixedCatalog: Channel3ProductDetail[] = [
    {
      product_id: 'p_instock',
      title: 'In Stock Item',
      description: 'Available',
      category_id: 'xoN',
      offers: [
        {
          id: 'o_in',
          product_id: 'p_instock',
          domain: 'shop.com',
          price: 2000,
          compare_at_price: 2500,
          max_commission_rate: 0.05,
          stock_status: 'IN_STOCK',
        },
      ],
      images: [{ url: 'http://img.com/1', cleaned_url: 'http://img.com/1-clean' }],
    },
    {
      product_id: 'p_outstock',
      title: 'Sold Out Item',
      description: 'Unavailable',
      category_id: 'xoN',
      offers: [
        {
          id: 'o_out',
          product_id: 'p_outstock',
          domain: 'shop.com',
          price: 5000,
          compare_at_price: 6000,
          max_commission_rate: 0.05,
          stock_status: 'OUT_OF_STOCK',
        },
      ],
      images: [{ url: 'http://img.com/2', cleaned_url: 'http://img.com/2-clean' }],
    },
  ];

  const failedHoldRes = await ch3.verifyAndHoldStock(
    ['p_instock', 'p_outstock'],
    { catalog: mixedCatalog, zipCode: '94103' }
  );

  assert.equal(failedHoldRes.all_held, false);
  assert.deepEqual(failedHoldRes.failed_items, ['p_outstock']);
  // Fallback re-optimization should automatically solve basket with remaining in-stock items
  assert.ok(failedHoldRes.fallback_reoptimization);
  assert.equal(failedHoldRes.fallback_reoptimization.assigned_merchants.length, 1);
  assert.equal(failedHoldRes.fallback_reoptimization.assigned_merchants[0].items[0].product_id, 'p_instock');
});

test('AtomicSpendEnforcer: uses Redis cluster hash tags {vch_...} for keys', async () => {
  const enforcer = new AtomicSpendEnforcer();
  let capturedKeys: string[] = [];

  const mockRedis: any = {
    script: async () => 'mock_sha',
    evalsha: async (_sha: string, keyCount: number, ...args: any[]) => {
      capturedKeys = args.slice(0, keyCount);
      return [1, '1000'];
    },
  };

  await enforcer.reserveBudget(mockRedis, {
    mandate_id: 'vch_alpha123',
    merchant_domain: 'test-merchant.com',
    requested_cents: 1000,
    current_unix_ms: Date.now(),
    category_id: 'xoN',
    merchant_anomaly_score: 50,
  });

  assert.equal(capturedKeys.length, 2);
  assert.equal(capturedKeys[0], 'aegis:{vch_alpha123}:mandate');
  assert.equal(capturedKeys[1], 'aegis:{vch_alpha123}:exposure:test-merchant.com');
});

test('CounterBidEngine: executes 2-turn bounded negotiation, auto-accepts within buffer, and triggers 60s HITL confirmation', async () => {
  const engine = new CounterBidEngine();

  // Generate real Ed25519 keypair for valid mandate signature test
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubDer = publicKey.export({ format: 'der', type: 'spki' });
  // Raw 32-byte Ed25519 key is the last 32 bytes of 44-byte SPKI DER
  const rawPubHex = pubDer.subarray(12).toString('hex');

  const mandateBase = {
    mandate_id: 'vch_counter_test',
    buyer_id: 'buyer_abc',
    max_total_spend_cents: 50000, // $500.00
    max_single_merchant_cents: 50000,
    cumulative_spent_cents: 0,
    currency_code: 'USD',
    allowed_category_ids: ['xoN'],
    public_key_hex: rawPubHex,
    expires_at: new Date(Date.now() + 3600 * 1000),
    status: 'ACTIVE' as const,
  };

  const messageObj = {
    mandate_id: mandateBase.mandate_id,
    buyer_id: mandateBase.buyer_id,
    max_total_spend_cents: mandateBase.max_total_spend_cents,
    max_single_merchant_cents: mandateBase.max_single_merchant_cents,
    currency_code: mandateBase.currency_code,
    allowed_category_ids: mandateBase.allowed_category_ids,
    expires_at: mandateBase.expires_at.toISOString(),
    status: mandateBase.status,
    public_key_hex: mandateBase.public_key_hex,
  };

  const sigBuffer = crypto.sign(null, Buffer.from(JSON.stringify(messageObj), 'utf8'), privateKey);
  const mandate = {
    ...mandateBase,
    ed25519_signature_hex: sigBuffer.toString('hex'),
    created_at: new Date(),
  };

  // Scenario 1: Retail $490, Floor $455, Buyer Bid $450 (Turn 1)
  // Floor is $455, Gap = $490 - $455 = $35. Merchant counter = 455 + round(35 * 0.4) = 455 + 14 = 469 ($469.00)
  // Buyer bid is $450. Difference is $19.
  // With default auto-accept buffer $15 (1500 cents), $19 > $15 -> Triggers 60s HITL prompt!
  const hitlRes = await engine.evaluateCounterBid({
    mandate,
    voucher_id: 'syn_test_1',
    channel3_product_id: 'ch3_prod_9921',
    merchant_domain: 'tech-merchant.com',
    retail_offer_cents: 49000,
    merchant_min_floor_cents: 45500,
    buyer_bid_cents: 45000,
    turn: 1,
  });

  assert.equal(hitlRes.ed25519_mandate_verified, true);
  assert.equal(hitlRes.status, 'HITL_CONFIRMATION_REQUIRED');
  assert.ok(hitlRes.hitl_prompt);
  assert.equal(hitlRes.hitl_prompt.required, true);
  assert.equal(hitlRes.hitl_prompt.timeout_seconds, 60);
  assert.ok(hitlRes.merchant_counter_voucher);
  assert.equal(hitlRes.merchant_counter_voucher.merchant_counter_cents, 46900);

  // Scenario 2: Turn 2 (Dutch auction concession to floor $455)
  // Buyer bid $450, Floor $455 -> diff is $5 <= $15 auto-accept buffer -> AUTO_ACCEPTED!
  const autoAcceptRes = await engine.evaluateCounterBid({
    mandate,
    voucher_id: 'syn_test_1',
    channel3_product_id: 'ch3_prod_9921',
    merchant_domain: 'tech-merchant.com',
    retail_offer_cents: 49000,
    merchant_min_floor_cents: 45500,
    buyer_bid_cents: 45000,
    turn: 2,
    turn_history: hitlRes.history,
  });

  assert.equal(autoAcceptRes.status, 'AUTO_ACCEPTED');
  assert.equal(autoAcceptRes.turn, 2);
  assert.equal(autoAcceptRes.merchant_counter_voucher?.merchant_counter_cents, 45500);
  assert.ok(autoAcceptRes.resulting_order_id);

  // Fastify route POST /api/buyer/counter-bid
  const app = await buildApp();
  const routeRes = await app.inject({
    method: 'POST',
    url: '/api/buyer/counter-bid',
    payload: {
      mandate: {
        ...mandate,
        expires_at: mandate.expires_at.toISOString(),
        created_at: mandate.created_at.toISOString(),
      },
      voucher_id: 'syn_route_test',
      channel3_product_id: 'ch3_prod_9921',
      merchant_domain: 'tech-merchant.com',
      retail_offer_cents: 49000,
      merchant_min_floor_cents: 45500,
      buyer_bid_cents: 45000,
      turn: 1,
    },
  });

  assert.equal(routeRes.statusCode, 200);
  const routeBody = routeRes.json();
  assert.equal(routeBody.status, 'PROCESSED');
  assert.equal(routeBody.evaluation.status, 'HITL_CONFIRMATION_REQUIRED');
});

test('HitlApprovalRegistry: registers 60s requests, broadcasts via SSE, and resolves human decisions', async () => {
  const { HitlApprovalRegistry } = await import('./services/hitl-approval.js');
  const registry = new HitlApprovalRegistry();

  const events: any[] = [];
  const unsubscribe = registry.subscribe((ev) => events.push(ev));

  // Request approval asynchronously with 2-second timeout for testing
  const approvalPromise = registry.requestApproval({
    type: 'MERCHANT_COUNTER_OFFER',
    mandate_id: 'vch_test_hitl',
    title: 'Merchant Counter-Offer Received',
    message: 'Merchant countered at $465.00 ($15 above bid). Accept counter before timer expires?',
    original_amount_cents: 45000,
    requested_amount_cents: 46500,
    delta_cents: 1500,
    timeout_seconds: 2,
  });

  const pending = registry.getPendingRequests();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].status, 'PENDING');
  assert.equal(pending[0].delta_cents, 1500);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'request:created');

  // Human approves the request
  const resolved = registry.resolveDecision(pending[0].id, true, {
    reason: 'Price within acceptable margin',
    action_token: 'hitl_acc_test',
  });

  const result = await approvalPromise;
  assert.equal(result.status, 'APPROVED');
  assert.equal(result.decision_payload?.approved, true);
  assert.equal(result.decision_payload?.reason, 'Price within acceptable margin');

  assert.equal(events.length, 2);
  assert.equal(events[1].type, 'request:resolved');

  unsubscribe();

  // Test automatic expiry on timeout
  const timeoutRegistry = new HitlApprovalRegistry();
  const expiredReq = await timeoutRegistry.requestApproval({
    type: 'CAP_OVERAGE_EXCEPTION',
    message: 'Overage test',
    timeout_seconds: 1, // 1 second
  });

  assert.equal(expiredReq.status, 'EXPIRED');
  assert.equal(expiredReq.decision_payload?.approved, false);
});

test('HTTP Routes: /api/hitl/pending and /api/hitl/respond manage approval lifecycle', async () => {
  const app = await buildApp();

  // 1. Post a new approval request via API
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/hitl/requests',
    payload: {
      type: 'MERCHANT_COUNTER_OFFER',
      mandate_id: 'vch_api_test',
      title: 'Counter Offer',
      message: 'Merchant countered at $465.00 ($15 above bid).',
      original_amount_cents: 45000,
      requested_amount_cents: 46500,
      timeout_seconds: 60,
    },
  });

  assert.equal(createRes.statusCode, 201);
  const createdBody = createRes.json();
  assert.equal(createdBody.status, 'QUEUED');
  assert.ok(createdBody.request.id);

  // 2. Query pending approvals
  const listRes = await app.inject({
    method: 'GET',
    url: '/api/hitl/pending',
  });
  assert.equal(listRes.statusCode, 200);
  const listBody = listRes.json();
  assert.ok(listBody.pending.some((r: any) => r.id === createdBody.request.id));

  // 3. Submit human decision
  const respondRes = await app.inject({
    method: 'POST',
    url: '/api/hitl/respond',
    payload: {
      id: createdBody.request.id,
      decision: 'APPROVE',
      reason: 'Human approved counter via web cockpit',
    },
  });

  assert.equal(respondRes.statusCode, 200);
  const respondBody = respondRes.json();
  assert.equal(respondBody.status, 'SUCCESS');
  assert.equal(respondBody.result.status, 'APPROVED');
  assert.equal(respondBody.result.decision_payload.approved, true);
});

test('Task 16: AtomicSpendEnforcer rollbackReservation decrements spent and exposure via hash tags', async () => {
  const enforcer = new AtomicSpendEnforcer();
  let capturedKeys: string[] = [];
  let capturedArgv: string[] = [];

  const mockRedis: any = {
    script: async () => 'mock_rollback_sha',
    evalsha: async (_sha: string, keyCount: number, ...args: any[]) => {
      capturedKeys = args.slice(0, keyCount);
      capturedArgv = args.slice(keyCount);
      return [1, '0']; // 100% balance restored
    },
  };

  const success = await enforcer.rollbackReservation(mockRedis, 'vch_rollback_123', 5000, 'merchant-a.com');
  assert.equal(success, true);
  assert.equal(capturedKeys.length, 2);
  assert.equal(capturedKeys[0], 'aegis:{vch_rollback_123}:mandate');
  assert.equal(capturedKeys[1], 'aegis:{vch_rollback_123}:exposure:merchant-a.com');
  assert.equal(capturedArgv[0], '5000');
});

test('Task 16: CartSolver decouples affiliate settlement authorizing full retail merchant price', () => {
  const solver = new CartSolver({ alpha: 0.75 });
  const mockProducts: Channel3ProductDetail[] = [
    {
      product_id: 'prod_decouple',
      title: 'Decoupled Product',
      description: 'Test decoupled product',
      category_id: 'c1',
      offers: [
        {
          id: 'o_decouple',
          product_id: 'prod_decouple',
          domain: 'decoupled-merchant.com',
          price: 20000, // $200.00 retail
          compare_at_price: 25000,
          max_commission_rate: 0.10, // 10% * 0.75 = $15.00 rebate
          shipping_fee_cents: 1000, // $10.00
          shipping_waiver_threshold_cents: 50000,
        },
      ],
      images: [{ url: 'https://img.test', cleaned_url: 'https://img.test/clean' }],
      dimensions: { weight: 100 },
    },
  ];

  const result = solver.solve(mockProducts, [{ product_id: 'prod_decouple', quantity: 1 }]);
  assert.equal(result.assigned_merchants.length, 1);
  const merchant = result.assigned_merchants[0];

  // Full retail authorization: subtotal $200 + shipping $10 + tax = $210 (without tax)
  assert.equal(merchant.merchant_retail_authorized_cents, merchant.subtotal_cents + merchant.shipping_fee_cents + merchant.tax_cents);
  assert.equal(merchant.platform_subsidy_cents, 1500); // $15 rebate
  assert.equal(result.total_platform_subsidy_credit_cents, 1500);

  const pu = result.paypal_purchase_units[0];
  // PayPal purchase unit amount value reflects full merchant retail authorized amount
  assert.equal(pu.amount.value, (merchant.merchant_retail_authorized_cents / 100).toFixed(2));
  assert.ok(pu.platform_subsidy_credit);
  assert.equal(pu.platform_subsidy_credit.settlement_decoupled, true);
  assert.equal(pu.platform_subsidy_credit.commission_rebate_cents, 1500);
});

test('Task 16: Vault onboarding routes /api/buyer/vault/setup and /api/buyer/vault/confirm', async () => {
  const app = await buildApp();

  // Test setup route
  const setupRes = await app.inject({
    method: 'POST',
    url: '/api/buyer/vault/setup',
    payload: {
      customer_id: 'cust_vault_test_1',
      mandate_id: 'vch_vault_test_1',
    },
  });

  assert.equal(setupRes.statusCode, 200);
  const setupBody = setupRes.json();
  assert.equal(setupBody.status, 'SUCCESS');
  assert.ok(setupBody.session.setup_token_id);
  assert.ok(setupBody.session.approve_url);

  // Test confirm route
  const confirmRes = await app.inject({
    method: 'POST',
    url: '/api/buyer/vault/confirm',
    payload: {
      setup_token_id: setupBody.session.setup_token_id,
      customer_id: 'cust_vault_test_1',
      mandate_id: 'vch_vault_test_1',
    },
  });

  assert.equal(confirmRes.statusCode, 200);
  const confirmBody = confirmRes.json();
  assert.equal(confirmBody.status, 'SUCCESS');
  assert.ok(confirmBody.vault.paypal_payment_token_id);
  assert.equal(confirmBody.vault.status, 'VAULTED');
});
