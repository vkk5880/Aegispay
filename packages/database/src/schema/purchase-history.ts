import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  numeric,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const purchaseHistoryTable = pgTable(
  'purchase_history',
  {
    order_id: varchar('order_id', { length: 64 }).primaryKey(),
    user_id: varchar('user_id', { length: 64 }).notNull(),
    title: text('title').notNull(),
    price_cents: integer('price_cents').notNull(),
    merchant_domain: varchar('merchant_domain', { length: 128 }).notNull(),
    cleaned_url: text('cleaned_url'),
    score: numeric('score', { precision: 4, scale: 2 }),
    tx_id: varchar('tx_id', { length: 64 }),
    reservation_id: varchar('reservation_id', { length: 64 }),
    escrow_status: varchar('escrow_status', { length: 32 }).notNull().default('HELD'),
    receipt_number: integer('receipt_number'),
    hash: text('hash'),
    carrier: varchar('carrier', { length: 64 }).default('FedEx Priority'),
    tracking_number: varchar('tracking_number', { length: 64 }),
    fulfillment_status: varchar('fulfillment_status', { length: 32 }).default('processing'),
    paypal_order_data: jsonb('paypal_order_data'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_purchase_history_user_id').on(table.user_id),
    createdAtIdx: index('idx_purchase_history_created_at').on(table.created_at),
    escrowStatusIdx: index('idx_purchase_history_escrow_status').on(table.escrow_status),
    txIdIdx: index('idx_purchase_history_tx_id').on(table.tx_id),
  })
);

export const purchaseHistory = purchaseHistoryTable;
export type PurchaseHistoryRow = typeof purchaseHistoryTable.$inferSelect;
export type NewPurchaseHistoryRow = typeof purchaseHistoryTable.$inferInsert;
