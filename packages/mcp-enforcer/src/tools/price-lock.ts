import crypto from 'node:crypto';
import { z } from 'zod';
import { defaultAuditChain } from '../audit-chain.js';

/**
 * Input schema for creating or checking a 72-hour price lock hold.
 */
export const PriceLockInputSchema = z.object({
  idempotency_key: z
    .string()
    .min(1, 'idempotency_key cannot be empty')
    .max(128, 'idempotency_key cannot exceed 128 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'idempotency_key must contain only alphanumeric characters, dashes, and underscores')
    .optional(),
  mandate_id: z.string().min(1, 'mandate_id must not be empty').max(64),
  product_id: z.string().min(1, 'product_id must not be empty').max(64),
  merchant_domain: z
    .string()
    .min(1, 'merchant_domain must not be empty')
    .max(128)
    .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid merchant domain format'),
  locked_price_cents: z
    .number()
    .int('locked_price_cents must be an integer')
    .positive('locked_price_cents must be greater than zero')
    .max(10_000_000, 'locked_price_cents exceeds maximum bounds ($100,000.00)'),
  hold_duration_hours: z
    .number()
    .int('hold_duration_hours must be an integer')
    .min(1, 'hold_duration_hours must be at least 1 hour')
    .max(72, 'hold_duration_hours cannot exceed 72 hours')
    .default(72),
});

export type PriceLockInput = z.infer<typeof PriceLockInputSchema>;

export interface PriceLockResult {
  success: boolean;
  lock_id?: string;
  mandate_id?: string;
  product_id?: string;
  merchant_domain?: string;
  locked_price_cents?: number;
  currency?: string;
  expires_at?: string;
  status?: string;
  audit_hash?: string;
  idempotent_replayed?: boolean;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * In-memory idempotency cache for price locks.
 */
interface PriceLockCacheEntry {
  result: PriceLockResult;
  expiresAt: number;
}

const priceLockCache = new Map<string, PriceLockCacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in-memory cache TTL

function getCachedPriceLock(key: string): PriceLockResult | null {
  const entry = priceLockCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    priceLockCache.delete(key);
    return null;
  }
  return { ...entry.result, idempotent_replayed: true };
}

function setCachedPriceLock(key: string, result: PriceLockResult): void {
  if (priceLockCache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of priceLockCache.entries()) {
      if (now > v.expiresAt) priceLockCache.delete(k);
    }
  }
  priceLockCache.set(key, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Masks unexpected errors to avoid leaking internal stack traces.
 */
function maskSafeError(err: unknown): { code: string; message: string } {
  const errMsg = err instanceof Error ? err.message : String(err);
  console.error('[MCP Enforcer:price-lock] Masked error:', errMsg);

  if (errMsg.startsWith('ERR_')) {
    const code = errMsg.split(':')[0].trim();
    return {
      code,
      message: errMsg,
    };
  }

  return {
    code: 'ERR_PRICE_LOCK_FAILED',
    message: 'The price lock operation could not be completed due to a processing constraint.',
  };
}

/**
 * Handles creation of a 72-hour guaranteed price lock hold with strict validation,
 * deterministic idempotency, and safe error masking.
 */
export async function handlePriceLock(rawArgs: unknown): Promise<PriceLockResult> {
  try {
    const parseResult = PriceLockInputSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return {
        success: false,
        error: {
          code: 'ERR_INVALID_ARGUMENT',
          message: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid price lock arguments',
        },
      };
    }

    const args = parseResult.data;

    // Determine effective idempotency key
    const effectiveKey =
      args.idempotency_key ||
      `plk_${args.mandate_id}_${args.product_id}_${args.merchant_domain}_${args.locked_price_cents}`;

    const cached = getCachedPriceLock(effectiveKey);
    if (cached) {
      return cached;
    }

    const now = Date.now();
    const durationMs = args.hold_duration_hours * 60 * 60 * 1000;
    const expiresAt = new Date(now + durationMs).toISOString();

    const uniqueEntropy = crypto.randomUUID().slice(0, 8);
    const lockId = `plk_${args.product_id.slice(0, 16)}_${uniqueEntropy}`;

    // Record immutable audit event in hash chain
    const auditEvent = defaultAuditChain.append({
      request_id: args.mandate_id,
      event_type: 'PRICE_LOCK_ESTABLISHED',
      observed: {
        lock_id: lockId,
        product_id: args.product_id,
        merchant_domain: args.merchant_domain,
        locked_price_cents: args.locked_price_cents,
        hold_duration_hours: args.hold_duration_hours,
      },
      inferred: {
        status: 'ACTIVE_PRICE_LOCK',
        expires_at: expiresAt,
      },
    });

    const result: PriceLockResult = {
      success: true,
      lock_id: lockId,
      mandate_id: args.mandate_id,
      product_id: args.product_id,
      merchant_domain: args.merchant_domain,
      locked_price_cents: args.locked_price_cents,
      currency: 'USD',
      expires_at: expiresAt,
      status: 'ACTIVE_PRICE_LOCK',
      audit_hash: auditEvent.hash,
    };

    setCachedPriceLock(effectiveKey, result);

    return result;
  } catch (err: unknown) {
    const masked = maskSafeError(err);
    return {
      success: false,
      error: masked,
    };
  }
}
