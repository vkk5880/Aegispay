import { z } from 'zod';
import type { SpendMandate } from '@aegispay/shared-types';
import { verifySessionMandateSignature } from '../ed25519-verifier.js';
import { defaultAtomicSpendEnforcer, AtomicSpendEnforcer } from '../redis-lua-enforcer.js';

/**
 * Sanitizes an object before stderr logging to avoid exposing tokens or keys.
 */
function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(clone)) {
    if (typeof clone[key] === 'string') {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('signature') ||
        lowerKey.includes('auth') ||
        lowerKey.includes('key')
      ) {
        clone[key] = '[REDACTED]';
      }
    } else if (typeof clone[key] === 'object' && clone[key] !== null) {
      clone[key] = sanitizeForLogging(clone[key]);
    }
  }
  return clone;
}

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
  console.error('[SpendCheck Tool] Validating spend-check request...', sanitizeForLogging(rawArgs));

  const parseResult = SpendCheckInputSchema.safeParse(rawArgs);
  if (!parseResult.success) {
    const primaryError = parseResult.error.issues[0]?.message || 'ERR_INVALID_ARGUMENTS';
    return {
      allowed: false,
      status: 'REJECTED',
      mandate_id: (rawArgs as any)?.mandate_token || 'UNKNOWN',
      requested_cents: typeof (rawArgs as any)?.requested_cents === 'number' ? (rawArgs as any).requested_cents : 0,
      reason: primaryError,
      error_code: primaryError.split(':')[0].trim(),
    };
  }

  const args = parseResult.data;

  // Validate mandate object if supplied
  if (args.mandate) {
    if (args.mandate.mandate_id !== args.mandate_token) {
      return {
        allowed: false,
        status: 'REJECTED',
        mandate_id: args.mandate_token,
        requested_cents: args.requested_cents,
        reason: 'ERR_MANDATE_TOKEN_MISMATCH: mandate_token does not match mandate.mandate_id',
        error_code: 'ERR_MANDATE_TOKEN_MISMATCH',
      };
    }

    if (args.requested_cents > args.mandate.max_total_spend_cents) {
      return {
        allowed: false,
        status: 'REJECTED',
        mandate_id: args.mandate_token,
        requested_cents: args.requested_cents,
        reason: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET: requested amount exceeds total budget cap',
        error_code: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET',
      };
    }

    if (args.requested_cents > args.mandate.max_single_merchant_cents) {
      return {
        allowed: false,
        status: 'REJECTED',
        mandate_id: args.mandate_token,
        requested_cents: args.requested_cents,
        reason: 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP: requested amount exceeds merchant cap',
        error_code: 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP',
      };
    }

    const isSigValid = await verifySessionMandateSignature(args.mandate);
    if (!isSigValid) {
      return {
        allowed: false,
        status: 'REJECTED',
        mandate_id: args.mandate_token,
        requested_cents: args.requested_cents,
        reason: 'ERR_ED25519_SIGNATURE_INVALID: Mandate cryptographic signature verification failed',
        error_code: 'ERR_ED25519_SIGNATURE_INVALID',
      };
    }
  }

  // Check Redis Lua atomic budget if client provided
  if (args.redis_client) {
    const enforcer = args.spend_enforcer || defaultAtomicSpendEnforcer;
    const reservation = await enforcer.reserveBudget(args.redis_client, {
      mandate_id: args.mandate_token,
      merchant_domain: args.merchant_domain,
      requested_cents: args.requested_cents,
      current_unix_ms: Date.now(),
      category_id: args.category_id || 'general',
      merchant_anomaly_score: 0,
    });

    if (!reservation.success) {
      return {
        allowed: false,
        status: 'REJECTED',
        mandate_id: args.mandate_token,
        requested_cents: args.requested_cents,
        reason: reservation.error_code || 'ERR_BUDGET_RESERVATION_FAILED',
        error_code: reservation.error_code || 'ERR_BUDGET_RESERVATION_FAILED',
      };
    }

    const remaining = args.mandate
      ? Math.max(0, args.mandate.max_total_spend_cents - (reservation.new_spent ?? args.requested_cents))
      : undefined;

    return {
      allowed: true,
      status: 'APPROVED',
      mandate_id: args.mandate_token,
      requested_cents: args.requested_cents,
      remaining_cents: remaining,
    };
  }

  const remainingCents = args.mandate
    ? Math.max(0, args.mandate.max_total_spend_cents - args.requested_cents)
    : undefined;

  return {
    allowed: true,
    status: 'APPROVED',
    mandate_id: args.mandate_token,
    requested_cents: args.requested_cents,
    remaining_cents: remainingCents,
  };
}
