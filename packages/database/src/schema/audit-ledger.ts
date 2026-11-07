import {
  sqliteTable,
  text,
  integer,
  index,
} from 'drizzle-orm/sqlite-core';
import { sqliteSpendMandates } from './spend-mandates.js';
import { sqliteOrders } from './orders.js';

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
