import crypto from 'node:crypto';
import { z } from 'zod';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { verifySessionMandateSignature } from '../ed25519-verifier.js';
import { calculateMerchantAnomalyScore, isMerchantAllowed } from '../merchant-anomaly-gate.js';
import { defaultAtomicSpendEnforcer, AtomicSpendEnforcer } from '../redis-lua-enforcer.js';
import { defaultAuditChain } from '../audit-chain.js';
import type { SpendMandate } from '@aegispay/shared-types';

const logger = createLogger('MCP:Enforcer:OrderAuthorize', { stream: 'stderr' });

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
    currency_code: z.string().length(3, 'currency_code must be a 3-letter ISO-4217 code').default('USD').optional(),
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
  if (!record) {
    logger.debug('Idempotency cache miss', { key });
    return null;
  }
  if (Date.now() > record.expiresAt) {
    logger.debug('Idempotency cache entry expired, purging', { key, expiresAt: record.expiresAt });
    idempotencyStore.delete(key);
    return null;
  }
  logger.info('Idempotency cache hit, replaying cached order authorization', { key });
  return { ...record.result, idempotent_replayed: true };
}

function setCachedResult(key: string, result: OrderAuthorizeResult): void {
  // Purge expired records periodically if map grows large
  if (idempotencyStore.size > 2000) {
    const now = Date.now();
    let purgedCount = 0;
    for (const [k, v] of idempotencyStore.entries()) {
      if (now > v.expiresAt) {
        idempotencyStore.delete(k);
        purgedCount++;
      }
    }
    logger.debug('Pruned expired entries from idempotency store', { purgedCount, remainingSize: idempotencyStore.size });
  }
  idempotencyStore.set(key, {
    result,
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
  });
  logger.debug('Cached order authorization response in idempotency store', { key, ttlMs: IDEMPOTENCY_TTL_MS });
}

/**
 * Safe error sanitization to prevent leaking internal stack traces.
 */
function maskSafeError(err: unknown): { code: string; message: string } {
  const errMsg = err instanceof Error ? err.message : String(err);
  const errStack = err instanceof Error ? err.stack : undefined;
  logger.error('Masked order authorization error', { errorMessage: errMsg, stack: errStack });

  if (errMsg.startsWith('ERR_') || errMsg.startsWith('ED25519_')) {
    const code = errMsg.split(':')[0].trim();
    logger.warn('Recognized business guardrail failure in order authorization', { code, message: errMsg });
    return {
      code,
      message: errMsg,
    };
  }

  if (errMsg.includes('strictly equal')) {
    logger.warn('Arithmetic mismatch in order authorization items calculation', { message: errMsg });
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
  logger.info('Evaluating order authorization request', sanitizeForLogging(rawArgs));
  try {
    const parseResult = OrderAuthorizeInputSchema.safeParse(rawArgs);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      const formattedErrors = parseResult.error.format();
      logger.warn('Order authorization input schema validation failed', {
        issue,
        formattedErrors,
        rawArgs: sanitizeForLogging(rawArgs),
      });
      return {
        success: false,
        error: {
          code: 'ERR_INVALID_ARGUMENT',
          message: issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid authorization arguments',
        },
      };
    }

    const args = parseResult.data;
    logger.debug('Order authorization schema successfully validated', {
      mandate_id: args.mandate_id,
      merchant_domain: args.merchant_domain,
      requested_cents: args.requested_cents,
      category_id: args.category_id,
      currency_code: args.currency_code ?? 'USD',
      item_count: args.items.length,
      has_mandate_obj: Boolean(args.mandate),
      has_redis_client: Boolean(args.redis_client),
    });

    // Validate currency code format if present
    const currency = (args.currency_code ?? 'USD').toUpperCase();
    if (currency !== 'USD') {
      logger.warn('Non-USD currency provided for order authorization', { currency });
    } else {
      logger.debug('Currency validation passed', { currency });
    }

    // Determine effective idempotency key
    const effectiveIdempotencyKey =
      args.idempotency_key ||
      `auto_${args.mandate_id}_${args.merchant_domain}_${args.requested_cents}_${args.items.map((i) => `${i.product_id}:${i.quantity}`).join(',')}`;
    logger.debug('Resolved effective idempotency key', {
      isClientProvided: Boolean(args.idempotency_key),
      effectiveIdempotencyKey,
    });

    const cached = getCachedResult(effectiveIdempotencyKey);
    if (cached) {
      logger.info('Returning cached order authorization result', {
        effectiveIdempotencyKey,
        order_id: cached.order_id,
      });
      return cached;
    }

    // Stage 1: Line-item arithmetic integrity and budget cap enforcement
    logger.debug('Stage 1: Line-item arithmetic and purchase unit amount check', {
      requested_cents: args.requested_cents,
      item_count: args.items.length,
    });

    if (!Number.isSafeInteger(args.requested_cents) || args.requested_cents <= 0) {
      logger.error('Order authorization rejected: requested_cents is not a positive safe integer', {
        requested_cents: args.requested_cents,
      });
      return {
        success: false,
        error: {
          code: 'ERR_INVALID_SPEND_AMOUNT',
          message: 'requested_cents must be a positive integer',
        },
      };
    }

    for (let i = 0; i < args.items.length; i++) {
      const item = args.items[i];
      logger.debug(`Validating item [${i}] breakdown`, {
        index: i,
        product_id: item.product_id,
        price_cents: item.price_cents,
        quantity: item.quantity,
        line_total_cents: item.price_cents * item.quantity,
      });

      if (
        !Number.isSafeInteger(item.price_cents) ||
        item.price_cents <= 0 ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        logger.error('Order authorization rejected: invalid item price or quantity bounds', {
          index: i,
          item,
        });
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
    logger.debug('Calculated total sum of order items', {
      calculatedSum,
      requested_cents: args.requested_cents,
      match: calculatedSum === args.requested_cents,
    });

    if (args.requested_cents !== calculatedSum) {
      logger.error('Order authorization rejected: arithmetic mismatch between items and requested_cents', {
        requested_cents: args.requested_cents,
        calculatedSum,
        difference: args.requested_cents - calculatedSum,
      });
      return {
        success: false,
        error: {
          code: 'ERR_ARITHMETIC_MISMATCH',
          message: 'requested_cents must strictly equal the sum of (price_cents * quantity) across all items',
        },
      };
    }

    if (args.mandate) {
      logger.debug('Evaluating spend limits against attached mandate object', {
        mandate_id: args.mandate.mandate_id,
        max_total_spend_cents: args.mandate.max_total_spend_cents,
        max_single_merchant_cents: args.mandate.max_single_merchant_cents,
        cumulative_spent_cents: args.mandate.cumulative_spent_cents,
        requested_cents: args.requested_cents,
      });

      if (args.requested_cents > args.mandate.max_total_spend_cents) {
        logger.warn('Order authorization rejected: total mandate budget cap exceeded', {
          requested_cents: args.requested_cents,
          max_total_spend_cents: args.mandate.max_total_spend_cents,
        });
        return {
          success: false,
          error: {
            code: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET',
            message: 'requested_cents exceeds mandate total budget cap',
          },
        };
      }

      if (args.requested_cents > args.mandate.max_single_merchant_cents) {
        logger.warn('Order authorization rejected: single merchant exposure cap exceeded', {
          requested_cents: args.requested_cents,
          max_single_merchant_cents: args.mandate.max_single_merchant_cents,
        });
        return {
          success: false,
          error: {
            code: 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP',
            message: 'requested_cents exceeds single merchant exposure cap',
          },
        };
      }

      // Stage 2: Ed25519 Cryptographic Signature Verification
      logger.debug('Stage 2: Verifying Ed25519 cryptographic mandate signature', {
        mandate_id: args.mandate.mandate_id,
      });
      const isSignatureValid = await verifySessionMandateSignature(args.mandate);
      logger.info('Ed25519 mandate signature verification completed', {
        mandate_id: args.mandate.mandate_id,
        isSignatureValid,
      });

      if (!isSignatureValid) {
        logger.error('Order authorization rejected: invalid or tampered Ed25519 signature', {
          mandate_id: args.mandate.mandate_id,
        });
        return {
          success: false,
          error: {
            code: 'ED25519_SIGNATURE_VERIFICATION_FAILED',
            message: 'Session mandate cryptographic signature is invalid or tampered',
          },
        };
      }
    } else {
      logger.debug('No inline spend mandate object provided, skipping cryptographic signature check');
    }

    // Stage 3: Merchant Anomaly Gate check (reject score > 300 / 1000 basis points)
    logger.debug('Stage 3: Evaluating merchant anomaly gate score', {
      merchant_domain: args.merchant_domain,
      dispute_rate: args.merchant_dispute_rate ?? 0,
      discount_variance: args.merchant_discount_variance ?? 0,
    });
    const anomalyScore = calculateMerchantAnomalyScore({
      domain: args.merchant_domain,
      disputeRate: args.merchant_dispute_rate ?? 0,
      averageDiscountVariance: args.merchant_discount_variance ?? 0,
    });
    const merchantAllowed = isMerchantAllowed(anomalyScore);
    logger.info('Merchant anomaly score calculated', {
      merchant_domain: args.merchant_domain,
      anomalyScore,
      merchantAllowed,
      threshold: 300,
    });

    if (!merchantAllowed) {
      logger.warn('Order authorization rejected: merchant anomaly score exceeds security threshold', {
        merchant_domain: args.merchant_domain,
        anomalyScore,
        threshold: 300,
      });
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
      logger.debug('Stage 4: Executing atomic Redis Lua spend budget reservation', {
        mandate_id: args.mandate_id,
        merchant_domain: args.merchant_domain,
        requested_cents: args.requested_cents,
        category_id: args.category_id,
      });
      const reservation = await enforcer.reserveBudget(args.redis_client, {
        mandate_id: args.mandate_id,
        merchant_domain: args.merchant_domain,
        requested_cents: args.requested_cents,
        current_unix_ms: Date.now(),
        category_id: args.category_id,
        merchant_anomaly_score: anomalyScore,
      });

      logger.info('Redis Lua budget reservation response', {
        mandate_id: args.mandate_id,
        success: reservation.success,
        new_spent: reservation.new_spent,
        error_code: reservation.error_code,
      });

      if (!reservation.success) {
        logger.warn('Order authorization rejected: Redis Lua budget reservation failed', {
          mandate_id: args.mandate_id,
          error_code: reservation.error_code,
        });
        return {
          success: false,
          error: {
            code: reservation.error_code || 'ERR_BUDGET_RESERVATION_FAILED',
            message: 'Budget reservation failed against Redis Lua enforcer',
          },
        };
      }

      newSpent = reservation.new_spent ?? args.requested_cents;
    } else {
      logger.debug('Stage 4 Skipped: No active Redis client provided; proceeding with local reservation simulation', {
        newSpent,
      });
    }

    const uniqueEntropy = crypto.randomUUID().slice(0, 12);
    const orderId = `ord_${args.mandate_id.slice(0, 16)}_${uniqueEntropy}`;
    const invoiceId = `inv_${args.merchant_domain.replace(/[^a-zA-Z0-9]/g, '_')}_${uniqueEntropy}`;

    logger.debug('Generated order and invoice identifiers', {
      orderId,
      invoiceId,
      uniqueEntropy,
    });

    // Append to immutable hash-chained audit ledger
    logger.debug('Appending authorization event to immutable audit chain', {
      orderId,
      invoiceId,
      mandate_id: args.mandate_id,
    });
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
    logger.info('Audit event appended to immutable ledger', {
      auditHash: auditEvent.hash,
      seq: auditEvent.seq,
      eventId: auditEvent.event_id,
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
    logger.info('Order authorization completed successfully', {
      order_id: orderId,
      invoice_id: invoiceId,
      spent_cents: newSpent,
      audit_hash: auditEvent.hash,
    });

    return result;
  } catch (err: unknown) {
    logger.error('Unexpected exception during handleOrderAuthorize execution', {
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
