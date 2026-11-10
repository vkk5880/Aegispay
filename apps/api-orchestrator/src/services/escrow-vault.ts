/**
 * apps/api-orchestrator/src/services/escrow-vault.ts
 *
 * Production Hardened Escrow Vault Engine.
 *
 * Provides:
 * 1. Strict state machine transitions: HELD -> RELEASED | VOIDED | DISPUTED
 * 2. Guard against double-release attacks
 * 3. Guard against unauthorized void operations
 * 4. Strict balance accounting guarding against negative balance transfers and over-releases
 */

import crypto from 'node:crypto';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('API:Services:FinancialCustodian:EscrowVault');

export type EscrowHoldStatus = 'HELD' | 'RELEASED' | 'VOIDED' | 'DISPUTED';

export interface CreateEscrowHoldParams {
  orderId: string;
  mandateId: string;
  authorizedPrincipal: string; // The authorized entity permitted to void/release (e.g. buyer or agent ID)
  payeeMerchantDomain: string;
  totalCents: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface EscrowHoldRecord {
  holdId: string;
  orderId: string;
  mandateId: string;
  authorizedPrincipal: string;
  payeeMerchantDomain: string;
  currency: string;
  initialAuthorizedCents: number;
  heldBalanceCents: number;
  residualAuthorizedCents?: number;
  releasedCents: number;
  status: EscrowHoldStatus;
  captures?: Array<{
    captureId: string;
    amountCents: number;
    finalCapture: boolean;
    capturedAt: number;
  }>;
  createdAt: number;
  releasedAt?: number;
  voidedAt?: number;
  disputedAt?: number;
  disputeReason?: string;
  disputeResolvedAt?: number;
  disputeOutcome?: 'RELEASED_TO_MERCHANT' | 'VOIDED_TO_BUYER';
  metadata?: Record<string, unknown>;
}

export interface ReleaseHoldOptions {
  callerPrincipal?: string;
  releaseReason?: string;
  transactionReference?: string;
}

export interface VoidHoldOptions {
  callerPrincipal: string;
  voidReason?: string;
}

export class EscrowVaultError extends Error {
  public code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'EscrowVaultError';
    this.code = code;
  }
}

export class EscrowVault {
  // Key: holdId -> EscrowHoldRecord
  private holds = new Map<string, EscrowHoldRecord>();

  /**
   * Creates an escrow hold, locking funds into the vault.
   */
  public createHold(params: CreateEscrowHoldParams, customHoldId?: string): EscrowHoldRecord {
    logger.info('Creating escrow hold in financial vault', {
      orderId: params.orderId,
      mandateId: params.mandateId,
      authorizedPrincipal: params.authorizedPrincipal,
      payeeMerchantDomain: params.payeeMerchantDomain,
      totalCents: params.totalCents,
      currency: params.currency || 'USD',
      customHoldId,
    });

    if (!params.orderId) {
      logger.error('Failed to create escrow hold: missing orderId', { params: sanitizeForLogging(params) });
      throw new EscrowVaultError('orderId is required', 'ERR_MISSING_ORDER_ID');
    }
    if (!params.mandateId) {
      logger.error('Failed to create escrow hold: missing mandateId', { params: sanitizeForLogging(params) });
      throw new EscrowVaultError('mandateId is required', 'ERR_MISSING_MANDATE_ID');
    }
    if (!params.authorizedPrincipal) {
      logger.error('Failed to create escrow hold: missing authorizedPrincipal', { params: sanitizeForLogging(params) });
      throw new EscrowVaultError('authorizedPrincipal is required', 'ERR_MISSING_PRINCIPAL');
    }
    if (!params.payeeMerchantDomain) {
      logger.error('Failed to create escrow hold: missing payeeMerchantDomain', { params: sanitizeForLogging(params) });
      throw new EscrowVaultError('payeeMerchantDomain is required', 'ERR_MISSING_MERCHANT');
    }
    if (params.totalCents <= 0 || !Number.isInteger(params.totalCents)) {
      logger.error('Failed to create escrow hold: invalid totalCents amount', {
        totalCents: params.totalCents,
        isInteger: Number.isInteger(params.totalCents),
      });
      throw new EscrowVaultError('Hold totalCents must be a positive integer', 'ERR_INVALID_AMOUNT');
    }

    const holdId = customHoldId || `esc_hold_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    if (this.holds.has(holdId)) {
      logger.error('Failed to create escrow hold: holdId collision', { holdId });
      throw new EscrowVaultError(`Escrow hold ${holdId} already exists`, 'ERR_HOLD_EXISTS');
    }

    const record: EscrowHoldRecord = {
      holdId,
      orderId: params.orderId,
      mandateId: params.mandateId,
      authorizedPrincipal: params.authorizedPrincipal,
      payeeMerchantDomain: params.payeeMerchantDomain,
      currency: params.currency || 'USD',
      initialAuthorizedCents: params.totalCents,
      heldBalanceCents: params.totalCents,
      releasedCents: 0,
      status: 'HELD',
      createdAt: Date.now(),
      metadata: params.metadata,
    };

    this.holds.set(holdId, record);
    logger.info('Successfully created and locked escrow hold', {
      holdId,
      orderId: record.orderId,
      initialAuthorizedCents: record.initialAuthorizedCents,
      heldBalanceCents: record.heldBalanceCents,
      status: record.status,
    });
    return { ...record };
  }

  /**
   * Releases held funds to the payee/merchant.
   *
   * Guardrails:
   * - Double-release guard: throws error if hold is already RELEASED or VOIDED.
   * - Negative balance guard: releaseAmountCents cannot be non-positive or exceed available heldBalanceCents.
   */
  public releaseHold(
    holdId: string,
    amountCents?: number,
    options?: ReleaseHoldOptions
  ): { holdId: string; status: EscrowHoldStatus; releasedCents: number; remainingHeldCents: number } {
    logger.info('Initiating escrow hold release', {
      holdId,
      requestedAmountCents: amountCents,
      options: sanitizeForLogging(options),
    });

    const hold = this.holds.get(holdId);
    if (!hold) {
      logger.error('Escrow release failed: hold not found', { holdId });
      throw new EscrowVaultError(`Escrow hold ${holdId} not found`, 'ERR_HOLD_NOT_FOUND');
    }

    if (hold.status === 'RELEASED') {
      logger.error('Double-release attack prevented: hold already completely released', {
        holdId,
        releasedCents: hold.releasedCents,
      });
      throw new EscrowVaultError(
        `Double-release prevented: hold ${holdId} has already been completely released`,
        'ERR_DOUBLE_RELEASE'
      );
    }

    if (hold.status === 'VOIDED') {
      logger.error('Escrow release failed: hold is voided', { holdId, voidedAt: hold.voidedAt });
      throw new EscrowVaultError(
        `Cannot release voided hold ${holdId}`,
        'ERR_HOLD_VOIDED'
      );
    }

    if (hold.status === 'DISPUTED') {
      logger.error('Escrow release blocked: hold is currently under dispute', {
        holdId,
        disputeReason: hold.disputeReason,
        disputedAt: hold.disputedAt,
      });
      throw new EscrowVaultError(
        `Cannot release hold ${holdId} while under dispute. Resolve dispute first.`,
        'ERR_HOLD_DISPUTED'
      );
    }

    const releaseAmount = amountCents ?? hold.heldBalanceCents;

    if (releaseAmount <= 0 || !Number.isInteger(releaseAmount)) {
      logger.error('Escrow release failed: invalid release amount', {
        holdId,
        releaseAmount,
        heldBalanceCents: hold.heldBalanceCents,
      });
      throw new EscrowVaultError(
        `Release amount must be a positive integer, received: ${releaseAmount}`,
        'ERR_INVALID_TRANSFER_AMOUNT'
      );
    }

    if (releaseAmount > hold.heldBalanceCents) {
      logger.error('Escrow release failed: requested amount exceeds available held balance', {
        holdId,
        releaseAmount,
        heldBalanceCents: hold.heldBalanceCents,
      });
      throw new EscrowVaultError(
        `Negative balance transfer prevented: requested ${releaseAmount} cents but only ${hold.heldBalanceCents} cents held in vault`,
        'ERR_INSUFFICIENT_HOLD_BALANCE'
      );
    }

    hold.heldBalanceCents -= releaseAmount;
    hold.releasedCents += releaseAmount;

    if (hold.heldBalanceCents === 0) {
      hold.status = 'RELEASED';
      hold.releasedAt = Date.now();
      logger.info('Escrow hold fully released and closed', {
        holdId,
        totalReleasedCents: hold.releasedCents,
        releasedAt: hold.releasedAt,
      });
    } else {
      logger.info('Escrow hold partially released', {
        holdId,
        releasedAmountCents: releaseAmount,
        remainingHeldCents: hold.heldBalanceCents,
        status: hold.status,
      });
    }

    return {
      holdId: hold.holdId,
      status: hold.status,
      releasedCents: releaseAmount,
      remainingHeldCents: hold.heldBalanceCents,
    };
  }

  /**
   * Partial capture tracking for Payments v2 authorizations.
   * Tracks residual authorized cents across multiple captures until final_capture: true or balance reaches zero.
   */
  public capturePartialHold(
    holdId: string,
    amountCents: number,
    options?: {
      captureId?: string;
      finalCapture?: boolean;
      callerPrincipal?: string;
    }
  ): {
    holdId: string;
    capturedCents: number;
    residualAuthorizedCents: number;
    finalCapture: boolean;
    status: EscrowHoldStatus;
  } {
    logger.info('Executing partial capture on escrow hold', {
      holdId,
      amountCents,
      captureId: options?.captureId,
      finalCaptureRequested: options?.finalCapture,
    });

    const hold = this.holds.get(holdId);
    if (!hold) {
      logger.error('Partial capture failed: hold not found', { holdId });
      throw new EscrowVaultError(`Escrow hold ${holdId} not found`, 'ERR_HOLD_NOT_FOUND');
    }

    if (hold.status === 'RELEASED') {
      logger.error('Partial capture prevented: hold already completely released/captured', { holdId });
      throw new EscrowVaultError(
        `Double-release prevented: hold ${holdId} has already been completely captured/released`,
        'ERR_DOUBLE_RELEASE'
      );
    }

    if (hold.status === 'VOIDED') {
      logger.error('Partial capture failed: hold is voided', { holdId });
      throw new EscrowVaultError(`Cannot capture voided hold ${holdId}`, 'ERR_HOLD_VOIDED');
    }

    if (hold.status === 'DISPUTED') {
      logger.error('Partial capture blocked: hold is under dispute', { holdId, reason: hold.disputeReason });
      throw new EscrowVaultError(`Cannot capture hold ${holdId} while under dispute`, 'ERR_HOLD_DISPUTED');
    }

    if (amountCents <= 0 || !Number.isInteger(amountCents)) {
      logger.error('Partial capture failed: invalid amountCents', { holdId, amountCents });
      throw new EscrowVaultError(
        `Capture amount must be a positive integer, received: ${amountCents}`,
        'ERR_INVALID_TRANSFER_AMOUNT'
      );
    }

    if (amountCents > hold.heldBalanceCents) {
      logger.error('Partial capture failed: capture amount exceeds residual held balance', {
        holdId,
        amountCents,
        heldBalanceCents: hold.heldBalanceCents,
      });
      throw new EscrowVaultError(
        `Negative balance transfer prevented: requested ${amountCents} cents but only ${hold.heldBalanceCents} cents residual in vault`,
        'ERR_INSUFFICIENT_HOLD_BALANCE'
      );
    }

    const captureId = options?.captureId || `cap_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
    hold.heldBalanceCents -= amountCents;
    hold.releasedCents += amountCents;
    hold.residualAuthorizedCents = hold.heldBalanceCents;

    const isFinal = options?.finalCapture === true || hold.heldBalanceCents === 0;

    if (!hold.captures) {
      hold.captures = [];
    }
    hold.captures.push({
      captureId,
      amountCents,
      finalCapture: isFinal,
      capturedAt: Date.now(),
    });

    if (isFinal) {
      hold.status = 'RELEASED';
      hold.releasedAt = Date.now();
      logger.info('Escrow partial capture completed finalization', {
        holdId,
        captureId,
        capturedCents: amountCents,
        residualAuthorizedCents: hold.heldBalanceCents,
        isFinal,
        status: hold.status,
      });
    } else {
      logger.info('Escrow partial capture recorded', {
        holdId,
        captureId,
        capturedCents: amountCents,
        residualAuthorizedCents: hold.heldBalanceCents,
        isFinal,
        status: hold.status,
      });
    }

    return {
      holdId: hold.holdId,
      capturedCents: amountCents,
      residualAuthorizedCents: hold.heldBalanceCents,
      finalCapture: isFinal,
      status: hold.status,
    };
  }

  /**
   * Voids an escrow hold, returning locked funds to the buyer.
   *
   * Guardrails:
   * - Unauthorized void guard: callerPrincipal must match authorizedPrincipal.
   * - State guard: cannot void already RELEASED or VOIDED holds.
   */
  public voidHold(
    holdId: string,
    options: VoidHoldOptions
  ): { holdId: string; status: 'VOIDED'; voidedCents: number; voidedAt: number } {
    logger.info('Initiating void authorization on escrow hold', {
      holdId,
      callerPrincipal: options.callerPrincipal,
      voidReason: options.voidReason,
    });

    const hold = this.holds.get(holdId);
    if (!hold) {
      logger.error('Void authorization failed: hold not found', { holdId });
      throw new EscrowVaultError(`Escrow hold ${holdId} not found`, 'ERR_HOLD_NOT_FOUND');
    }

    if (options.callerPrincipal !== hold.authorizedPrincipal) {
      logger.error('Unauthorized void attempt blocked by security gate', {
        holdId,
        callerPrincipal: options.callerPrincipal,
        authorizedPrincipal: hold.authorizedPrincipal,
      });
      throw new EscrowVaultError(
        `Unauthorized void prevented: principal '${options.callerPrincipal}' does not match authorized hold owner '${hold.authorizedPrincipal}'`,
        'ERR_UNAUTHORIZED_VOID'
      );
    }

    if (hold.status === 'VOIDED') {
      logger.error('Void operation failed: hold is already VOIDED', { holdId, voidedAt: hold.voidedAt });
      throw new EscrowVaultError(`Hold ${holdId} is already VOIDED`, 'ERR_ALREADY_VOIDED');
    }

    if (hold.status === 'RELEASED') {
      logger.error('Void operation failed: funds already released to merchant', { holdId, releasedAt: hold.releasedAt });
      throw new EscrowVaultError(
        `Cannot void hold ${holdId} because funds have already been RELEASED to merchant`,
        'ERR_CANNOT_VOID_RELEASED'
      );
    }

    if (hold.status === 'DISPUTED') {
      logger.error('Void operation blocked: hold is under dispute', { holdId, reason: hold.disputeReason });
      throw new EscrowVaultError(
        `Cannot void hold ${holdId} while under dispute. Resolve dispute first.`,
        'ERR_HOLD_DISPUTED'
      );
    }

    const voidedCents = hold.heldBalanceCents;
    hold.heldBalanceCents = 0;
    hold.status = 'VOIDED';
    hold.voidedAt = Date.now();

    logger.info('Escrow hold successfully voided and funds released to buyer', {
      holdId,
      voidedCents,
      voidedAt: hold.voidedAt,
      callerPrincipal: options.callerPrincipal,
    });

    return {
      holdId: hold.holdId,
      status: 'VOIDED',
      voidedCents,
      voidedAt: hold.voidedAt,
    };
  }

  /**
   * Transitions hold to DISPUTED state, freezing releases and voids.
   */
  public disputeHold(holdId: string, reason: string): { holdId: string; status: 'DISPUTED' } {
    logger.info('Placing escrow hold into DISPUTED state', { holdId, reason });

    const hold = this.holds.get(holdId);
    if (!hold) {
      logger.error('Dispute transition failed: hold not found', { holdId });
      throw new EscrowVaultError(`Escrow hold ${holdId} not found`, 'ERR_HOLD_NOT_FOUND');
    }

    if (hold.status === 'VOIDED' || hold.status === 'RELEASED') {
      logger.error('Dispute transition failed: hold in terminal state', { holdId, status: hold.status });
      throw new EscrowVaultError(
        `Cannot dispute hold ${holdId} in ${hold.status} state`,
        'ERR_INVALID_DISPUTE_STATE'
      );
    }

    hold.status = 'DISPUTED';
    hold.disputedAt = Date.now();
    hold.disputeReason = reason;

    logger.info('Escrow hold successfully marked as DISPUTED and frozen', {
      holdId,
      disputedAt: hold.disputedAt,
      heldBalanceCents: hold.heldBalanceCents,
      disputeReason: reason,
    });

    return {
      holdId: hold.holdId,
      status: 'DISPUTED',
    };
  }

  /**
   * Resolves a disputed hold either in favor of merchant (RELEASE) or buyer (VOID).
   */
  public resolveDispute(
    holdId: string,
    outcome: 'RELEASED_TO_MERCHANT' | 'VOIDED_TO_BUYER',
    amountCents?: number
  ): EscrowHoldRecord {
    logger.info('Resolving disputed escrow hold', {
      holdId,
      outcome,
      specifiedAmountCents: amountCents,
    });

    const hold = this.holds.get(holdId);
    if (!hold) {
      logger.error('Dispute resolution failed: hold not found', { holdId });
      throw new EscrowVaultError(`Escrow hold ${holdId} not found`, 'ERR_HOLD_NOT_FOUND');
    }

    if (hold.status !== 'DISPUTED') {
      logger.error('Dispute resolution failed: hold is not in DISPUTED state', { holdId, status: hold.status });
      throw new EscrowVaultError(`Hold ${holdId} is not under dispute`, 'ERR_NOT_IN_DISPUTE');
    }

    hold.disputeResolvedAt = Date.now();
    hold.disputeOutcome = outcome;

    if (outcome === 'RELEASED_TO_MERCHANT') {
      const releaseAmount = amountCents ?? hold.heldBalanceCents;
      if (releaseAmount <= 0 || releaseAmount > hold.heldBalanceCents) {
        logger.error('Dispute resolution failed: invalid release amount', {
          holdId,
          releaseAmount,
          heldBalanceCents: hold.heldBalanceCents,
        });
        throw new EscrowVaultError(
          `Invalid dispute release amount: ${releaseAmount}`,
          'ERR_INVALID_TRANSFER_AMOUNT'
        );
      }
      hold.heldBalanceCents -= releaseAmount;
      hold.releasedCents += releaseAmount;
      hold.status = 'RELEASED';
      hold.releasedAt = Date.now();
      logger.info('Dispute resolved in favor of merchant (RELEASED)', {
        holdId,
        releasedCents: releaseAmount,
        heldBalanceCents: hold.heldBalanceCents,
        status: hold.status,
      });
    } else {
      const voidedCents = hold.heldBalanceCents;
      hold.heldBalanceCents = 0;
      hold.status = 'VOIDED';
      hold.voidedAt = Date.now();
      logger.info('Dispute resolved in favor of buyer (VOIDED)', {
        holdId,
        voidedCents,
        status: hold.status,
      });
    }

    return { ...hold };
  }

  /**
   * Retrieve an escrow hold record
   */
  public getHold(holdId: string): EscrowHoldRecord | undefined {
    const hold = this.holds.get(holdId);
    logger.debug('Retrieved escrow hold record', {
      holdId,
      found: Boolean(hold),
      status: hold?.status,
    });
    return hold ? { ...hold } : undefined;
  }

  /**
   * Get the current active held balance in cents
   */
  public getHoldBalance(holdId: string): number {
    const hold = this.holds.get(holdId);
    if (!hold) {
      logger.error('Failed to get hold balance: hold not found', { holdId });
      throw new EscrowVaultError(`Escrow hold ${holdId} not found`, 'ERR_HOLD_NOT_FOUND');
    }
    logger.debug('Retrieved escrow hold balance', {
      holdId,
      heldBalanceCents: hold.heldBalanceCents,
    });
    return hold.heldBalanceCents;
  }

  /**
   * Clear all holds (useful for testing)
   */
  public reset(): void {
    const priorCount = this.holds.size;
    this.holds.clear();
    logger.info('Reset escrow vault state', { clearedHoldsCount: priorCount });
  }
}

export const defaultEscrowVault = new EscrowVault();
