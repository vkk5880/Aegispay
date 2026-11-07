import {
  sqliteTable,
  text,
  integer,
  index,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const sqliteSpendMandates = sqliteTable(
  'spend_mandates',
  {
    mandate_id: text('mandate_id').primaryKey(),
    buyer_id: text('buyer_id').notNull(),
    max_total_spend_cents: integer('max_total_spend_cents').notNull(),
    max_single_merchant_cents: integer('max_single_merchant_cents').notNull(),
    cumulative_spent_cents: integer('cumulative_spent_cents').notNull().default(0),
    currency_code: text('currency_code').notNull().default('USD'),
    allowed_category_ids: text('allowed_category_ids').notNull(), // JSON serialized array
    public_key_hex: text('public_key_hex').notNull(),
    ed25519_signature_hex: text('ed25519_signature_hex').notNull(),
    expires_at: text('expires_at').notNull(), // ISO-8601 string
    status: text('status').notNull().default('ACTIVE'),
    created_at: text('created_at').notNull(), // ISO-8601 string
  },
  (table) => ({
    buyerIdIdx: index('idx_sqlite_spend_mandates_buyer_id').on(table.buyer_id),
    statusIdx: index('idx_sqlite_spend_mandates_status').on(table.status),
    createdAtIdx: index('idx_sqlite_spend_mandates_created_at').on(table.created_at),
    maxTotalSpendCentsCheck: check(
      'check_sqlite_spend_mandates_max_total_spend_cents_positive',
      sql`${table.max_total_spend_cents} > 0`
    ),
    maxSingleMerchantCentsCheck: check(
      'check_sqlite_spend_mandates_max_single_merchant_cents_positive',
      sql`${table.max_single_merchant_cents} > 0`
    ),
    cumulativeSpentCentsCheck: check(
      'check_sqlite_spend_mandates_cumulative_spent_cents_positive',
      sql`${table.cumulative_spent_cents} >= 0`
    ),
  })
);

export type SqliteSpendMandate = typeof sqliteSpendMandates.$inferSelect;
export type NewSqliteSpendMandate = typeof sqliteSpendMandates.$inferInsert;
