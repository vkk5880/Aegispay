import {
  sqliteTable,
  text,
  integer,
  index,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { sqliteSpendMandates } from './spend-mandates.js';

export const sqliteOrders = sqliteTable(
  'orders',
  {
    order_id: text('order_id').primaryKey(),
    mandate_id: text('mandate_id')
      .notNull()
      .references(() => sqliteSpendMandates.mandate_id, { onDelete: 'restrict' }),
    paypal_order_id: text('paypal_order_id').notNull().unique(),
    paypal_request_id: text('paypal_request_id').notNull().unique(),
    gross_authorized_cents: integer('gross_authorized_cents').notNull(),
    commission_rebate_cents: integer('commission_rebate_cents').notNull().default(0),
    shipping_saved_cents: integer('shipping_saved_cents').notNull().default(0),
    currency_code: text('currency_code').notNull().default('USD'),
    order_status: text('order_status').notNull().default('PENDING'),
    server_readback_verified: integer('server_readback_verified', { mode: 'boolean' })
      .notNull()
      .default(false),
    created_at: text('created_at').notNull(), // ISO-8601 string
    updated_at: text('updated_at').notNull(), // ISO-8601 string
  },
  (table) => ({
    mandateIdIdx: index('idx_sqlite_orders_mandate_id').on(table.mandate_id),
    paypalOrderIdIdx: index('idx_sqlite_orders_paypal_order_id').on(table.paypal_order_id),
    createdAtIdx: index('idx_sqlite_orders_created_at').on(table.created_at),
    orderStatusIdx: index('idx_sqlite_orders_order_status').on(table.order_status),
    grossAuthorizedCentsCheck: check(
      'check_sqlite_orders_gross_authorized_cents_positive',
      sql`${table.gross_authorized_cents} > 0`
    ),
    commissionRebateCentsCheck: check(
      'check_sqlite_orders_commission_rebate_cents_positive',
      sql`${table.commission_rebate_cents} >= 0`
    ),
    shippingSavedCentsCheck: check(
      'check_sqlite_orders_shipping_saved_cents_positive',
      sql`${table.shipping_saved_cents} >= 0`
    ),
  })
);

export type SqliteOrder = typeof sqliteOrders.$inferSelect;
export type NewSqliteOrder = typeof sqliteOrders.$inferInsert;
