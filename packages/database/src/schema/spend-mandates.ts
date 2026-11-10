import {
  sqliteTable,
  text,
  integer,
  index,
  check,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

export const mandateLogger = createLogger('Database:Observability:SpendMandates');

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

/**
 * Validates and logs spend mandate constraint checks before query execution.
 */
export function validateSpendMandateConstraints(
  mandate: NewSqliteSpendMandate
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  mandateLogger.debug('Evaluating spend mandate constraint rules', {
    mandate_id: mandate.mandate_id,
    buyer_id: mandate.buyer_id,
  });

  if (typeof mandate.max_total_spend_cents !== 'number' || mandate.max_total_spend_cents <= 0) {
    mandateLogger.warn('Constraint violation: max_total_spend_cents must be a positive integer', {
      mandate_id: mandate.mandate_id,
      max_total_spend_cents: mandate.max_total_spend_cents,
    });
    errors.push('max_total_spend_cents must be > 0');
  } else {
    mandateLogger.debug('Constraint check passed: max_total_spend_cents is positive', {
      max_total_spend_cents: mandate.max_total_spend_cents,
    });
  }

  if (typeof mandate.max_single_merchant_cents !== 'number' || mandate.max_single_merchant_cents <= 0) {
    mandateLogger.warn('Constraint violation: max_single_merchant_cents must be a positive integer', {
      mandate_id: mandate.mandate_id,
      max_single_merchant_cents: mandate.max_single_merchant_cents,
    });
    errors.push('max_single_merchant_cents must be > 0');
  } else {
    mandateLogger.debug('Constraint check passed: max_single_merchant_cents is positive', {
      max_single_merchant_cents: mandate.max_single_merchant_cents,
    });
  }

  if (
    mandate.cumulative_spent_cents !== undefined &&
    mandate.cumulative_spent_cents !== null &&
    (typeof mandate.cumulative_spent_cents !== 'number' || mandate.cumulative_spent_cents < 0)
  ) {
    mandateLogger.warn('Constraint violation: cumulative_spent_cents cannot be negative', {
      mandate_id: mandate.mandate_id,
      cumulative_spent_cents: mandate.cumulative_spent_cents,
    });
    errors.push('cumulative_spent_cents must be >= 0');
  } else {
    mandateLogger.debug('Constraint check passed: cumulative_spent_cents is non-negative');
  }

  const isValid = errors.length === 0;
  if (isValid) {
    mandateLogger.info('Spend mandate passed all constraint checks', {
      mandate_id: mandate.mandate_id,
    });
  } else {
    mandateLogger.error('Spend mandate failed constraint validation', {
      mandate_id: mandate.mandate_id,
      errors,
    });
  }

  return { valid: isValid, errors };
}

/**
 * Deep logging wrapper for spend mandate query operations.
 */
export function logMandateQueryExecution<T>(
  operation: 'INSERT' | 'SELECT' | 'UPDATE' | 'DELETE' | 'LIST',
  params: Record<string, unknown>,
  queryFn: () => T
): T {
  const timer = mandateLogger.time(`SpendMandate:${operation}`);
  const sanitizedParams = sanitizeForLogging(params);
  mandateLogger.debug(`Executing ${operation} query on spend_mandates`, { params: sanitizedParams });

  try {
    const result = queryFn();
    timer(`Successfully completed ${operation} on spend_mandates`, {
      params: sanitizedParams,
      resultCount: Array.isArray(result) ? result.length : result ? 1 : 0,
    });
    return result;
  } catch (error: any) {
    mandateLogger.error(`Failed executing ${operation} on spend_mandates`, {
      params: sanitizedParams,
      errorName: error?.name,
      errorMessage: error?.message,
      errorCode: error?.code,
      stack: error?.stack,
    });
    throw error;
  }
}
