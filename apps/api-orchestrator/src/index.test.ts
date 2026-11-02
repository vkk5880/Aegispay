import test from 'node:test';
import assert from 'node:assert/strict';
import { CartSolver } from './services/cart-solver.js';
import { Channel3ProductDetail } from './services/channel3.client.js';
import { DisputeMatrixService } from './services/dispute-matrix.js';
import { SyntheticIntentEngine } from './services/synthetic-intent.js';
import { PayPalApimaticClient } from './services/paypal-apimatic.js';
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
