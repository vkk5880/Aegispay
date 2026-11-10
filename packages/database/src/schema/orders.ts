import {
  sqliteTable,
  text,
  integer,
  index,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { sqliteSpendMandates } from './spend-mandates.js';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

export const ordersLogger = createLogger('Database:Observability:Orders');

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

export interface LineItemAssociation {
  line_item_id: string;
  order_id: string;
  channel3_product_id: string;
  unit_price_cents: number;
  quantity: number;
  status: 'PENDING' | 'RESERVED' | 'CAPTURED' | 'VOIDED';
}

/**
 * Validates and logs order constraint checks prior to query execution.
 */
export function validateOrderConstraints(
  order: NewSqliteOrder
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  ordersLogger.debug('Evaluating order constraint rules', {
    order_id: order.order_id,
    mandate_id: order.mandate_id,
    paypal_order_id: order.paypal_order_id,
  });

  if (typeof order.gross_authorized_cents !== 'number' || order.gross_authorized_cents <= 0) {
    ordersLogger.warn('Constraint violation: gross_authorized_cents must be a positive integer', {
      order_id: order.order_id,
      gross_authorized_cents: order.gross_authorized_cents,
    });
    errors.push('gross_authorized_cents must be > 0');
  } else {
    ordersLogger.debug('Constraint check passed: gross_authorized_cents is positive', {
      gross_authorized_cents: order.gross_authorized_cents,
    });
  }

  if (
    order.commission_rebate_cents !== undefined &&
    order.commission_rebate_cents !== null &&
    (typeof order.commission_rebate_cents !== 'number' || order.commission_rebate_cents < 0)
  ) {
    ordersLogger.warn('Constraint violation: commission_rebate_cents cannot be negative', {
      order_id: order.order_id,
      commission_rebate_cents: order.commission_rebate_cents,
    });
    errors.push('commission_rebate_cents must be >= 0');
  } else {
    ordersLogger.debug('Constraint check passed: commission_rebate_cents is non-negative');
  }

  if (
    order.shipping_saved_cents !== undefined &&
    order.shipping_saved_cents !== null &&
    (typeof order.shipping_saved_cents !== 'number' || order.shipping_saved_cents < 0)
  ) {
    ordersLogger.warn('Constraint violation: shipping_saved_cents cannot be negative', {
      order_id: order.order_id,
      shipping_saved_cents: order.shipping_saved_cents,
    });
    errors.push('shipping_saved_cents must be >= 0');
  } else {
    ordersLogger.debug('Constraint check passed: shipping_saved_cents is non-negative');
  }

  const isValid = errors.length === 0;
  if (isValid) {
    ordersLogger.info('Order record passed all constraint checks', {
      order_id: order.order_id,
    });
  } else {
    ordersLogger.error('Order record failed constraint validation', {
      order_id: order.order_id,
      errors,
    });
  }

  return { valid: isValid, errors };
}

/**
 * Deep logging for order status transitions.
 */
export function logOrderStatusTransition(
  orderId: string,
  fromStatus: string,
  toStatus: string,
  reason?: string
): void {
  ordersLogger.info('Order status transition triggered', {
    order_id: orderId,
    from_status: fromStatus,
    to_status: toStatus,
    reason: reason ?? 'Standard workflow progression',
  });
}

/**
 * Deep logging for line item associations in order workflows.
 */
export function logLineItemAssociation(
  association: LineItemAssociation
): void {
  ordersLogger.info('Line item associated with order', {
    order_id: association.order_id,
    line_item_id: association.line_item_id,
    product_id: association.channel3_product_id,
    quantity: association.quantity,
    unit_price_cents: association.unit_price_cents,
    status: association.status,
  });
}

/**
 * Deep logging for transaction rollbacks.
 */
export function logOrderTransactionRollback(
  orderId: string,
  stage: string,
  reason: string,
  error?: unknown
): void {
  ordersLogger.warn('Order transaction rollback initiated', {
    order_id: orderId,
    stage,
    reason,
    error: error ? sanitizeForLogging(error) : undefined,
  });
}

/**
 * Deep logging wrapper for orders query operations.
 */
export function logOrderQueryExecution<T>(
  operation: 'INSERT' | 'SELECT' | 'UPDATE' | 'DELETE' | 'LIST',
  params: Record<string, unknown>,
  queryFn: () => T
): T {
  const timer = ordersLogger.time(`Order:${operation}`);
  const sanitizedParams = sanitizeForLogging(params);
  ordersLogger.debug(`Executing ${operation} query on orders`, { params: sanitizedParams });

  try {
    const result = queryFn();
    timer(`Successfully completed ${operation} on orders`, {
      params: sanitizedParams,
      resultCount: Array.isArray(result) ? result.length : result ? 1 : 0,
    });
    return result;
  } catch (error: any) {
    ordersLogger.error(`Failed executing ${operation} on orders`, {
      params: sanitizedParams,
      errorName: error?.name,
      errorMessage: error?.message,
      errorCode: error?.code,
      stack: error?.stack,
    });
    throw error;
  }
}
