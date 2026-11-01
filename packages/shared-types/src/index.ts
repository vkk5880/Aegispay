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
  expires_at: z.date(),
  status: z.enum(['ACTIVE', 'EXHAUSTED', 'REVOKED', 'EXPIRED']).default('ACTIVE'),
  created_at: z.date().default(() => new Date()),
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
  updated_at: z.date().default(() => new Date()),
});

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

export type SpendMandate = z.infer<typeof SpendMandateSchema>;
export type SessionMandate = z.infer<typeof SessionMandateSchema>;
export type SyntheticIntentVoucher = z.infer<typeof SyntheticIntentVoucherSchema>;
export type EscrowOrder = z.infer<typeof EscrowOrderSchema>;
export type PurchaseUnitHold = z.infer<typeof PurchaseUnitHoldSchema>;
export type DisputeArbitration = z.infer<typeof DisputeArbitrationSchema>;
export type DisputeAnalysisResult = z.infer<typeof DisputeAnalysisResultSchema>;
export type Channel3Item = z.infer<typeof Channel3ItemSchema>;
export type PayPalOrderIntent = z.infer<typeof PayPalOrderIntentSchema>;
