import { z } from 'zod';

/**
 * Float-Safe Money and Basis Points Primitives
 * Direct TypeScript port from Custodian (custodian.money and custodian.bp).
 * Floating-point numbers have no canonical byte form and lead to rounding drift.
 * All amounts are integer cents (paise) and all scores are integer basis points.
 */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export class BpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BpError';
  }
}

/**
 * Refuse floats explicitly so the failure names the real problem.
 * In JS runtime, Number.isInteger distinguishes whole numbers from fractional floats.
 */
export function rejectFloat(value: unknown, context: string = 'value'): asserts value is number {
  if (typeof value === 'boolean') {
    throw new MoneyError(`bool is not a valid ${context}: ${value}`);
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new MoneyError(
      `float or non-integer is not a valid ${context}: ${value}. ` +
      `Pass an integer count of cents/paise or basis points.`
    );
  }
}

/**
 * CentsSchema: Strict integer cents validation (custodian.money).
 * Rejects floating-point numbers and negative values.
 */
export const CentsSchema = z
  .number({
    required_error: 'Amount in cents is required',
    invalid_type_error: 'Amount in cents must be an integer number',
  })
  .int('Amount in cents must be an integer; floats are strictly rejected')
  .nonnegative('Amount in cents must be non-negative');

export type Cents = z.infer<typeof CentsSchema>;

export const PositiveCentsSchema = CentsSchema.refine((v) => v > 0, {
  message: 'Amount in cents must be strictly positive',
});

export type PositiveCents = z.infer<typeof PositiveCentsSchema>;

/**
 * Parse a dollar/rupee amount string or integer into integer cents without float math.
 */
export function parseCents(raw: string | number): number {
  if (typeof raw === 'number') {
    if (typeof raw === 'boolean' || !Number.isInteger(raw)) {
      throw new MoneyError(`float is not a valid money input: ${raw}. Pass a str or integer cents.`);
    }
    if (raw < 0) {
      throw new MoneyError(`negative amount: ${raw}`);
    }
    return raw;
  }

  if (typeof raw !== 'string') {
    throw new MoneyError(`unparseable amount: ${String(raw)}`);
  }

  const trimmed = raw.trim();
  const match = trimmed.match(/^(?:[\$₹]|rs\.?|usd|inr)?\s*([0-9,]+(?:\.[0-9]+)?)\s*(?:\/-)?$/i);
  if (!match) {
    throw new MoneyError(`unparseable amount: ${raw}`);
  }

  const cleanNumStr = match[1].replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleanNumStr)) {
    throw new MoneyError(`unparseable amount: ${raw}`);
  }

  const parts = cleanNumStr.split('.');
  const whole = parseInt(parts[0], 10);
  if (isNaN(whole) || whole < 0) {
    throw new MoneyError(`negative amount: ${raw}`);
  }

  let cents = whole * 100;
  if (parts.length > 1) {
    const fractionStr = parts[1].slice(0, 3);
    if (fractionStr.length === 1) {
      cents += parseInt(fractionStr, 10) * 10;
    } else if (fractionStr.length === 2) {
      cents += parseInt(fractionStr, 10);
    } else {
      const twoDec = parseInt(fractionStr.slice(0, 2), 10);
      const thirdDec = parseInt(fractionStr[2], 10);
      cents += twoDec + (thirdDec >= 5 ? 1 : 0);
    }
  }

  return cents;
}

/**
 * Format integer cents for humans ($1,299.50 or ₹1,299.50). Never parse back.
 */
export function formatCents(cents: number, currency: string = 'USD'): string {
  if (typeof cents !== 'number' || !Number.isInteger(cents)) {
    throw new MoneyError(`expected int cents, got ${typeof cents === 'number' ? 'float' : typeof cents}`);
  }
  const sign = cents < 0 ? '-' : '';
  const absCents = Math.abs(cents);
  const dollars = Math.floor(absCents / 100);
  const remCents = absCents % 100;
  const remCentsStr = remCents.toString().padStart(2, '0');
  const formattedDollars = dollars.toLocaleString('en-US');

  if (currency === 'INR') {
    return `${sign}₹${formattedDollars}.${remCentsStr}`;
  }
  return `${sign}$${formattedDollars}.${remCentsStr}`;
}

/**
 * Line item total: integer multiplication with strict float rejection and no rounding.
 */
export function lineTotal(unitPriceCents: number, quantity: number): number {
  if (typeof unitPriceCents !== 'number' || !Number.isInteger(unitPriceCents)) {
    throw new MoneyError(`float is not a valid money input for unitPriceCents: ${unitPriceCents}`);
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
    throw new MoneyError(`float is not a valid quantity input: ${quantity}`);
  }
  if (unitPriceCents < 0) {
    throw new MoneyError(`negative unit price: ${unitPriceCents}`);
  }
  if (quantity < 0) {
    throw new MoneyError(`negative quantity: ${quantity}`);
  }
  return unitPriceCents * quantity;
}

/**
 * BasisPointsSchema: Integer basis points (0 to 10,000 bp, custodian.bp).
 * 0 = 0.00%, 10,000 = 100.00%, 1 bp = 0.01%.
 * Strict float rejection: floats have no canonical byte form and are rejected.
 */
export const BasisPointsSchema = z
  .number({
    required_error: 'Basis points value is required',
    invalid_type_error: 'Basis points must be an integer number',
  })
  .int('Basis points must be an integer; floats are strictly rejected')
  .min(0, 'Basis points out of range [0, 10000]: must be >= 0')
  .max(10000, 'Basis points out of range [0, 10000]: must be <= 10000');

export type BasisPoints = z.infer<typeof BasisPointsSchema>;

export const FULL_BP = 10_000;
export const ZERO_BP = 0;

export function validateBasisPoints(score: number): number {
  if (typeof score !== 'number' || !Number.isInteger(score)) {
    throw new BpError(`basis points must be int, got ${typeof score}: ${score}`);
  }
  if (score < ZERO_BP || score > FULL_BP) {
    throw new BpError(`basis points out of range [0, ${FULL_BP}]: ${score}`);
  }
  return score;
}

/**
 * Convert a ratio to basis points, rounding half up in integer arithmetic.
 */
export function basisPointsFromRatio(numerator: number, denominator: number): number {
  if (typeof numerator !== 'number' || !Number.isInteger(numerator) ||
      typeof denominator !== 'number' || !Number.isInteger(denominator)) {
    throw new BpError('basisPointsFromRatio takes ints; floats cannot enter a score');
  }
  if (denominator === 0) {
    throw new BpError('basisPointsFromRatio: zero denominator — the caller must decide what empty means');
  }
  if (numerator < 0 || denominator < 0) {
    throw new BpError(`basisPointsFromRatio: negative input ${numerator}/${denominator}`);
  }
  const score = Math.floor((numerator * FULL_BP + Math.floor(denominator / 2)) / denominator);
  return validateBasisPoints(Math.min(FULL_BP, score));
}

/**
 * Parse human percentage like "85" or "85.5" into integer basis points.
 */
export function basisPointsFromPercent(percent: string): number {
  const trimmed = percent.trim().replace(/%$/, '');
  const match = trimmed.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new BpError(`unparseable percentage: ${percent}`);
  }
  const whole = parseInt(match[1], 10);
  let bp = whole * 100;
  if (match[2]) {
    const fractionStr = match[2].slice(0, 3);
    if (fractionStr.length === 1) {
      bp += parseInt(fractionStr, 10) * 10;
    } else if (fractionStr.length === 2) {
      bp += parseInt(fractionStr, 10);
    } else {
      const twoDec = parseInt(fractionStr.slice(0, 2), 10);
      const thirdDec = parseInt(fractionStr[2], 10);
      bp += twoDec + (thirdDec >= 5 ? 1 : 0);
    }
  }
  return validateBasisPoints(bp);
}

/**
 * Weighted mean of [scoreBp, weight] pairs in integer arithmetic (round half up).
 */
export function weightedBasisPoints(parts: Array<[number, number]>): number {
  const pairs = parts.map(([score, weight]) => {
    return [validateBasisPoints(score), weight] as [number, number];
  });
  if (pairs.some(([, w]) => typeof w !== 'number' || !Number.isInteger(w) || w < 0)) {
    throw new BpError('negative or float weight');
  }
  const totalWeight = pairs.reduce((sum, [, w]) => sum + w, 0);
  if (totalWeight === 0) {
    return ZERO_BP;
  }
  const numerator = pairs.reduce((sum, [score, weight]) => sum + score * weight, 0);
  const rounded = Math.floor((numerator + Math.floor(totalWeight / 2)) / totalWeight);
  return validateBasisPoints(rounded);
}

/**
 * Render basis points for humans: 8500 -> "85.00%".
 */
export function formatBasisPoints(score: number): string {
  validateBasisPoints(score);
  const whole = Math.floor(score / 100);
  const part = score % 100;
  return `${whole}.${part.toString().padStart(2, '0')}%`;
}

export const SpendMandateSchema = z.object({
  mandate_id: z.string().max(32),
  buyer_id: z.string().max(64),
  max_total_spend_cents: z.number().int().positive(),
  max_single_merchant_cents: z.number().int().positive(),
  cumulative_spent_cents: z.number().int().nonnegative().default(0),
  currency_code: z.string().length(3).default('USD'),
  allowed_category_ids: z.array(z.string()),
  public_key_hex: z.string().max(128),
  ed25519_signature_hex: z.string(),
  expires_at: z.union([z.date(), z.string().datetime()]).transform(v => typeof v === 'string' ? new Date(v) : v),
  status: z.enum(['ACTIVE', 'EXHAUSTED', 'REVOKED', 'EXPIRED']).default('ACTIVE'),
  created_at: z.union([z.date(), z.string().datetime()]).optional().transform(v => typeof v === 'string' ? new Date(v) : (v || new Date())),
}).refine(
  data => data.max_single_merchant_cents <= data.max_total_spend_cents,
  {
    message: 'max_single_merchant_cents must not exceed max_total_spend_cents',
  }
);

export const SessionMandateSchema = SpendMandateSchema;

export const SyntheticIntentVoucherSchema = z.object({
  voucher_id: z.string().max(32),
  mandate_id: z.string().max(32),
  paypal_vault_setup_token_id: z.string().max(64),
  paypal_payment_token_id: z.string().max(64).nullable().optional(),
  channel3_product_id: z.string().max(64),
  merchant_domain: z.string().max(128),
  retail_offer_cents: z.number().int().nonnegative(),
  buyer_bid_cents: z.number().int().nonnegative(),
  commission_rebate_rate: z.number().min(0).max(1),
  merchant_min_floor_cents: z.number().int().nonnegative(),
  negotiation_status: z.enum(['OPEN_BID', 'COUNTERED', 'ACCEPTED_AND_CAPTURED', 'EXPIRED']).default('OPEN_BID'),
  resulting_paypal_order_id: z.string().max(64).nullable().optional(),
  expires_at: z.date(),
  created_at: z.date().default(() => new Date()),
});

export const EscrowOrderSchema = z.object({
  id: z.string().uuid().optional(),
  paypal_order_id: z.string().max(64),
  paypal_request_id: z.string().max(64),
  mandate_id: z.string().max(32),
  gross_authorized_cents: z.number().int().nonnegative(),
  commission_rebate_cents: z.number().int().nonnegative().default(0),
  shipping_saved_cents: z.number().int().nonnegative().default(0),
  currency_code: z.string().length(3).default('USD'),
  server_readback_verified: z.boolean().default(false),
  order_status: z.enum(['AUTHORIZED', 'PRICE_DROP_CAPTURED', 'COMPLETED', 'VOIDED']),
  created_at: z.date().default(() => new Date()),
});

export const PurchaseUnitHoldSchema = z.object({
  id: z.string().uuid().optional(),
  escrow_order_id: z.string().uuid(),
  invoice_id: z.string().max(64),
  paypal_authorization_id: z.string().max(64).nullable().optional(),
  paypal_capture_id: z.string().max(64).nullable().optional(),
  paypal_tracking_number: z.string().max(64).nullable().optional(),
  channel3_product_id: z.string().max(64),
  channel3_cleaned_image_url: z.string().url(),
  merchant_domain: z.string().max(128),
  merchant_anomaly_score: z.number().min(0).max(1000),
  authorized_cents: z.number().int().nonnegative(),
  target_price_drop_cents: z.number().int().nonnegative(),
  final_captured_cents: z.number().int().nonnegative().nullable().optional(),
  honor_period_expires_at: z.date(),
  auth_valid_until: z.date(),
  hold_status: z.enum(['WATCHING_PRICE']).default('WATCHING_PRICE'),
  tax_cents: z.number().int().nonnegative().default(0),
  zip_code: z.string().max(10).nullable().optional(),
  stock_reservation_status: z.string().max(32).default('CONFIRMED'),
});

export const DisputeArbitrationSchema = z.object({
  paypal_dispute_id: z.string().max(64),
  purchase_unit_id: z.string().uuid().nullable().optional(),
  dispute_reason: z.string().max(64),
  dispute_state: z.string().max(64),
  dispute_amount_cents: z.number().int().nonnegative(),
  liability_score_l: z.number().min(0).max(1),
  abuse_risk_score_r: z.number().min(0).max(1),
  exif_tamper_flag: z.boolean().default(false),
  defect_bounding_box: z.array(z.number()).length(4).nullable().optional(),
  hateoas_allowed_actions: z.array(z.string()),
  selected_tier_action: z.enum(['TIER1_REFUND', 'TIER2_PARTIAL_OFFER', 'TIER3_RETURN_OFFER', 'TIER4_CONTEST_PDF', 'TIER5_SLA_ESCALATE']),
  seller_response_due_date: z.date(),
  assigned_analyst_id: z.string().max(64).nullable().optional(),
  scheduled_review_start: z.date().nullable().optional(),
  scheduled_review_end: z.date().nullable().optional(),
  compiled_evidence_pdf_base64: z.string().nullable().optional(),
  return_tracking_id: z.string().max(64).nullable().optional(),
  return_label_url: z.string().nullable().optional(),
  updated_at: z.date().default(() => new Date()),
});

export const ReturnLabelInfoSchema = z.object({
  label_url: z.string(),
  tracking_number: z.string(),
  carrier: z.string(),
  qr_code_base64: z.string(),
});

export const AutonomyDialModeSchema = z.enum(['COPILOT', 'SUPERVISED', 'AUTONOMOUS']);

export const DisputeAnalysisResultSchema = z.object({
  identity_match_score: z.number().min(0).max(1),
  defect_severity_score: z.number().min(0).max(1),
  defect_bounding_box: z.array(z.number()).length(4).nullable().optional(),
  liability_score_l: z.number().min(0).max(1),
  abuse_risk_score_r: z.number().min(0).max(1),
});

export const Channel3ItemSchema = z.object({
  product_id: z.string(),
  price: z.number(),
  compare_at_price: z.number(),
  max_commission_rate: z.number(),
  domain: z.string(),
  cleaned_url: z.string().url(),
  dimensions: z.object({
    weight: z.number().optional(),
  }).optional(),
});

export const PayPalOrderIntentSchema = z.enum(['AUTHORIZE', 'CAPTURE']);

export const ShoppingActionTypeSchema = z.enum(['DISCOVER', 'COMPARE', 'DETAILS', 'BUY']);

export const ProductCardDataSchema = z.object({
  product_id: z.string(),
  title: z.string(),
  description: z.string(),
  category_id: z.string(),
  price_cents: z.number().int().nonnegative(),
  compare_at_price_cents: z.number().int().nonnegative(),
  commission_rebate_cents: z.number().int().nonnegative().default(0),
  commission_rate: z.number().min(0).max(1).default(0),
  rating: z.number().min(0).max(5).default(4.8),
  review_count: z.number().int().nonnegative().default(120),
  shipping_fee_cents: z.number().int().nonnegative().default(0),
  free_shipping: z.boolean().default(false),
  merchant_domain: z.string(),
  merchant_credibility_score: z.number().min(0).max(100).default(95),
  stock_status: z.enum(['IN_STOCK', 'OUT_OF_STOCK']).default('IN_STOCK'),
  delivery_window: z.string().default('2-3 Business Days'),
  image_url: z.string().url(),
  cleaned_image_url: z.string().url(),
  specs: z.record(z.string(), z.string()).optional(),
  images: z.array(z.object({
    url: z.string(),
    cleaned_url: z.string(),
  })).optional(),
});

export const ComparisonMatrixRowSchema = z.object({
  attribute: z.string(),
  values: z.record(z.string(), z.string()), // map productId -> display value
  highlighted_product_id: z.string().optional(),
});

export const ComparisonMatrixSchema = z.object({
  product_ids: z.array(z.string()),
  products: z.array(ProductCardDataSchema),
  rows: z.array(ComparisonMatrixRowSchema),
  winner_product_id: z.string().optional(),
  rationale: z.string().optional(),
});

export const ExplainableCartItemSchema = z.object({
  product_id: z.string(),
  title: z.string(),
  quantity: z.number().int().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  unit_compare_price_cents: z.number().int().nonnegative(),
  commission_rate: z.number().min(0).max(1),
  cleaned_url: z.string(),
});

export const ExplainableCartMerchantGroupSchema = z.object({
  merchant_domain: z.string(),
  items: z.array(ExplainableCartItemSchema),
  subtotal_cents: z.number().int().nonnegative(),
  commission_rebate_cents: z.number().int().nonnegative(),
  shipping_fee_cents: z.number().int().nonnegative(),
  shipping_waived: z.boolean(),
  merchant_anomaly_penalty_cents: z.number().int().nonnegative().default(0),
  tax_cents: z.number().int().nonnegative().default(0),
  tax_rate_bps: z.number().int().nonnegative().default(0),
  net_merchant_cents: z.number().int().nonnegative(),
  merchant_retail_authorized_cents: z.number().int().nonnegative(),
  platform_subsidy_cents: z.number().int().nonnegative(),
});

export const ExplainableCartPayloadSchema = z.object({
  assigned_merchants: z.array(ExplainableCartMerchantGroupSchema),
  gross_subtotal_cents: z.number().int().nonnegative(),
  total_commission_rebate_cents: z.number().int().nonnegative(),
  total_shipping_cents: z.number().int().nonnegative(),
  total_shipping_saved_cents: z.number().int().nonnegative(),
  total_tax_cents: z.number().int().nonnegative(),
  net_buyer_expenditure_cents: z.number().int().nonnegative(),
  total_merchant_authorized_cents: z.number().int().nonnegative().optional(),
  total_platform_subsidy_credit_cents: z.number().int().nonnegative().optional(),
  savings_percentage: z.number().min(0).max(100),
  is_within_budget: z.boolean(),
  budget_cap_cents: z.number().int().positive().optional(),
  overage_percentage: z.number().optional(),
  zip_code: z.string().optional(),
  paypal_purchase_units: z.array(z.any()).optional(),
});

export const ChatResponsePayloadSchema = z.object({
  action: ShoppingActionTypeSchema,
  markdown: z.string(),
  products: z.array(ProductCardDataSchema).optional(),
  comparison: ComparisonMatrixSchema.optional(),
  product_detail: ProductCardDataSchema.optional(),
  cart: ExplainableCartPayloadSchema.optional().or(z.any()), // KnapsackOptimizationResult / ExplainableCartPayload
  stock_reservation: z.any().optional(), // TwoPhaseStockReservationResult
  follow_up_suggestions: z.array(z.string()).optional(),
  thought_trace: z.array(z.string()).optional(),
  active_model: z.string().optional(),
});

export type SpendMandate = z.infer<typeof SpendMandateSchema>;
export type SessionMandate = z.infer<typeof SessionMandateSchema>;
export type SyntheticIntentVoucher = z.infer<typeof SyntheticIntentVoucherSchema>;
export type EscrowOrder = z.infer<typeof EscrowOrderSchema>;
export type PurchaseUnitHold = z.infer<typeof PurchaseUnitHoldSchema>;
export type DisputeArbitration = z.infer<typeof DisputeArbitrationSchema>;
export type ReturnLabelInfo = z.infer<typeof ReturnLabelInfoSchema>;
export type AutonomyDialMode = z.infer<typeof AutonomyDialModeSchema>;
export type DisputeAnalysisResult = z.infer<typeof DisputeAnalysisResultSchema>;
export type Channel3Item = z.infer<typeof Channel3ItemSchema>;
export type PayPalOrderIntent = z.infer<typeof PayPalOrderIntentSchema>;
export type ShoppingActionType = z.infer<typeof ShoppingActionTypeSchema>;
export type ProductCardData = z.infer<typeof ProductCardDataSchema>;
export type ComparisonMatrixRow = z.infer<typeof ComparisonMatrixRowSchema>;
export type ComparisonMatrix = z.infer<typeof ComparisonMatrixSchema>;
export type ExplainableCartItem = z.infer<typeof ExplainableCartItemSchema>;
export type ExplainableCartMerchantGroup = z.infer<typeof ExplainableCartMerchantGroupSchema>;
export type ExplainableCartPayload = z.infer<typeof ExplainableCartPayloadSchema>;
export type ChatResponsePayload = z.infer<typeof ChatResponsePayloadSchema>;

/**
 * Custodian Reason Codes and Violation Taxonomies
 * Derived from AP2 Intent Mandates and Custodian Gate verification architecture
 */
export const CustodianReasonCodeSchema = z.enum([
  // Price Integrity
  'PRICE_MATCHES_CATALOG',
  'PRICE_MISMATCH',
  'ITEM_NOT_IN_CATALOG',
  'ITEM_OUT_OF_STOCK',
  'SNAPSHOT_STALE',
  'LINE_ITEM_SUM_MISMATCH',

  // Budget
  'BUDGET_SATISFIED',
  'BUDGET_EXCEEDED',
  'BUDGET_UNSET',
  'UNIT_PRICE_CEILING_EXCEEDED',
  'INVALID_SPEND_AMOUNT',

  // Merchant Scope & Anomaly
  'MERCHANT_IN_SCOPE',
  'MERCHANT_OUT_OF_SCOPE',
  'MERCHANT_UNNAMED_BY_HUMAN',
  'MERCHANT_ANOMALY_THRESHOLD_EXCEEDED',

  // Category Scope
  'CATEGORY_IN_SCOPE',
  'CATEGORY_OUT_OF_SCOPE',

  // Mandate & Cryptographic Authority
  'MANDATE_SATISFIED',
  'MANDATE_TOTAL_EXCEEDED',
  'MANDATE_PER_TXN_EXCEEDED',
  'MANDATE_EXPIRED',
  'MANDATE_NOT_YET_VALID',
  'MANDATE_REVOKED',
  'MANDATE_MERCHANT_NOT_ALLOWED',
  'MANDATE_CATEGORY_NOT_ALLOWED',
  'MANDATE_CURRENCY_MISMATCH',
  'MANDATE_NOT_FOUND',
  'ED25519_SIGNATURE_VERIFICATION_FAILED',
  'MANDATE_UNSIGNED_OR_TAMPERED',

  // Hard constraints
  'HARD_CONSTRAINT_VIOLATED'
]);

export type CustodianReasonCode = z.infer<typeof CustodianReasonCodeSchema>;

export const CUSTODIAN_REASON_CODES = CustodianReasonCodeSchema.options;

export const CUSTODIAN_BLOCKING_REASON_CODES: readonly CustodianReasonCode[] = [
  'PRICE_MISMATCH',
  'ITEM_NOT_IN_CATALOG',
  'ITEM_OUT_OF_STOCK',
  'LINE_ITEM_SUM_MISMATCH',
  'BUDGET_EXCEEDED',
  'UNIT_PRICE_CEILING_EXCEEDED',
  'INVALID_SPEND_AMOUNT',
  'MERCHANT_OUT_OF_SCOPE',
  'MERCHANT_ANOMALY_THRESHOLD_EXCEEDED',
  'CATEGORY_OUT_OF_SCOPE',
  'MANDATE_TOTAL_EXCEEDED',
  'MANDATE_PER_TXN_EXCEEDED',
  'MANDATE_EXPIRED',
  'MANDATE_NOT_YET_VALID',
  'MANDATE_REVOKED',
  'MANDATE_MERCHANT_NOT_ALLOWED',
  'MANDATE_CATEGORY_NOT_ALLOWED',
  'MANDATE_CURRENCY_MISMATCH',
  'MANDATE_NOT_FOUND',
  'ED25519_SIGNATURE_VERIFICATION_FAILED',
  'MANDATE_UNSIGNED_OR_TAMPERED',
  'HARD_CONSTRAINT_VIOLATED',
] as const;

export function isBlockingReasonCode(code: CustodianReasonCode): boolean {
  return (CUSTODIAN_BLOCKING_REASON_CODES as readonly string[]).includes(code);
}

export const CustodianViolationTaxonomySchema = z.object({
  code: CustodianReasonCodeSchema,
  message: z.string(),
  stage: z.enum(['STAGE_1_SCHEMA', 'STAGE_2_CRYPTOGRAPHIC', 'STAGE_3_MERCHANT_ANOMALY', 'STAGE_4_REDIS_LUA_PRE_RESERVATION']),
  is_blocking: z.boolean().default(true),
  observed_value: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.any()), z.array(z.any()), z.null()]).optional(),
  expected_ceiling: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.any()), z.array(z.any()), z.null()]).optional(),
});

export type CustodianViolationTaxonomy = z.infer<typeof CustodianViolationTaxonomySchema>;
export const ViolationTaxonomySchema = CustodianViolationTaxonomySchema;
export type ViolationTaxonomy = CustodianViolationTaxonomy;

export const CUSTODIAN_TAXONOMY_REGISTRY: Record<CustodianReasonCode, CustodianViolationTaxonomy> = {
  PRICE_MATCHES_CATALOG: {
    code: 'PRICE_MATCHES_CATALOG',
    message: 'Every price quoted by the agent matches the verified catalog.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: false,
  },
  PRICE_MISMATCH: {
    code: 'PRICE_MISMATCH',
    message: 'The agent quoted a price the catalog does not have.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: true,
  },
  ITEM_NOT_IN_CATALOG: {
    code: 'ITEM_NOT_IN_CATALOG',
    message: 'The cart contains an item this catalog does not sell.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: true,
  },
  ITEM_OUT_OF_STOCK: {
    code: 'ITEM_OUT_OF_STOCK',
    message: 'The cart contains an item that is out of stock.',
    stage: 'STAGE_4_REDIS_LUA_PRE_RESERVATION',
    is_blocking: true,
  },
  SNAPSHOT_STALE: {
    code: 'SNAPSHOT_STALE',
    message: 'The catalog snapshot is older than this decision allows.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: false,
  },
  LINE_ITEM_SUM_MISMATCH: {
    code: 'LINE_ITEM_SUM_MISMATCH',
    message: 'Sum of item prices does not equal the claimed subtotal.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: true,
  },
  BUDGET_SATISFIED: {
    code: 'BUDGET_SATISFIED',
    message: 'The verified total is within the stated budget ceiling.',
    stage: 'STAGE_4_REDIS_LUA_PRE_RESERVATION',
    is_blocking: false,
  },
  BUDGET_EXCEEDED: {
    code: 'BUDGET_EXCEEDED',
    message: 'The verified total exceeds the stated budget ceiling.',
    stage: 'STAGE_4_REDIS_LUA_PRE_RESERVATION',
    is_blocking: true,
  },
  BUDGET_UNSET: {
    code: 'BUDGET_UNSET',
    message: 'No budget was stated; the mandate caps govern instead.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: false,
  },
  UNIT_PRICE_CEILING_EXCEEDED: {
    code: 'UNIT_PRICE_CEILING_EXCEEDED',
    message: 'An item costs more per unit than was allowed for it.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: true,
  },
  INVALID_SPEND_AMOUNT: {
    code: 'INVALID_SPEND_AMOUNT',
    message: 'Spend amount is non-integer, negative, or invalid.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: true,
  },
  MERCHANT_IN_SCOPE: {
    code: 'MERCHANT_IN_SCOPE',
    message: 'The merchant is one the human named in scope.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: false,
  },
  MERCHANT_OUT_OF_SCOPE: {
    code: 'MERCHANT_OUT_OF_SCOPE',
    message: 'The purchase is from a merchant outside the permitted scope.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: true,
  },
  MERCHANT_UNNAMED_BY_HUMAN: {
    code: 'MERCHANT_UNNAMED_BY_HUMAN',
    message: 'No merchant named by human; mandate allowlist applies.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: false,
  },
  MERCHANT_ANOMALY_THRESHOLD_EXCEEDED: {
    code: 'MERCHANT_ANOMALY_THRESHOLD_EXCEEDED',
    message: 'Merchant anomaly risk score exceeds the allowed threshold.',
    stage: 'STAGE_3_MERCHANT_ANOMALY',
    is_blocking: true,
  },
  CATEGORY_IN_SCOPE: {
    code: 'CATEGORY_IN_SCOPE',
    message: 'Every item falls in a category the human authorized.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: false,
  },
  CATEGORY_OUT_OF_SCOPE: {
    code: 'CATEGORY_OUT_OF_SCOPE',
    message: 'An item falls outside authorized merchandise categories.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: true,
  },
  MANDATE_SATISFIED: {
    code: 'MANDATE_SATISFIED',
    message: 'The spend is inside the authorized payment mandate.',
    stage: 'STAGE_2_CRYPTOGRAPHIC',
    is_blocking: false,
  },
  MANDATE_TOTAL_EXCEEDED: {
    code: 'MANDATE_TOTAL_EXCEEDED',
    message: 'The spend exceeds the mandate lifetime ceiling.',
    stage: 'STAGE_4_REDIS_LUA_PRE_RESERVATION',
    is_blocking: true,
  },
  MANDATE_PER_TXN_EXCEEDED: {
    code: 'MANDATE_PER_TXN_EXCEEDED',
    message: 'The spend exceeds the mandate per-transaction cap.',
    stage: 'STAGE_4_REDIS_LUA_PRE_RESERVATION',
    is_blocking: true,
  },
  MANDATE_EXPIRED: {
    code: 'MANDATE_EXPIRED',
    message: 'The payment mandate has expired.',
    stage: 'STAGE_2_CRYPTOGRAPHIC',
    is_blocking: true,
  },
  MANDATE_NOT_YET_VALID: {
    code: 'MANDATE_NOT_YET_VALID',
    message: 'The payment mandate is not valid yet.',
    stage: 'STAGE_2_CRYPTOGRAPHIC',
    is_blocking: true,
  },
  MANDATE_REVOKED: {
    code: 'MANDATE_REVOKED',
    message: 'The payment mandate has been revoked by the owner.',
    stage: 'STAGE_2_CRYPTOGRAPHIC',
    is_blocking: true,
  },
  MANDATE_MERCHANT_NOT_ALLOWED: {
    code: 'MANDATE_MERCHANT_NOT_ALLOWED',
    message: 'The mandate does not authorize payment to this merchant.',
    stage: 'STAGE_2_CRYPTOGRAPHIC',
    is_blocking: true,
  },
  MANDATE_CATEGORY_NOT_ALLOWED: {
    code: 'MANDATE_CATEGORY_NOT_ALLOWED',
    message: 'The mandate does not cover this category of spending.',
    stage: 'STAGE_2_CRYPTOGRAPHIC',
    is_blocking: true,
  },
  MANDATE_CURRENCY_MISMATCH: {
    code: 'MANDATE_CURRENCY_MISMATCH',
    message: 'The mandate is denominated in a different currency.',
    stage: 'STAGE_2_CRYPTOGRAPHIC',
    is_blocking: true,
  },
  MANDATE_NOT_FOUND: {
    code: 'MANDATE_NOT_FOUND',
    message: 'The referenced spend mandate could not be found.',
    stage: 'STAGE_2_CRYPTOGRAPHIC',
    is_blocking: true,
  },
  ED25519_SIGNATURE_VERIFICATION_FAILED: {
    code: 'ED25519_SIGNATURE_VERIFICATION_FAILED',
    message: 'Ed25519 cryptographic signature verification failed.',
    stage: 'STAGE_2_CRYPTOGRAPHIC',
    is_blocking: true,
  },
  MANDATE_UNSIGNED_OR_TAMPERED: {
    code: 'MANDATE_UNSIGNED_OR_TAMPERED',
    message: 'The mandate payload is unsigned or has been tampered with.',
    stage: 'STAGE_2_CRYPTOGRAPHIC',
    is_blocking: true,
  },
  HARD_CONSTRAINT_VIOLATED: {
    code: 'HARD_CONSTRAINT_VIOLATED',
    message: 'A non-negotiable hard constraint was violated.',
    stage: 'STAGE_1_SCHEMA',
    is_blocking: true,
  },
};

/**
 * Custodian AP2 Policy Evaluation Verdict Schema
 * Models multi-dimensional decision gates, basis-point alignment scores, and reason codes
 */
export const PolicyEvaluationVerdictSchema = z.object({
  mandate_id: z.string(),
  outcome: z.enum(['APPROVE', 'HOLD', 'REJECT']),
  decision_id: z.string(),
  total_score_bp: BasisPointsSchema, // float-rejected integer basis points
  reasons: z.array(CustodianReasonCodeSchema),
  dimensions: z.array(z.object({
    dimension: z.enum([
      'PRICE_INTEGRITY',
      'BUDGET',
      'MERCHANT_SCOPE',
      'CATEGORY_SCOPE',
      'MANDATE',
      'SUBSTITUTION',
      'SCOPE_CREEP',
      'SANITIZATION'
    ]),
    status: z.enum(['PASS', 'FAIL', 'UNCERTAIN']),
    score_bp: BasisPointsSchema, // float-rejected integer basis points
    reason_codes: z.array(CustodianReasonCodeSchema).min(1, 'Dimension must provide at least one reason code'),
  })),
  verified_total_cents: CentsSchema.optional(),
  verified_total_paise: CentsSchema.optional(),
  bindings: z.array(z.object({
    cart_line_id: z.string(),
    requested_line_id: z.string().nullable().optional(),
    kind: z.enum(['EXACT', 'SUBSTITUTION', 'BUNDLE_MEMBER', 'UNBOUND']),
    score_bp: BasisPointsSchema,
    reason_codes: z.array(CustodianReasonCodeSchema).optional().default([]),
  })).optional(),
  snapshot_digest: z.string().length(64).optional(),
  thresholds_version: z.string().optional(),
  thresholds_digest: z.string().length(64).optional(),
  escalated_line_ids: z.array(z.string()).optional(),
  disposition_codes: z.array(CustodianReasonCodeSchema).optional(),
  audit_hash: z.string().length(64).optional(),
  evaluated_at: z.union([z.date(), z.string().datetime()]).transform(v => typeof v === 'string' ? new Date(v) : v),
}).refine(
  (data) => {
    // Invariant: An APPROVE outcome cannot contain any blocking violation codes
    if (data.outcome === 'APPROVE') {
      const allReasons = [
        ...data.reasons,
        ...data.dimensions.flatMap((d) => d.reason_codes),
        ...(data.disposition_codes || []),
      ];
      return !allReasons.some((r) => CUSTODIAN_BLOCKING_REASON_CODES.includes(r));
    }
    return true;
  },
  {
    message: 'An APPROVE outcome cannot contain blocking violation reason codes',
  }
);

export type PolicyEvaluationVerdict = z.infer<typeof PolicyEvaluationVerdictSchema>;

/**
 * CustodianVerdictSchema: Exported alongside PolicyEvaluationVerdictSchema
 * Canonical representation of Custodian multi-dimensional alignment decision gate.
 */
export const CustodianVerdictSchema = PolicyEvaluationVerdictSchema;
export type CustodianVerdict = z.infer<typeof CustodianVerdictSchema>;

/**
 * Agentic Commerce Protocol (ACP) Interoperability Schemas
 * RFC-compliant checkout sessions, carts, discount extensions, and payment delegates
 */
export const AcpDiscountExtensionSchema = z.object({
  code: z.string().optional(),
  title: z.string().optional(),
  amount_cents: z.number().int().nonnegative(),
  type: z.enum(['coupon', 'promo', 'commission_rebate', 'voucher']).default('coupon'),
  applied_to: z.enum(['order', 'item', 'shipping']).default('order'),
  item_id: z.string().optional(),
});

export type AcpDiscountExtension = z.infer<typeof AcpDiscountExtensionSchema>;

export const AcpCartItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  quantity: z.number().int().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  total_price_cents: z.number().int().nonnegative(),
  currency: z.string().default('USD'),
  merchant_id: z.string().optional(),
  merchant_domain: z.string().optional(),
  image_url: z.string().url().optional(),
  discounts: z.array(AcpDiscountExtensionSchema).optional().default([]),
});

export type AcpCartItem = z.infer<typeof AcpCartItemSchema>;

export const AcpCartPayloadSchema = z.object({
  cart_id: z.string(),
  items: z.array(AcpCartItemSchema).min(1, 'Cart items array must not be empty'),
  currency: z.string().default('USD'),
  subtotal_cents: z.number().int().nonnegative(),
  tax_cents: z.number().int().nonnegative().default(0),
  shipping_cents: z.number().int().nonnegative().default(0),
  discount_cents: z.number().int().nonnegative().default(0),
  total_cents: z.number().int().nonnegative(),
  discounts: z.array(AcpDiscountExtensionSchema).optional().default([]),
}).refine(
  (cart) => {
    const calculatedSum = cart.items.reduce((sum, it) => sum + it.total_price_cents, 0);
    return Math.abs(cart.subtotal_cents - calculatedSum) === 0;
  },
  {
    message: 'Cart subtotal_cents must equal sum of item total_price_cents',
  }
);

export type AcpCartPayload = z.infer<typeof AcpCartPayloadSchema>;

export const AcpAddressSchema = z.object({
  name: z.string().optional(),
  line_one: z.string(),
  line_two: z.string().optional().default(''),
  city: z.string(),
  state: z.string(),
  country: z.string().length(2).default('US'),
  postal_code: z.string(),
});

export type AcpAddress = z.infer<typeof AcpAddressSchema>;

export const AcpCheckoutSessionSchema = z.object({
  id: z.string(),
  status: z.enum(['created', 'in_progress', 'ready_for_payment', 'completed', 'canceled']).default('created'),
  cart: AcpCartPayloadSchema,
  shipping_address: AcpAddressSchema.optional(),
  billing_address: AcpAddressSchema.optional(),
  buyer_email: z.string().email().optional(),
  buyer_mandate_id: z.string().optional(),
  expires_at: z.union([z.date(), z.string().datetime()]).transform(v => typeof v === 'string' ? new Date(v) : v),
  created_at: z.union([z.date(), z.string().datetime()]).optional().transform(v => typeof v === 'string' ? new Date(v) : (v || new Date())),
  metadata: z.record(z.string(), z.any()).optional().default({}),
});

export type AcpCheckoutSession = z.infer<typeof AcpCheckoutSessionSchema>;

export const AcpPaymentHandlerRequestSchema = z.object({
  checkout_session_id: z.string(),
  mandate_id: z.string().optional(),
  payment_method: z.object({
    type: z.enum(['vault_token', 'card', 'ed25519_mandate', 'paypal_wallet']),
    token: z.string().optional(),
    mandate_signature: z.string().optional(),
    public_key_hex: z.string().optional(),
  }),
  amount_cents: z.number().int().positive(),
  currency: z.string().default('USD'),
  merchant_domain: z.string(),
  risk_signals: z.array(z.object({
    type: z.string(),
    score: z.number().int(),
    action: z.enum(['blocked', 'manual_review', 'authorized']),
  })).optional().default([]),
  metadata: z.record(z.string(), z.string()).optional().default({}),
});

export type AcpPaymentHandlerRequest = z.infer<typeof AcpPaymentHandlerRequestSchema>;

export const AcpPaymentHandlerResponseSchema = z.object({
  payment_id: z.string(),
  status: z.enum(['AUTHORIZED', 'CAPTURED', 'DECLINED', 'REQUIRES_ACTION']),
  amount_cents: z.number().int().positive(),
  currency: z.string().default('USD'),
  transaction_reference: z.string(),
  paypal_order_id: z.string().optional(),
  challenge_url: z.string().url().optional(),
  error_code: z.string().optional(),
  created_at: z.union([z.date(), z.string().datetime()]).transform(v => typeof v === 'string' ? new Date(v) : v),
});

export type AcpPaymentHandlerResponse = z.infer<typeof AcpPaymentHandlerResponseSchema>;

/**
 * x402 Core Protocol Schemas
 * Standardized HTTP 402 payment requirements, contracts, and cryptographic receipts
 * Matching x402 payment specifications (v2) and AegisPay autonomous execution
 */
export const X402ResourceInfoSchema = z.object({
  url: z.string(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  serviceName: z.string().optional(),
  tags: z.array(z.string()).optional(),
  iconUrl: z.string().optional(),
});

export type X402ResourceInfo = z.infer<typeof X402ResourceInfoSchema>;

export const X402PaymentRequirementsSchema = z.object({
  scheme: z.string().default('exact'),
  network: z.string().default('paypal-sandbox'),
  asset: z.string().default('USD'),
  amount: z.union([z.string(), z.number()]),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().int().positive().default(86400),
  extra: z.record(z.string(), z.any()).optional().default({}),
});

export type X402PaymentRequirements = z.infer<typeof X402PaymentRequirementsSchema>;

export const X402SpendPolicySchema = z.object({
  currency: z.string().default('USD'),
  mandate_protocol: z.string().default('Ed25519-SessionMandate-v1'),
  atomic_settlement: z.string().default('REDIS_LUA_PRE_RESERVED'),
  max_allowed_spend_cents: z.number().int().positive().optional(),
});

export type X402SpendPolicy = z.infer<typeof X402SpendPolicySchema>;

export const X402PaymentContractSchema = z.object({
  x402Version: z.number().int().default(2),
  error: z.string().optional(),
  payment_contract_id: z.string().optional(),
  pay_to: z.string().optional(),
  resource: X402ResourceInfoSchema.optional(),
  accepts: z.array(X402PaymentRequirementsSchema).optional().default([]),
  vault_setup_url: z.string().optional(),
  accepted_headers: z.array(z.string()).optional(),
  spend_policy: X402SpendPolicySchema.optional(),
  extensions: z.record(z.string(), z.any()).optional().default({}),
  created_at: z.union([z.date(), z.string().datetime()]).optional().transform(v => typeof v === 'string' ? new Date(v) : (v || new Date())),
});

export type X402PaymentContract = z.infer<typeof X402PaymentContractSchema>;

export const X402PaymentReceiptSchema = z.object({
  contractId: z.string(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().default('USD'),
  timestamp: z.number().int().positive(),
  hmac: z.string().min(32),
  receipt_token: z.string().optional(),
  x402Version: z.number().int().default(2).optional(),
});

export type X402PaymentReceipt = z.infer<typeof X402PaymentReceiptSchema>;


