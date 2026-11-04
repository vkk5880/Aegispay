import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SpendMandateSchema,
  SessionMandateSchema,
  PolicyEvaluationVerdictSchema,
  ViolationTaxonomySchema,
  AcpCartPayloadSchema,
  AcpCheckoutSessionSchema,
  AcpPaymentHandlerRequestSchema,
  AcpPaymentHandlerResponseSchema,
  AcpDiscountExtensionSchema,
} from './index.js';

test('SpendMandateSchema: validates valid mandate and enforces cap refinement', () => {
  const validMandate = {
    mandate_id: 'vch_valid_123',
    buyer_id: 'buyer_abc',
    max_total_spend_cents: 50000,
    max_single_merchant_cents: 20000,
    cumulative_spent_cents: 0,
    currency_code: 'USD',
    allowed_category_ids: ['electronics', 'apparel'],
    public_key_hex: 'a'.repeat(64),
    ed25519_signature_hex: 'b'.repeat(128),
    expires_at: new Date(Date.now() + 86400000),
    status: 'ACTIVE' as const,
  };

  const parsed = SpendMandateSchema.safeParse(validMandate);
  assert.equal(parsed.success, true);

  // Invariant Refinement: max_single_merchant_cents cannot exceed max_total_spend_cents
  const invalidCapsMandate = {
    ...validMandate,
    max_total_spend_cents: 10000,
    max_single_merchant_cents: 20000, // exceeds total!
  };
  const parsedInvalidCaps = SpendMandateSchema.safeParse(invalidCapsMandate);
  assert.equal(parsedInvalidCaps.success, false);
  if (!parsedInvalidCaps.success) {
    assert.ok(
      parsedInvalidCaps.error.issues.some((i) =>
        i.message.includes('max_single_merchant_cents must not exceed max_total_spend_cents')
      )
    );
  }

  // SessionMandateSchema parity
  const parsedSession = SessionMandateSchema.safeParse(validMandate);
  assert.equal(parsedSession.success, true);
});

test('PolicyEvaluationVerdictSchema: validates alignment and forbids APPROVE with blocking reasons', () => {
  const validApprove = {
    mandate_id: 'vch_123',
    outcome: 'APPROVE' as const,
    decision_id: 'dec_001',
    total_score_bp: 9500,
    reasons: ['BUDGET_SATISFIED', 'MERCHANT_IN_SCOPE'] as any[],
    dimensions: [
      {
        dimension: 'BUDGET' as const,
        status: 'PASS' as const,
        score_bp: 10000,
        reason_codes: ['BUDGET_SATISFIED'] as any[],
      },
      {
        dimension: 'MERCHANT_SCOPE' as const,
        status: 'PASS' as const,
        score_bp: 9000,
        reason_codes: ['MERCHANT_IN_SCOPE'] as any[],
      },
    ],
    evaluated_at: new Date(),
  };

  const parsedApprove = PolicyEvaluationVerdictSchema.safeParse(validApprove);
  assert.equal(parsedApprove.success, true);

  // Invariant Refinement: APPROVE with blocking reason (e.g. BUDGET_EXCEEDED) must be rejected
  const illegalApprove = {
    ...validApprove,
    reasons: ['BUDGET_EXCEEDED', 'MERCHANT_IN_SCOPE'] as any[],
  };
  const parsedIllegal = PolicyEvaluationVerdictSchema.safeParse(illegalApprove);
  assert.equal(parsedIllegal.success, false);
  if (!parsedIllegal.success) {
    assert.ok(
      parsedIllegal.error.issues.some((i) =>
        i.message.includes('An APPROVE outcome cannot contain blocking violation reason codes')
      )
    );
  }

  // REJECT or HOLD with blocking reasons is allowed
  const validReject = {
    ...validApprove,
    outcome: 'REJECT' as const,
    reasons: ['BUDGET_EXCEEDED'] as any[],
  };
  const parsedReject = PolicyEvaluationVerdictSchema.safeParse(validReject);
  assert.equal(parsedReject.success, true);
});

test('ViolationTaxonomySchema: validates violation taxonomy across gate stages', () => {
  const validTaxonomy = {
    code: 'BUDGET_EXCEEDED',
    message: 'Requested transaction exceeds allocated budget ceiling',
    stage: 'STAGE_4_REDIS_LUA_PRE_RESERVATION',
    is_blocking: true,
    observed_value: 55000,
    expected_ceiling: 50000,
  };

  const parsed = ViolationTaxonomySchema.safeParse(validTaxonomy);
  assert.equal(parsed.success, true);

  // Invalid stage rejected
  const invalidStage = {
    ...validTaxonomy,
    stage: 'INVALID_STAGE',
  };
  const parsedInvalid = ViolationTaxonomySchema.safeParse(invalidStage);
  assert.equal(parsedInvalid.success, false);
});

test('AcpCartPayloadSchema: enforces line item arithmetic refinement', () => {
  const validCart = {
    cart_id: 'cart_001',
    currency: 'USD',
    subtotal_cents: 6000,
    tax_cents: 500,
    shipping_cents: 0,
    discount_cents: 500,
    total_cents: 6000,
    items: [
      {
        id: 'item_1',
        title: 'Mechanical Keyboard',
        quantity: 1,
        unit_price_cents: 6000,
        total_price_cents: 6000,
        currency: 'USD',
      },
    ],
  };

  const parsed = AcpCartPayloadSchema.safeParse(validCart);
  assert.equal(parsed.success, true);

  // Arithmetic mismatch between items sum and subtotal
  const mismatchCart = {
    ...validCart,
    subtotal_cents: 9999, // mismatch!
  };
  const parsedMismatch = AcpCartPayloadSchema.safeParse(mismatchCart);
  assert.equal(parsedMismatch.success, false);
  if (!parsedMismatch.success) {
    assert.ok(
      parsedMismatch.error.issues.some((i) =>
        i.message.includes('Cart subtotal_cents must equal sum of item total_price_cents')
      )
    );
  }

  // Empty items rejected
  const emptyCart = {
    ...validCart,
    items: [],
  };
  const parsedEmpty = AcpCartPayloadSchema.safeParse(emptyCart);
  assert.equal(parsedEmpty.success, false);
});

test('AcpCheckoutSessionSchema: validates session lifecycle and addresses', () => {
  const validSession = {
    id: 'cs_001',
    status: 'in_progress',
    cart: {
      cart_id: 'cart_001',
      currency: 'USD',
      subtotal_cents: 3000,
      total_cents: 3000,
      items: [
        {
          id: 'item_1',
          title: 'USB-C Cable',
          quantity: 2,
          unit_price_cents: 1500,
          total_price_cents: 3000,
          currency: 'USD',
        },
      ],
    },
    shipping_address: {
      name: 'Alice Smith',
      line_one: '100 Market St',
      city: 'San Francisco',
      state: 'CA',
      country: 'US',
      postal_code: '94105',
    },
    expires_at: new Date(Date.now() + 1800000),
  };

  const parsed = AcpCheckoutSessionSchema.safeParse(validSession);
  assert.equal(parsed.success, true);

  const invalidStatus = {
    ...validSession,
    status: 'UNKNOWN_STATUS',
  };
  assert.equal(AcpCheckoutSessionSchema.safeParse(invalidStatus).success, false);
});

test('AcpPaymentHandler schemas: validates delegated payment requests and responses', () => {
  const validRequest = {
    checkout_session_id: 'cs_001',
    payment_method: {
      type: 'vault_token',
      token: 'tok_paypal_vault_999',
    },
    amount_cents: 3000,
    currency: 'USD',
    merchant_domain: 'bestbuy.com',
    risk_signals: [
      {
        type: 'card_testing',
        score: 0,
        action: 'authorized',
      },
    ],
  };

  const parsedReq = AcpPaymentHandlerRequestSchema.safeParse(validRequest);
  assert.equal(parsedReq.success, true);

  // Negative amount rejected
  const negativeReq = {
    ...validRequest,
    amount_cents: -500,
  };
  assert.equal(AcpPaymentHandlerRequestSchema.safeParse(negativeReq).success, false);

  const validResponse = {
    payment_id: 'pay_987654',
    status: 'AUTHORIZED',
    amount_cents: 3000,
    currency: 'USD',
    transaction_reference: 'ref_12345',
    paypal_order_id: 'ord_pp_777',
    created_at: new Date(),
  };

  const parsedRes = AcpPaymentHandlerResponseSchema.safeParse(validResponse);
  assert.equal(parsedRes.success, true);
});

test('AcpDiscountExtensionSchema: validates discount extensions and rebates', () => {
  const validDiscount = {
    code: 'SAVE10',
    title: '10% Seasonal Promotion',
    amount_cents: 500,
    type: 'promo',
    applied_to: 'order',
  };

  assert.equal(AcpDiscountExtensionSchema.safeParse(validDiscount).success, true);

  const negativeDiscount = {
    ...validDiscount,
    amount_cents: -100,
  };
  assert.equal(AcpDiscountExtensionSchema.safeParse(negativeDiscount).success, false);
});
