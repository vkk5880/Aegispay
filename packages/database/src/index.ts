import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { createLogger } from '@aegispay/shared-types';

export const dbLogger = createLogger('Database:Postgres');

// PostgreSQL client creation (backward compatible with Render basic-1gb connection bounding)
export function createDb(
  connectionString: string,
  options?: {
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    statementTimeoutMillis?: number;
  }
) {
  const max = options?.max ?? 20;
  const connectionTimeoutMillis = options?.connectionTimeoutMillis ?? 5000;
  dbLogger.debug(`Creating PostgreSQL pool (max: ${max}, connectionTimeout: ${connectionTimeoutMillis}ms)`);

  const pool = new Pool({
    connectionString,
    max,
    idleTimeoutMillis: options?.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis,
    statement_timeout: options?.statementTimeoutMillis ?? 10000,
  });

  pool.on('error', (err) => {
    dbLogger.error('Unexpected error on idle PostgreSQL pool client:', err);
  });

  return drizzle(pool, { schema });
}

// Re-export PostgreSQL schemas
export * from './schema.js';
export { eq, sql, desc, asc, inArray, or, and } from 'drizzle-orm';


// Export SQLite schemas
export * from './schema/spend-mandates.js';
export * from './schema/orders.js';
export * from './schema/audit-ledger.js';

import {
  sqliteSpendMandates,
  type SqliteSpendMandate,
  type NewSqliteSpendMandate,
} from './schema/spend-mandates.js';
import {
  sqliteOrders,
  type SqliteOrder,
  type NewSqliteOrder,
} from './schema/orders.js';
import {
  sqliteAuditLedger,
  type SqliteAuditLedgerEntry,
  type NewSqliteAuditLedgerEntry,
} from './schema/audit-ledger.js';

export interface DatabaseSyncStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

export interface DatabaseSyncInstance {
  exec(sql: string): void;
  prepare(sql: string): DatabaseSyncStatement;
  close(): void;
}

export interface SqliteDbOptions {
  busyTimeout?: number;
  walMode?: boolean;
  foreignKeys?: boolean;
}

export interface SqliteAuditDb {
  readonly raw: DatabaseSyncInstance;
  close(): void;
  // Prepared query helpers preventing SQL injection
  insertSpendMandate(mandate: NewSqliteSpendMandate): SqliteSpendMandate;
  getSpendMandate(mandateId: string): SqliteSpendMandate | null;
  listSpendMandates(buyerId?: string): SqliteSpendMandate[];

  insertOrder(order: NewSqliteOrder): SqliteOrder;
  getOrder(orderId: string): SqliteOrder | null;
  getOrderByPaypalOrderId(paypalOrderId: string): SqliteOrder | null;
  listOrders(mandateId?: string): SqliteOrder[];

  insertAuditLedger(entry: NewSqliteAuditLedgerEntry): SqliteAuditLedgerEntry;
  getAuditLedgerEntry(eventId: string): SqliteAuditLedgerEntry | null;
  listAuditLedgerByRequestId(requestId: string): SqliteAuditLedgerEntry[];
  listAuditLedgerByMandateId(mandateId: string): SqliteAuditLedgerEntry[];
  listAuditLedgerByOrderId(orderId: string): SqliteAuditLedgerEntry[];
  verifyAuditLedgerIntegrity(): { valid: boolean; totalEntries: number; brokenEventId?: string };
}

/**
 * Initializes SQLite database connection configured with WAL journal mode,
 * foreign key enforcement (PRAGMA foreign_keys = ON), and connection busy timeouts.
 */
export function createSqliteDb(
  location: string = ':memory:',
  options: SqliteDbOptions = {}
): SqliteAuditDb {
  // Dynamically load node:sqlite to support Node 22 native SQLite without forcing root types
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeSqlite = (function loadSqlite() {
    try {
      // eslint-disable-next-line no-eval
      return eval("require('node:sqlite')");
    } catch {
      throw new Error('Native node:sqlite module is unavailable in current runtime.');
    }
  })();

  const db: DatabaseSyncInstance = new nodeSqlite.DatabaseSync(location);

  const busyTimeout = options.busyTimeout ?? 5000;
  const foreignKeys = options.foreignKeys ?? true;
  const walMode = options.walMode ?? true;

  // PRAGMA Configurations
  if (foreignKeys) {
    db.exec('PRAGMA foreign_keys = ON;');
  }
  db.exec(`PRAGMA busy_timeout = ${Number(busyTimeout)};`);

  if (walMode && location !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA synchronous = NORMAL;');

  // Initialize Core Schema DDL with strict constraints and foreign keys (ON DELETE RESTRICT)
  db.exec(`
    CREATE TABLE IF NOT EXISTS spend_mandates (
      mandate_id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL,
      max_total_spend_cents INTEGER NOT NULL CHECK (max_total_spend_cents > 0),
      max_single_merchant_cents INTEGER NOT NULL CHECK (max_single_merchant_cents > 0),
      cumulative_spent_cents INTEGER NOT NULL DEFAULT 0 CHECK (cumulative_spent_cents >= 0),
      currency_code TEXT NOT NULL DEFAULT 'USD',
      allowed_category_ids TEXT NOT NULL,
      public_key_hex TEXT NOT NULL,
      ed25519_signature_hex TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sqlite_spend_mandates_buyer_id ON spend_mandates (buyer_id);
    CREATE INDEX IF NOT EXISTS idx_sqlite_spend_mandates_status ON spend_mandates (status);
    CREATE INDEX IF NOT EXISTS idx_sqlite_spend_mandates_created_at ON spend_mandates (created_at);

    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      mandate_id TEXT NOT NULL REFERENCES spend_mandates (mandate_id) ON DELETE RESTRICT,
      paypal_order_id TEXT NOT NULL UNIQUE,
      paypal_request_id TEXT NOT NULL UNIQUE,
      gross_authorized_cents INTEGER NOT NULL CHECK (gross_authorized_cents > 0),
      commission_rebate_cents INTEGER NOT NULL DEFAULT 0 CHECK (commission_rebate_cents >= 0),
      shipping_saved_cents INTEGER NOT NULL DEFAULT 0 CHECK (shipping_saved_cents >= 0),
      currency_code TEXT NOT NULL DEFAULT 'USD',
      order_status TEXT NOT NULL DEFAULT 'PENDING',
      server_readback_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sqlite_orders_mandate_id ON orders (mandate_id);
    CREATE INDEX IF NOT EXISTS idx_sqlite_orders_paypal_order_id ON orders (paypal_order_id);
    CREATE INDEX IF NOT EXISTS idx_sqlite_orders_created_at ON orders (created_at);
    CREATE INDEX IF NOT EXISTS idx_sqlite_orders_order_status ON orders (order_status);

    CREATE TABLE IF NOT EXISTS audit_ledger (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      request_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      mandate_id TEXT REFERENCES spend_mandates (mandate_id) ON DELETE RESTRICT,
      order_id TEXT REFERENCES orders (order_id) ON DELETE RESTRICT,
      payload TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sqlite_audit_ledger_mandate_id ON audit_ledger (mandate_id);
    CREATE INDEX IF NOT EXISTS idx_sqlite_audit_ledger_order_id ON audit_ledger (order_id);
    CREATE INDEX IF NOT EXISTS idx_sqlite_audit_ledger_request_id ON audit_ledger (request_id);
    CREATE INDEX IF NOT EXISTS idx_sqlite_audit_ledger_event_type ON audit_ledger (event_type);
    CREATE INDEX IF NOT EXISTS idx_sqlite_audit_ledger_created_at ON audit_ledger (created_at);
    CREATE INDEX IF NOT EXISTS idx_sqlite_audit_ledger_hash ON audit_ledger (hash);
  `);

  // Prepared statements for spend_mandates
  const stmtInsertMandate = db.prepare(`
    INSERT INTO spend_mandates (
      mandate_id, buyer_id, max_total_spend_cents, max_single_merchant_cents,
      cumulative_spent_cents, currency_code, allowed_category_ids,
      public_key_hex, ed25519_signature_hex, expires_at, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const stmtGetMandate = db.prepare('SELECT * FROM spend_mandates WHERE mandate_id = ?;');
  const stmtListMandatesAll = db.prepare('SELECT * FROM spend_mandates ORDER BY created_at DESC;');
  const stmtListMandatesByBuyer = db.prepare('SELECT * FROM spend_mandates WHERE buyer_id = ? ORDER BY created_at DESC;');

  // Prepared statements for orders
  const stmtInsertOrder = db.prepare(`
    INSERT INTO orders (
      order_id, mandate_id, paypal_order_id, paypal_request_id,
      gross_authorized_cents, commission_rebate_cents, shipping_saved_cents,
      currency_code, order_status, server_readback_verified, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const stmtGetOrder = db.prepare('SELECT * FROM orders WHERE order_id = ?;');
  const stmtGetOrderByPaypal = db.prepare('SELECT * FROM orders WHERE paypal_order_id = ?;');
  const stmtListOrdersAll = db.prepare('SELECT * FROM orders ORDER BY created_at DESC;');
  const stmtListOrdersByMandate = db.prepare('SELECT * FROM orders WHERE mandate_id = ? ORDER BY created_at DESC;');

  // Prepared statements for audit_ledger
  const stmtInsertAudit = db.prepare(`
    INSERT INTO audit_ledger (
      event_id, request_id, event_type, mandate_id, order_id,
      payload, prev_hash, hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);
  const stmtGetAudit = db.prepare('SELECT * FROM audit_ledger WHERE event_id = ?;');
  const stmtListAuditByRequest = db.prepare('SELECT * FROM audit_ledger WHERE request_id = ? ORDER BY seq ASC;');
  const stmtListAuditByMandate = db.prepare('SELECT * FROM audit_ledger WHERE mandate_id = ? ORDER BY seq ASC;');
  const stmtListAuditByOrder = db.prepare('SELECT * FROM audit_ledger WHERE order_id = ? ORDER BY seq ASC;');
  const stmtListAuditAllSeq = db.prepare('SELECT * FROM audit_ledger ORDER BY seq ASC;');

  return {
    raw: db,
    close() {
      db.close();
    },

    insertSpendMandate(mandate: NewSqliteSpendMandate): SqliteSpendMandate {
      stmtInsertMandate.run(
        mandate.mandate_id,
        mandate.buyer_id,
        mandate.max_total_spend_cents,
        mandate.max_single_merchant_cents,
        mandate.cumulative_spent_cents ?? 0,
        mandate.currency_code ?? 'USD',
        mandate.allowed_category_ids,
        mandate.public_key_hex,
        mandate.ed25519_signature_hex,
        mandate.expires_at,
        mandate.status ?? 'ACTIVE',
        mandate.created_at
      );
      const row = stmtGetMandate.get(mandate.mandate_id) as unknown as SqliteSpendMandate;
      return row;
    },

    getSpendMandate(mandateId: string): SqliteSpendMandate | null {
      const row = stmtGetMandate.get(mandateId) as unknown as SqliteSpendMandate | undefined;
      return row ?? null;
    },

    listSpendMandates(buyerId?: string): SqliteSpendMandate[] {
      if (buyerId) {
        return stmtListMandatesByBuyer.all(buyerId) as unknown as SqliteSpendMandate[];
      }
      return stmtListMandatesAll.all() as unknown as SqliteSpendMandate[];
    },

    insertOrder(order: NewSqliteOrder): SqliteOrder {
      stmtInsertOrder.run(
        order.order_id,
        order.mandate_id,
        order.paypal_order_id,
        order.paypal_request_id,
        order.gross_authorized_cents,
        order.commission_rebate_cents ?? 0,
        order.shipping_saved_cents ?? 0,
        order.currency_code ?? 'USD',
        order.order_status ?? 'PENDING',
        order.server_readback_verified ? 1 : 0,
        order.created_at,
        order.updated_at
      );
      const row = stmtGetOrder.get(order.order_id) as unknown as SqliteOrder;
      return {
        ...row,
        server_readback_verified: Boolean(row.server_readback_verified),
      };
    },

    getOrder(orderId: string): SqliteOrder | null {
      const row = stmtGetOrder.get(orderId) as unknown as SqliteOrder | undefined;
      if (!row) return null;
      return {
        ...row,
        server_readback_verified: Boolean(row.server_readback_verified),
      };
    },

    getOrderByPaypalOrderId(paypalOrderId: string): SqliteOrder | null {
      const row = stmtGetOrderByPaypal.get(paypalOrderId) as unknown as SqliteOrder | undefined;
      if (!row) return null;
      return {
        ...row,
        server_readback_verified: Boolean(row.server_readback_verified),
      };
    },

    listOrders(mandateId?: string): SqliteOrder[] {
      const rows = (
        mandateId ? stmtListOrdersByMandate.all(mandateId) : stmtListOrdersAll.all()
      ) as unknown as SqliteOrder[];
      return rows.map((r) => ({
        ...r,
        server_readback_verified: Boolean(r.server_readback_verified),
      }));
    },

    insertAuditLedger(entry: NewSqliteAuditLedgerEntry): SqliteAuditLedgerEntry {
      stmtInsertAudit.run(
        entry.event_id,
        entry.request_id,
        entry.event_type,
        entry.mandate_id ?? null,
        entry.order_id ?? null,
        entry.payload,
        entry.prev_hash,
        entry.hash,
        entry.created_at
      );
      const row = stmtGetAudit.get(entry.event_id) as unknown as SqliteAuditLedgerEntry;
      return row;
    },

    getAuditLedgerEntry(eventId: string): SqliteAuditLedgerEntry | null {
      const row = stmtGetAudit.get(eventId) as unknown as SqliteAuditLedgerEntry | undefined;
      return row ?? null;
    },

    listAuditLedgerByRequestId(requestId: string): SqliteAuditLedgerEntry[] {
      return stmtListAuditByRequest.all(requestId) as unknown as SqliteAuditLedgerEntry[];
    },

    listAuditLedgerByMandateId(mandateId: string): SqliteAuditLedgerEntry[] {
      return stmtListAuditByMandate.all(mandateId) as unknown as SqliteAuditLedgerEntry[];
    },

    listAuditLedgerByOrderId(orderId: string): SqliteAuditLedgerEntry[] {
      return stmtListAuditByOrder.all(orderId) as unknown as SqliteAuditLedgerEntry[];
    },

    verifyAuditLedgerIntegrity(): {
      valid: boolean;
      totalEntries: number;
      brokenEventId?: string;
    } {
      const rows = stmtListAuditAllSeq.all() as unknown as SqliteAuditLedgerEntry[];
      for (let i = 0; i < rows.length; i++) {
        const curr = rows[i];
        if (i > 0) {
          const prev = rows[i - 1];
          if (curr.prev_hash !== prev.hash) {
            return {
              valid: false,
              totalEntries: rows.length,
              brokenEventId: curr.event_id,
            };
          }
        }
      }
      return {
        valid: true,
        totalEntries: rows.length,
      };
    },
  };
}
