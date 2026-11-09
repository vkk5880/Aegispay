import {
  pgTable,
  varchar,
  integer,
  timestamp,
  uuid,
  text,
  boolean,
  numeric,
  jsonb,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const spendMandates = pgTable(
  'spend_mandates',
  {
    mandate_id: varchar('mandate_id', { length: 32 }).primaryKey(),
    buyer_id: varchar('buyer_id', { length: 64 }).notNull(),
    max_total_spend_cents: integer('max_total_spend_cents').notNull(),
    max_single_merchant_cents: integer('max_single_merchant_cents').notNull(),
    cumulative_spent_cents: integer('cumulative_spent_cents').notNull().default(0),
    currency_code: varchar('currency_code', { length: 3 }).notNull().default('USD'),
    allowed_category_ids: text('allowed_category_ids').array().notNull(),
    public_key_hex: varchar('public_key_hex', { length: 128 }).notNull(),
    ed25519_signature_hex: text('ed25519_signature_hex').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('ACTIVE'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    maxTotalSpendCentsCheck: check(
      'check_spend_mandates_max_total_spend_cents_positive',
      sql`${table.max_total_spend_cents} > 0`
    ),
    maxSingleMerchantCentsCheck: check(
      'check_spend_mandates_max_single_merchant_cents_positive',
      sql`${table.max_single_merchant_cents} > 0`
    ),
    cumulativeSpentCentsCheck: check(
      'check_spend_mandates_cumulative_spent_cents_positive',
      sql`${table.cumulative_spent_cents} >= 0`
    ),
  })
);

export const syntheticIntentVouchers = pgTable(
  'synthetic_intent_vouchers',
  {
    voucher_id: varchar('voucher_id', { length: 32 }).primaryKey(),
    mandate_id: varchar('mandate_id', { length: 32 }).notNull().references(() => spendMandates.mandate_id),
    paypal_vault_setup_token_id: varchar('paypal_vault_setup_token_id', { length: 64 }).notNull(),
    paypal_payment_token_id: varchar('paypal_payment_token_id', { length: 64 }),
    channel3_product_id: varchar('channel3_product_id', { length: 64 }).notNull(),
    merchant_domain: varchar('merchant_domain', { length: 128 }).notNull(),
    retail_offer_cents: integer('retail_offer_cents').notNull(),
    buyer_bid_cents: integer('buyer_bid_cents').notNull(),
    commission_rebate_rate: numeric('commission_rebate_rate', { precision: 5, scale: 4 }).notNull(),
    merchant_min_floor_cents: integer('merchant_min_floor_cents').notNull(),
    negotiation_status: varchar('negotiation_status', { length: 32 }).notNull().default('OPEN_BID'),
    resulting_paypal_order_id: varchar('resulting_paypal_order_id', { length: 64 }),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    mandateIdIdx: index('idx_synthetic_intent_vouchers_mandate_id').on(table.mandate_id),
    negotiationStatusIdx: index('idx_synthetic_intent_vouchers_negotiation_status').on(table.negotiation_status),
    retailOfferCentsCheck: check(
      'check_synthetic_intent_vouchers_retail_offer_cents_positive',
      sql`${table.retail_offer_cents} > 0`
    ),
    buyerBidCentsCheck: check(
      'check_synthetic_intent_vouchers_buyer_bid_cents_positive',
      sql`${table.buyer_bid_cents} > 0`
    ),
    merchantMinFloorCentsCheck: check(
      'check_synthetic_intent_vouchers_merchant_min_floor_cents_positive',
      sql`${table.merchant_min_floor_cents} > 0`
    ),
  })
);

export const escrowOrders = pgTable(
  'escrow_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paypal_order_id: varchar('paypal_order_id', { length: 64 }).notNull().unique(),
    paypal_request_id: varchar('paypal_request_id', { length: 64 }).notNull().unique(),
    mandate_id: varchar('mandate_id', { length: 32 }).notNull().references(() => spendMandates.mandate_id),
    gross_authorized_cents: integer('gross_authorized_cents').notNull(),
    commission_rebate_cents: integer('commission_rebate_cents').notNull().default(0),
    shipping_saved_cents: integer('shipping_saved_cents').notNull().default(0),
    currency_code: varchar('currency_code', { length: 3 }).notNull().default('USD'),
    server_readback_verified: boolean('server_readback_verified').notNull().default(false),
    order_status: varchar('order_status', { length: 32 }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    grossAuthorizedCentsCheck: check(
      'check_escrow_orders_gross_authorized_cents_positive',
      sql`${table.gross_authorized_cents} > 0`
    ),
  })
);

export const purchaseUnitHolds = pgTable(
  'purchase_unit_holds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    escrow_order_id: uuid('escrow_order_id').notNull().references(() => escrowOrders.id),
    invoice_id: varchar('invoice_id', { length: 64 }).notNull().unique(),
    paypal_authorization_id: varchar('paypal_authorization_id', { length: 64 }).unique(),
    paypal_capture_id: varchar('paypal_capture_id', { length: 64 }).unique(),
    paypal_tracking_number: varchar('paypal_tracking_number', { length: 64 }),
    channel3_product_id: varchar('channel3_product_id', { length: 64 }).notNull(),
    channel3_cleaned_image_url: text('channel3_cleaned_image_url').notNull(),
    merchant_domain: varchar('merchant_domain', { length: 128 }).notNull(),
    merchant_anomaly_score: numeric('merchant_anomaly_score', { precision: 4, scale: 3 }).notNull(),
    authorized_cents: integer('authorized_cents').notNull(),
    target_price_drop_cents: integer('target_price_drop_cents').notNull(),
    residual_authorized_cents: integer('residual_authorized_cents'),
    final_captured_cents: integer('final_captured_cents'),
    final_capture: boolean('final_capture').default(true),
    honor_period_expires_at: timestamp('honor_period_expires_at', { withTimezone: true }).notNull(),
    auth_valid_until: timestamp('auth_valid_until', { withTimezone: true }).notNull(),
    hold_status: varchar('hold_status', { length: 32 }).notNull().default('WATCHING_PRICE'),
    tax_cents: integer('tax_cents').notNull().default(0),
    zip_code: varchar('zip_code', { length: 10 }),
    stock_reservation_status: varchar('stock_reservation_status', { length: 32 }).notNull().default('CONFIRMED'),
  },
  (table) => ({
    escrowOrderIdIdx: index('idx_purchase_unit_holds_escrow_order_id').on(table.escrow_order_id),
    merchantDomainIdx: index('idx_purchase_unit_holds_merchant_domain').on(table.merchant_domain),
    holdStatusIdx: index('idx_purchase_unit_holds_hold_status').on(table.hold_status),
    authorizedCentsCheck: check(
      'check_purchase_unit_holds_authorized_cents_positive',
      sql`${table.authorized_cents} > 0`
    ),
    targetPriceDropCentsCheck: check(
      'check_purchase_unit_holds_target_price_drop_cents_positive',
      sql`${table.target_price_drop_cents} > 0`
    ),
    taxCentsCheck: check(
      'check_purchase_unit_holds_tax_cents_positive',
      sql`${table.tax_cents} >= 0`
    ),
  })
);

export const disputeArbitrations = pgTable(
  'dispute_arbitrations',
  {
    paypal_dispute_id: varchar('paypal_dispute_id', { length: 64 }).primaryKey(),
    purchase_unit_id: uuid('purchase_unit_id').references(() => purchaseUnitHolds.id),
    dispute_reason: varchar('dispute_reason', { length: 64 }).notNull(),
    dispute_state: varchar('dispute_state', { length: 64 }).notNull(),
    dispute_amount_cents: integer('dispute_amount_cents').notNull(),
    liability_score_l: numeric('liability_score_l', { precision: 4, scale: 3 }).notNull(),
    abuse_risk_score_r: numeric('abuse_risk_score_r', { precision: 4, scale: 3 }).notNull(),
    exif_tamper_flag: boolean('exif_tamper_flag').notNull().default(false),
    defect_bounding_box: jsonb('defect_bounding_box'),
    hateoas_allowed_actions: text('hateoas_allowed_actions').array().notNull(),
    selected_tier_action: varchar('selected_tier_action', { length: 48 }).notNull(),
    seller_response_due_date: timestamp('seller_response_due_date', { withTimezone: true }).notNull(),
    assigned_analyst_id: varchar('assigned_analyst_id', { length: 64 }),
    scheduled_review_start: timestamp('scheduled_review_start', { withTimezone: true }),
    scheduled_review_end: timestamp('scheduled_review_end', { withTimezone: true }),
    compiled_evidence_pdf_base64: text('compiled_evidence_pdf_base64'),
    return_tracking_id: varchar('return_tracking_id', { length: 64 }),
    return_label_url: text('return_label_url'),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    purchaseUnitIdIdx: index('idx_dispute_arbitrations_purchase_unit_id').on(table.purchase_unit_id),
    disputeStateIdx: index('idx_dispute_arbitrations_dispute_state').on(table.dispute_state),
    selectedTierActionIdx: index('idx_dispute_arbitrations_selected_tier_action').on(table.selected_tier_action),
    disputeAmountCentsCheck: check(
      'check_dispute_arbitrations_dispute_amount_cents_positive',
      sql`${table.dispute_amount_cents} > 0`
    ),
  })
);

export * from './schema/user-memories.js';

