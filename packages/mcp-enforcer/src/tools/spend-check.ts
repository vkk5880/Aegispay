import { z } from 'zod';
import type { SpendMandate } from '@aegispay/shared-types';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { verifySessionMandateSignature } from '../ed25519-verifier.js';
import { defaultAtomicSpendEnforcer, AtomicSpendEnforcer } from '../redis-lua-enforcer.js';

const logger = createLogger('MCP:Enforcer:SpendCheck', { stream: 'stderr' });

/**
 * Zod schema for spend-check tool arguments.
 * Enforces:
 * - Rejecting negative cents and zero values (must be positive safe integer).
 * - Rejecting missing or blank mandate tokens/IDs.
 */
export const SpendCheckInputSchema = z.object({
  mandate_token: z
    .string({ required_error: 'ERR_MISSING_MANDATE_TOKEN: mandate_token is required' })
    .min(1, 'ERR_MISSING_MANDATE_TOKEN: mandate_token must not be empty')
    .max(256),
  requested_cents: z
    .number({ required_error: 'ERR_INVALID_SPEND_AMOUNT: requested_cents is required' })
    .int('ERR_INVALID_SPEND_AMOUNT: requested_cents must be an integer')
    .positive('ERR_INVALID_SPEND_AMOUNT: requested_cents must be greater than zero')
    .refine((val) => Number.isSafeInteger(val), {
      message: 'ERR_INVALID_SPEND_AMOUNT: requested_cents must be a safe integer',
    }),
  merchant_domain: z.string().min(1).max(128),
  category_id: z.string().min(1).optional(),
  mandate: z.custom<SpendMandate>().optional(),
  redis_client: z.any().optional(),
  spend_enforcer: z.custom<AtomicSpendEnforcer>().optional(),
});

export type SpendCheckInput = z.infer<typeof SpendCheckInputSchema>;

export interface SpendCheckOutput {
  allowed: boolean;
  status: 'APPROVED' | 'REJECTED';
  mandate_id: string;
  requested_cents: number;
  remaining_cents?: number;
  reason?: string;
  error_code?: string;
}

/**
 * Handles spend check evaluation against cryptographic mandate rules and Redis Lua atomic budgets.
 * Never outputs to stdout; logs diagnostic traces solely to stderr.
 */
export async function handleSpendCheck(rawArgs: unknown): Promise<SpendCheckOutput> {
  logger.info('Evaluating spend-check request', sanitizeForLogging(rawArgs));
  try {
    const parseResult = SpendCheckInputSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const primaryError = parseResult.error.issues[0]?.message || 'ERR_INVALID_ARGUMENTS';
      const errorCode = primaryError.split(':')[0].trim();
      const formattedErrors = parseResult.error.format();
      logger.warn('Spend check schema validation failed', {
        primaryError,
        errorCode,
        formattedErrors,
        rawArgs: sanitizeForLogging(rawArgs),
      });
      return {
        allowed: false,
        status: 'REJECTED',
        mandate_id: (rawArgs as any)?.mandate_token || 'UNKNOWN',
        requested_cents: typeof (rawArgs as any)?.requested_cents === 'number' ? (rawArgs as any).requested_cents : 0,
        reason: primaryError,
        error_code: errorCode,
      };
    }

    const args = parseResult.data;
    logger.debug('Spend check schema successfully validated', {
      mandate_token: args.mandate_token,
      merchant_domain: args.merchant_domain,
      requested_cents: args.requested_cents,
      category_id: args.category_id ?? 'general',
      has_mandate_obj: Boolean(args.mandate),
      has_redis_client: Boolean(args.redis_client),
    });

    // Validate mandate object if supplied
    if (args.mandate) {
      logger.debug('Evaluating spend check constraints against attached mandate object', {
        mandate_token: args.mandate_token,
        mandate_id: args.mandate.mandate_id,
        max_total_spend_cents: args.mandate.max_total_spend_cents,
        max_single_merchant_cents: args.mandate.max_single_merchant_cents,
        allowed_category_ids: args.mandate.allowed_category_ids,
        expires_at: args.mandate.expires_at,
        status: args.mandate.status,
      });

      // 1. Mandate ID match check
      if (args.mandate.mandate_id !== args.mandate_token) {
        logger.warn('Spend check rejected: mandate_token does not match mandate.mandate_id', {
          mandate_token: args.mandate_token,
          mandate_id: args.mandate.mandate_id,
        });
        return {
          allowed: false,
          status: 'REJECTED',
          mandate_id: args.mandate_token,
          requested_cents: args.requested_cents,
          reason: 'ERR_MANDATE_TOKEN_MISMATCH: mandate_token does not match mandate.mandate_id',
          error_code: 'ERR_MANDATE_TOKEN_MISMATCH',
        };
      }
      logger.debug('Mandate token match verified', { mandate_token: args.mandate_token });

      // 2. Buyer public key formatting check
      if (args.mandate.public_key_hex) {
        const isHex = /^[0-9a-fA-F]{64}$/.test(args.mandate.public_key_hex);
        logger.debug('Validating buyer public key formatting', {
          length: args.mandate.public_key_hex.length,
          isValidHex32Byte: isHex,
        });
        if (!isHex) {
          logger.warn('Spend check warning: buyer public_key_hex is not 64 hex characters (32 bytes)', {
            length: args.mandate.public_key_hex.length,
          });
        }
      }

      // 3. Category array constraints check
      if (args.category_id && args.mandate.allowed_category_ids && Array.isArray(args.mandate.allowed_category_ids)) {
        logger.debug('Checking category authorization against allowed categories', {
          requested_category: args.category_id,
          allowed_categories: args.mandate.allowed_category_ids,
        });
        const isWildcard = args.mandate.allowed_category_ids.includes('*');
        const isAllowed = isWildcard || args.mandate.allowed_category_ids.includes(args.category_id);
        if (!isAllowed) {
          logger.warn('Spend check rejected: category not allowed by mandate policy', {
            requested_category: args.category_id,
            allowed_categories: args.mandate.allowed_category_ids,
          });
          return {
            allowed: false,
            status: 'REJECTED',
            mandate_id: args.mandate_token,
            requested_cents: args.requested_cents,
            reason: `ERR_CATEGORY_NOT_AUTHORIZED: Category ${args.category_id} is not in allowed categories`,
            error_code: 'ERR_CATEGORY_NOT_AUTHORIZED',
          };
        }
        logger.debug('Category authorization passed', { category_id: args.category_id });
      }

      // 4. Mandate expiration check
      if (args.mandate.expires_at) {
        const expDate = new Date(args.mandate.expires_at);
        const isExpired = Date.now() > expDate.getTime();
        logger.debug('Checking mandate expiration', {
          expires_at: args.mandate.expires_at,
          now: new Date().toISOString(),
          isExpired,
        });
        if (isExpired) {
          logger.warn('Spend check rejected: mandate has expired', {
            expires_at: args.mandate.expires_at,
          });
          return {
            allowed: false,
            status: 'REJECTED',
            mandate_id: args.mandate_token,
            requested_cents: args.requested_cents,
            reason: 'ERR_MANDATE_EXPIRED: Spend mandate validity window has elapsed',
            error_code: 'ERR_MANDATE_EXPIRED',
          };
        }
      }

      // 5. Total budget cap check
      if (args.requested_cents > args.mandate.max_total_spend_cents) {
        logger.warn('Spend check rejected: requested amount exceeds total budget cap', {
          requested_cents: args.requested_cents,
          max_total_spend_cents: args.mandate.max_total_spend_cents,
        });
        return {
          allowed: false,
          status: 'REJECTED',
          mandate_id: args.mandate_token,
          requested_cents: args.requested_cents,
          reason: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET: requested amount exceeds total budget cap',
          error_code: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET',
        };
      }
      logger.debug('Total budget cap check passed', {
        requested_cents: args.requested_cents,
        max_total_spend_cents: args.mandate.max_total_spend_cents,
      });

      // 6. Single merchant exposure cap check
      if (args.requested_cents > args.mandate.max_single_merchant_cents) {
        logger.warn('Spend check rejected: requested amount exceeds merchant cap', {
          requested_cents: args.requested_cents,
          max_single_merchant_cents: args.mandate.max_single_merchant_cents,
        });
        return {
          allowed: false,
          status: 'REJECTED',
          mandate_id: args.mandate_token,
          requested_cents: args.requested_cents,
          reason: 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP: requested amount exceeds merchant cap',
          error_code: 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP',
        };
      }
      logger.debug('Single merchant exposure cap check passed', {
        requested_cents: args.requested_cents,
        max_single_merchant_cents: args.mandate.max_single_merchant_cents,
      });

      // 7. Ed25519 Cryptographic Signature Check
      logger.debug('Verifying Ed25519 signature on mandate', { mandate_id: args.mandate.mandate_id });
      const isSigValid = await verifySessionMandateSignature(args.mandate);
      logger.info('Ed25519 signature verification result', {
        mandate_id: args.mandate.mandate_id,
        isSigValid,
      });
      if (!isSigValid) {
        logger.error('Spend check rejected: Ed25519 cryptographic signature verification failed', {
          mandate_id: args.mandate.mandate_id,
        });
        return {
          allowed: false,
          status: 'REJECTED',
          mandate_id: args.mandate_token,
          requested_cents: args.requested_cents,
          reason: 'ERR_ED25519_SIGNATURE_INVALID: Mandate cryptographic signature verification failed',
          error_code: 'ERR_ED25519_SIGNATURE_INVALID',
        };
      }
    } else {
      logger.debug('No inline spend mandate object provided for spend check; evaluating direct checks');
    }

    // Check Redis Lua atomic budget if client provided
    if (args.redis_client) {
      logger.debug('Executing atomic Redis Lua spend budget reservation test', {
        mandate_token: args.mandate_token,
        merchant_domain: args.merchant_domain,
        requested_cents: args.requested_cents,
      });
      const enforcer = args.spend_enforcer || defaultAtomicSpendEnforcer;
      const reservation = await enforcer.reserveBudget(args.redis_client, {
        mandate_id: args.mandate_token,
        merchant_domain: args.merchant_domain,
        requested_cents: args.requested_cents,
        current_unix_ms: Date.now(),
        category_id: args.category_id || 'general',
        merchant_anomaly_score: 0,
      });

      logger.info('Redis Lua reservation outcome for spend check', {
        mandate_token: args.mandate_token,
        success: reservation.success,
        new_spent: reservation.new_spent,
        error_code: reservation.error_code,
      });

      if (!reservation.success) {
        const errCode = reservation.error_code || 'ERR_BUDGET_RESERVATION_FAILED';
        logger.warn('Spend check rejected by Redis Lua enforcer', {
          mandate_token: args.mandate_token,
          error_code: errCode,
        });
        return {
          allowed: false,
          status: 'REJECTED',
          mandate_id: args.mandate_token,
          requested_cents: args.requested_cents,
          reason: errCode,
          error_code: errCode,
        };
      }

      const remaining = args.mandate
        ? Math.max(0, args.mandate.max_total_spend_cents - (reservation.new_spent ?? args.requested_cents))
        : undefined;

      logger.info('Spend check APPROVED via Redis Lua enforcer', {
        mandate_id: args.mandate_token,
        requested_cents: args.requested_cents,
        remaining_cents: remaining,
      });

      return {
        allowed: true,
        status: 'APPROVED',
        mandate_id: args.mandate_token,
        requested_cents: args.requested_cents,
        remaining_cents: remaining,
      };
    } else {
      logger.debug('No active Redis client provided; calculating remaining budget from mandate limits');
    }

    const remainingCents = args.mandate
      ? Math.max(0, args.mandate.max_total_spend_cents - args.requested_cents)
      : undefined;

    logger.info('Spend check APPROVED under policy parameters', {
      mandate_id: args.mandate_token,
      requested_cents: args.requested_cents,
      remaining_cents: remainingCents,
    });

    return {
      allowed: true,
      status: 'APPROVED',
      mandate_id: args.mandate_token,
      requested_cents: args.requested_cents,
      remaining_cents: remainingCents,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    logger.error('Unexpected exception during handleSpendCheck execution', {
      error: errorMsg,
      stack: errorStack,
      rawArgs: sanitizeForLogging(rawArgs),
    });
    return {
      allowed: false,
      status: 'REJECTED',
      mandate_id: (rawArgs as any)?.mandate_token || 'UNKNOWN',
      requested_cents: typeof (rawArgs as any)?.requested_cents === 'number' ? (rawArgs as any).requested_cents : 0,
      reason: 'ERR_SPEND_CHECK_FAILED: An internal error occurred during spend verification',
      error_code: 'ERR_SPEND_CHECK_FAILED',
    };
  }
}
