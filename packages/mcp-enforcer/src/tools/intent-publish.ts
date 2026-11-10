import crypto from 'node:crypto';
import { z } from 'zod';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('MCP:Enforcer:IntentPublish', { stream: 'stderr' });

/**
 * In-memory replay cache to protect against voucher and intent replay attacks.
 * Tracks nonces/voucher tokens with expiration times.
 */
class VoucherReplayProtectionRegistry {
  private seenVouchers = new Map<string, number>();

  /**
   * Checks if an intent nonce or voucher token has already been published/used.
   * If not seen, records it with TTL.
   */
  checkAndRecord(nonce: string, ttlMs: number = 300_000): boolean {
    const now = Date.now();
    this.evictExpired(now);

    if (this.seenVouchers.has(nonce)) {
      logger.warn('Replay attack detected: nonce or voucher token already present in registry', {
        nonce: sanitizeForLogging(nonce),
        registrySize: this.seenVouchers.size,
      });
      return false; // Replay detected!
    }

    this.seenVouchers.set(nonce, now + ttlMs);
    logger.debug('Registered nonce in replay protection cache', {
      nonce: sanitizeForLogging(nonce),
      ttlMs,
      expiresAt: new Date(now + ttlMs).toISOString(),
      registrySize: this.seenVouchers.size,
    });
    return true;
  }

  has(nonce: string): boolean {
    const expiresAt = this.seenVouchers.get(nonce);
    if (!expiresAt) {
      logger.debug('Replay cache lookup: nonce not found', { nonce: sanitizeForLogging(nonce) });
      return false;
    }
    if (expiresAt < Date.now()) {
      this.seenVouchers.delete(nonce);
      logger.debug('Replay cache lookup: nonce expired and evicted', { nonce: sanitizeForLogging(nonce) });
      return false;
    }
    logger.debug('Replay cache lookup: active nonce found', { nonce: sanitizeForLogging(nonce) });
    return true;
  }

  clear(): void {
    const count = this.seenVouchers.size;
    this.seenVouchers.clear();
    logger.info('Cleared voucher replay registry', { clearedCount: count });
  }

  private evictExpired(now: number): void {
    let evictedCount = 0;
    for (const [id, expiresAt] of this.seenVouchers.entries()) {
      if (expiresAt < now) {
        this.seenVouchers.delete(id);
        evictedCount++;
      }
    }
    if (evictedCount > 0) {
      logger.debug('Evicted expired nonces from replay registry', { evictedCount, remaining: this.seenVouchers.size });
    }
  }
}

export const defaultVoucherReplayRegistry = new VoucherReplayProtectionRegistry();

/**
 * Zod input schema for publishing synthetic intents.
 * Validates integer amounts and required fields.
 */
export const IntentPublishInputSchema = z.object({
  mandate_id: z.string().min(1).max(64),
  channel3_product_id: z.string().min(1).max(64),
  merchant_domain: z.string().min(1).max(128),
  retail_offer_cents: z.number().int().positive().refine((n) => Number.isSafeInteger(n)),
  buyer_bid_cents: z.number().int().positive().refine((n) => Number.isSafeInteger(n)),
  buyer_budget_cap_cents: z.number().int().positive().refine((n) => Number.isSafeInteger(n)).optional(),
  commission_rebate_rate: z.number().min(0).max(1).optional(),
  merchant_min_floor_discount_pct: z.number().min(0).max(1).optional(),
  idempotency_nonce: z.string().min(8).max(128).optional(),
});

export type IntentPublishInput = z.infer<typeof IntentPublishInputSchema>;

/**
 * Publicly visible Intent Voucher payload.
 * SECURITY CONSTRAINT: Floor price and internal margins MUST NEVER be disclosed.
 */
export interface PublishedIntentVoucher {
  voucher_id: string;
  nonce: string;
  mandate_id: string;
  channel3_product_id: string;
  merchant_domain: string;
  retail_offer_cents: number;
  buyer_bid_cents: number;
  status: 'BROADCASTED' | 'MATCHED' | 'REJECTED';
  created_at: string;
  expires_at: string;
  setup_token_id?: string;
  // NOTE: merchant_min_floor_cents or internal margin percentages are explicitly OMITTED.
}

export interface IntentPublishOutput {
  success: boolean;
  voucher?: PublishedIntentVoucher;
  error?: string;
  error_code?: string;
}

/**
 * Publishes synthetic intent vouchers while enforcing:
 * 1. Zero Floor Price Disclosure: Internal minimum clearing thresholds/floors are calculated
 *    privately to determine match eligibility but are NEVER leaked to external callers.
 * 2. Voucher Replay Attack Defense: Single-use cryptographic nonces and voucher IDs are validated
 *    against the replay registry.
 */
export async function handleIntentPublish(
  rawArgs: unknown,
  replayRegistry: VoucherReplayProtectionRegistry = defaultVoucherReplayRegistry
): Promise<IntentPublishOutput> {
  logger.info('Evaluating intent publish request', { rawArgs: sanitizeForLogging(rawArgs) });

  try {
    const parsed = IntentPublishInputSchema.safeParse(rawArgs);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'ERR_INVALID_INTENT_ARGUMENTS';
      logger.warn('Intent publish schema validation failed', {
        primaryError: msg,
        issues: parsed.error.issues,
      });
      return {
        success: false,
        error: msg,
        error_code: 'ERR_INVALID_ARGUMENTS',
      };
    }

    const data = parsed.data;

    // Replay Attack Defense: Check and register idempotency nonce if provided
    const nonce = data.idempotency_nonce || crypto.randomUUID();
    logger.debug('Checking replay protection registry for nonce', { nonce: sanitizeForLogging(nonce) });
    const replayAllowed = replayRegistry.checkAndRecord(nonce, 300_000); // 5 min TTL
    if (!replayAllowed) {
      logger.warn('Intent publish rejected due to nonce replay', { nonce: sanitizeForLogging(nonce) });
      return {
        success: false,
        error: 'ERR_VOUCHER_REPLAY_DETECTED: Voucher nonce has already been utilized or broadcasted.',
        error_code: 'ERR_VOUCHER_REPLAY_DETECTED',
      };
    }

    // Evaluate margin floor internally WITHOUT disclosing floor price in the response payload
    const commissionRebate = data.commission_rebate_rate ?? 0.12;
    const allowedDiscount = Math.max(data.merchant_min_floor_discount_pct ?? 0.10, commissionRebate * 0.8);
    const internalMerchantFloorCents = Math.round(data.retail_offer_cents * (1 - allowedDiscount));

    // Determine matching status based on bid vs internal floor
    const isMatched = data.buyer_bid_cents >= internalMerchantFloorCents;

    logger.info('Evaluated internal clearing margin floor against buyer bid', {
      merchantDomain: data.merchant_domain,
      retailOfferCents: data.retail_offer_cents,
      buyerBidCents: data.buyer_bid_cents,
      commissionRebate,
      allowedDiscount,
      internalFloorCentsCalculated: internalMerchantFloorCents,
      isMatched,
      decision: isMatched ? 'MATCHED' : 'BROADCASTED',
    });

    const now = new Date();
    const expires = new Date(now.getTime() + 72 * 3600 * 1000); // 72-hour window

    const voucherEntropy = crypto.randomUUID().slice(0, 12);
    const voucherId = `syn_${data.mandate_id.slice(0, 8)}_${voucherEntropy}`;
    const setupTokenId = `set_${crypto.randomUUID().slice(0, 16)}`;

    // Also register the generated voucherId against replay
    replayRegistry.checkAndRecord(voucherId, 72 * 3600 * 1000);
    logger.debug('Registered generated voucher ID in replay registry', {
      voucherId,
      expiresAt: expires.toISOString(),
    });

    // Construct response strictly omitting merchant floor price to protect merchant pricing power
    const voucher: PublishedIntentVoucher = {
      voucher_id: voucherId,
      nonce,
      mandate_id: data.mandate_id,
      channel3_product_id: data.channel3_product_id,
      merchant_domain: data.merchant_domain,
      retail_offer_cents: data.retail_offer_cents,
      buyer_bid_cents: data.buyer_bid_cents,
      status: isMatched ? 'MATCHED' : 'BROADCASTED',
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
      setup_token_id: setupTokenId,
    };

    logger.info('Synthetic intent voucher created successfully', {
      voucherId,
      mandateId: data.mandate_id,
      merchantDomain: data.merchant_domain,
      status: voucher.status,
    });

    return {
      success: true,
      voucher,
    };
  } catch (error: unknown) {
    logger.error('Unexpected error publishing intent voucher', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: 'ERR_INTENT_PUBLISH_INTERNAL_FAILURE',
      error_code: 'ERR_INTERNAL_ERROR',
    };
  }
}
