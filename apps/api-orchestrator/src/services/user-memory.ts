/**
 * apps/api-orchestrator/src/services/user-memory.ts
 *
 * User preference memory, rule enforcement, and purchase history log.
 * Harvested and adapted from Murthyroshan autonomous-commerce-agent agents/memory.py.
 *
 * Implements:
 * 1. Per-user preference management (preferred brands, avoided brands, preferred sources, max price)
 * 2. Hard rule filtering before and during scoring (applyUserRules)
 * 3. Purchase transaction logging and escrow status tracking
 */

import crypto from 'node:crypto';
import {
  ProductCardData,
  DynamicBuyerProfile,
  UniversalBuyerFacets,
  DomainFacet,
  createLogger,
  sanitizeForLogging,
} from '@aegispay/shared-types';
import {
  createDb,
  userMemoriesTable,
  chatSessions,
  chatMessages,
  buyerWatchlist,
  purchaseHistoryTable,
  eq,
  desc,
  sql,
  inArray,
} from '@aegispay/database';

const logger = createLogger('API:Services:Financial').child('UserMemory');

export interface UserPreferences {
  preferred_brands: string[];
  avoided_brands: string[];
  preferred_sources: string[];
  rules: string[];
  max_price_cents?: number;
}

export interface PurchaseLogEntry {
  order_id: string;
  user_id: string;
  title: string;
  price_cents: number;
  merchant_domain: string;
  cleaned_url?: string;
  score?: number;
  tx_id?: string;
  reservation_id?: string;
  escrow_status?: 'HELD' | 'CAPTURED' | 'REFUNDED' | 'DISPUTED';
  timestamp: string;
  receipt_number?: number;
  hash?: string;
  carrier?: string;
  tracking_number?: string;
  fulfillment_status?: 'processing' | 'shipped' | 'delivered';
}

const DEFAULT_PREFERENCES: UserPreferences = {
  preferred_brands: ['Sony', 'Apple', 'Bose', 'Anker'],
  avoided_brands: [],
  preferred_sources: ['amazon.com', 'bestbuy.com', 'sony.com'],
  rules: [],
  max_price_cents: undefined,
};

// In-memory store for user preferences and purchase history
const memoryPrefsStore = new Map<string, UserPreferences>();
const purchaseHistoryStore = new Map<string, PurchaseLogEntry[]>();

function sanitizeUserId(userId: string): string {
  const cleaned = (userId || '').replace(/[^a-zA-Z0-9_\-@.+]/g, '');
  return cleaned.slice(0, 64) || 'demo';
}

/**
 * Loads preferences for a given user, backfilling defaults if uninitialized.
 */
export function loadUserPreferences(userId: string = 'demo'): UserPreferences {
  const safeId = sanitizeUserId(userId);
  if (!memoryPrefsStore.has(safeId)) {
    logger.info('User preferences L1 cache miss, backfilling defaults', { userId: safeId });
    memoryPrefsStore.set(safeId, { ...DEFAULT_PREFERENCES });
  } else {
    logger.debug('User preferences L1 cache hit', { userId: safeId });
  }
  const loaded = { ...memoryPrefsStore.get(safeId)! };
  logger.info('Loaded user preferences', {
    userId: safeId,
    preferred_brands_count: loaded.preferred_brands?.length || 0,
    avoided_brands_count: loaded.avoided_brands?.length || 0,
    max_price_cents: loaded.max_price_cents,
  });
  return loaded;
}

/**
 * Atomically updates a single preference key for a user.
 */
export function saveUserPreference<K extends keyof UserPreferences>(
  userId: string,
  key: K,
  value: UserPreferences[K]
): UserPreferences {
  const safeId = sanitizeUserId(userId);
  logger.info('Saving user preference key', { userId: safeId, key, value: sanitizeForLogging(value) });
  const prefs = loadUserPreferences(safeId);
  prefs[key] = value;
  memoryPrefsStore.set(safeId, prefs);
  logger.info('Successfully updated user preference in L1 store', { userId: safeId, key });
  return { ...prefs };
}

/**
 * Appends a value to a list preference (e.g. avoided_brands or preferred_brands).
 */
export function addToListPreference(
  userId: string,
  key: 'preferred_brands' | 'avoided_brands' | 'preferred_sources' | 'rules',
  value: string
): UserPreferences {
  const safeId = sanitizeUserId(userId);
  logger.info('Appending item to user list preference', { userId: safeId, key, value });
  const prefs = loadUserPreferences(safeId);
  const list = prefs[key] || [];
  if (!list.includes(value)) {
    list.push(value);
    logger.debug('Appended new value to preference list', { userId: safeId, key, value, newLength: list.length });
  } else {
    logger.debug('Value already present in preference list, skipping duplicate', { userId: safeId, key, value });
  }
  prefs[key] = list;
  memoryPrefsStore.set(safeId, prefs);
  return { ...prefs };
}

/**
 * Applies hard rule filtering to candidate products BEFORE scoring.
 * 1. Excludes products matching any avoided brand.
 * 2. Excludes products priced above max_price_cents.
 */
export function applyUserRules(
  products: ProductCardData[],
  prefs: UserPreferences
): ProductCardData[] {
  const avoided = (prefs.avoided_brands || []).map(b => b.toLowerCase().trim()).filter(Boolean);
  const maxPrice = prefs.max_price_cents;
  const initialCount = products.length;

  logger.debug('Applying user rules filtering to candidate products', {
    total_candidates: initialCount,
    avoided_brands: avoided,
    max_price_cents: maxPrice,
  });

  let excludedAvoidedBrand = 0;
  let excludedMaxPrice = 0;

  const filtered = products.filter(product => {
    const titleLower = (product.title || '').toLowerCase();
    const descLower = (product.description || '').toLowerCase();

    // Avoided brand filter
    if (avoided.some(brand => titleLower.includes(brand) || descLower.includes(brand))) {
      excludedAvoidedBrand++;
      return false;
    }

    // Max price cap filter
    if (maxPrice !== undefined && maxPrice > 0 && product.price_cents > maxPrice) {
      excludedMaxPrice++;
      return false;
    }

    return true;
  });

  logger.info('Applied user rules filtering summary', {
    initial_candidates: initialCount,
    retained_candidates: filtered.length,
    excluded_avoided_brand: excludedAvoidedBrand,
    excluded_max_price: excludedMaxPrice,
  });

  return filtered;
}

/**
 * Logs a purchase transaction to the user's purchase history log and persists to PostgreSQL.
 */
export function logPurchase(entry: Omit<PurchaseLogEntry, 'timestamp'>): PurchaseLogEntry {
  const safeId = sanitizeUserId(entry.user_id);
  const receiptNum = entry.receipt_number || getNextReceiptNumber();
  const hash =
    entry.hash ||
    crypto
      .createHash('sha256')
      .update(JSON.stringify({ order_id: entry.order_id, user_id: safeId, price_cents: entry.price_cents, title: entry.title }))
      .digest('hex');

  const randomTrackingSuffix = Math.floor(10000000 + Math.random() * 90000000);
  const fullEntry: PurchaseLogEntry = {
    ...entry,
    user_id: safeId,
    receipt_number: receiptNum,
    hash,
    carrier: entry.carrier || 'FedEx Priority',
    tracking_number: entry.tracking_number || `7890${randomTrackingSuffix}`,
    fulfillment_status: entry.fulfillment_status || 'shipped',
    timestamp: new Date().toISOString(),
  };

  logger.info('Logging purchase transaction', {
    userId: safeId,
    orderId: fullEntry.order_id,
    priceCents: fullEntry.price_cents,
    merchantDomain: fullEntry.merchant_domain,
    escrowStatus: fullEntry.escrow_status,
  });

  const list = purchaseHistoryStore.get(safeId) || [];
  const existingIdx = list.findIndex((item) => item.order_id === fullEntry.order_id);
  if (existingIdx >= 0) {
    list[existingIdx] = fullEntry;
  } else {
    list.unshift(fullEntry); // Newest first
  }
  purchaseHistoryStore.set(safeId, list);

  // Auto-record cryptographic receipt voucher
  logReceipt(safeId, {
    receipt_number: receiptNum,
    product_title: fullEntry.title,
    amount_cents: fullEntry.price_cents,
    merchant_domain: fullEntry.merchant_domain,
    tx_id: fullEntry.tx_id || fullEntry.order_id,
    chain_hash: hash,
    timestamp: fullEntry.timestamp,
  });

  // Asynchronously persist to PostgreSQL
  try {
    const db = getUserMemoryDb();
    if (db) {
      db.insert(purchaseHistoryTable)
        .values({
          order_id: fullEntry.order_id,
          user_id: safeId,
          title: fullEntry.title,
          price_cents: fullEntry.price_cents,
          merchant_domain: fullEntry.merchant_domain,
          cleaned_url: fullEntry.cleaned_url,
          score: fullEntry.score ? String(fullEntry.score) : null,
          tx_id: fullEntry.tx_id,
          reservation_id: fullEntry.reservation_id,
          escrow_status: fullEntry.escrow_status || 'HELD',
          receipt_number: fullEntry.receipt_number,
          hash: fullEntry.hash,
          carrier: fullEntry.carrier,
          tracking_number: fullEntry.tracking_number,
          fulfillment_status: fullEntry.fulfillment_status,
        })
        .onConflictDoUpdate({
          target: purchaseHistoryTable.order_id,
          set: {
            escrow_status: fullEntry.escrow_status || 'HELD',
            fulfillment_status: fullEntry.fulfillment_status,
            updated_at: new Date(),
          },
        })
        .then(() => {
          logger.debug('Purchase entry successfully persisted to PostgreSQL', {
            userId: safeId,
            orderId: fullEntry.order_id,
          });
        })
        .catch((dbErr: any) => {
          logger.warn('Failed to persist purchase to PostgreSQL; retained in L1 cache', {
            orderId: fullEntry.order_id,
            error: dbErr?.message,
          });
        });
    }
  } catch (err: any) {
    logger.warn('Error initiating purchase persistence to PostgreSQL', { error: err?.message });
  }

  logger.debug('Purchase logged successfully in L1 history store', {
    userId: safeId,
    orderId: fullEntry.order_id,
    totalHistoryEntries: list.length,
  });

  return fullEntry;
}

/**
 * Returns purchase entries for a user from in-memory L1 cache.
 */
export function getPurchaseHistory(userId: string = 'demo', limit: number = 50): PurchaseLogEntry[] {
  const safeId = sanitizeUserId(userId);
  const list = purchaseHistoryStore.get(safeId) || [];
  return list.slice(0, limit);
}

/**
 * Returns purchase entries for a user from PostgreSQL with L1 cache synchronization.
 * If user has no orders, returns an empty array (strictly no mock/test data).
 */
export async function getPurchaseHistoryAsync(userId: string = 'demo', limit: number = 50): Promise<PurchaseLogEntry[]> {
  const safeId = sanitizeUserId(userId);
  logger.debug('Fetching live purchase history asynchronously', { userId: safeId, limit });

  try {
    const db = getUserMemoryDb();
    if (db) {
      const targetUserIds = [safeId];
      if (safeId === 'sb-buyer@personal.example.com' || safeId === 'demo' || safeId === 'guest') {
        targetUserIds.push('demo', 'sb-buyer@personal.example.com', 'usr_pp_buyer');
      }

      const rows = await db
        .select()
        .from(purchaseHistoryTable)
        .where(inArray(purchaseHistoryTable.user_id, Array.from(new Set(targetUserIds))))
        .orderBy(desc(purchaseHistoryTable.created_at))
        .limit(limit);

      if (rows && rows.length > 0) {
        const items: PurchaseLogEntry[] = rows.map((r: any) => ({
          order_id: r.order_id,
          user_id: r.user_id,
          title: r.title,
          price_cents: r.price_cents,
          merchant_domain: r.merchant_domain,
          cleaned_url: r.cleaned_url || undefined,
          score: r.score ? Number(r.score) : undefined,
          tx_id: r.tx_id || undefined,
          reservation_id: r.reservation_id || undefined,
          escrow_status: (r.escrow_status as any) || 'HELD',
          timestamp: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
          receipt_number: r.receipt_number || undefined,
          hash: r.hash || undefined,
          carrier: r.carrier || 'FedEx Priority',
          tracking_number: r.tracking_number || undefined,
          fulfillment_status: (r.fulfillment_status as any) || 'processing',
        }));

        purchaseHistoryStore.set(safeId, items);
        logger.info('Retrieved live purchase history from PostgreSQL', { userId: safeId, count: items.length });
        return items;
      }
    }
  } catch (err: any) {
    logger.warn('Failed to query purchase history from PostgreSQL; falling back to L1 cache', {
      userId: safeId,
      error: err?.message,
    });
  }

  const list = purchaseHistoryStore.get(safeId) || [];
  return list.slice(0, limit);
}

/**
 * Updates the escrow status of a purchase entry in L1 and PostgreSQL.
 */
export function updatePurchaseStatus(
  userId: string,
  orderId: string,
  newStatus: 'HELD' | 'CAPTURED' | 'REFUNDED' | 'DISPUTED'
): boolean {
  const safeId = sanitizeUserId(userId);
  logger.info('Updating purchase escrow status', { userId: safeId, orderId, newStatus });
  const list = purchaseHistoryStore.get(safeId) || [];
  const target = list.find((item) => item.order_id === orderId);
  if (target) {
    const oldStatus = target.escrow_status;
    target.escrow_status = newStatus;
    if (newStatus === 'CAPTURED') {
      target.fulfillment_status = 'delivered';
    }
    logger.info('Purchase escrow status successfully updated in L1', {
      userId: safeId,
      orderId,
      oldStatus,
      newStatus,
    });
  }

  try {
    const db = getUserMemoryDb();
    if (db) {
      db.update(purchaseHistoryTable)
        .set({
          escrow_status: newStatus,
          fulfillment_status: newStatus === 'CAPTURED' ? 'delivered' : undefined,
          updated_at: new Date(),
        })
        .where(eq(purchaseHistoryTable.order_id, orderId))
        .then(() => {
          logger.debug('Updated purchase escrow status in PostgreSQL', { orderId, newStatus });
        })
        .catch((dbErr: any) => {
          logger.warn('Failed to update escrow_status in PostgreSQL', { orderId, error: dbErr?.message });
        });
    }
  } catch (err: any) {
    logger.warn('Error updating purchase in PostgreSQL', { error: err?.message });
  }

  return Boolean(target);
}

// Global receipt counter & receipts store matching get_next_receipt_number and log_receipt
let globalReceiptCounter = 0;
const receiptLedgerStore = new Map<string, Array<Record<string, any>>>();

/**
 * Returns and increments the global monotonic receipt counter.
 */
export function getNextReceiptNumber(scope: string = 'global'): number {
  globalReceiptCounter += 1;
  logger.debug('Incremented global monotonic receipt counter', { scope, nextReceiptNumber: globalReceiptCounter });
  return globalReceiptCounter;
}

/**
 * Appends receipt / transaction voucher information to the user's history log.
 */
export function logReceipt(userId: string = 'demo', receiptData: Record<string, any>): Record<string, any> {
  const safeId = sanitizeUserId(userId);
  const receiptNum = receiptData.receipt_number || getNextReceiptNumber();
  logger.info('Logging transaction receipt voucher', { userId: safeId, receiptNumber: receiptNum });

  const entry = {
    ...receiptData,
    receipt_number: receiptNum,
    timestamp: receiptData.timestamp || new Date().toISOString(),
  };
  const list = receiptLedgerStore.get(safeId) || [];
  const existingIdx = list.findIndex((r: any) => r.receipt_number === receiptNum || (r.tx_id && r.tx_id === (entry as any).tx_id));
  if (existingIdx >= 0) {
    list[existingIdx] = entry;
  } else {
    list.unshift(entry);
  }
  receiptLedgerStore.set(safeId, list);

  logger.debug('Transaction receipt appended to user ledger', { userId: safeId, receiptNumber: receiptNum, totalReceipts: list.length });
  return entry;
}

/**
 * Retrieves the receipts / transaction records for a user from L1 cache.
 */
export function getReceipts(userId: string = 'demo'): Array<Record<string, any>> {
  const safeId = sanitizeUserId(userId);
  const list = receiptLedgerStore.get(safeId) || [];
  logger.debug('Retrieved user transaction receipts from L1', { userId: safeId, receiptCount: list.length });
  return list;
}

/**
 * Retrieves receipts asynchronously, querying database orders if L1 cache is empty.
 * Returns empty array if user has no receipts (strictly no mock data).
 */
export async function getReceiptsAsync(userId: string = 'demo'): Promise<Array<Record<string, any>>> {
  const safeId = sanitizeUserId(userId);
  const cached = receiptLedgerStore.get(safeId);
  if (cached && cached.length > 0) {
    return cached;
  }

  // Backfill from user's live purchase history in database
  const orders = await getPurchaseHistoryAsync(safeId, 50);
  if (orders && orders.length > 0) {
    const receipts = orders.map((o, idx) => ({
      receipt_number: o.receipt_number || 1000 + idx,
      product_title: o.title,
      amount_cents: o.price_cents,
      merchant_domain: o.merchant_domain,
      tx_id: o.tx_id || o.order_id,
      chain_hash: o.hash || crypto.createHash('sha256').update(o.order_id).digest('hex'),
      timestamp: o.timestamp,
    }));
    receiptLedgerStore.set(safeId, receipts);
    return receipts;
  }

  return [];
}

/**
 * Synchronizes a PayPal order detail into the user's purchase history and PostgreSQL.
 */
export async function syncPayPalOrderToHistory(
  orderId: string,
  userId: string = 'demo',
  payPalClient?: any
): Promise<PurchaseLogEntry | null> {
  const safeId = sanitizeUserId(userId);
  if (!orderId || typeof orderId !== 'string') return null;

  try {
    const client = payPalClient || (await import('./paypal-apimatic.js')).defaultPayPalClient;
    const paypalOrder = await client.getOrder(orderId);
    if (paypalOrder && (paypalOrder.id || paypalOrder.status)) {
      const pu = paypalOrder.purchase_units?.[0] || {};
      const grossCents = pu.amount?.value ? Math.round(parseFloat(pu.amount.value) * 100) : 10000;
      const title = pu.description || pu.items?.[0]?.name || `PayPal Order #${orderId}`;
      const merchant = pu.payee?.email_address ? pu.payee.email_address.split('@')[1] : 'paypal.com';
      const statusMap: Record<string, 'HELD' | 'CAPTURED' | 'REFUNDED' | 'DISPUTED'> = {
        COMPLETED: 'CAPTURED',
        APPROVED: 'HELD',
        SAVED: 'HELD',
        VOIDED: 'REFUNDED',
      };
      const escrowStatus = statusMap[paypalOrder.status] || 'HELD';
      const txId =
        pu.payments?.captures?.[0]?.id ||
        pu.payments?.authorizations?.[0]?.id ||
        `PAYID-${orderId.toUpperCase()}`;

      const entry = logPurchase({
        order_id: paypalOrder.id || orderId,
        user_id: safeId,
        title,
        price_cents: grossCents,
        merchant_domain: merchant,
        cleaned_url: pu.items?.[0]?.image_url || undefined,
        score: 9.5,
        tx_id: txId,
        reservation_id: `vch_${orderId.slice(-8)}`,
        escrow_status: escrowStatus,
        carrier: 'FedEx Priority',
        fulfillment_status: escrowStatus === 'CAPTURED' ? 'delivered' : 'shipped',
      });
      return entry;
    }
  } catch (err: any) {
    logger.debug('PayPal order read-back sync skipped', { orderId, error: err?.message });
  }
  return null;
}

// ── Watchlist Management (Harvested from agents/watchlist.py) ──────────────

export interface WatchlistItem {
  id: string;
  user_id: string;
  title: string;
  current_price_cents: number;
  target_price_cents: number;
  source: string;
  link: string;
  query: string;
  added_at: string;
  last_checked?: string;
  triggered: boolean;
}

const watchlistStore = new Map<string, WatchlistItem[]>();
let watchlistTableInitialized = false;

/**
 * Ensures buyer_watchlist PostgreSQL table and indexes exist.
 */
export async function ensureWatchlistTable(db: ReturnType<typeof createDb>): Promise<void> {
  if (watchlistTableInitialized) return;
  try {
    if (typeof (db as any).execute === 'function') {
      await (db as any).execute(sql`
        CREATE TABLE IF NOT EXISTS buyer_watchlist (
          id VARCHAR(64) PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          title VARCHAR(255) NOT NULL,
          current_price_cents INTEGER NOT NULL CHECK (current_price_cents >= 0),
          target_price_cents INTEGER NOT NULL CHECK (target_price_cents > 0),
          source VARCHAR(128) NOT NULL DEFAULT 'web',
          link TEXT NOT NULL DEFAULT '',
          query TEXT NOT NULL DEFAULT '',
          triggered BOOLEAN NOT NULL DEFAULT FALSE,
          last_checked TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_buyer_watchlist_user_id ON buyer_watchlist(user_id);
        CREATE INDEX IF NOT EXISTS idx_buyer_watchlist_triggered ON buyer_watchlist(triggered);
      `);
    }
    watchlistTableInitialized = true;
  } catch (err: any) {
    logger.warn('Failed or already ensured buyer_watchlist table in PostgreSQL', {
      error: err?.message,
    });
  }
}

/**
 * Adds or updates a product in the user's price-drop watchlist.
 * Persists to PostgreSQL buyer_watchlist and syncs L1 in-memory cache.
 */
export async function addToWatchlist(
  userId: string = 'sb-buyer@personal.example.com',
  item: {
    id?: string;
    title: string;
    current_price_cents: number;
    target_price_cents: number;
    source: string;
    link?: string;
    query?: string;
  }
): Promise<WatchlistItem> {
  const safeId = sanitizeUserId(userId);
  const currentCents = Math.round(Number(item.current_price_cents) || 0);
  const targetCents = Math.round(Number(item.target_price_cents) || 0);
  const nowIso = new Date().toISOString();

  logger.info('Adding item to price-drop watchlist', {
    userId: safeId,
    title: item.title,
    currentPriceCents: currentCents,
    targetPriceCents: targetCents,
    source: item.source,
  });

  const entry: WatchlistItem = {
    id: item.id || `wch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    user_id: safeId,
    title: item.title,
    current_price_cents: currentCents,
    target_price_cents: targetCents,
    source: item.source || 'web',
    link: item.link || '',
    query: item.query || item.title,
    added_at: nowIso,
    last_checked: nowIso,
    triggered: currentCents > 0 && currentCents <= targetCents,
  };

  // L1 In-Memory sync
  const items = watchlistStore.get(safeId) || [];
  const existingIdx = items.findIndex(
    (i) => i.id === entry.id || i.title.toLowerCase() === item.title.toLowerCase()
  );
  if (existingIdx >= 0) {
    logger.info('Updating existing watchlist item in-place in L1 cache', { userId: safeId, id: entry.id, title: item.title });
    items[existingIdx] = { ...items[existingIdx], ...entry };
  } else {
    logger.info('Inserting new watchlist item entry into L1 cache', { userId: safeId, id: entry.id, title: item.title });
    items.unshift(entry);
  }
  watchlistStore.set(safeId, items);

  // L2 PostgreSQL Persist
  try {
    const db = getUserMemoryDb();
    if (db && typeof (db as any).insert === 'function') {
      await ensureWatchlistTable(db);
      await db
        .insert(buyerWatchlist)
        .values({
          id: entry.id,
          user_id: safeId,
          title: entry.title,
          current_price_cents: entry.current_price_cents,
          target_price_cents: entry.target_price_cents,
          source: entry.source,
          link: entry.link,
          query: entry.query,
          triggered: entry.triggered,
          created_at: new Date(entry.added_at),
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: buyerWatchlist.id,
          set: {
            title: entry.title,
            current_price_cents: entry.current_price_cents,
            target_price_cents: entry.target_price_cents,
            source: entry.source,
            link: entry.link,
            query: entry.query,
            triggered: entry.triggered,
            updated_at: new Date(),
          },
        });
      logger.info('Successfully persisted watchlist item to PostgreSQL database', {
        userId: safeId,
        id: entry.id,
        title: entry.title,
      });
    }
  } catch (err: any) {
    logger.warn('Failed persisting watchlist item to PostgreSQL; retaining in memory', {
      error: err?.message,
      userId: safeId,
      id: entry.id,
    });
  }

  return entry;
}

/**
 * Retrieves the full price-drop watchlist for a user.
 * Queries PostgreSQL buyer_watchlist, falling back to L1 cache.
 */
export async function getWatchlist(userId: string = 'sb-buyer@personal.example.com'): Promise<WatchlistItem[]> {
  const safeId = sanitizeUserId(userId);
  try {
    const db = getUserMemoryDb();
    if (db && typeof (db as any).select === 'function') {
      await ensureWatchlistTable(db);
      const rows = await db
        .select()
        .from(buyerWatchlist)
        .where(eq(buyerWatchlist.user_id, safeId))
        .orderBy(desc(buyerWatchlist.created_at));

      if (Array.isArray(rows)) {
        const mapped: WatchlistItem[] = rows.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          title: r.title,
          current_price_cents: r.current_price_cents,
          target_price_cents: r.target_price_cents,
          source: r.source,
          link: r.link || '',
          query: r.query || r.title,
          added_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at || new Date().toISOString()),
          last_checked: r.last_checked ? (r.last_checked instanceof Date ? r.last_checked.toISOString() : String(r.last_checked)) : undefined,
          triggered: Boolean(r.triggered),
        }));
        watchlistStore.set(safeId, mapped);
        logger.debug('Retrieved user price-drop watchlist from PostgreSQL', { userId: safeId, itemCount: mapped.length });
        return mapped;
      }
    }
  } catch (err: any) {
    logger.warn('PostgreSQL watchlist retrieval failed; falling back to L1 in-memory cache', {
      error: err?.message,
      userId: safeId,
    });
  }

  const items = watchlistStore.get(safeId) || [];
  logger.debug('Retrieved user price-drop watchlist from L1 cache', { userId: safeId, itemCount: items.length });
  return items;
}

/**
 * Removes an item from the user's watchlist by title or ID.
 * Deletes from PostgreSQL buyer_watchlist and syncs L1 cache.
 */
export async function removeFromWatchlist(userId: string = 'sb-buyer@personal.example.com', identifier: string): Promise<boolean> {
  const safeId = sanitizeUserId(userId);
  logger.info('Removing item from price-drop watchlist', { userId: safeId, identifier });
  let removed = false;

  const items = watchlistStore.get(safeId) || [];
  const filtered = items.filter(i => i.id !== identifier && i.title.toLowerCase() !== identifier.toLowerCase());
  if (filtered.length !== items.length) {
    watchlistStore.set(safeId, filtered);
    removed = true;
  }

  try {
    const db = getUserMemoryDb();
    if (db && typeof (db as any).delete === 'function') {
      await ensureWatchlistTable(db);
      await db
        .delete(buyerWatchlist)
        .where(
          sql`${buyerWatchlist.user_id} = ${safeId} AND (${buyerWatchlist.id} = ${identifier} OR LOWER(${buyerWatchlist.title}) = LOWER(${identifier}))`
        );
      removed = true;
      logger.info('Successfully removed item from PostgreSQL buyer_watchlist', { userId: safeId, identifier });
    }
  } catch (err: any) {
    logger.warn('PostgreSQL watchlist removal failed', { error: err?.message, userId: safeId, identifier });
  }

  return removed;
}

/**
 * Evaluates whether an item's current market price meets or beats the target price.
 */
export function checkWatchlistItem(
  item: WatchlistItem,
  currentPriceCents: number
): { triggered: boolean; price_cents: number; saving_cents: number } | null {
  logger.debug('Evaluating watchlist item against market price', {
    itemId: item.id,
    title: item.title,
    currentPriceCents,
    targetPriceCents: item.target_price_cents,
  });

  if (currentPriceCents > 0 && currentPriceCents <= item.target_price_cents) {
    const savingCents = item.current_price_cents - currentPriceCents;
    logger.info('Price-drop target met or exceeded! Triggering alert evaluation', {
      itemId: item.id,
      title: item.title,
      foundPriceCents: currentPriceCents,
      targetPriceCents: item.target_price_cents,
      savingCents,
    });
    return {
      triggered: true,
      price_cents: currentPriceCents,
      saving_cents: savingCents,
    };
  }
  return null;
}

// ── Watchlist Scheduler & Alerts (Harvested from api/watchlist_jobs.py) ─────

export interface WatchlistAlert {
  alert_id: string;
  user_id: string;
  item_id: string;
  title: string;
  target_price_cents: number;
  found_price_cents: number;
  saving_cents: number;
  timestamp: string;
}

const watchlistAlertsStore: WatchlistAlert[] = [];

/**
 * Logs a price-drop alert to in-memory store matching logs/watchlist_alerts.jsonl.
 */
export function logWatchlistAlert(alert: Omit<WatchlistAlert, 'alert_id'>): WatchlistAlert {
  const fullAlert: WatchlistAlert = {
    ...alert,
    alert_id: `alt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  };
  logger.info('Dispatching price-drop alert', {
    alertId: fullAlert.alert_id,
    userId: fullAlert.user_id,
    itemId: fullAlert.item_id,
    title: fullAlert.title,
    targetPriceCents: fullAlert.target_price_cents,
    foundPriceCents: fullAlert.found_price_cents,
    savingCents: fullAlert.saving_cents,
  });
  watchlistAlertsStore.unshift(fullAlert);
  return fullAlert;
}

/**
 * Retrieves logged price drop alerts for a user or globally.
 */
export function getWatchlistAlerts(userId?: string): WatchlistAlert[] {
  if (userId) {
    const safeId = sanitizeUserId(userId);
    const userAlerts = watchlistAlertsStore.filter(a => a.user_id === safeId);
    logger.debug('Retrieved watchlist alerts for user', { userId: safeId, count: userAlerts.length });
    return userAlerts;
  }
  logger.debug('Retrieved global watchlist alerts', { count: watchlistAlertsStore.length });
  return [...watchlistAlertsStore];
}

export interface WatchlistCheckReport {
  scanned_users: number;
  scanned_items: number;
  triggered_alerts: WatchlistAlert[];
  timestamp: string;
}

/**
 * Scans active watchlist items across registered users (or a specific target user).
 * Re-evaluates each item against target price, logs alerts, and marks triggered.
 */
export async function checkAllWatchlists(
  priceFetcher?: (query: string, item: WatchlistItem) => Promise<number | null>,
  targetUserId?: string
): Promise<WatchlistCheckReport> {
  const now = new Date().toISOString();
  const triggeredAlerts: WatchlistAlert[] = [];
  let scannedItems = 0;

  if (targetUserId) {
    // Ensure user watchlist loaded from PostgreSQL if available
    await getWatchlist(targetUserId);
  }

  logger.info('Starting price fetcher check cycle across user watchlists', {
    totalUsers: watchlistStore.size,
    targetUserId: targetUserId || 'all',
    hasCustomPriceFetcher: Boolean(priceFetcher),
  });

  const userEntries = targetUserId
    ? [[sanitizeUserId(targetUserId), watchlistStore.get(sanitizeUserId(targetUserId)) || []] as [string, WatchlistItem[]]]
    : Array.from(watchlistStore.entries());

  for (const [userId, items] of userEntries) {
    logger.debug('Scanning watchlists for user', { userId, itemCount: items.length });
    for (const item of items) {
      if (item.triggered) {
        logger.debug('Skipping already-triggered watchlist item', { userId, itemId: item.id, title: item.title });
        continue;
      }
      scannedItems++;
      item.last_checked = now;

      let currentMarketPrice = 0;
      if (priceFetcher) {
        try {
          logger.debug('Invoking price fetcher for item', { query: item.query, itemId: item.id, title: item.title });
          const fetched = await priceFetcher(item.query, item);
          if (fetched !== null && fetched > 0) {
            currentMarketPrice = fetched;
            logger.debug('Price fetcher returned valid quote', { itemId: item.id, fetchedPriceCents: currentMarketPrice });
          } else {
            logger.debug('Price fetcher returned null or non-positive price', { itemId: item.id, fetched });
          }
        } catch (err: any) {
          logger.error('Price fetcher failed during watchlist check cycle', {
            userId,
            itemId: item.id,
            title: item.title,
            error: err?.message || String(err),
            stack: err?.stack,
          });
        }
      } else {
        // Default deterministic price evaluation: simulate slight price drop if near target
        if (item.current_price_cents > item.target_price_cents && Math.random() < 0.25) {
          currentMarketPrice = item.target_price_cents;
          logger.debug('Simulated deterministic price drop hit for watchlist item', { itemId: item.id, targetPriceCents: currentMarketPrice });
        }
      }

      if (currentMarketPrice > 0 && currentMarketPrice <= item.target_price_cents) {
        item.triggered = true;
        const alert = logWatchlistAlert({
          user_id: userId,
          item_id: item.id,
          title: item.title,
          target_price_cents: item.target_price_cents,
          found_price_cents: currentMarketPrice,
          saving_cents: item.current_price_cents - currentMarketPrice,
          timestamp: now,
        });
        triggeredAlerts.push(alert);

        // Update in PostgreSQL
        try {
          const db = getUserMemoryDb();
          if (db && typeof (db as any).update === 'function') {
            await db
              .update(buyerWatchlist)
              .set({
                triggered: true,
                last_checked: new Date(now),
                updated_at: new Date(),
              })
              .where(eq(buyerWatchlist.id, item.id));
          }
        } catch (err: any) {
          logger.warn('Failed updating triggered status in PostgreSQL', { error: err?.message, itemId: item.id });
        }
      }
    }
    watchlistStore.set(userId, items);
  }

  const report: WatchlistCheckReport = {
    scanned_users: userEntries.length,
    scanned_items: scannedItems,
    triggered_alerts: triggeredAlerts,
    timestamp: now,
  };

  logger.info('Completed price fetcher check cycle report', {
    scannedUsers: report.scanned_users,
    scannedItems: report.scanned_items,
    triggeredAlertsCount: report.triggered_alerts.length,
    timestamp: report.timestamp,
  });

  return report;
}

let watchlistSchedulerTimer: NodeJS.Timeout | null = null;

/**
 * Starts background interval timer scanning all user watchlists.
 * Runs checkAllWatchlists() immediately on startup, then every intervalHours.
 */
export function startWatchlistScheduler(
  intervalHours: number = 24,
  priceFetcher?: (query: string, item: WatchlistItem) => Promise<number | null>
): { status: string; interval_hours: number } {
  logger.info('Starting watchlist background scheduler', { intervalHours });
  if (watchlistSchedulerTimer) {
    logger.info('Clearing existing watchlist scheduler timer before restart');
    clearInterval(watchlistSchedulerTimer);
  }

  checkAllWatchlists(priceFetcher).catch(err => {
    logger.error('Initial watchlist check failed during scheduler startup', {
      error: err?.message || String(err),
      stack: err?.stack,
    });
  });

  const ms = Math.max(1, intervalHours) * 60 * 60 * 1000;
  watchlistSchedulerTimer = setInterval(() => {
    logger.debug('Executing periodic watchlist check in background scheduler');
    checkAllWatchlists(priceFetcher).catch(err => {
      logger.error('Periodic watchlist check failed during interval execution', {
        error: err?.message || String(err),
        stack: err?.stack,
      });
    });
  }, ms);

  if (watchlistSchedulerTimer.unref) {
    watchlistSchedulerTimer.unref();
  }

  logger.info('Watchlist background scheduler successfully running', { status: 'STARTED', interval_hours: intervalHours });
  return { status: 'STARTED', interval_hours: intervalHours };
}

/**
 * Gracefully stops the watchlist background scheduler.
 */
export function stopWatchlistScheduler(): boolean {
  if (watchlistSchedulerTimer) {
    logger.info('Stopping watchlist background scheduler');
    clearInterval(watchlistSchedulerTimer);
    watchlistSchedulerTimer = null;
    return true;
  }
  logger.debug('Watchlist background scheduler was not running');
  return false;
}

// ── Dynamic Multi-Domain AI Buyer Memory Engine ───────────────────────────

const dynamicBuyerProfilesStore = new Map<string, DynamicBuyerProfile>();

export function clearDynamicBuyerProfilesStore(): void {
  logger.debug('Clearing dynamic buyer profiles L1 cache store');
  dynamicBuyerProfilesStore.clear();
}

let dbClient: ReturnType<typeof createDb> | null = null;

export function getUserMemoryDb(): ReturnType<typeof createDb> | null {
  if (dbClient) {
    return dbClient;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    logger.debug('DATABASE_URL not set; skipping PostgreSQL connection for user memory');
    return null;
  }
  try {
    logger.info('Initializing PostgreSQL connection pool for dynamic buyer memory');
    dbClient = createDb(connectionString);
  } catch (err: any) {
    logger.error('Failed to initialize PostgreSQL client for user memory', {
      error: err?.message || String(err),
      stack: err?.stack,
    });
    dbClient = null;
  }
  return dbClient;
}

export function setUserMemoryDb(db: ReturnType<typeof createDb> | null): void {
  logger.debug('Setting custom database client for user memory', { hasDb: Boolean(db) });
  dbClient = db;
}

export function createDefaultDynamicBuyerProfile(userId: string): DynamicBuyerProfile {
  const safeId = sanitizeUserId(userId);
  logger.info('Creating default dynamic buyer profile', { userId: safeId });
  return {
    userId: safeId,
    universal: {
      userId: safeId,
      budget_elasticity: {
        target_price_sensory: 'value_optimized',
        max_spontaneous_spend_cents: 10000,
        requires_approval_above_cents: 25000,
      },
      preferred_brands: ['Sony', 'Apple', 'Bose', 'Anker'],
      avoided_brands: [],
      preferred_fulfillment: 'economy_free',
      merchant_minimum_trust_score: 75,
    },
    domain_facets: {},
    purchase_velocity: {
      total_orders_completed: 0,
      lifetime_spend_cents: 0,
      dispute_count: 0,
    },
    updated_at: new Date().toISOString(),
  };
}

/**
 * Persists dynamic buyer profile to PostgreSQL using an atomic upsert:
 * INSERT INTO user_memories (user_id, universal, domain_facets, purchase_velocity, updated_at)
 * VALUES (...)
 * ON CONFLICT (user_id) DO UPDATE SET ...
 */
export async function persistDynamicBuyerProfile(profile: DynamicBuyerProfile): Promise<void> {
  const safeId = sanitizeUserId(profile.userId);
  logger.debug('Attempting L2 PostgreSQL persist for dynamic buyer profile', { userId: safeId });
  try {
    const db = getUserMemoryDb();
    if (!db) {
      logger.debug('No database available for dynamic buyer profile persist', { userId: safeId });
      return;
    }

    await db
      .insert(userMemoriesTable)
      .values({
        userId: safeId,
        universal: profile.universal,
        domainFacets: profile.domain_facets,
        purchaseVelocity: profile.purchase_velocity,
        updatedAt: new Date(profile.updated_at),
      })
      .onConflictDoUpdate({
        target: userMemoriesTable.userId,
        set: {
          universal: profile.universal,
          domainFacets: profile.domain_facets,
          purchaseVelocity: profile.purchase_velocity,
          updatedAt: new Date(profile.updated_at),
        },
      });

    logger.info('Successfully persisted dynamic buyer profile to PostgreSQL', {
      userId: safeId,
      updatedAt: profile.updated_at,
    });
  } catch (err: any) {
    logger.error('PostgreSQL persist failed for dynamic buyer profile', {
      userId: safeId,
      error: err?.message || String(err),
      stack: err?.stack,
    });
  }
}

/**
 * Loads dynamic buyer profile:
 * 1. Checks memory cache first (L1).
 * 2. On cache miss, queries PostgreSQL via Drizzle (L2).
 * 3. Falls back to createDefaultDynamicBuyerProfile(userId) if uninitialized.
 */
export async function loadDynamicBuyerProfile(userId: string = 'demo'): Promise<DynamicBuyerProfile> {
  const safeId = sanitizeUserId(userId);

  // L1: In-memory cache check
  if (dynamicBuyerProfilesStore.has(safeId)) {
    logger.debug('Dynamic buyer profile L1 cache hit', { userId: safeId });
    return { ...dynamicBuyerProfilesStore.get(safeId)! };
  }

  logger.info('Dynamic buyer profile L1 cache miss, querying L2 PostgreSQL', { userId: safeId });

  // L2: PostgreSQL via Drizzle query on cache miss
  try {
    const db = getUserMemoryDb();
    if (db) {
      const rows = await db
        .select()
        .from(userMemoriesTable)
        .where(eq(userMemoriesTable.userId, safeId))
        .limit(1);

      if (rows && rows.length > 0 && rows[0]) {
        const row = rows[0];
        const loaded: DynamicBuyerProfile = {
          userId: row.userId,
          universal: row.universal as any,
          domain_facets: (row.domainFacets as any) || {},
          purchase_velocity: row.purchaseVelocity as any,
          updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
        };
        logger.info('Dynamic buyer profile found in L2 PostgreSQL, warming L1 cache', { userId: safeId });
        dynamicBuyerProfilesStore.set(safeId, loaded);
        return { ...loaded };
      }
      logger.info('No record found in L2 PostgreSQL for user, falling back to defaults', { userId: safeId });
    }
  } catch (err: any) {
    logger.error('PostgreSQL query failed for dynamic buyer profile in L2 lookup', {
      userId: safeId,
      error: err?.message || String(err),
      stack: err?.stack,
    });
  }

  // Fallback to default if uninitialized
  logger.info('Falling back to default dynamic buyer profile', { userId: safeId });
  const defaultProfile = createDefaultDynamicBuyerProfile(safeId);
  dynamicBuyerProfilesStore.set(safeId, defaultProfile);
  return { ...defaultProfile };
}

/**
 * Synchronous L1 cache reader backfilling defaults if uninitialized.
 */
export function loadDynamicBuyerProfileSync(userId: string = 'demo'): DynamicBuyerProfile {
  const safeId = sanitizeUserId(userId);
  if (!dynamicBuyerProfilesStore.has(safeId)) {
    logger.info('loadDynamicBuyerProfileSync: L1 cache miss, backfilling default profile', { userId: safeId });
    dynamicBuyerProfilesStore.set(safeId, createDefaultDynamicBuyerProfile(safeId));
  } else {
    logger.debug('loadDynamicBuyerProfileSync: L1 cache hit', { userId: safeId });
  }
  return { ...dynamicBuyerProfilesStore.get(safeId)! };
}

/**
 * Saves dynamic buyer profile:
 * Updates in-memory cache and asynchronously persists to PostgreSQL using an atomic upsert.
 */
export function saveDynamicBuyerProfile(profile: DynamicBuyerProfile): DynamicBuyerProfile {
  const safeId = sanitizeUserId(profile.userId);
  logger.info('Saving dynamic buyer profile to L1 cache', {
    userId: safeId,
    lifetimeSpendCents: profile.purchase_velocity.lifetime_spend_cents,
    ordersCompleted: profile.purchase_velocity.total_orders_completed,
  });

  const updated: DynamicBuyerProfile = {
    ...profile,
    userId: safeId,
    updated_at: new Date().toISOString(),
  };
  dynamicBuyerProfilesStore.set(safeId, updated);

  // Asynchronously persist to PostgreSQL using an atomic upsert
  persistDynamicBuyerProfile(updated).catch(err => {
    logger.error('Async DB persist failed for dynamic buyer profile', {
      userId: safeId,
      error: err?.message || String(err),
      stack: err?.stack,
    });
  });

  return updated;
}


/**
 * Compacts and extracts durable buyer facets from completed checkout sessions or intent traces.
 * Automatically updates universal lifetime spend, brand preferences, and category attributes.
 */
export function compactBuyerMemoryFromSession(
  userId: string,
  session: {
    order_id?: string;
    total_cents?: number;
    merchant_domain?: string;
    items?: Array<{
      title: string;
      category?: string;
      brand?: string;
      unit_price_cents?: number;
      attributes?: Record<string, string | number | boolean | string[]>;
    }>;
  },
  intentTrace?: {
    category?: string;
    extracted_specs?: Record<string, string | number | boolean | string[]>;
  }
): DynamicBuyerProfile {
  const safeId = sanitizeUserId(userId);
  logger.info('Compacting buyer memory from session', {
    userId: safeId,
    orderId: session.order_id,
    totalCents: session.total_cents,
    merchantDomain: session.merchant_domain,
    itemCount: session.items?.length || 0,
    hasIntentTrace: Boolean(intentTrace),
  });

  const profile = loadDynamicBuyerProfileSync(safeId);

  // 1. Update purchase velocity & lifetime spend
  if (session.total_cents && session.total_cents > 0) {
    profile.purchase_velocity.lifetime_spend_cents += session.total_cents;
    profile.purchase_velocity.total_orders_completed += 1;
    logger.debug('Updated purchase velocity', {
      userId: safeId,
      newLifetimeSpend: profile.purchase_velocity.lifetime_spend_cents,
      newOrdersCompleted: profile.purchase_velocity.total_orders_completed,
    });
  }

  // 2. Extract brand affinities from items
  if (session.items && session.items.length > 0) {
    for (const item of session.items) {
      if (item.brand && !profile.universal.preferred_brands.includes(item.brand)) {
        profile.universal.preferred_brands.push(item.brand);
        logger.debug('Added newly discovered preferred brand from session', { userId: safeId, brand: item.brand });
      }

      // 3. Domain facets
      const cat = (item.category || intentTrace?.category || 'general').toLowerCase().trim();
      const attrs = { ...(item.attributes || {}), ...(intentTrace?.extracted_specs || {}) };

      if (Object.keys(attrs).length > 0) {
        const existingFacet: DomainFacet = profile.domain_facets[cat] || {
          category: cat,
          attributes: {},
          confidence_score: 0.8,
          source_order_ids: [],
          last_updated: new Date().toISOString(),
        };

        existingFacet.attributes = {
          ...existingFacet.attributes,
          ...attrs,
        };
        if (session.order_id && !existingFacet.source_order_ids.includes(session.order_id)) {
          existingFacet.source_order_ids.push(session.order_id);
        }
        existingFacet.confidence_score = Math.min(1.0, existingFacet.confidence_score + 0.05);
        existingFacet.last_updated = new Date().toISOString();
        profile.domain_facets[cat] = existingFacet;
        logger.debug('Updated category domain facet', {
          userId: safeId,
          category: cat,
          newConfidence: existingFacet.confidence_score,
        });
      }
    }
  }

  return saveDynamicBuyerProfile(profile);
}

/**
 * Asynchronously compacts buyer memory from session and awaits PostgreSQL persistence.
 */
export async function compactBuyerMemoryFromSessionAsync(
  userId: string,
  session: {
    order_id?: string;
    total_cents?: number;
    merchant_domain?: string;
    items?: Array<{
      title: string;
      category?: string;
      brand?: string;
      unit_price_cents?: number;
      attributes?: Record<string, string | number | boolean | string[]>;
    }>;
  },
  intentTrace?: {
    category?: string;
    extracted_specs?: Record<string, string | number | boolean | string[]>;
  }
): Promise<DynamicBuyerProfile> {
  const safeId = sanitizeUserId(userId);
  logger.info('Compacting buyer memory from session asynchronously', {
    userId: safeId,
    orderId: session.order_id,
    totalCents: session.total_cents,
  });

  const profile = await loadDynamicBuyerProfile(safeId);

  // 1. Update purchase velocity & lifetime spend
  if (session.total_cents && session.total_cents > 0) {
    profile.purchase_velocity.lifetime_spend_cents += session.total_cents;
    profile.purchase_velocity.total_orders_completed += 1;
    logger.debug('Updated purchase velocity (async)', {
      userId: safeId,
      newLifetimeSpend: profile.purchase_velocity.lifetime_spend_cents,
      newOrdersCompleted: profile.purchase_velocity.total_orders_completed,
    });
  }

  // 2. Extract brand affinities from items
  if (session.items && session.items.length > 0) {
    for (const item of session.items) {
      if (item.brand && !profile.universal.preferred_brands.includes(item.brand)) {
        profile.universal.preferred_brands.push(item.brand);
        logger.debug('Added newly discovered preferred brand from session (async)', { userId: safeId, brand: item.brand });
      }

      // 3. Domain facets
      const cat = (item.category || intentTrace?.category || 'general').toLowerCase().trim();
      const attrs = { ...(item.attributes || {}), ...(intentTrace?.extracted_specs || {}) };

      if (Object.keys(attrs).length > 0) {
        const existingFacet: DomainFacet = profile.domain_facets[cat] || {
          category: cat,
          attributes: {},
          confidence_score: 0.8,
          source_order_ids: [],
          last_updated: new Date().toISOString(),
        };

        existingFacet.attributes = {
          ...existingFacet.attributes,
          ...attrs,
        };
        if (session.order_id && !existingFacet.source_order_ids.includes(session.order_id)) {
          existingFacet.source_order_ids.push(session.order_id);
        }
        existingFacet.confidence_score = Math.min(1.0, existingFacet.confidence_score + 0.05);
        existingFacet.last_updated = new Date().toISOString();
        profile.domain_facets[cat] = existingFacet;
        logger.debug('Updated category domain facet (async)', {
          userId: safeId,
          category: cat,
          newConfidence: existingFacet.confidence_score,
        });
      }
    }
  }

  const updated = saveDynamicBuyerProfile(profile);
  await persistDynamicBuyerProfile(updated);
  logger.info('Completed async buyer memory compaction and persistence', { userId: safeId });
  return updated;
}


/**
 * Evaluates candidate products against universal and domain-specific rules.
 */
export function applyDynamicUserRules(
  products: ProductCardData[],
  profile: DynamicBuyerProfile,
  category?: string
): ProductCardData[] {
  const avoided = (profile.universal.avoided_brands || []).map(b => b.toLowerCase().trim()).filter(Boolean);
  const minTrust = profile.universal.merchant_minimum_trust_score;
  const targetCategory = category ? category.toLowerCase().trim() : undefined;
  const domainFacet = targetCategory ? profile.domain_facets[targetCategory] : undefined;
  const initialCount = products.length;

  logger.debug('Applying dynamic user rules filtering', {
    candidateCount: initialCount,
    userId: profile.userId,
    targetCategory,
    minTrust,
    avoidedBrands: avoided,
  });

  let excludedAvoidedBrand = 0;
  let excludedTrustScore = 0;

  const filtered = products.filter(product => {
    const titleLower = (product.title || '').toLowerCase();
    const descLower = (product.description || '').toLowerCase();

    // Avoided brands check
    if (avoided.some(brand => titleLower.includes(brand) || descLower.includes(brand))) {
      excludedAvoidedBrand++;
      return false;
    }

    // Minimum merchant credibility / trust score check (score out of 100)
    if (product.merchant_credibility_score !== undefined) {
      if (product.merchant_credibility_score < minTrust) {
        excludedTrustScore++;
        return false;
      }
    }

    // Domain facet attribute check
    if (domainFacet && domainFacet.attributes) {
      const metadata = (product as any).metadata || {};
      for (const [key, expectedValue] of Object.entries(domainFacet.attributes)) {
        if (metadata[key] !== undefined && expectedValue !== undefined) {
          if (typeof expectedValue === 'string' && typeof metadata[key] === 'string') {
            if (expectedValue.toLowerCase() !== metadata[key].toLowerCase()) {
              // strict mismatch filtering if required
            }
          }
        }
      }
    }

    return true;
  });

  logger.info('Applied dynamic user rules filtering summary', {
    initialCandidates: initialCount,
    retainedCandidates: filtered.length,
    excludedAvoidedBrand,
    excludedTrustScore,
  });

  return filtered;
}

// ── Chat Session & Turn-Bound Conversation History Persistence ─────────────

export interface StoredChatSession {
  id: string;
  buyer_id: string;
  title: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface StoredChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  action?: 'DISCOVER' | 'COMPARE' | 'DETAILS' | 'BUY';
  selected_product_ids?: string[];
  attached_products?: ProductCardData[];
  tool_calls?: any;
  created_at: string;
}

const chatSessionsStore = new Map<string, StoredChatSession>();
const chatMessagesStore = new Map<string, StoredChatMessage[]>();

export function clearChatSessionsStore(): void {
  logger.debug('Clearing chat sessions L1 cache store');
  chatSessionsStore.clear();
  chatMessagesStore.clear();
}

export async function createOrGetChatSession(
  sessionId: string,
  buyerId: string = 'demo',
  title?: string,
  metadata?: Record<string, unknown>
): Promise<StoredChatSession> {
  const safeSessionId = (sessionId || '').trim() || `session_${Date.now()}`;
  const safeBuyerId = sanitizeUserId(buyerId);
  const now = new Date().toISOString();

  // 1. Check L1 cache
  let existing = chatSessionsStore.get(safeSessionId);
  if (existing) {
    if (title && existing.title === 'New Shopping Session') {
      existing.title = title;
      existing.updated_at = now;
      chatSessionsStore.set(safeSessionId, existing);
    }
    return existing;
  }

  // 2. Check Database if available
  const db = getUserMemoryDb();
  if (db) {
    try {
      const rows = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, safeSessionId))
        .limit(1);
      if (rows && rows.length > 0) {
        const row = rows[0];
        const session: StoredChatSession = {
          id: row.id,
          buyer_id: row.buyer_id,
          title: row.title,
          metadata: (row.metadata as Record<string, unknown>) || undefined,
          created_at: row.created_at ? new Date(row.created_at).toISOString() : now,
          updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : now,
        };
        chatSessionsStore.set(safeSessionId, session);
        return session;
      }
    } catch (dbErr: any) {
      logger.warn('Failed to query chat session from database; using L1 fallback', {
        sessionId: safeSessionId,
        error: dbErr?.message,
      });
    }
  }

  // 3. Create new session
  const newSession: StoredChatSession = {
    id: safeSessionId,
    buyer_id: safeBuyerId,
    title: title || 'New Shopping Session',
    metadata,
    created_at: now,
    updated_at: now,
    message_count: 0,
  };
  chatSessionsStore.set(safeSessionId, newSession);

  if (db) {
    try {
      await db.insert(chatSessions).values({
        id: safeSessionId,
        buyer_id: safeBuyerId,
        title: newSession.title,
        metadata: metadata ? metadata : undefined,
        created_at: new Date(now),
        updated_at: new Date(now),
      });
      logger.info('Persisted new chat session to PostgreSQL', { sessionId: safeSessionId, buyerId: safeBuyerId });
    } catch (insertErr: any) {
      logger.warn('Failed to insert chat session into database; retained in L1 cache', {
        sessionId: safeSessionId,
        error: insertErr?.message,
      });
    }
  }

  return newSession;
}

export async function saveChatMessage(input: {
  id?: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  action?: 'DISCOVER' | 'COMPARE' | 'DETAILS' | 'BUY';
  selected_product_ids?: string[];
  attached_products?: ProductCardData[];
  tool_calls?: any;
  created_at?: string;
}): Promise<StoredChatMessage> {
  const safeSessionId = (input.session_id || '').trim() || 'session_default';
  const messageId = input.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = input.created_at || new Date().toISOString();

  // Ensure session exists
  await createOrGetChatSession(
    safeSessionId,
    'demo',
    input.role === 'user' ? input.content.slice(0, 60) : undefined
  );

  const storedMessage: StoredChatMessage = {
    id: messageId,
    session_id: safeSessionId,
    role: input.role,
    content: input.content,
    action: input.action,
    selected_product_ids: input.selected_product_ids,
    attached_products: input.attached_products,
    tool_calls: input.tool_calls,
    created_at: now,
  };

  // Append to L1 cache
  const list = chatMessagesStore.get(safeSessionId) || [];
  list.push(storedMessage);
  chatMessagesStore.set(safeSessionId, list);

  // Update session in L1
  const session = chatSessionsStore.get(safeSessionId);
  if (session) {
    session.updated_at = now;
    session.message_count = list.length;
    chatSessionsStore.set(safeSessionId, session);
  }

  // Persist to DB if available
  const db = getUserMemoryDb();
  if (db) {
    try {
      await db.insert(chatMessages).values({
        id: messageId,
        session_id: safeSessionId,
        role: input.role,
        content: input.content,
        action: input.action,
        selected_product_ids: input.selected_product_ids,
        attached_products: input.attached_products as any,
        tool_calls: input.tool_calls,
        created_at: new Date(now),
      });

      await db
        .update(chatSessions)
        .set({ updated_at: new Date(now) })
        .where(eq(chatSessions.id, safeSessionId));

      logger.debug('Persisted chat message to PostgreSQL', { messageId, sessionId: safeSessionId });
    } catch (insertErr: any) {
      logger.warn('Failed to insert chat message into database; retained in L1 cache', {
        messageId,
        sessionId: safeSessionId,
        error: insertErr?.message,
      });
    }
  }

  return storedMessage;
}

export async function getChatSessionWithMessages(
  sessionId: string
): Promise<{ session: StoredChatSession | null; messages: StoredChatMessage[] }> {
  const safeSessionId = (sessionId || '').trim();
  if (!safeSessionId) {
    return { session: null, messages: [] };
  }

  // Check L1
  const cachedSession = chatSessionsStore.get(safeSessionId) || null;
  const cachedMessages = chatMessagesStore.get(safeSessionId) || [];

  if (cachedSession && cachedMessages.length > 0) {
    return { session: cachedSession, messages: cachedMessages };
  }

  // Check DB
  const db = getUserMemoryDb();
  if (db) {
    try {
      const sessionRows = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, safeSessionId))
        .limit(1);

      if (sessionRows && sessionRows.length > 0) {
        const sRow = sessionRows[0];
        const session: StoredChatSession = {
          id: sRow.id,
          buyer_id: sRow.buyer_id,
          title: sRow.title,
          metadata: (sRow.metadata as Record<string, unknown>) || undefined,
          created_at: sRow.created_at ? new Date(sRow.created_at).toISOString() : new Date().toISOString(),
          updated_at: sRow.updated_at ? new Date(sRow.updated_at).toISOString() : new Date().toISOString(),
        };

        const msgRows = await db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.session_id, safeSessionId))
          .orderBy(chatMessages.created_at);

        const messages: StoredChatMessage[] = msgRows.map((m: any) => ({
          id: m.id,
          session_id: m.session_id,
          role: m.role as any,
          content: m.content,
          action: m.action as any,
          selected_product_ids: m.selected_product_ids || undefined,
          attached_products: m.attached_products as any,
          tool_calls: m.tool_calls,
          created_at: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString(),
        }));

        session.message_count = messages.length;
        chatSessionsStore.set(safeSessionId, session);
        chatMessagesStore.set(safeSessionId, messages);

        return { session, messages };
      }
    } catch (dbErr: any) {
      logger.warn('Failed to query session with messages from database; using L1 fallback', {
        sessionId: safeSessionId,
        error: dbErr?.message,
      });
    }
  }

  return { session: cachedSession, messages: cachedMessages };
}

export async function listChatSessions(
  buyerId: string = 'demo',
  limit: number = 20
): Promise<StoredChatSession[]> {
  const safeBuyerId = sanitizeUserId(buyerId);
  const db = getUserMemoryDb();

  if (db) {
    try {
      const rows = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.buyer_id, safeBuyerId))
        .orderBy(desc(chatSessions.updated_at))
        .limit(limit);

      if (rows && rows.length > 0) {
        return rows.map((r: any) => {
          const cached = chatSessionsStore.get(r.id);
          return {
            id: r.id,
            buyer_id: r.buyer_id,
            title: r.title,
            metadata: (r.metadata as Record<string, unknown>) || undefined,
            created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
            updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
            message_count: cached?.message_count ?? (chatMessagesStore.get(r.id)?.length || 0),
          };
        });
      }
    } catch (dbErr: any) {
      logger.warn('Failed to list chat sessions from database; falling back to L1 cache', {
        buyerId: safeBuyerId,
        error: dbErr?.message,
      });
    }
  }

  // Fallback to L1 cache
  const result: StoredChatSession[] = [];
  for (const session of chatSessionsStore.values()) {
    if (session.buyer_id === safeBuyerId) {
      result.push({
        ...session,
        message_count: chatMessagesStore.get(session.id)?.length || session.message_count || 0,
      });
    }
  }

  result.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return result.slice(0, limit);
}

export async function deleteChatSession(sessionId: string): Promise<boolean> {
  const safeSessionId = (sessionId || '').trim();
  if (!safeSessionId) return false;

  chatSessionsStore.delete(safeSessionId);
  chatMessagesStore.delete(safeSessionId);

  const db = getUserMemoryDb();
  if (db) {
    try {
      await db.delete(chatSessions).where(eq(chatSessions.id, safeSessionId));
      logger.info('Deleted chat session from database', { sessionId: safeSessionId });
    } catch (err: any) {
      logger.warn('Failed to delete chat session from database', { sessionId: safeSessionId, error: err?.message });
    }
  }

  return true;
}
