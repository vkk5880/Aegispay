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

export const knapsackCarts = pgTable(
  'knapsack_carts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cart_id: varchar('cart_id', { length: 64 }).notNull().unique(),
    buyer_id: varchar('buyer_id', { length: 64 }).notNull(),
    currency_code: varchar('currency_code', { length: 3 }).notNull().default('USD'),
    gross_subtotal_cents: integer('gross_subtotal_cents').notNull().default(0),
    total_commission_rebate_cents: integer('total_commission_rebate_cents').notNull().default(0),
    total_shipping_cents: integer('total_shipping_cents').notNull().default(0),
    total_shipping_saved_cents: integer('total_shipping_saved_cents').notNull().default(0),
    total_tax_cents: integer('total_tax_cents').notNull().default(0),
    net_buyer_expenditure_cents: integer('net_buyer_expenditure_cents').notNull().default(0),
    status: varchar('status', { length: 32 }).notNull().default('OPEN'),
    delivery_window: varchar('delivery_window', { length: 64 }).default('2-3 Business Days'),
    zip_code: varchar('zip_code', { length: 10 }),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cartIdIdx: index('idx_knapsack_carts_cart_id').on(table.cart_id),
    buyerIdIdx: index('idx_knapsack_carts_buyer_id').on(table.buyer_id),
    statusIdx: index('idx_knapsack_carts_status').on(table.status),
    expiresAtIdx: index('idx_knapsack_carts_expires_at').on(table.expires_at),
    grossSubtotalCentsCheck: check(
      'check_knapsack_carts_gross_subtotal_cents_nonnegative',
      sql`${table.gross_subtotal_cents} >= 0`
    ),
    totalCommissionRebateCentsCheck: check(
      'check_knapsack_carts_total_commission_rebate_cents_nonnegative',
      sql`${table.total_commission_rebate_cents} >= 0`
    ),
    totalShippingCentsCheck: check(
      'check_knapsack_carts_total_shipping_cents_nonnegative',
      sql`${table.total_shipping_cents} >= 0`
    ),
    totalShippingSavedCentsCheck: check(
      'check_knapsack_carts_total_shipping_saved_cents_nonnegative',
      sql`${table.total_shipping_saved_cents} >= 0`
    ),
    totalTaxCentsCheck: check(
      'check_knapsack_carts_total_tax_cents_nonnegative',
      sql`${table.total_tax_cents} >= 0`
    ),
    netBuyerExpenditureCentsCheck: check(
      'check_knapsack_carts_net_buyer_expenditure_cents_nonnegative',
      sql`${table.net_buyer_expenditure_cents} >= 0`
    ),
    slaExpiryCheck: check(
      'check_knapsack_carts_expires_at_valid',
      sql`${table.expires_at} >= ${table.created_at}`
    ),
  })
);

export const knapsackCartItems = pgTable(
  'knapsack_cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cart_id: varchar('cart_id', { length: 64 })
      .notNull()
      .references(() => knapsackCarts.cart_id, { onDelete: 'cascade' }),
    product_id: varchar('product_id', { length: 64 }).notNull(),
    merchant_domain: varchar('merchant_domain', { length: 128 }).notNull(),
    title: text('title').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unit_price_cents: integer('unit_price_cents').notNull(),
    unit_compare_price_cents: integer('unit_compare_price_cents').notNull().default(0),
    commission_rate: numeric('commission_rate', { precision: 5, scale: 4 }).notNull().default('0'),
    rebate_cents: integer('rebate_cents').notNull().default(0),
    shipping_fee_cents: integer('shipping_fee_cents').notNull().default(0),
    shipping_waived: boolean('shipping_waived').notNull().default(false),
    tax_cents: integer('tax_cents').notNull().default(0),
    cleaned_image_url: text('cleaned_image_url'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cartIdIdx: index('idx_knapsack_cart_items_cart_id').on(table.cart_id),
    merchantDomainIdx: index('idx_knapsack_cart_items_merchant_domain').on(table.merchant_domain),
    productIdIdx: index('idx_knapsack_cart_items_product_id').on(table.product_id),
    quantityCheck: check(
      'check_knapsack_cart_items_quantity_positive',
      sql`${table.quantity} > 0`
    ),
    unitPriceCentsCheck: check(
      'check_knapsack_cart_items_unit_price_cents_nonnegative',
      sql`${table.unit_price_cents} >= 0`
    ),
    unitComparePriceCentsCheck: check(
      'check_knapsack_cart_items_unit_compare_price_cents_nonnegative',
      sql`${table.unit_compare_price_cents} >= 0`
    ),
    rebateCentsCheck: check(
      'check_knapsack_cart_items_rebate_cents_nonnegative',
      sql`${table.rebate_cents} >= 0`
    ),
    shippingFeeCentsCheck: check(
      'check_knapsack_cart_items_shipping_fee_cents_nonnegative',
      sql`${table.shipping_fee_cents} >= 0`
    ),
    taxCentsCheck: check(
      'check_knapsack_cart_items_tax_cents_nonnegative',
      sql`${table.tax_cents} >= 0`
    ),
  })
);
