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

export const intentVouchers = pgTable(
  'intent_vouchers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    voucher_id: varchar('voucher_id', { length: 32 }).notNull().unique(),
    mandate_id: varchar('mandate_id', { length: 32 }).notNull(),
    buyer_id: varchar('buyer_id', { length: 64 }),
    paypal_vault_setup_token_id: varchar('paypal_vault_setup_token_id', { length: 64 }).notNull(),
    paypal_payment_token_id: varchar('paypal_payment_token_id', { length: 64 }),
    channel3_product_id: varchar('channel3_product_id', { length: 64 }).notNull(),
    merchant_domain: varchar('merchant_domain', { length: 128 }).notNull(),
    retail_offer_cents: integer('retail_offer_cents').notNull(),
    buyer_bid_cents: integer('buyer_bid_cents').notNull(),
    commission_rebate_rate: numeric('commission_rebate_rate', { precision: 5, scale: 4 }).notNull().default('0.0000'),
    merchant_min_floor_cents: integer('merchant_min_floor_cents').notNull(),
    counter_bid_cents: integer('counter_bid_cents'),
    negotiation_status: varchar('negotiation_status', { length: 32 }).notNull().default('OPEN_BID'), // OPEN_BID, COUNTERED, ACCEPTED_AND_CAPTURED, REJECTED, EXPIRED
    negotiation_rounds: integer('negotiation_rounds').notNull().default(1),
    currency_code: varchar('currency_code', { length: 3 }).notNull().default('USD'),
    resulting_paypal_order_id: varchar('resulting_paypal_order_id', { length: 64 }),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    voucherIdIdx: index('idx_intent_vouchers_voucher_id').on(table.voucher_id),
    mandateIdIdx: index('idx_intent_vouchers_mandate_id').on(table.mandate_id),
    merchantDomainIdx: index('idx_intent_vouchers_merchant_domain').on(table.merchant_domain),
    negotiationStatusIdx: index('idx_intent_vouchers_negotiation_status').on(table.negotiation_status),
    expiresAtIdx: index('idx_intent_vouchers_expires_at').on(table.expires_at),
    retailOfferCentsCheck: check(
      'check_intent_vouchers_retail_offer_cents_nonnegative',
      sql`${table.retail_offer_cents} >= 0`
    ),
    buyerBidCentsCheck: check(
      'check_intent_vouchers_buyer_bid_cents_nonnegative',
      sql`${table.buyer_bid_cents} >= 0`
    ),
    merchantMinFloorCentsCheck: check(
      'check_intent_vouchers_merchant_min_floor_cents_nonnegative',
      sql`${table.merchant_min_floor_cents} >= 0`
    ),
    counterBidCentsCheck: check(
      'check_intent_vouchers_counter_bid_cents_nonnegative',
      sql`${table.counter_bid_cents} IS NULL OR ${table.counter_bid_cents} >= 0`
    ),
    negotiationRoundsCheck: check(
      'check_intent_vouchers_negotiation_rounds_positive',
      sql`${table.negotiation_rounds} > 0`
    ),
    slaExpiryCheck: check(
      'check_intent_vouchers_expires_at_valid',
      sql`${table.expires_at} >= ${table.created_at}`
    ),
  })
);

export const intentVoucherNegotiations = pgTable(
  'intent_voucher_negotiations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    voucher_id: varchar('voucher_id', { length: 32 })
      .notNull()
      .references(() => intentVouchers.voucher_id, { onDelete: 'cascade' }),
    round_number: integer('round_number').notNull(),
    proposer: varchar('proposer', { length: 32 }).notNull(), // BUYER, MERCHANT, AGENT
    offered_cents: integer('offered_cents').notNull(),
    rationale: text('rationale'),
    accepted: boolean('accepted').default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    voucherIdIdx: index('idx_intent_voucher_negotiations_voucher_id').on(table.voucher_id),
    roundNumberCheck: check(
      'check_intent_voucher_negotiations_round_number_positive',
      sql`${table.round_number} > 0`
    ),
    offeredCentsCheck: check(
      'check_intent_voucher_negotiations_offered_cents_nonnegative',
      sql`${table.offered_cents} >= 0`
    ),
  })
);
