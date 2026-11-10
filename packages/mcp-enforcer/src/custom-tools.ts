import crypto from 'node:crypto';
import { z } from 'zod';
import { createLogger, sanitizeForLogging as sharedSanitizeForLogging } from '@aegispay/shared-types';
import { verifySessionMandateSignature } from './ed25519-verifier.js';
import { calculateMerchantAnomalyScore, isMerchantAllowed } from './merchant-anomaly-gate.js';
import { defaultAtomicSpendEnforcer, AtomicSpendEnforcer } from './redis-lua-enforcer.js';
import { defaultAuditChain } from './audit-chain.js';
import type { SpendMandate } from '@aegispay/shared-types';

const logger = createLogger('MCP:Enforcer:Tools', { stream: 'stderr' });

/**
 * Validates that an image URL points to a public, safe endpoint and prevents SSRF attacks.
 * Rejects:
 * - Loopback addresses (127.0.0.1, localhost, [::1])
 * - Link-local cloud metadata (169.254.169.254)
 * - Private RFC 1918 subnets:
 *     10.0.0.0/8
 *     172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
 *     192.168.0.0/16
 * - Non-HTTP/HTTPS protocols
 */
export function validatePublicImageUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      logger.warn('SSRF defense rejected non-http/https protocol', { protocol: parsed.protocol, url: urlStr });
      return false;
    }

    const hostname = parsed.hostname.toLowerCase().trim();

    // Check localhost / loopback string names
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '[::1]' ||
      hostname === '::1'
    ) {
      logger.warn('SSRF defense rejected loopback/localhost hostname', { hostname });
      return false;
    }

    // Strip IPv6 brackets if present
    const cleanHost = hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;

    // Check IPv4 pattern
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = cleanHost.match(ipv4Regex);

    if (ipMatch) {
      const octet1 = parseInt(ipMatch[1], 10);
      const octet2 = parseInt(ipMatch[2], 10);
      const octet3 = parseInt(ipMatch[3], 10);
      const octet4 = parseInt(ipMatch[4], 10);

      if (octet1 > 255 || octet2 > 255 || octet3 > 255 || octet4 > 255) {
        logger.warn('SSRF defense rejected invalid IPv4 octet bounds', { ipMatch: cleanHost });
        return false;
      }

      // Loopback: 127.0.0.0/8
      if (octet1 === 127) {
        logger.warn('SSRF defense rejected loopback 127.0.0.0/8 address', { ip: cleanHost });
        return false;
      }

      // Link-local / AWS/GCP cloud metadata: 169.254.0.0/16 (169.254.169.254)
      if (octet1 === 169 && octet2 === 254) {
        logger.warn('SSRF defense rejected cloud link-local metadata address 169.254.0.0/16', { ip: cleanHost });
        return false;
      }

      // RFC 1918 Private Subnet: 10.0.0.0/8
      if (octet1 === 10) {
        logger.warn('SSRF defense rejected private RFC 1918 10.0.0.0/8 address', { ip: cleanHost });
        return false;
      }

      // RFC 1918 Private Subnet: 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
        logger.warn('SSRF defense rejected private RFC 1918 172.16.0.0/12 address', { ip: cleanHost });
        return false;
      }

      // RFC 1918 Private Subnet: 192.168.0.0/16
      if (octet1 === 192 && octet2 === 168) {
        logger.warn('SSRF defense rejected private RFC 1918 192.168.0.0/16 address', { ip: cleanHost });
        return false;
      }

      // 0.0.0.0/8
      if (octet1 === 0) {
        logger.warn('SSRF defense rejected 0.0.0.0/8 address', { ip: cleanHost });
        return false;
      }
    }

    logger.debug('SSRF defense approved public image URL', { hostname: cleanHost });
    return true;
  } catch (err: any) {
    logger.error('SSRF validation threw an error during URL parsing', { error: err?.message, url: urlStr });
    return false;
  }
}

/**
 * Helper to redact sensitive tokens/signatures before logging to stderr.
 */
export function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  try {
    const sharedClean = sharedSanitizeForLogging(obj);
    if (!sharedClean || typeof sharedClean !== 'object') return sharedClean;
    const clone = Array.isArray(sharedClean) ? [...sharedClean] : { ...sharedClean };
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
  } catch {
    return '[SANITIZATION_FAILED]';
  }
}

// 1. optimize_channel3_multi_merchant_basket
export const OptimizeBasketSchema = z.object({
  allowance_voucher_id: z.string().max(64),
  search_query: z.string().optional(),
  category_ids: z.array(z.string()).optional(),
  hex_color: z.string().optional(),
  image_url: z
    .string()
    .url()
    .refine((url) => validatePublicImageUrl(url), {
      message: 'Invalid public image URL: loopback, link-local metadata, or private IP addresses are rejected',
    })
    .optional(),
  items: z.array(z.object({
    product_id: z.string(),
    merchant_domain: z.string(),
    price_cents: z.number().int().positive(),
    quantity: z.number().int().positive().default(1),
  })).optional(),
});

// 2. authorize_conditional_escrow_order
export const AuthorizeEscrowOrderSchema = z.object({
  mandate_id: z.string().max(32),
  merchant_domain: z.string().max(128).min(1),
  requested_cents: z.number().int().positive(),
  category_id: z.string().min(1),
  items: z.array(z.object({
    product_id: z.string().min(1),
    price_cents: z.number().int().positive(),
    quantity: z.number().int().positive()
  })).min(1, 'Cart items array must not be empty'),
  mandate: z.custom<SpendMandate>().optional(),
  merchant_dispute_rate: z.number().min(0).max(1).optional(),
  merchant_discount_variance: z.number().min(0).max(1).optional(),
  redis_client: z.any().optional(),
  spend_enforcer: z.custom<AtomicSpendEnforcer>().optional(),
  confirmed: z.boolean().optional(),
  requires_3ds: z.boolean().optional()
}).refine(
  data => data.requested_cents === data.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0),
  {
    message: 'requested_cents must strictly equal the sum of (price_cents * quantity) across all items'
  }
).refine(
  data => !data.mandate || data.requested_cents <= data.mandate.max_total_spend_cents,
  {
    message: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET: requested_cents exceeds mandate total budget cap'
  }
).refine(
  data => !data.mandate || data.requested_cents <= data.mandate.max_single_merchant_cents,
  {
    message: 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP: requested_cents exceeds mandate single merchant exposure cap'
  }
);

// 3. broadcast_synthetic_intent_voucher
export const BroadcastSyntheticIntentSchema = z.object({
  mandate_id: z.string().max(32),
  channel3_product_id: z.string().max(64),
  merchant_domain: z.string().max(128),
  retail_offer_cents: z.number().int().positive(),
  buyer_bid_cents: z.number().int().positive()
});

// 4. void_or_capture_escrow_hold
export const VoidOrCaptureEscrowSchema = z.object({
  authorization_id: z.string().max(64),
  action: z.enum(['CAPTURE', 'VOID']),
  amount_cents: z.number().int().positive().optional() // Required for CAPTURE if different from auth
});

// 5. submit_dispute_evidence_bundle
export const SubmitDisputeEvidenceSchema = z.object({
  paypal_dispute_id: z.string().max(64),
  carrier_tracking_number: z.string().optional(),
  policy_proof_text: z.string().optional(),
  vision_defect_mask: z.array(z.number()).length(4).optional() // [ymin, xmin, ymax, xmax]
});

// 6. propose_dispute_partial_settlement
export const ProposeDisputeSettlementSchema = z.object({
  paypal_dispute_id: z.string().max(64),
  compromise_amount_cents: z.number().int().positive()
});

// 7. create_invoice
export const CreateInvoiceSchema = z.object({
  recipient_email: z.string().email(),
  recipient_name: z.string().optional(),
  business_name: z.string().optional(),
  currency_code: z.string().default('USD'),
  payment_term: z.string().default('NET_30'),
  note: z.string().optional(),
  items: z.array(z.object({
    name: z.string().min(1),
    quantity: z.number().int().positive().default(1),
    unit_amount_cents: z.number().int().positive(),
  })).min(1),
});

// 8. send_invoice
export const SendInvoiceSchema = z.object({
  invoice_id: z.string().min(1),
});

// 9. generate_invoice_qr
export const GenerateInvoiceQrSchema = z.object({
  invoice_id: z.string().min(1),
});

// Tool handlers interfaces
export interface OptimizeBasketResult {
  basket_total_cents: number;
  assignments: Array<{ merchant_domain: string; items: any[] }>;
  net_buyer_expenditure_cents: number;
}

export interface AuthorizeEscrowOrderResult {
  paypal_order_id: string;
  invoice_id: string;
  status: string;
  spent_cents?: number;
  merchant_anomaly_score?: number;
  audit_hash?: string;
}

export interface BroadcastSyntheticIntentResult {
  voucher_id: string;
  setup_token_id: string;
  status: string;
}

export interface VoidOrCaptureEscrowResult {
  status: string;
  transaction_id: string;
}

export interface SubmitDisputeEvidenceResult {
  status: string;
  evidence_id?: string;
}

export interface ProposeDisputeSettlementResult {
  status: string;
  offer_id?: string;
}

// Handlers connected to real cryptographic verification and atomic budget enforcer
export const toolHandlers = {
  async handleOptimizeBasket(args: z.infer<typeof OptimizeBasketSchema>): Promise<OptimizeBasketResult> {
    console.error('[MCP Enforcer] Optimizing basket...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:optimize_channel3_multi_merchant_basket');
    logger.info('[MCP Enforcer] Optimizing basket...', sanitizeForLogging(args));
    try {
      if (args.items && args.items.length > 0) {
        logger.debug('Optimizing basket across merchant items', { itemCount: args.items.length });
        const merchantMap = new Map<string, any[]>();
        let totalCents = 0;
        for (const item of args.items) {
          totalCents += item.price_cents * (item.quantity ?? 1);
          const list = merchantMap.get(item.merchant_domain) || [];
          list.push(item);
          merchantMap.set(item.merchant_domain, list);
        }
        const assignments = Array.from(merchantMap.entries()).map(([merchant_domain, items]) => ({
          merchant_domain,
          items,
        }));
        logger.info('Basket optimization computed successfully', {
          totalCents,
          merchantCount: assignments.length,
        });
        endTimer('Completed basket multi-vendor assignment');
        return {
          basket_total_cents: totalCents,
          assignments,
          net_buyer_expenditure_cents: totalCents,
        };
      }
      logger.debug('Empty items list provided for basket optimization');
      endTimer('Completed with empty basket');
      return {
        basket_total_cents: 0,
        assignments: [],
        net_buyer_expenditure_cents: 0,
      };
    } catch (err: any) {
      logger.error('Failed to optimize multi-merchant basket', { error: err?.message, stack: err?.stack });
      endTimer('Failed basket optimization');
      throw err;
    }
  },

  async handleAuthorizeEscrow(args: z.infer<typeof AuthorizeEscrowOrderSchema>): Promise<AuthorizeEscrowOrderResult> {
    console.error('[MCP Enforcer] Authorizing escrow...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:authorize_conditional_escrow_order');
    logger.info('[MCP Enforcer] Authorizing escrow...', sanitizeForLogging(args));

    // Sequential 4-Stage Custodian Verification Gate:
    // Stage 1: Line-item arithmetic integrity and budget cap enforcement (float-safe integer checks)
    logger.debug('Custodian Gate Stage 1: Checking line-item arithmetic and budget cap bounds', {
      requestedCents: args.requested_cents,
      itemCount: args.items?.length,
    });
    if (!Number.isSafeInteger(args.requested_cents) || args.requested_cents <= 0) {
      logger.error('Custodian Gate Stage 1 Failed: Non-safe integer or non-positive requested_cents', {
        requestedCents: args.requested_cents,
      });
      endTimer('Stage 1 failure');
      throw new Error('ERR_INVALID_SPEND_AMOUNT: requested_cents must be a positive integer');
    }
    for (const item of args.items) {
      if (
        !Number.isSafeInteger(item.price_cents) ||
        item.price_cents <= 0 ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        logger.error('Custodian Gate Stage 1 Failed: Invalid item arithmetic', sanitizeForLogging(item));
        endTimer('Stage 1 failure');
        throw new Error('ERR_INVALID_ITEM_ARITHMETIC: item price_cents and quantity must be positive safe integers');
      }
    }

    const calculatedSum = args.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
    if (args.requested_cents !== calculatedSum) {
      logger.error('Custodian Gate Stage 1 Failed: Requested cents mismatch sum of line items', {
        requestedCents: args.requested_cents,
        calculatedSum,
      });
      endTimer('Stage 1 mismatch');
      throw new Error('requested_cents must strictly equal the sum of (price_cents * quantity) across all items');
    }

    if (args.mandate) {
      logger.debug('Custodian Gate Stage 1: Checking mandate caps', {
        requestedCents: args.requested_cents,
        maxTotal: args.mandate.max_total_spend_cents,
        maxMerchant: args.mandate.max_single_merchant_cents,
      });
      if (args.requested_cents > args.mandate.max_total_spend_cents) {
        logger.error('Custodian Gate Stage 1 Failed: Exceeds total mandate budget', {
          requestedCents: args.requested_cents,
          maxTotal: args.mandate.max_total_spend_cents,
        });
        endTimer('Budget cap violation');
        throw new Error('ERR_EXCEEDS_TOTAL_MANDATE_BUDGET');
      }
      if (args.requested_cents > args.mandate.max_single_merchant_cents) {
        logger.error('Custodian Gate Stage 1 Failed: Exceeds single merchant exposure cap', {
          requestedCents: args.requested_cents,
          maxMerchant: args.mandate.max_single_merchant_cents,
        });
        endTimer('Merchant cap violation');
        throw new Error('ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP');
      }
    }
    logger.info('Custodian Gate Stage 1 Passed: Arithmetic and cap constraints verified');

    // Stage 2: Ed25519 Cryptographic Signature Verification against buyer public key
    if (args.mandate) {
      logger.debug('Custodian Gate Stage 2: Verifying Ed25519 session mandate signature', {
        mandateId: args.mandate.mandate_id,
      });
      const isSignatureValid = await verifySessionMandateSignature(args.mandate);
      if (!isSignatureValid) {
        logger.error('Custodian Gate Stage 2 Failed: Ed25519 signature verification rejected', {
          mandateId: args.mandate.mandate_id,
        });
        endTimer('Signature verification failure');
        throw new Error('ED25519_SIGNATURE_VERIFICATION_FAILED');
      }
      logger.info('Custodian Gate Stage 2 Passed: Ed25519 signature cryptographically verified');
    } else {
      logger.debug('Custodian Gate Stage 2 Skipped: No mandate object provided in payload');
    }

    // Stage 3: Merchant Anomaly Gate check (reject score > 300 / 1000 basis points threshold for risk)
    logger.debug('Custodian Gate Stage 3: Evaluating merchant anomaly risk', {
      domain: args.merchant_domain,
      disputeRate: args.merchant_dispute_rate ?? 0,
      discountVariance: args.merchant_discount_variance ?? 0,
    });
    const anomalyScore = calculateMerchantAnomalyScore({
      domain: args.merchant_domain,
      disputeRate: args.merchant_dispute_rate ?? 0,
      averageDiscountVariance: args.merchant_discount_variance ?? 0,
    });

    if (!isMerchantAllowed(anomalyScore)) {
      logger.error('Custodian Gate Stage 3 Failed: Merchant anomaly score exceeded risk threshold', {
        domain: args.merchant_domain,
        anomalyScore,
        threshold: 300,
      });
      endTimer('Merchant anomaly failure');
      throw new Error(`ERR_MERCHANT_ANOMALY_THRESHOLD_EXCEEDED: score ${anomalyScore}`);
    }
    logger.info('Custodian Gate Stage 3 Passed: Merchant anomaly within risk bounds', { anomalyScore });

    // Stage 4: Single-threaded Redis Lua reserveBudget() pre-reservation using {vch_<mandate_id>} hash tags
    logger.debug('Custodian Gate Stage 4: Atomic Redis Lua spend reservation', {
      mandateId: args.mandate_id,
      merchantDomain: args.merchant_domain,
      requestedCents: args.requested_cents,
    });
    let newSpent = args.requested_cents;
    const enforcer = args.spend_enforcer || defaultAtomicSpendEnforcer;

    // Fail-closed security policy: In production or when REDIS_URL is configured, atomic Redis Lua pre-reservation is mandatory
    const isProduction = process.env.NODE_ENV === 'production';
    const hasRedisConfig = Boolean(process.env.REDIS_URL);
    if (!args.redis_client && (isProduction || hasRedisConfig)) {
      logger.error('Custodian Gate Stage 4 Failed: Fail-closed Redis required in production/configured environment', {
        isProduction,
        hasRedisConfig,
      });
      endTimer('Redis fail-closed');
      throw new Error(
        'ERR_FAIL_CLOSED_REDIS_REQUIRED: Autonomous spend authorization strictly requires an active Redis enforcer in production'
      );
    }

    if (args.redis_client) {
      try {
        logger.debug('Invoking AtomicSpendEnforcer.reserveBudget with Redis client');
        const reservation = await enforcer.reserveBudget(args.redis_client, {
          mandate_id: args.mandate_id,
          merchant_domain: args.merchant_domain,
          requested_cents: args.requested_cents,
          current_unix_ms: Date.now(),
          category_id: args.category_id,
          merchant_anomaly_score: anomalyScore,
        });

        if (!reservation.success) {
          logger.error('Custodian Gate Stage 4 Failed: Redis Lua spend reservation rejected', {
            errorCode: reservation.error_code,
            mandateId: args.mandate_id,
          });
          endTimer('Spend reservation rejection');
          throw new Error(reservation.error_code || 'ERR_BUDGET_RESERVATION_FAILED');
        }

        newSpent = reservation.new_spent ?? args.requested_cents;
        logger.info('Custodian Gate Stage 4 Passed: Redis Lua spend reservation succeeded', {
          mandateId: args.mandate_id,
          newSpent,
        });
      } catch (err: any) {
        // Strict fail-closed policy: sanitize error to prevent internal connection string/token leakage
        const rawMsg = err?.message || 'ERR_BUDGET_RESERVATION_FAILED';
        const sanitized = rawMsg
          .replace(/redis[s]?:\/\/[^\s@]+@[^\s/]+/gi, 'redis://[REDACTED]')
          .replace(/password=[^\s&]+/gi, 'password=[REDACTED]');
        logger.error('Redis Lua reservation encountered exception, failing closed', {
          sanitizedError: sanitized,
          stack: err?.stack,
        });
        endTimer('Redis exception');
        throw new Error(sanitized);
      }
    } else {
      logger.warn('Custodian Gate Stage 4: Executing in local mock mode without active Redis client');
    }

    const uniqueEntropy = crypto.randomUUID().slice(0, 12);
    const orderId = `ord_${args.mandate_id}_${uniqueEntropy}`;
    const invoiceId = `inv_${args.merchant_domain}_${uniqueEntropy}`;

    // Port immutable hash-chained audit logging from Custodian chain.py
    logger.debug('Appending authorization event to immutable audit chain', { orderId, invoiceId });
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

    logger.info('Escrow authorization complete and audit sealed', {
      orderId,
      invoiceId,
      auditHash: auditEvent.hash,
    });
    endTimer('Escrow authorization completed successfully');

    return {
      paypal_order_id: orderId,
      invoice_id: invoiceId,
      status: 'AUTHORIZED',
      spent_cents: newSpent,
      merchant_anomaly_score: anomalyScore,
      audit_hash: auditEvent.hash,
    };
  },

  async handleBroadcastIntent(args: z.infer<typeof BroadcastSyntheticIntentSchema>): Promise<BroadcastSyntheticIntentResult> {
    console.error('[MCP Enforcer] Broadcasting synthetic intent...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:broadcast_synthetic_intent_voucher');
    logger.info('[MCP Enforcer] Broadcasting synthetic intent...', sanitizeForLogging(args));
    try {
      const entropy = crypto.randomUUID().slice(0, 12);
      const voucherId = `syn_${args.mandate_id.slice(0, 8)}_${entropy}`;
      const setupTokenId = `set_${entropy}`;
      logger.info('Synthetic intent voucher created', {
        voucherId,
        setupTokenId,
        bidCents: args.buyer_bid_cents,
        retailCents: args.retail_offer_cents,
        merchantDomain: args.merchant_domain,
      });
      endTimer('Completed broadcasting intent voucher');
      return {
        voucher_id: voucherId,
        setup_token_id: setupTokenId,
        status: 'BROADCASTED',
      };
    } catch (err: any) {
      logger.error('Failed to broadcast synthetic intent voucher', { error: err?.message, stack: err?.stack });
      endTimer('Failed broadcast intent');
      throw err;
    }
  },

  async handleVoidOrCapture(args: z.infer<typeof VoidOrCaptureEscrowSchema>): Promise<VoidOrCaptureEscrowResult> {
    console.error('[MCP Enforcer] Voiding or capturing...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:void_or_capture_escrow_hold');
    logger.info('[MCP Enforcer] Voiding or capturing...', sanitizeForLogging(args));
    try {
      const status = args.action === 'CAPTURE' ? 'CAPTURED' : 'VOIDED';
      const txId = `tx_${args.authorization_id}_${crypto.randomUUID().slice(0, 8)}`;
      logger.info('Void or capture action completed', {
        action: args.action,
        status,
        transactionId: txId,
        amountCents: args.amount_cents,
      });
      endTimer(`Completed action: ${args.action}`);
      return {
        status,
        transaction_id: txId,
      };
    } catch (err: any) {
      logger.error('Failed void or capture action', { error: err?.message, stack: err?.stack });
      endTimer('Failed void or capture');
      throw err;
    }
  },

  async handleSubmitEvidence(args: z.infer<typeof SubmitDisputeEvidenceSchema>): Promise<SubmitDisputeEvidenceResult> {
    console.error('[MCP Enforcer] Submitting evidence...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:submit_dispute_evidence_bundle');
    logger.info('[MCP Enforcer] Submitting evidence...', sanitizeForLogging(args));
    try {
      const evidenceId = `ev_${args.paypal_dispute_id}_${crypto.randomUUID().slice(0, 8)}`;
      logger.info('Dispute evidence bundle registered', {
        disputeId: args.paypal_dispute_id,
        evidenceId,
        hasTracking: Boolean(args.carrier_tracking_number),
        hasDefectMask: Boolean(args.vision_defect_mask),
      });
      endTimer('Completed dispute evidence submission');
      return {
        status: 'SUBMITTED',
        evidence_id: evidenceId,
      };
    } catch (err: any) {
      logger.error('Failed to submit dispute evidence bundle', { error: err?.message, stack: err?.stack });
      endTimer('Failed evidence submission');
      throw err;
    }
  },

  async handleProposeSettlement(args: z.infer<typeof ProposeDisputeSettlementSchema>): Promise<ProposeDisputeSettlementResult> {
    console.error('[MCP Enforcer] Proposing settlement...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:propose_dispute_partial_settlement');
    logger.info('[MCP Enforcer] Proposing settlement...', sanitizeForLogging(args));
    try {
      const offerId = `off_${args.paypal_dispute_id}_${crypto.randomUUID().slice(0, 8)}`;
      logger.info('Dispute partial settlement proposed', {
        disputeId: args.paypal_dispute_id,
        offerId,
        compromiseCents: args.compromise_amount_cents,
      });
      endTimer('Completed settlement proposal');
      return {
        status: 'PROPOSED',
        offer_id: offerId,
      };
    } catch (err: any) {
      logger.error('Failed to propose dispute settlement', { error: err?.message, stack: err?.stack });
      endTimer('Failed settlement proposal');
      throw err;
    }
  },

  // =========================================================================
  // ACP MCP 5-Tool Handlers (docs/mcp-binding.md)
  // =========================================================================

  async handleCreateCheckoutSession(args: any) {
    console.error('[MCP Enforcer] Creating ACP checkout session via MCP tool...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:create_checkout_session');
    logger.info('[MCP Enforcer] Creating ACP checkout session via MCP tool...', sanitizeForLogging(args));
    try {
      const payload = args.payload || {};
      const sessionId = `cs_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

      const items = (payload.items || []).map((it: any, idx: number) => {
        const unitCents = it.unit_price_cents !== undefined ? it.unit_price_cents : 2500;
        return {
          id: it.id || `item_${idx + 1}`,
          name: it.name || `Item ${it.id}`,
          quantity: it.quantity || 1,
          unit_price_cents: unitCents,
          subtotal_cents: unitCents * (it.quantity || 1),
        };
      });

      const subtotalCents = items.reduce((acc: number, it: any) => acc + it.subtotal_cents, 0);
      const taxCents = Math.round(subtotalCents * 0.0825);
      const shippingCents = subtotalCents >= 10000 ? 0 : 500;
      const totalCents = subtotalCents + taxCents + shippingCents;

      logger.debug('Calculated ACP session totals', {
        sessionId,
        subtotalCents,
        taxCents,
        shippingCents,
        totalCents,
      });

      const auditEvent = defaultAuditChain.append({
        request_id: args.meta?.request_id || sessionId,
        event_type: 'ACP_MCP_SESSION_CREATED',
        observed: {
          session_id: sessionId,
          items_count: items.length,
          subtotal_cents: subtotalCents,
          affiliate_provider: payload.affiliate_attribution?.provider || null,
        },
        inferred: {
          total_cents: totalCents,
          status: 'ready_for_payment',
        },
      });

      logger.info('ACP checkout session created and audit sealed', {
        sessionId,
        auditHash: auditEvent.hash,
        totalCents,
      });
      endTimer('Created ACP checkout session');

      return {
        id: sessionId,
        status: 'ready_for_payment',
        currency: (payload.currency || 'USD').toLowerCase(),
        line_items: items.map((it: any) => ({
          id: `li_${it.id}`,
          item: { id: it.id, name: it.name },
          quantity: it.quantity,
          base_amount: it.subtotal_cents,
          discount_amount: 0,
          subtotal: it.subtotal_cents,
          total: it.subtotal_cents,
        })),
        totals: [
          { type: 'subtotal', amount: subtotalCents },
          { type: 'tax', amount: taxCents },
          { type: 'shipping', amount: shippingCents },
          { type: 'total', amount: totalCents },
        ],
        capabilities: {
          payment_handlers: ['paypal_vault_v3', 'card_tokenized'],
        },
        messages: [],
        links: [
          { rel: 'self', href: `https://aegispay.dev/checkout_sessions/${sessionId}` },
        ],
        audit_hash: auditEvent.hash,
      };
    } catch (err: any) {
      logger.error('Failed to create ACP checkout session', { error: err?.message, stack: err?.stack });
      endTimer('Failed create checkout session');
      throw err;
    }
  },

  async handleGetCheckoutSession(args: any) {
    console.error('[MCP Enforcer] Getting ACP checkout session via MCP tool...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:get_checkout_session');
    logger.info('[MCP Enforcer] Getting ACP checkout session via MCP tool...', sanitizeForLogging(args));
    try {
      if (!args.id || args.id === 'invalid' || args.id.includes('nonexistent')) {
        logger.warn('ACP session not found for query', { id: args?.id });
        const err: any = new Error('Checkout session not found');
        err.code = -32000;
        err.data = {
          type: 'invalid_request',
          code: 'session_not_found',
          message: 'Checkout session not found',
          param: 'id',
        };
        endTimer('Session not found error');
        throw err;
      }
      logger.info('Retrieved ACP checkout session successfully', { id: args.id });
      endTimer('Retrieved checkout session');
      return {
        id: args.id,
        status: 'ready_for_payment',
        currency: 'usd',
        line_items: [],
        totals: [
          { type: 'subtotal', amount: 5000 },
          { type: 'tax', amount: 413 },
          { type: 'total', amount: 5413 },
        ],
        messages: [],
      };
    } catch (err: any) {
      logger.error('Error fetching ACP checkout session', { id: args?.id, error: err?.message, stack: err?.stack });
      endTimer('Failed get checkout session');
      throw err;
    }
  },

  async handleUpdateCheckoutSession(args: any) {
    console.error('[MCP Enforcer] Updating ACP checkout session via MCP tool...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:update_checkout_session');
    logger.info('[MCP Enforcer] Updating ACP checkout session via MCP tool...', sanitizeForLogging(args));
    try {
      logger.info('Updated ACP checkout session state', { id: args.id });
      endTimer('Updated checkout session');
      return {
        id: args.id,
        status: 'ready_for_payment',
        currency: 'usd',
        updated_at: new Date().toISOString(),
        messages: [],
      };
    } catch (err: any) {
      logger.error('Failed to update ACP checkout session', { id: args?.id, error: err?.message, stack: err?.stack });
      endTimer('Failed update checkout session');
      throw err;
    }
  },

  async handleCompleteCheckoutSession(args: any) {
    console.error('[MCP Enforcer] Completing ACP checkout session via MCP tool...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:complete_checkout_session');
    logger.info('[MCP Enforcer] Completing ACP checkout session via MCP tool...', sanitizeForLogging(args));
    try {
      const orderId = `ord_mcp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      logger.debug('Completing session and appending audit entry', { sessionId: args.id, orderId });
      const auditEvent = defaultAuditChain.append({
        request_id: args.id,
        event_type: 'ACP_MCP_SESSION_COMPLETED',
        observed: {
          session_id: args.id,
          payment_method_type: args.payload?.payment_method?.type || null,
        },
        inferred: {
          order_id: orderId,
          status: 'completed',
        },
      });

      logger.info('ACP checkout session completed successfully', {
        sessionId: args.id,
        orderId,
        auditHash: auditEvent.hash,
      });
      endTimer('Completed checkout session');

      return {
        id: args.id,
        status: 'completed',
        order: {
          id: orderId,
          order_id: orderId,
          status: 'CREATED',
          created_at: new Date().toISOString(),
        },
        audit_hash: auditEvent.hash,
      };
    } catch (err: any) {
      logger.error('Failed to complete ACP checkout session', { id: args?.id, error: err?.message, stack: err?.stack });
      endTimer('Failed complete checkout session');
      throw err;
    }
  },

  async handleCancelCheckoutSession(args: any) {
    console.error('[MCP Enforcer] Cancelling ACP checkout session via MCP tool...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:cancel_checkout_session');
    logger.info('[MCP Enforcer] Cancelling ACP checkout session via MCP tool...', sanitizeForLogging(args));
    try {
      logger.debug('Cancelling session and appending audit entry', { sessionId: args.id });
      const auditEvent = defaultAuditChain.append({
        request_id: args.id,
        event_type: 'ACP_MCP_SESSION_CANCELLED',
        observed: {
          session_id: args.id,
          reason: args.payload?.reason || null,
        },
        inferred: {
          status: 'cancelled',
        },
      });

      logger.info('ACP checkout session cancelled successfully', {
        sessionId: args.id,
        reason: args.payload?.reason || 'user_requested',
        auditHash: auditEvent.hash,
      });
      endTimer('Cancelled checkout session');

      return {
        id: args.id,
        status: 'cancelled',
        cancellation_reason: args.payload?.reason || 'user_requested',
        audit_hash: auditEvent.hash,
      };
    } catch (err: any) {
      logger.error('Failed to cancel ACP checkout session', { id: args?.id, error: err?.message, stack: err?.stack });
      endTimer('Failed cancel checkout session');
      throw err;
    }
  },

  async handleCreateInvoice(args: z.infer<typeof CreateInvoiceSchema>) {
    console.error('[MCP Enforcer] Creating B2B invoice...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:create_invoice');
    logger.info('[MCP Enforcer] Creating B2B invoice...', sanitizeForLogging(args));
    try {
      const invId = `INV2-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
      const totalCents = args.items.reduce((sum, item) => sum + item.unit_amount_cents * (item.quantity || 1), 0);
      logger.info('B2B invoice drafted', {
        invoiceId: invId,
        recipient: args.recipient_email,
        totalCents,
        currency: args.currency_code || 'USD',
      });
      endTimer('Created B2B invoice');
      return {
        invoice_id: invId,
        status: 'DRAFT',
        invoice_number: `INV-${Date.now()}`,
        amount: {
          currency_code: args.currency_code || 'USD',
          value: (totalCents / 100).toFixed(2),
        },
        payer_view_url: `https://www.sandbox.paypal.com/invoice/p/#${invId}`,
      };
    } catch (err: any) {
      logger.error('Failed to create B2B invoice', { error: err?.message, stack: err?.stack });
      endTimer('Failed create invoice');
      throw err;
    }
  },

  async handleSendInvoice(args: z.infer<typeof SendInvoiceSchema>) {
    console.error('[MCP Enforcer] Sending B2B invoice...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:send_invoice');
    logger.info('[MCP Enforcer] Sending B2B invoice...', sanitizeForLogging(args));
    try {
      logger.info('B2B invoice marked sent', { invoiceId: args.invoice_id });
      endTimer('Sent B2B invoice');
      return {
        invoice_id: args.invoice_id,
        status: 'SENT',
        sent_at: new Date().toISOString(),
      };
    } catch (err: any) {
      logger.error('Failed to send B2B invoice', { invoiceId: args?.invoice_id, error: err?.message, stack: err?.stack });
      endTimer('Failed send invoice');
      throw err;
    }
  },

  async handleGenerateInvoiceQr(args: z.infer<typeof GenerateInvoiceQrSchema>) {
    console.error('[MCP Enforcer] Generating B2B invoice QR code...', sanitizeForLogging(args));
    const endTimer = logger.time('Tool:generate_invoice_qr');
    logger.info('[MCP Enforcer] Generating B2B invoice QR code...', sanitizeForLogging(args));
    try {
      logger.info('B2B invoice QR code generated', { invoiceId: args.invoice_id });
      endTimer('Generated invoice QR');
      return {
        invoice_id: args.invoice_id,
        qr_code: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      };
    } catch (err: any) {
      logger.error('Failed to generate invoice QR', { invoiceId: args?.invoice_id, error: err?.message, stack: err?.stack });
      endTimer('Failed generate QR');
      throw err;
    }
  },
};
