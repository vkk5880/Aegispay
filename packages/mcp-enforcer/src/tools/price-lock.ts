import crypto from 'node:crypto';
import { z } from 'zod';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { defaultAuditChain } from '../audit-chain.js';

const logger = createLogger('MCP:Enforcer:PriceLock', { stream: 'stderr' });

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
  competitor_url: z
    .string()
    .url('Invalid competitor URL format')
    .max(512, 'competitor_url cannot exceed 512 characters')
    .optional(),
  max_discount_percentage: z
    .number()
    .min(0, 'max_discount_percentage cannot be negative')
    .max(100, 'max_discount_percentage cannot exceed 100')
    .optional(),
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
  if (!entry) {
    logger.debug('Price lock cache miss', { key });
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    logger.debug('Price lock cache entry expired, purging', { key, expiresAt: entry.expiresAt });
    priceLockCache.delete(key);
    return null;
  }
  logger.info('Price lock cache hit, returning cached hold', { key, lock_id: entry.result.lock_id });
  return { ...entry.result, idempotent_replayed: true };
}

function setCachedPriceLock(key: string, result: PriceLockResult): void {
  if (priceLockCache.size > 2000) {
    const now = Date.now();
    let purgedCount = 0;
    for (const [k, v] of priceLockCache.entries()) {
      if (now > v.expiresAt) {
        priceLockCache.delete(k);
        purgedCount++;
      }
    }
    logger.debug('Pruned expired entries from price lock cache', { purgedCount, remainingSize: priceLockCache.size });
  }
  priceLockCache.set(key, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  logger.debug('Cached price lock hold in idempotency cache', { key, ttlMs: CACHE_TTL_MS });
}

/**
 * Masks unexpected errors to avoid leaking internal stack traces.
 */
function maskSafeError(err: unknown): { code: string; message: string } {
  const errMsg = err instanceof Error ? err.message : String(err);
  const errStack = err instanceof Error ? err.stack : undefined;
  logger.error('Masked price lock error', { errorMessage: errMsg, stack: errStack });

  if (errMsg.startsWith('ERR_')) {
    const code = errMsg.split(':')[0].trim();
    logger.warn('Recognized business guardrail failure in price lock', { code, message: errMsg });
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
  logger.info('Evaluating price lock hold request', sanitizeForLogging(rawArgs));
  try {
    const parseResult = PriceLockInputSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const formattedErrors = parseResult.error.format();
      logger.warn('Price lock input schema validation failed', {
        issue,
        formattedErrors,
        rawArgs: sanitizeForLogging(rawArgs),
      });
      return {
        success: false,
        error: {
          code: 'ERR_INVALID_ARGUMENT',
          message: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid price lock arguments',
        },
      };
    }

    const args = parseResult.data;
    logger.debug('Price lock input schema successfully validated', {
      mandate_id: args.mandate_id,
      product_id: args.product_id,
      merchant_domain: args.merchant_domain,
      locked_price_cents: args.locked_price_cents,
      hold_duration_hours: args.hold_duration_hours,
      has_competitor_url: Boolean(args.competitor_url),
      max_discount_percentage: args.max_discount_percentage,
    });

    // Validate hold duration bounds explicitly
    if (args.hold_duration_hours < 1 || args.hold_duration_hours > 72) {
      logger.warn('Price lock duration validation failed: out of bounds', {
        hold_duration_hours: args.hold_duration_hours,
      });
      return {
        success: false,
        error: {
          code: 'ERR_INVALID_DURATION',
          message: 'hold_duration_hours must be between 1 and 72 hours',
        },
      };
    }
    logger.debug('Hold duration validated within 1-72 hours window', {
      hold_duration_hours: args.hold_duration_hours,
    });

    // Validate price ceiling bounds ($100,000.00 max)
    if (args.locked_price_cents <= 0 || args.locked_price_cents > 10_000_000) {
      logger.warn('Price ceiling validation failed: price exceeds maximum boundary', {
        locked_price_cents: args.locked_price_cents,
      });
      return {
        success: false,
        error: {
          code: 'ERR_PRICE_OUT_OF_BOUNDS',
          message: 'locked_price_cents must be between 1 and 10,000,000 cents ($100,000.00)',
        },
      };
    }
    logger.debug('Price ceiling validated within bounds', {
      locked_price_cents: args.locked_price_cents,
    });

    // Validate competitor URL if supplied
    if (args.competitor_url) {
      logger.debug('Validating competitor URL format and protocol', {
        competitor_url: args.competitor_url,
      });
      try {
        const parsedUrl = new URL(args.competitor_url);
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          logger.warn('Competitor URL protocol rejected: only http and https allowed', {
            protocol: parsedUrl.protocol,
          });
          return {
            success: false,
            error: {
              code: 'ERR_INVALID_COMPETITOR_URL',
              message: 'competitor_url must use http or https protocol',
            },
          };
        }
        logger.debug('Competitor URL protocol verified', { protocol: parsedUrl.protocol, host: parsedUrl.host });
      } catch (urlErr) {
        logger.warn('Competitor URL failed parsing', {
          competitor_url: args.competitor_url,
          error: urlErr instanceof Error ? urlErr.message : String(urlErr),
        });
        return {
          success: false,
          error: {
            code: 'ERR_INVALID_COMPETITOR_URL',
            message: 'competitor_url is not a valid URL',
          },
        };
      }
    }

    // Check discount limit constraints if provided
    if (args.max_discount_percentage !== undefined) {
      logger.debug('Evaluating discount limit constraint', {
        max_discount_percentage: args.max_discount_percentage,
      });
      if (args.max_discount_percentage > 85) {
        logger.warn('Discount limit rejection: maximum discount percentage exceeds safety threshold of 85%', {
          max_discount_percentage: args.max_discount_percentage,
        });
        return {
          success: false,
          error: {
            code: 'ERR_DISCOUNT_LIMIT_EXCEEDED',
            message: 'max_discount_percentage cannot exceed 85% safety threshold',
          },
        };
      }
      logger.debug('Discount limit verified within safety bounds', {
        max_discount_percentage: args.max_discount_percentage,
      });
    }

    // Determine effective idempotency key
    const effectiveKey =
      args.idempotency_key ||
      `plk_${args.mandate_id}_${args.product_id}_${args.merchant_domain}_${args.locked_price_cents}`;
    logger.debug('Resolved price lock idempotency key', {
      isClientProvided: Boolean(args.idempotency_key),
      effectiveKey,
    });

    const cached = getCachedPriceLock(effectiveKey);
    if (cached) {
      logger.info('Returning cached price lock response', {
        effectiveKey,
        lock_id: cached.lock_id,
      });
      return cached;
    }

    const now = Date.now();
    const durationMs = args.hold_duration_hours * 60 * 60 * 1000;
    const expiresAt = new Date(now + durationMs).toISOString();
    logger.debug('Calculated price lock expiration timestamp', {
      now: new Date(now).toISOString(),
      durationMs,
      expiresAt,
    });

    const uniqueEntropy = crypto.randomUUID().slice(0, 8);
    const lockId = `plk_${args.product_id.slice(0, 16)}_${uniqueEntropy}`;
    logger.debug('Generated unique price lock identifier', { lockId, uniqueEntropy });

    // Record immutable audit event in hash chain
    logger.debug('Appending PRICE_LOCK_ESTABLISHED event to immutable audit chain', {
      lockId,
      mandate_id: args.mandate_id,
      product_id: args.product_id,
      locked_price_cents: args.locked_price_cents,
    });
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
    logger.info('Audit event appended for price lock', {
      auditHash: auditEvent.hash,
      seq: auditEvent.seq,
      eventId: auditEvent.event_id,
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
    logger.info('Price lock hold established successfully', {
      lock_id: lockId,
      expires_at: expiresAt,
      locked_price_cents: args.locked_price_cents,
      audit_hash: auditEvent.hash,
    });

    return result;
  } catch (err: unknown) {
    logger.error('Unexpected exception during handlePriceLock execution', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    const masked = maskSafeError(err);
    return {
      success: false,
      error: masked,
    };
  }
}
