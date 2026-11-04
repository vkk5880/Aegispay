import { z } from 'zod';

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
});

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

export const CustodianViolationTaxonomySchema = z.object({
  code: CustodianReasonCodeSchema,
  message: z.string(),
  stage: z.enum(['STAGE_1_SCHEMA', 'STAGE_2_CRYPTOGRAPHIC', 'STAGE_3_MERCHANT_ANOMALY', 'STAGE_4_REDIS_LUA_PRE_RESERVATION']),
  is_blocking: z.boolean().default(true),
  observed_value: z.union([z.string(), z.number(), z.record(z.string(), z.any())]).optional(),
  expected_ceiling: z.union([z.string(), z.number(), z.record(z.string(), z.any())]).optional(),
});

export type CustodianViolationTaxonomy = z.infer<typeof CustodianViolationTaxonomySchema>;
