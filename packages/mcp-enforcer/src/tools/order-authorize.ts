import crypto from 'node:crypto';
import { z } from 'zod';
import { verifySessionMandateSignature } from '../ed25519-verifier.js';
import { calculateMerchantAnomalyScore, isMerchantAllowed } from '../merchant-anomaly-gate.js';
import { defaultAtomicSpendEnforcer, AtomicSpendEnforcer } from '../redis-lua-enforcer.js';
import { defaultAuditChain } from '../audit-chain.js';
import type { SpendMandate } from '@aegispay/shared-types';

/**
 * Strict Zod input schema for Order Authorization tool.
 */
export const OrderAuthorizeItemSchema = z.object({
  product_id: z.string().min(1, 'Product ID must not be empty').max(64),
  price_cents: z.number().int('Item price_cents must be an integer').positive('Item price_cents must be positive'),
  quantity: z.number().int('Item quantity must be an integer').positive('Item quantity must be positive'),
});

export const OrderAuthorizeInputSchema = z
  .object({
    idempotency_key: z
      .string()
      .min(1, 'idempotency_key cannot be empty')
      .max(128, 'idempotency_key cannot exceed 128 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'idempotency_key must contain only alphanumeric characters, dashes, and underscores')
      .optional(),
    mandate_id: z.string().min(1, 'mandate_id must not be empty').max(64),
    merchant_domain: z
      .string()
      .min(1, 'merchant_domain must not be empty')
      .max(128)
      .regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid merchant domain format'),
    requested_cents: z
      .number()
      .int('requested_cents must be an integer')
      .positive('requested_cents must be positive')
      .max(10_000_000, 'requested_cents exceeds maximum transaction boundary ($100,000.00)'),
    category_id: z.string().min(1, 'category_id must not be empty').max(64),
    items: z.array(OrderAuthorizeItemSchema).min(1, 'Items list cannot be empty').max(100, 'Cannot authorize more than 100 items per order'),
    mandate: z.custom<SpendMandate>().optional(),
    merchant_dispute_rate: z.number().min(0).max(1).optional(),
    merchant_discount_variance: z.number().min(0).max(1).optional(),
    redis_client: z.any().optional(),
    spend_enforcer: z.custom<AtomicSpendEnforcer>().optional(),
  })
  .refine(
    (data) => {
      const calculatedSum = data.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
      return data.requested_cents === calculatedSum;
    },
    {
      message: 'requested_cents must strictly equal the sum of (price_cents * quantity) across all items',
      path: ['requested_cents'],
    }
  )
  .refine(
    (data) => !data.mandate || data.requested_cents <= data.mandate.max_total_spend_cents,
    {
      message: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET: requested_cents exceeds mandate total budget cap',
      path: ['requested_cents'],
    }
  )
  .refine(
    (data) => !data.mandate || data.requested_cents <= data.mandate.max_single_merchant_cents,
    {
      message: 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP: requested_cents exceeds mandate single merchant exposure cap',
      path: ['requested_cents'],
    }
  );

export type OrderAuthorizeInput = z.infer<typeof OrderAuthorizeInputSchema>;

export interface OrderAuthorizeResult {
  success: boolean;
  order_id?: string;
  invoice_id?: string;
  status?: string;
  spent_cents?: number;
  merchant_anomaly_score?: number;
  audit_hash?: string;
  idempotent_replayed?: boolean;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Idempotency registry for order authorization requests.
 * Caches responses by idempotency key with TTL.
 */
interface IdempotencyRecord {
  result: OrderAuthorizeResult;
  expiresAt: number;
}

const IDEMPOTENCY_TTL_MS = 15 * 60 * 1000; // 15 minutes
const idempotencyStore = new Map<string, IdempotencyRecord>();

function getCachedResult(key: string): OrderAuthorizeResult | null {
  const record = idempotencyStore.get(key);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    idempotencyStore.delete(key);
    return null;
  }
  return { ...record.result, idempotent_replayed: true };
}

function setCachedResult(key: string, result: OrderAuthorizeResult): void {
  // Purge expired records periodically if map grows large
  if (idempotencyStore.size > 2000) {
    const now = Date.now();
    for (const [k, v] of idempotencyStore.entries()) {
      if (now > v.expiresAt) idempotencyStore.delete(k);
    }
  }
  idempotencyStore.set(key, {
    result,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
}

/**
 * Safe error sanitization to prevent leaking internal stack traces.
 */
function maskSafeError(err: unknown): { code: string; message: string } {
  const errMsg = err instanceof Error ? err.message : String(err);
  console.error('[MCP Enforcer:order-authorize] Masked error:', errMsg);

  if (errMsg.startsWith('ERR_') || errMsg.startsWith('ED25519_')) {
    const code = errMsg.split(':')[0].trim();
    return {
      code,
      message: errMsg,
    };
  }

  if (errMsg.includes('strictly equal')) {
    return {
      code: 'ERR_ARITHMETIC_MISMATCH',
      message: 'requested_cents must strictly equal the sum of (price_cents * quantity) across all items',
    };
  }

  return {
    code: 'ERR_AUTHORIZATION_FAILED',
    message: 'The order authorization request failed due to a processing constraint.',
  };
}

/**
 * Handles order authorization with strict verification, safe arithmetic,
 * idempotent execution guarantee, and safe error masking.
 */
export async function handleOrderAuthorize(rawArgs: unknown): Promise<OrderAuthorizeResult> {
  try {
    const parseResult = OrderAuthorizeInputSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return {
        success: false,
        error: {
          code: 'ERR_INVALID_ARGUMENT',
          message: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid authorization arguments',
        },
      };
    }

    const args = parseResult.data;

    // Determine effective idempotency key
    const effectiveIdempotencyKey =
      args.idempotency_key ||
      `auto_${args.mandate_id}_${args.merchant_domain}_${args.requested_cents}_${args.items.map((i) => `${i.product_id}:${i.quantity}`).join(',')}`;

    const cached = getCachedResult(effectiveIdempotencyKey);
    if (cached) {
      return cached;
    }

    // Stage 1: Line-item arithmetic integrity and budget cap enforcement
    if (!Number.isSafeInteger(args.requested_cents) || args.requested_cents <= 0) {
      return {
        success: false,
        error: {
          code: 'ERR_INVALID_SPEND_AMOUNT',
          message: 'requested_cents must be a positive integer',
        },
      };
    }

    for (const item of args.items) {
      if (
        !Number.isSafeInteger(item.price_cents) ||
        item.price_cents <= 0 ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return {
          success: false,
          error: {
            code: 'ERR_INVALID_ITEM_ARITHMETIC',
            message: 'Item price_cents and quantity must be positive safe integers',
          },
        };
      }
    }

    const calculatedSum = args.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
    if (args.requested_cents !== calculatedSum) {
      return {
        success: false,
        error: {
          code: 'ERR_ARITHMETIC_MISMATCH',
          message: 'requested_cents must strictly equal the sum of (price_cents * quantity) across all items',
        },
      };
    }

    if (args.mandate) {
      if (args.requested_cents > args.mandate.max_total_spend_cents) {
        return {
          success: false,
          error: {
            code: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET',
            message: 'requested_cents exceeds mandate total budget cap',
          },
        };
      }
      if (args.requested_cents > args.mandate.max_single_merchant_cents) {
        return {
          success: false,
          error: {
            code: 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP',
            message: 'requested_cents exceeds single merchant exposure cap',
          },
        };
      }

      // Stage 2: Ed25519 Cryptographic Signature Verification
      const isSignatureValid = await verifySessionMandateSignature(args.mandate);
      if (!isSignatureValid) {
        return {
          success: false,
          error: {
            code: 'ED25519_SIGNATURE_VERIFICATION_FAILED',
            message: 'Session mandate cryptographic signature is invalid or tampered',
          },
        };
      }
    }

    // Stage 3: Merchant Anomaly Gate check (reject score > 300 / 1000 basis points)
    const anomalyScore = calculateMerchantAnomalyScore({
      domain: args.merchant_domain,
      disputeRate: args.merchant_dispute_rate ?? 0,
      averageDiscountVariance: args.merchant_discount_variance ?? 0,
    });

    if (!isMerchantAllowed(anomalyScore)) {
      return {
        success: false,
        error: {
          code: 'ERR_MERCHANT_ANOMALY_THRESHOLD_EXCEEDED',
          message: `Merchant anomaly score ${anomalyScore} exceeds security threshold`,
        },
      };
    }

    // Stage 4: Single-threaded Redis Lua reserveBudget() pre-reservation
    let newSpent = args.requested_cents;
    const enforcer = args.spend_enforcer || defaultAtomicSpendEnforcer;

    if (args.redis_client) {
      const reservation = await enforcer.reserveBudget(args.redis_client, {
        mandate_id: args.mandate_id,
        merchant_domain: args.merchant_domain,
        requested_cents: args.requested_cents,
        current_unix_ms: Date.now(),
        category_id: args.category_id,
        merchant_anomaly_score: anomalyScore,
      });

      if (!reservation.success) {
        return {
          success: false,
          error: {
            code: reservation.error_code || 'ERR_BUDGET_RESERVATION_FAILED',
            message: 'Budget reservation failed against Redis Lua enforcer',
          },
        };
      }

      newSpent = reservation.new_spent ?? args.requested_cents;
    }

    const uniqueEntropy = crypto.randomUUID().slice(0, 12);
    const orderId = `ord_${args.mandate_id.slice(0, 16)}_${uniqueEntropy}`;
    const invoiceId = `inv_${args.merchant_domain.replace(/[^a-zA-Z0-9]/g, '_')}_${uniqueEntropy}`;

    // Append to immutable hash-chained audit ledger
    const auditEvent = defaultAuditChain.append({
      request_id: args.mandate_id,
      event_type: 'PAYMENT_INITIATED',
      observed: {
        mandate_id: args.mandate_id,
        merchant_domain: args.merchant_domain,
        requested_cents: args.requested_cents,
        category_id: args.category_id,
        items_count: args.items.length,
        merchant_anomaly_score: anomalyScore,
      },
      inferred: {
        status: 'AUTHORIZED',
        spent_cents: newSpent,
        order_id: orderId,
        invoice_id: invoiceId,
      },
    });

    const result: OrderAuthorizeResult = {
      success: true,
      order_id: orderId,
      invoice_id: invoiceId,
      status: 'AUTHORIZED',
      spent_cents: newSpent,
      merchant_anomaly_score: anomalyScore,
      audit_hash: auditEvent.hash,
    };

    // Cache idempotent response
    setCachedResult(effectiveIdempotencyKey, result);

    return result;
  } catch (err: unknown) {
    const masked = maskSafeError(err);
    return {
      success: false,
      error: masked,
    };
  }
}
