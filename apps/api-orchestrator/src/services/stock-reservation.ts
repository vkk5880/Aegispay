/**
 * apps/api-orchestrator/src/services/stock-reservation.ts
 *
 * Production Two-Phase Commit (2PC) Stock Reservation Engine.
 *
 * Provides:
 * 1. Strict 2PC state machine transitions (PREPARED -> COMMITTED or ABORTED)
 * 2. All-or-nothing stock locking ensuring zero orphan held stock upon partial reservation failures
 * 3. Automatic 15-minute TTL expiration that automatically frees uncommitted held stock
 * 4. In-memory inventory tracking with merchant-domain multi-tenant partitioning
 */

import crypto from 'node:crypto';

export type TwoPhaseCommitState = 'PREPARED' | 'COMMITTED' | 'ABORTED';

export interface StockReservationItemRequest {
  productId: string;
  quantity: number;
  merchantDomain?: string;
}

export interface ReservedStockEntry {
  productId: string;
  quantity: number;
  merchantDomain: string;
  heldAt: number;
}

export interface StockReservationRecord {
  reservationId: string;
  state: TwoPhaseCommitState;
  items: ReservedStockEntry[];
  ttlMs: number;
  preparedAt: number;
  expiresAt: number;
  committedAt?: number;
  abortedAt?: number;
  abortReason?: string;
}

export interface PrepareReservationOptions {
  ttlMs?: number; // Defaults to 15 minutes (900,000 ms)
  metadata?: Record<string, unknown>;
}

export interface PrepareReservationResult {
  success: boolean;
  reservationId: string;
  state: TwoPhaseCommitState;
  items: ReservedStockEntry[];
  expiresAt: number;
  failedItems?: Array<{
    productId: string;
    requestedQuantity: number;
    availableQuantity: number;
    merchantDomain: string;
    reason: string;
  }>;
}

export interface CommitReservationResult {
  success: boolean;
  reservationId: string;
  state: 'COMMITTED';
  committedAt: number;
}

export interface AbortReservationResult {
  success: boolean;
  reservationId: string;
  state: 'ABORTED';
  abortedAt: number;
  reason: string;
  releasedItems: ReservedStockEntry[];
}

export class StockReservationError extends Error {
  public code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'StockReservationError';
    this.code = code;
  }
}

export class StockReservationEngine {
  public static readonly DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes in ms

  // Key format: `${merchantDomain}#${productId}` -> available count
  private inventory = new Map<string, number>();

  // Key: reservationId -> record
  private reservations = new Map<string, StockReservationRecord>();

  private sweepTimer?: NodeJS.Timeout;

  constructor(autoSweepIntervalMs: number = 60 * 1000) {
    if (autoSweepIntervalMs > 0 && typeof setInterval !== 'undefined') {
      this.sweepTimer = setInterval(() => {
        this.sweepExpiredReservations();
      }, autoSweepIntervalMs);
      if (this.sweepTimer.unref) {
        this.sweepTimer.unref();
      }
    }
  }

  /**
   * Helper to build inventory key
   */
  private makeKey(productId: string, merchantDomain: string = 'global'): string {
    return `${merchantDomain.toLowerCase()}#${productId}`;
  }

  /**
   * Set inventory level for a given product and merchant domain
   */
  public setInventory(productId: string, quantity: number, merchantDomain: string = 'global'): void {
    if (quantity < 0) {
      throw new StockReservationError('Inventory quantity cannot be negative', 'ERR_INVALID_QUANTITY');
    }
    const key = this.makeKey(productId, merchantDomain);
    this.inventory.set(key, Math.floor(quantity));
  }

  /**
   * Get current available (unreserved) inventory count
   */
  public getInventory(productId: string, merchantDomain: string = 'global'): number {
    const key = this.makeKey(productId, merchantDomain);
    return this.inventory.get(key) ?? 0;
  }

  /**
   * Phase 1: PREPARE
   *
   * Verifies inventory across all requested items and holds stock.
   * Enforces zero orphan held stock: if any item fails reservation,
   * all previously held items in this request are immediately rolled back.
   */
  public prepare(
    items: StockReservationItemRequest[],
    options?: PrepareReservationOptions,
    customReservationId?: string
  ): PrepareReservationResult {
    this.sweepExpiredReservations();

    if (!items || items.length === 0) {
      throw new StockReservationError('Reservation items array cannot be empty', 'ERR_EMPTY_ITEMS');
    }

    const reservationId = customReservationId || `res_2pc_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    if (this.reservations.has(reservationId)) {
      throw new StockReservationError(`Reservation ID ${reservationId} already exists`, 'ERR_RESERVATION_EXISTS');
    }

    const ttlMs = options?.ttlMs ?? StockReservationEngine.DEFAULT_TTL_MS;
    if (ttlMs <= 0) {
      throw new StockReservationError('TTL must be a positive integer', 'ERR_INVALID_TTL');
    }

    const now = Date.now();
    const expiresAt = now + ttlMs;

    const successfullyHeld: ReservedStockEntry[] = [];
    const failedItems: Array<{
      productId: string;
      requestedQuantity: number;
      availableQuantity: number;
      merchantDomain: string;
      reason: string;
    }> = [];

    for (const req of items) {
      const qty = req.quantity ?? 1;
      const domain = (req.merchantDomain || 'global').toLowerCase();

      if (qty <= 0 || !Number.isInteger(qty)) {
        failedItems.push({
          productId: req.productId,
          requestedQuantity: qty,
          availableQuantity: 0,
          merchantDomain: domain,
          reason: 'Quantity must be a positive integer',
        });
        break;
      }

      const key = this.makeKey(req.productId, domain);
      const currentStock = this.inventory.get(key) ?? 0;

      if (currentStock < qty) {
        failedItems.push({
          productId: req.productId,
          requestedQuantity: qty,
          availableQuantity: currentStock,
          merchantDomain: domain,
          reason: `Insufficient inventory: requested ${qty}, available ${currentStock}`,
        });
        break;
      }

      // Deduct temporarily into held status
      this.inventory.set(key, currentStock - qty);
      successfullyHeld.push({
        productId: req.productId,
        quantity: qty,
        merchantDomain: domain,
        heldAt: now,
      });
    }

    // Zero-orphan-stock guarantee: if any item failed, immediately roll back all items held in this batch
    if (failedItems.length > 0) {
      for (const held of successfullyHeld) {
        const key = this.makeKey(held.productId, held.merchantDomain);
        const current = this.inventory.get(key) ?? 0;
        this.inventory.set(key, current + held.quantity);
      }

      const abortedRecord: StockReservationRecord = {
        reservationId,
        state: 'ABORTED',
        items: successfullyHeld,
        ttlMs,
        preparedAt: now,
        expiresAt,
        abortedAt: Date.now(),
        abortReason: `Prepare failed: ${failedItems[0].reason}`,
      };
      this.reservations.set(reservationId, abortedRecord);

      return {
        success: false,
        reservationId,
        state: 'ABORTED',
        items: [],
        expiresAt,
        failedItems,
      };
    }

    // All items successfully held in PREPARED state
    const record: StockReservationRecord = {
      reservationId,
      state: 'PREPARED',
      items: successfullyHeld,
      ttlMs,
      preparedAt: now,
      expiresAt,
    };
    this.reservations.set(reservationId, record);

    return {
      success: true,
      reservationId,
      state: 'PREPARED',
      items: successfullyHeld,
      expiresAt,
    };
  }

  /**
   * Phase 2: COMMIT
   *
   * Transitions a PREPARED reservation to COMMITTED.
   * Permanently claims the held stock.
   */
  public commit(reservationId: string): CommitReservationResult {
    this.sweepExpiredReservations();

    const record = this.reservations.get(reservationId);
    if (!record) {
      throw new StockReservationError(`Reservation ${reservationId} not found`, 'ERR_RESERVATION_NOT_FOUND');
    }

    if (record.state === 'COMMITTED') {
      throw new StockReservationError(`Reservation ${reservationId} has already been COMMITTED`, 'ERR_ALREADY_COMMITTED');
    }

    if (record.state === 'ABORTED') {
      throw new StockReservationError(
        `Cannot commit ABORTED reservation ${reservationId} (reason: ${record.abortReason || 'Unknown'})`,
        'ERR_ALREADY_ABORTED'
      );
    }

    if (Date.now() > record.expiresAt) {
      // Lazy TTL expiration check
      this.abortReservationInternal(record, 'EXPIRED_TTL_ON_COMMIT');
      throw new StockReservationError(
        `Reservation ${reservationId} expired before commit (TTL: ${record.ttlMs}ms)`,
        'ERR_RESERVATION_EXPIRED'
      );
    }

    record.state = 'COMMITTED';
    record.committedAt = Date.now();

    return {
      success: true,
      reservationId,
      state: 'COMMITTED',
      committedAt: record.committedAt,
    };
  }

  /**
   * Phase 2: ABORT / ROLLBACK
   *
   * Transitions a PREPARED reservation to ABORTED and releases held inventory.
   */
  public abort(reservationId: string, reason: string = 'USER_OR_SYSTEM_ABORT'): AbortReservationResult {
    const record = this.reservations.get(reservationId);
    if (!record) {
      throw new StockReservationError(`Reservation ${reservationId} not found`, 'ERR_RESERVATION_NOT_FOUND');
    }

    if (record.state === 'COMMITTED') {
      throw new StockReservationError(
        `Cannot abort already COMMITTED reservation ${reservationId}`,
        'ERR_CANNOT_ABORT_COMMITTED'
      );
    }

    if (record.state === 'ABORTED') {
      return {
        success: true,
        reservationId,
        state: 'ABORTED',
        abortedAt: record.abortedAt ?? Date.now(),
        reason: record.abortReason || reason,
        releasedItems: [],
      };
    }

    const releasedItems = this.abortReservationInternal(record, reason);

    return {
      success: true,
      reservationId,
      state: 'ABORTED',
      abortedAt: record.abortedAt!,
      reason: record.abortReason!,
      releasedItems,
    };
  }

  /**
   * Internal helper to release held stock when aborting
   */
  private abortReservationInternal(record: StockReservationRecord, reason: string): ReservedStockEntry[] {
    for (const item of record.items) {
      const key = this.makeKey(item.productId, item.merchantDomain);
      const current = this.inventory.get(key) ?? 0;
      this.inventory.set(key, current + item.quantity);
    }
    record.state = 'ABORTED';
    record.abortedAt = Date.now();
    record.abortReason = reason;
    return record.items;
  }

  /**
   * Automatic TTL sweeper: releases all uncommitted reservations older than 15 minutes (or custom TTL)
   */
  public sweepExpiredReservations(): number {
    const now = Date.now();
    let expiredCount = 0;

    for (const [, record] of this.reservations) {
      if (record.state === 'PREPARED' && now > record.expiresAt) {
        this.abortReservationInternal(record, 'EXPIRED_15MIN_TTL');
        expiredCount++;
      }
    }

    return expiredCount;
  }

  /**
   * Retrieve a reservation record
   */
  public getReservation(reservationId: string): StockReservationRecord | undefined {
    this.sweepExpiredReservations();
    return this.reservations.get(reservationId);
  }

  /**
   * Clear all records and stop sweep timer (useful for testing)
   */
  public reset(): void {
    this.inventory.clear();
    this.reservations.clear();
  }

  public destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
    this.reset();
  }
}

export const defaultStockReservationEngine = new StockReservationEngine();
