import {
  pgTable,
  varchar,
  integer,
  timestamp,
  text,
  boolean,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const buyerWatchlist = pgTable(
  'buyer_watchlist',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    user_id: varchar('user_id', { length: 64 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    current_price_cents: integer('current_price_cents').notNull(),
    target_price_cents: integer('target_price_cents').notNull(),
    source: varchar('source', { length: 128 }).notNull().default('web'),
    link: text('link').notNull().default(''),
    query: text('query').notNull().default(''),
    triggered: boolean('triggered').notNull().default(false),
    last_checked: timestamp('last_checked', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_buyer_watchlist_user_id').on(table.user_id),
    triggeredIdx: index('idx_buyer_watchlist_triggered').on(table.triggered),
    currentPriceCentsCheck: check(
      'check_buyer_watchlist_current_price_cents_positive',
      sql`${table.current_price_cents} >= 0`
    ),
    targetPriceCentsCheck: check(
      'check_buyer_watchlist_target_price_cents_positive',
      sql`${table.target_price_cents} > 0`
    ),
  })
);

export const buyerWatchlistTable = buyerWatchlist;

export type BuyerWatchlistItem = typeof buyerWatchlist.$inferSelect;
export type NewBuyerWatchlistItem = typeof buyerWatchlist.$inferInsert;
