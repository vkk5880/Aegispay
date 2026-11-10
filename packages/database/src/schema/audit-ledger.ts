import {
  sqliteTable,
  text,
  integer,
  index,
} from 'drizzle-orm/sqlite-core';
import { sqliteSpendMandates } from './spend-mandates.js';
import { sqliteOrders } from './orders.js';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

export const auditLogger = createLogger('Database:Observability:AuditLedger');

export const sqliteAuditLedger = sqliteTable(
  'audit_ledger',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    event_id: text('event_id').notNull().unique(),
    request_id: text('request_id').notNull(),
    event_type: text('event_type').notNull(),
    mandate_id: text('mandate_id').references(() => sqliteSpendMandates.mandate_id, {
      onDelete: 'restrict',
    }),
    order_id: text('order_id').references(() => sqliteOrders.order_id, {
      onDelete: 'restrict',
    }),
    payload: text('payload').notNull(), // Canonical JSON string (RFC 8785)
    prev_hash: text('prev_hash').notNull(),
    hash: text('hash').notNull().unique(),
    created_at: text('created_at').notNull(), // ISO-8601 string
  },
  (table) => ({
    mandateIdIdx: index('idx_sqlite_audit_ledger_mandate_id').on(table.mandate_id),
    orderIdIdx: index('idx_sqlite_audit_ledger_order_id').on(table.order_id),
    requestIdIdx: index('idx_sqlite_audit_ledger_request_id').on(table.request_id),
    eventTypeIdx: index('idx_sqlite_audit_ledger_event_type').on(table.event_type),
    createdAtIdx: index('idx_sqlite_audit_ledger_created_at').on(table.created_at),
    hashIdx: index('idx_sqlite_audit_ledger_hash').on(table.hash),
  })
);

export type SqliteAuditLedgerEntry = typeof sqliteAuditLedger.$inferSelect;
export type NewSqliteAuditLedgerEntry = typeof sqliteAuditLedger.$inferInsert;

/**
 * Deep logging for audit ledger hash-chain insertion statements.
 */
export function logAuditLedgerInsert(
  entry: NewSqliteAuditLedgerEntry
): void {
  auditLogger.info('Inserting cryptographic hash-chain entry into audit_ledger', {
    event_id: entry.event_id,
    request_id: entry.request_id,
    event_type: entry.event_type,
    mandate_id: entry.mandate_id ?? null,
    order_id: entry.order_id ?? null,
    prev_hash: entry.prev_hash,
    hash: entry.hash,
    payload_preview: typeof entry.payload === 'string' && entry.payload.length > 100
      ? `${entry.payload.slice(0, 100)}... [${entry.payload.length} chars]`
      : entry.payload,
    created_at: entry.created_at,
  });
}

/**
 * Deep logging for previous hash lookups in cryptographic hash chain.
 */
export function logPreviousHashLookup(
  context: { requestId?: string; mandateId?: string; orderId?: string; previousHash?: string }
): void {
  auditLogger.debug('Cryptographic hash-chain: looked up previous hash', {
    context: sanitizeForLogging(context),
    previous_hash: context.previousHash ?? 'GENESIS',
  });
}

/**
 * Deep logging for signature verification queries.
 */
export function logSignatureVerificationQuery(
  context: { mandateId: string; publicKeyHex: string; signatureHex: string; verified: boolean }
): void {
  const sanitized = sanitizeForLogging(context);
  if (context.verified) {
    auditLogger.info('Cryptographic signature verification query succeeded', sanitized);
  } else {
    auditLogger.error('Cryptographic signature verification query rejected', sanitized);
  }
}

/**
 * Deep logging for tamper-detection scan iterations and integrity verifications.
 */
export function logTamperDetectionScan(
  iteration: number,
  total: number,
  currentEventId: string,
  expectedPrevHash: string,
  actualPrevHash: string,
  matched: boolean
): void {
  if (matched) {
    auditLogger.debug(`Tamper-detection scan iteration [${iteration + 1}/${total}]: hash integrity intact`, {
      event_id: currentEventId,
      expectedPrevHash,
      actualPrevHash,
    });
  } else {
    auditLogger.error(`Tamper-detection scan iteration [${iteration + 1}/${total}]: HASH MISMATCH / TAMPERING DETECTED!`, {
      broken_event_id: currentEventId,
      expected_prev_hash: expectedPrevHash,
      actual_prev_hash: actualPrevHash,
    });
  }
}

/**
 * Deep logging wrapper for audit_ledger query operations.
 */
export function logAuditQueryExecution<T>(
  operation: 'INSERT' | 'SELECT' | 'VERIFY_INTEGRITY' | 'LIST',
  params: Record<string, unknown>,
  queryFn: () => T
): T {
  const timer = auditLogger.time(`AuditLedger:${operation}`);
  const sanitizedParams = sanitizeForLogging(params);
  auditLogger.debug(`Executing ${operation} query on audit_ledger`, { params: sanitizedParams });

  try {
    const result = queryFn();
    timer(`Successfully completed ${operation} on audit_ledger`, {
      params: sanitizedParams,
      resultCount: Array.isArray(result) ? result.length : result ? 1 : 0,
    });
    return result;
  } catch (error: any) {
    auditLogger.error(`Failed executing ${operation} on audit_ledger`, {
      params: sanitizedParams,
      errorName: error?.name,
      errorMessage: error?.message,
      errorCode: error?.code,
      stack: error?.stack,
    });
    throw error;
  }
}
