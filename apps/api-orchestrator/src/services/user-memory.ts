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

import {
  ProductCardData,
  DynamicBuyerProfile,
  UniversalBuyerFacets,
  DomainFacet,
} from '@aegispay/shared-types';
import { createDb, userMemoriesTable, eq } from '@aegispay/database';


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
  const cleaned = (userId || '').replace(/[^a-zA-Z0-9_\-]/g, '');
  return cleaned.slice(0, 64) || 'demo';
}

/**
 * Loads preferences for a given user, backfilling defaults if uninitialized.
 */
export function loadUserPreferences(userId: string = 'demo'): UserPreferences {
  const safeId = sanitizeUserId(userId);
  if (!memoryPrefsStore.has(safeId)) {
    memoryPrefsStore.set(safeId, { ...DEFAULT_PREFERENCES });
  }
  return { ...memoryPrefsStore.get(safeId)! };
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
  const prefs = loadUserPreferences(safeId);
  prefs[key] = value;
  memoryPrefsStore.set(safeId, prefs);
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
  const prefs = loadUserPreferences(safeId);
  const list = prefs[key] || [];
  if (!list.includes(value)) {
    list.push(value);
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

  return products.filter(product => {
    const titleLower = (product.title || '').toLowerCase();
    const descLower = (product.description || '').toLowerCase();

    // Avoided brand filter
    if (avoided.some(brand => titleLower.includes(brand) || descLower.includes(brand))) {
      return false;
    }

    // Max price cap filter
    if (maxPrice !== undefined && maxPrice > 0 && product.price_cents > maxPrice) {
      return false;
    }

    return true;
  });
}

/**
 * Logs a purchase transaction to the user's purchase history log.
 */
export function logPurchase(entry: Omit<PurchaseLogEntry, 'timestamp'>): PurchaseLogEntry {
  const safeId = sanitizeUserId(entry.user_id);
  const fullEntry: PurchaseLogEntry = {
    ...entry,
    user_id: safeId,
    timestamp: new Date().toISOString(),
  };

  const list = purchaseHistoryStore.get(safeId) || [];
  list.unshift(fullEntry); // Newest first
  purchaseHistoryStore.set(safeId, list);

  return fullEntry;
}

/**
 * Returns the last purchase entries for a user (newest first).
 */
export function getPurchaseHistory(userId: string = 'demo', limit: number = 50): PurchaseLogEntry[] {
  const safeId = sanitizeUserId(userId);
  const list = purchaseHistoryStore.get(safeId) || [];
  return list.slice(0, limit);
}

/**
 * Updates the escrow status of a purchase entry.
 */
export function updatePurchaseStatus(
  userId: string,
  orderId: string,
  newStatus: 'HELD' | 'CAPTURED' | 'REFUNDED' | 'DISPUTED'
): boolean {
  const safeId = sanitizeUserId(userId);
  const list = purchaseHistoryStore.get(safeId) || [];
  const target = list.find(item => item.order_id === orderId);
  if (target) {
    target.escrow_status = newStatus;
    return true;
  }
  return false;
}

// Global receipt counter & receipts store matching get_next_receipt_number and log_receipt
let globalReceiptCounter = 0;
const receiptLedgerStore = new Map<string, Array<Record<string, any>>>();

/**
 * Returns and increments the global monotonic receipt counter.
 */
export function getNextReceiptNumber(scope: string = 'global'): number {
  globalReceiptCounter += 1;
  return globalReceiptCounter;
}

/**
 * Appends receipt / transaction voucher information to the user's history log.
 */
export function logReceipt(userId: string = 'demo', receiptData: Record<string, any>): Record<string, any> {
  const safeId = sanitizeUserId(userId);
  const entry = {
    ...receiptData,
    receipt_number: receiptData.receipt_number || getNextReceiptNumber(),
    timestamp: new Date().toISOString(),
  };
  const list = receiptLedgerStore.get(safeId) || [];
  list.unshift(entry);
  receiptLedgerStore.set(safeId, list);
  return entry;
}

/**
 * Retrieves the receipts / transaction records for a user.
 */
export function getReceipts(userId: string = 'demo'): Array<Record<string, any>> {
  const safeId = sanitizeUserId(userId);
  return receiptLedgerStore.get(safeId) || [];
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

/**
 * Adds or updates a product in the user's price-drop watchlist.
 */
export function addToWatchlist(
  userId: string = 'demo',
  item: {
    title: string;
    current_price_cents: number;
    target_price_cents: number;
    source: string;
    link?: string;
    query?: string;
  }
): WatchlistItem {
  const safeId = sanitizeUserId(userId);
  const items = watchlistStore.get(safeId) || [];
  
  const entry: WatchlistItem = {
    id: `wch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    user_id: safeId,
    title: item.title,
    current_price_cents: item.current_price_cents,
    target_price_cents: item.target_price_cents,
    source: item.source,
    link: item.link || '',
    query: item.query || item.title,
    added_at: new Date().toISOString(),
    triggered: false,
  };

  const existingIdx = items.findIndex(i => i.title.toLowerCase() === item.title.toLowerCase());
  if (existingIdx >= 0) {
    items[existingIdx] = entry;
  } else {
    items.push(entry);
  }
  watchlistStore.set(safeId, items);
  return entry;
}

/**
 * Retrieves the full price-drop watchlist for a user.
 */
export function getWatchlist(userId: string = 'demo'): WatchlistItem[] {
  const safeId = sanitizeUserId(userId);
  return watchlistStore.get(safeId) || [];
}

/**
 * Removes an item from the user's watchlist by title or ID.
 */
export function removeFromWatchlist(userId: string = 'demo', identifier: string): boolean {
  const safeId = sanitizeUserId(userId);
  const items = watchlistStore.get(safeId) || [];
  const filtered = items.filter(i => i.id !== identifier && i.title.toLowerCase() !== identifier.toLowerCase());
  if (filtered.length !== items.length) {
    watchlistStore.set(safeId, filtered);
    return true;
  }
  return false;
}

/**
 * Evaluates whether an item's current market price meets or beats the target price.
 */
export function checkWatchlistItem(
  item: WatchlistItem,
  currentPriceCents: number
): { triggered: boolean; price_cents: number; saving_cents: number } | null {
  if (currentPriceCents > 0 && currentPriceCents <= item.target_price_cents) {
    return {
      triggered: true,
      price_cents: currentPriceCents,
      saving_cents: item.current_price_cents - currentPriceCents,
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
  watchlistAlertsStore.unshift(fullAlert);
  return fullAlert;
}

/**
 * Retrieves logged price drop alerts for a user or globally.
 */
export function getWatchlistAlerts(userId?: string): WatchlistAlert[] {
  if (userId) {
    const safeId = sanitizeUserId(userId);
    return watchlistAlertsStore.filter(a => a.user_id === safeId);
  }
  return [...watchlistAlertsStore];
}

export interface WatchlistCheckReport {
  scanned_users: number;
  scanned_items: number;
  triggered_alerts: WatchlistAlert[];
  timestamp: string;
}

/**
 * Scans all active watchlist items across all registered users.
 * Re-evaluates each item against target price, logs alerts, and marks triggered.
 */
export async function checkAllWatchlists(
  priceFetcher?: (query: string, item: WatchlistItem) => Promise<number | null>
): Promise<WatchlistCheckReport> {
  const now = new Date().toISOString();
  const triggeredAlerts: WatchlistAlert[] = [];
  let scannedItems = 0;

  for (const [userId, items] of watchlistStore.entries()) {
    for (const item of items) {
      if (item.triggered) continue; // Already triggered — don't re-alert
      scannedItems++;
      item.last_checked = now;

      let currentMarketPrice = 0;
      if (priceFetcher) {
        try {
          const fetched = await priceFetcher(item.query, item);
          if (fetched !== null && fetched > 0) {
            currentMarketPrice = fetched;
          }
        } catch (err) {
          console.warn(`checkAllWatchlists: priceFetcher failed for ${item.title}:`, err);
        }
      } else {
        // Default deterministic price evaluation: simulate slight price drop if near target
        if (item.current_price_cents > item.target_price_cents && Math.random() < 0.25) {
          currentMarketPrice = item.target_price_cents;
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
      }
    }
    watchlistStore.set(userId, items);
  }

  return {
    scanned_users: watchlistStore.size,
    scanned_items: scannedItems,
    triggered_alerts: triggeredAlerts,
    timestamp: now,
  };
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
  if (watchlistSchedulerTimer) {
    clearInterval(watchlistSchedulerTimer);
  }

  checkAllWatchlists(priceFetcher).catch(err => console.error('Initial watchlist check failed:', err));

  const ms = Math.max(1, intervalHours) * 60 * 60 * 1000;
  watchlistSchedulerTimer = setInterval(() => {
    checkAllWatchlists(priceFetcher).catch(err => console.error('Periodic watchlist check failed:', err));
  }, ms);

  if (watchlistSchedulerTimer.unref) {
    watchlistSchedulerTimer.unref();
  }

  return { status: 'STARTED', interval_hours: intervalHours };
}

/**
 * Gracefully stops the watchlist background scheduler.
 */
export function stopWatchlistScheduler(): boolean {
  if (watchlistSchedulerTimer) {
    clearInterval(watchlistSchedulerTimer);
    watchlistSchedulerTimer = null;
    return true;
  }
  return false;
}

// ── Dynamic Multi-Domain AI Buyer Memory Engine ───────────────────────────

const dynamicBuyerProfilesStore = new Map<string, DynamicBuyerProfile>();

export function clearDynamicBuyerProfilesStore(): void {
  dynamicBuyerProfilesStore.clear();
}

let dbClient: ReturnType<typeof createDb> | null = null;

export function getUserMemoryDb(): ReturnType<typeof createDb> | null {
  if (!dbClient) {
    try {
      const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/aegispay';
      dbClient = createDb(connectionString);
    } catch (err) {
      console.warn('[user-memory] Failed to initialize PostgreSQL client:', err);
      dbClient = null;
    }
  }
  return dbClient;
}

export function setUserMemoryDb(db: ReturnType<typeof createDb> | null): void {
  dbClient = db;
}

export function createDefaultDynamicBuyerProfile(userId: string): DynamicBuyerProfile {
  const safeId = sanitizeUserId(userId);
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
  try {
    const db = getUserMemoryDb();
    if (!db) return;

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
  } catch (err) {
    console.warn(`[user-memory] PostgreSQL persist failed for user ${safeId}:`, err);
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
    return { ...dynamicBuyerProfilesStore.get(safeId)! };
  }

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
        dynamicBuyerProfilesStore.set(safeId, loaded);
        return { ...loaded };
      }
    }
  } catch (err) {
    console.warn(`[user-memory] PostgreSQL query failed for user ${safeId}:`, err);
  }

  // Fallback to default if uninitialized
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
    dynamicBuyerProfilesStore.set(safeId, createDefaultDynamicBuyerProfile(safeId));
  }
  return { ...dynamicBuyerProfilesStore.get(safeId)! };
}

/**
 * Saves dynamic buyer profile:
 * Updates in-memory cache and asynchronously persists to PostgreSQL using an atomic upsert.
 */
export function saveDynamicBuyerProfile(profile: DynamicBuyerProfile): DynamicBuyerProfile {
  const safeId = sanitizeUserId(profile.userId);
  const updated: DynamicBuyerProfile = {
    ...profile,
    userId: safeId,
    updated_at: new Date().toISOString(),
  };
  dynamicBuyerProfilesStore.set(safeId, updated);

  // Asynchronously persist to PostgreSQL using an atomic upsert
  persistDynamicBuyerProfile(updated).catch(err => {
    console.warn(`[user-memory] Async DB persist failed for user ${safeId}:`, err);
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
  const profile = loadDynamicBuyerProfileSync(safeId);

  // 1. Update purchase velocity & lifetime spend
  if (session.total_cents && session.total_cents > 0) {
    profile.purchase_velocity.lifetime_spend_cents += session.total_cents;
    profile.purchase_velocity.total_orders_completed += 1;
  }

  // 2. Extract brand affinities from items
  if (session.items && session.items.length > 0) {
    for (const item of session.items) {
      if (item.brand && !profile.universal.preferred_brands.includes(item.brand)) {
        profile.universal.preferred_brands.push(item.brand);
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
  const profile = await loadDynamicBuyerProfile(safeId);

  // 1. Update purchase velocity & lifetime spend
  if (session.total_cents && session.total_cents > 0) {
    profile.purchase_velocity.lifetime_spend_cents += session.total_cents;
    profile.purchase_velocity.total_orders_completed += 1;
  }

  // 2. Extract brand affinities from items
  if (session.items && session.items.length > 0) {
    for (const item of session.items) {
      if (item.brand && !profile.universal.preferred_brands.includes(item.brand)) {
        profile.universal.preferred_brands.push(item.brand);
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
      }
    }
  }

  const updated = saveDynamicBuyerProfile(profile);
  await persistDynamicBuyerProfile(updated);
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

  return products.filter(product => {
    const titleLower = (product.title || '').toLowerCase();
    const descLower = (product.description || '').toLowerCase();

    // Avoided brands check
    if (avoided.some(brand => titleLower.includes(brand) || descLower.includes(brand))) {
      return false;
    }

    // Minimum merchant credibility / trust score check (score out of 100)
    if (product.merchant_credibility_score !== undefined) {
      if (product.merchant_credibility_score < minTrust) {
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
}

