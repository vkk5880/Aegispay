import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SpendMandateSchema,
  SessionMandateSchema,
  PolicyEvaluationVerdictSchema,
  CustodianVerdictSchema,
  ViolationTaxonomySchema,
  CustodianViolationTaxonomySchema,
  CustodianReasonCodeSchema,
  CUSTODIAN_REASON_CODES,
  CUSTODIAN_BLOCKING_REASON_CODES,
  CUSTODIAN_TAXONOMY_REGISTRY,
  isBlockingReasonCode,
  CentsSchema,
  PositiveCentsSchema,
  BasisPointsSchema,
  FULL_BP,
  ZERO_BP,
  MoneyError,
  BpError,
  rejectFloat,
  parseCents,
  formatCents,
  lineTotal,
  validateBasisPoints,
  basisPointsFromRatio,
  basisPointsFromPercent,
  weightedBasisPoints,
  formatBasisPoints,
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

test('CentsSchema & Float-Safe Money: strictly rejects floats and validates integer cents', () => {
  // 1. CentsSchema validation: valid integer cents
  assert.equal(CentsSchema.safeParse(0).success, true);
  assert.equal(CentsSchema.safeParse(100).success, true);
  assert.equal(CentsSchema.safeParse(129950).success, true);

  // Strict float rejection
  const floatCents = CentsSchema.safeParse(12.5);
  assert.equal(floatCents.success, false);
  assert.equal(CentsSchema.safeParse(0.01).success, false);
  assert.equal(CentsSchema.safeParse(199.99).success, false);
  assert.equal(CentsSchema.safeParse(12.0001).success, false);

  // Negative rejection
  assert.equal(CentsSchema.safeParse(-1).success, false);
  assert.equal(CentsSchema.safeParse(-500).success, false);

  // Type boundary rejection
  assert.equal(CentsSchema.safeParse('100').success, false);
  assert.equal(CentsSchema.safeParse(true).success, false);
  assert.equal(CentsSchema.safeParse(null).success, false);
  assert.equal(CentsSchema.safeParse(undefined).success, false);

  // PositiveCentsSchema
  assert.equal(PositiveCentsSchema.safeParse(100).success, true);
  assert.equal(PositiveCentsSchema.safeParse(0).success, false);

  // 2. rejectFloat helper
  assert.doesNotThrow(() => rejectFloat(100, 'cents'));
  assert.throws(() => rejectFloat(12.5, 'cents'), MoneyError);
  assert.throws(() => rejectFloat(true, 'cents'), MoneyError);
  assert.throws(() => rejectFloat('100', 'cents'), MoneyError);

  // 3. parseCents without float math
  assert.equal(parseCents('$12.99'), 1299);
  assert.equal(parseCents('12.99'), 1299);
  assert.equal(parseCents('₹1,299.50'), 129950);
  assert.equal(parseCents('Rs. 1,299.50'), 129950);
  assert.equal(parseCents('USD 45.00'), 4500);
  assert.equal(parseCents('199/-'), 19900);
  assert.equal(parseCents(5000), 5000);
  // Rejects floats in parseCents
  assert.throws(() => parseCents(12.5), MoneyError);
  assert.throws(() => parseCents(-100), MoneyError);
  assert.throws(() => parseCents('not-a-number'), MoneyError);

  // 4. formatCents presentation
  assert.equal(formatCents(200000), '$2,000.00');
  assert.equal(formatCents(200000, 'INR'), '₹2,000.00');
  assert.equal(formatCents(0), '$0.00');
  assert.throws(() => formatCents(12.5 as any), MoneyError);

  // 5. lineTotal integer multiplication
  assert.equal(lineTotal(1500, 3), 4500);
  assert.equal(lineTotal(0, 5), 0);
  assert.throws(() => lineTotal(15.5 as any, 3), MoneyError);
  assert.throws(() => lineTotal(1500, 2.5 as any), MoneyError);
  assert.throws(() => lineTotal(1500, -1), MoneyError);
});

test('BasisPointsSchema & Float-Safe Math: strictly rejects floats and validates [0, 10000] range', () => {
  // 1. BasisPointsSchema: 0 to 10000 integer bp
  assert.equal(BasisPointsSchema.safeParse(0).success, true);
  assert.equal(BasisPointsSchema.safeParse(3333).success, true);
  assert.equal(BasisPointsSchema.safeParse(8500).success, true);
  assert.equal(BasisPointsSchema.safeParse(10000).success, true);

  // Strict float rejection
  assert.equal(BasisPointsSchema.safeParse(85.5).success, false);
  assert.equal(BasisPointsSchema.safeParse(99.99).success, false);
  assert.equal(BasisPointsSchema.safeParse(0.5).success, false);

  // Bounds rejection
  assert.equal(BasisPointsSchema.safeParse(-1).success, false);
  assert.equal(BasisPointsSchema.safeParse(10001).success, false);

  // Non-number rejection
  assert.equal(BasisPointsSchema.safeParse('8500').success, false);
  assert.equal(BasisPointsSchema.safeParse(true).success, false);

  // 2. validateBasisPoints
  assert.equal(validateBasisPoints(8500), 8500);
  assert.throws(() => validateBasisPoints(85.5 as any), BpError);
  assert.throws(() => validateBasisPoints(-5), BpError);
  assert.throws(() => validateBasisPoints(10001), BpError);

  // 3. basisPointsFromRatio (round half up integer math)
  assert.equal(basisPointsFromRatio(1, 3), 3333);
  assert.equal(basisPointsFromRatio(1, 2), 5000);
  assert.equal(basisPointsFromRatio(2, 3), 6667);
  assert.equal(basisPointsFromRatio(3, 3), 10000);
  assert.equal(basisPointsFromRatio(0, 5), 0);
  assert.throws(() => basisPointsFromRatio(1, 0), BpError);
  assert.throws(() => basisPointsFromRatio(1.5 as any, 3), BpError);
  assert.throws(() => basisPointsFromRatio(-1, 3), BpError);

  // 4. basisPointsFromPercent
  assert.equal(basisPointsFromPercent('85'), 8500);
  assert.equal(basisPointsFromPercent('85.5'), 8550);
  assert.equal(basisPointsFromPercent('100%'), 10000);
  assert.equal(basisPointsFromPercent('0%'), 0);
  assert.equal(basisPointsFromPercent('33.33%'), 3333);

  // 5. weightedBasisPoints
  assert.equal(weightedBasisPoints([[8000, 1], [9000, 1]]), 8500);
  assert.equal(weightedBasisPoints([[10000, 3], [5000, 1]]), 8750);
  assert.equal(weightedBasisPoints([]), ZERO_BP);
  assert.throws(() => weightedBasisPoints([[8500, -1]]), BpError);
  assert.throws(() => weightedBasisPoints([[85.5 as any, 1]]), BpError);

  // 6. formatBasisPoints
  assert.equal(formatBasisPoints(8500), '85.00%');
  assert.equal(formatBasisPoints(10000), '100.00%');
  assert.equal(formatBasisPoints(0), '0.00%');
  assert.equal(formatBasisPoints(3333), '33.33%');
});

test('CustodianReasonCodeSchema & CustodianViolationTaxonomySchema: verifies complete 30-reason taxonomy coverage', () => {
  // 1. Exactly 30 reason codes in the closed taxonomy
  assert.equal(CUSTODIAN_REASON_CODES.length, 30);
  assert.equal(CustodianReasonCodeSchema.options.length, 30);

  // 2. Validate all 30 codes under CustodianReasonCodeSchema and CustodianViolationTaxonomySchema
  for (const code of CUSTODIAN_REASON_CODES) {
    const parsedCode = CustodianReasonCodeSchema.safeParse(code);
    assert.equal(parsedCode.success, true, `Reason code ${code} must parse successfully`);

    const taxonomyEntry = CUSTODIAN_TAXONOMY_REGISTRY[code];
    assert.ok(taxonomyEntry, `Taxonomy entry must exist for ${code}`);
    assert.equal(taxonomyEntry.code, code);

    const parsedTaxonomy = CustodianViolationTaxonomySchema.safeParse(taxonomyEntry);
    assert.equal(parsedTaxonomy.success, true, `Taxonomy for ${code} must satisfy schema`);
  }

  // 3. Blocking reason code helper
  assert.equal(isBlockingReasonCode('BUDGET_EXCEEDED'), true);
  assert.equal(isBlockingReasonCode('PRICE_MISMATCH'), true);
  assert.equal(isBlockingReasonCode('HARD_CONSTRAINT_VIOLATED'), true);
  assert.equal(isBlockingReasonCode('ED25519_SIGNATURE_VERIFICATION_FAILED'), true);
  assert.equal(isBlockingReasonCode('BUDGET_SATISFIED'), false);
  assert.equal(isBlockingReasonCode('PRICE_MATCHES_CATALOG'), false);
  assert.equal(isBlockingReasonCode('MERCHANT_IN_SCOPE'), false);

  // 4. Invalid reason code rejected
  assert.equal(CustodianReasonCodeSchema.safeParse('UNKNOWN_REASON_CODE').success, false);
});

test('CustodianVerdictSchema: validates alignment, enforces float rejection on scores and amounts, and parity with PolicyEvaluationVerdictSchema', () => {
  const validVerdict = {
    mandate_id: 'man_test_888',
    outcome: 'APPROVE' as const,
    decision_id: 'dec_custodian_001',
    total_score_bp: 9800,
    reasons: ['BUDGET_SATISFIED', 'MERCHANT_IN_SCOPE'] as any[],
    dimensions: [
      {
        dimension: 'PRICE_INTEGRITY' as const,
        status: 'PASS' as const,
        score_bp: 10000,
        reason_codes: ['PRICE_MATCHES_CATALOG'] as any[],
      },
      {
        dimension: 'BUDGET' as const,
        status: 'PASS' as const,
        score_bp: 9800,
        reason_codes: ['BUDGET_SATISFIED'] as any[],
      },
      {
        dimension: 'MERCHANT_SCOPE' as const,
        status: 'PASS' as const,
        score_bp: 10000,
        reason_codes: ['MERCHANT_IN_SCOPE'] as any[],
      },
    ],
    verified_total_cents: 4500,
    evaluated_at: new Date(),
  };

  // 1. CustodianVerdictSchema parses valid approval
  const parsedCustodian = CustodianVerdictSchema.safeParse(validVerdict);
  assert.equal(parsedCustodian.success, true);

  // 2. Parity: PolicyEvaluationVerdictSchema parses identically
  const parsedPolicy = PolicyEvaluationVerdictSchema.safeParse(validVerdict);
  assert.equal(parsedPolicy.success, true);

  // 3. Float rejection on total_score_bp
  const floatScoreVerdict = {
    ...validVerdict,
    total_score_bp: 9800.5,
  };
  const parsedFloatScore = CustodianVerdictSchema.safeParse(floatScoreVerdict);
  assert.equal(parsedFloatScore.success, false);

  // 4. Float rejection on dimension score_bp
  const floatDimVerdict = {
    ...validVerdict,
    dimensions: [
      {
        dimension: 'PRICE_INTEGRITY' as const,
        status: 'PASS' as const,
        score_bp: 9999.9, // float!
        reason_codes: ['PRICE_MATCHES_CATALOG'] as any[],
      },
    ],
  };
  assert.equal(CustodianVerdictSchema.safeParse(floatDimVerdict).success, false);

  // 5. Float rejection on verified_total_cents
  const floatCentsVerdict = {
    ...validVerdict,
    verified_total_cents: 4500.5, // float!
  };
  assert.equal(CustodianVerdictSchema.safeParse(floatCentsVerdict).success, false);

  // 6. Invariant: APPROVE cannot carry a blocking reason code
  const blockingApprove = {
    ...validVerdict,
    reasons: ['BUDGET_EXCEEDED'] as any[],
  };
  const parsedBlocking = CustodianVerdictSchema.safeParse(blockingApprove);
  assert.equal(parsedBlocking.success, false);

  // 7. Invariant: APPROVE cannot carry a dimension with blocking reason code
  const blockingDimApprove = {
    ...validVerdict,
    reasons: ['BUDGET_SATISFIED'] as any[],
    dimensions: [
      {
        dimension: 'BUDGET' as const,
        status: 'FAIL' as const,
        score_bp: 0,
        reason_codes: ['BUDGET_EXCEEDED'] as any[], // blocking!
      },
    ],
  };
  assert.equal(CustodianVerdictSchema.safeParse(blockingDimApprove).success, false);

  // 8. HOLD / REJECT allows blocking codes
  const validHold = {
    ...validVerdict,
    outcome: 'HOLD' as const,
    reasons: ['BUDGET_EXCEEDED'] as any[],
  };
  assert.equal(CustodianVerdictSchema.safeParse(validHold).success, true);
});
