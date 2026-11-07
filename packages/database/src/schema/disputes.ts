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

export const disputeRecords = pgTable(
  'dispute_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paypal_dispute_id: varchar('paypal_dispute_id', { length: 64 }).notNull().unique(),
    paypal_order_id: varchar('paypal_order_id', { length: 64 }),
    purchase_unit_id: uuid('purchase_unit_id'),
    merchant_domain: varchar('merchant_domain', { length: 128 }).notNull(),
    buyer_id: varchar('buyer_id', { length: 64 }),
    dispute_reason: varchar('dispute_reason', { length: 64 }).notNull(),
    dispute_stage: varchar('dispute_stage', { length: 48 }).notNull().default('INQUIRY'), // INQUIRY, CHARGEBACK, PRE_ARBITRATION, ARBITRATION
    dispute_state: varchar('dispute_state', { length: 64 }).notNull().default('REQUIRED_ACTION'), // REQUIRED_ACTION, UNDER_REVIEW, RESOLVED
    dispute_amount_cents: integer('dispute_amount_cents').notNull(),
    settlement_amount_cents: integer('settlement_amount_cents').default(0),
    fee_cents: integer('fee_cents').default(0),
    currency_code: varchar('currency_code', { length: 3 }).notNull().default('USD'),
    liability_score_l: numeric('liability_score_l', { precision: 4, scale: 3 }).notNull().default('0.000'),
    abuse_risk_score_r: numeric('abuse_risk_score_r', { precision: 4, scale: 3 }).notNull().default('0.000'),
    exif_tamper_flag: boolean('exif_tamper_flag').notNull().default(false),
    defect_bounding_box: jsonb('defect_bounding_box'),
    hateoas_allowed_actions: text('hateoas_allowed_actions').array().notNull().default(sql`ARRAY[]::text[]`),
    selected_tier_action: varchar('selected_tier_action', { length: 48 }).notNull().default('TIER5_SLA_ESCALATE'),
    sla_expiry_at: timestamp('sla_expiry_at', { withTimezone: true }).notNull(),
    seller_response_due_date: timestamp('seller_response_due_date', { withTimezone: true }).notNull(),
    assigned_analyst_id: varchar('assigned_analyst_id', { length: 64 }),
    scheduled_review_start: timestamp('scheduled_review_start', { withTimezone: true }),
    scheduled_review_end: timestamp('scheduled_review_end', { withTimezone: true }),
    resolution_outcome: varchar('resolution_outcome', { length: 64 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    paypalDisputeIdIdx: index('idx_dispute_records_paypal_dispute_id').on(table.paypal_dispute_id),
    merchantDomainIdx: index('idx_dispute_records_merchant_domain').on(table.merchant_domain),
    disputeStageIdx: index('idx_dispute_records_dispute_stage').on(table.dispute_stage),
    disputeStateIdx: index('idx_dispute_records_dispute_state').on(table.dispute_state),
    selectedTierActionIdx: index('idx_dispute_records_selected_tier_action').on(table.selected_tier_action),
    slaExpiryAtIdx: index('idx_dispute_records_sla_expiry_at').on(table.sla_expiry_at),
    sellerResponseDueDateIdx: index('idx_dispute_records_seller_response_due_date').on(table.seller_response_due_date),
    disputeAmountCentsCheck: check(
      'check_dispute_records_dispute_amount_cents_nonnegative',
      sql`${table.dispute_amount_cents} >= 0`
    ),
    settlementAmountCentsCheck: check(
      'check_dispute_records_settlement_amount_cents_nonnegative',
      sql`${table.settlement_amount_cents} >= 0`
    ),
    feeCentsCheck: check(
      'check_dispute_records_fee_cents_nonnegative',
      sql`${table.fee_cents} >= 0`
    ),
    slaExpiryCheck: check(
      'check_dispute_records_sla_expiry_at_valid',
      sql`${table.sla_expiry_at} >= ${table.created_at}`
    ),
    sellerResponseDueDateCheck: check(
      'check_dispute_records_seller_response_due_date_valid',
      sql`${table.seller_response_due_date} >= ${table.created_at}`
    ),
  })
);

export const disputeEvidenceRecords = pgTable(
  'dispute_evidence_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paypal_dispute_id: varchar('paypal_dispute_id', { length: 64 })
      .notNull()
      .references(() => disputeRecords.paypal_dispute_id, { onDelete: 'cascade' }),
    evidence_type: varchar('evidence_type', { length: 64 }).notNull(), // PROOF_OF_FULFILLMENT, PROOF_OF_DELIVERY, RETURN_TRACKING, FORENSIC_DOSSIER
    source: varchar('source', { length: 32 }).notNull().default('SYSTEM'), // BUYER, MERCHANT, SYSTEM, CARRIER
    evidence_url: text('evidence_url'),
    document_hash_sha256: varchar('document_hash_sha256', { length: 64 }),
    notes: text('notes'),
    compiled_pdf_base64: text('compiled_pdf_base64'),
    carrier_tracking_number: varchar('carrier_tracking_number', { length: 64 }),
    carrier_name: varchar('carrier_name', { length: 64 }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    disputeIdIdx: index('idx_dispute_evidence_records_dispute_id').on(table.paypal_dispute_id),
    evidenceTypeIdx: index('idx_dispute_evidence_records_evidence_type').on(table.evidence_type),
  })
);
