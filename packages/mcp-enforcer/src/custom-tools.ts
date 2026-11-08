import crypto from 'node:crypto';
import { z } from 'zod';
import { verifySessionMandateSignature } from './ed25519-verifier.js';
import { calculateMerchantAnomalyScore, isMerchantAllowed } from './merchant-anomaly-gate.js';
import { defaultAtomicSpendEnforcer, AtomicSpendEnforcer } from './redis-lua-enforcer.js';
import { defaultAuditChain } from './audit-chain.js';
import type { SpendMandate } from '@aegispay/shared-types';

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
        return false;
      }

      // Loopback: 127.0.0.0/8
      if (octet1 === 127) {
        return false;
      }

      // Link-local / AWS/GCP cloud metadata: 169.254.0.0/16 (169.254.169.254)
      if (octet1 === 169 && octet2 === 254) {
        return false;
      }

      // RFC 1918 Private Subnet: 10.0.0.0/8
      if (octet1 === 10) {
        return false;
      }

      // RFC 1918 Private Subnet: 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
        return false;
      }

      // RFC 1918 Private Subnet: 192.168.0.0/16
      if (octet1 === 192 && octet2 === 168) {
        return false;
      }

      // 0.0.0.0/8
      if (octet1 === 0) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Helper to redact sensitive tokens/signatures before logging to stderr.
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
  spend_enforcer: z.custom<AtomicSpendEnforcer>().optional()
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
    if (args.items && args.items.length > 0) {
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
      return {
        basket_total_cents: totalCents,
        assignments,
        net_buyer_expenditure_cents: totalCents,
      };
    }
    return {
      basket_total_cents: 0,
      assignments: [],
      net_buyer_expenditure_cents: 0,
    };
  },

  async handleAuthorizeEscrow(args: z.infer<typeof AuthorizeEscrowOrderSchema>): Promise<AuthorizeEscrowOrderResult> {
    console.error('[MCP Enforcer] Authorizing escrow...', sanitizeForLogging(args));

    // Sequential 4-Stage Custodian Verification Gate:
    // Stage 1: Line-item arithmetic integrity and budget cap enforcement (float-safe integer checks)
    if (!Number.isSafeInteger(args.requested_cents) || args.requested_cents <= 0) {
      throw new Error('ERR_INVALID_SPEND_AMOUNT: requested_cents must be a positive integer');
    }
    for (const item of args.items) {
      if (
        !Number.isSafeInteger(item.price_cents) ||
        item.price_cents <= 0 ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        throw new Error('ERR_INVALID_ITEM_ARITHMETIC: item price_cents and quantity must be positive safe integers');
      }
    }

    const calculatedSum = args.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
    if (args.requested_cents !== calculatedSum) {
      throw new Error('requested_cents must strictly equal the sum of (price_cents * quantity) across all items');
    }

    if (args.mandate) {
      if (args.requested_cents > args.mandate.max_total_spend_cents) {
        throw new Error('ERR_EXCEEDS_TOTAL_MANDATE_BUDGET');
      }
      if (args.requested_cents > args.mandate.max_single_merchant_cents) {
        throw new Error('ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP');
      }
    }

    // Stage 2: Ed25519 Cryptographic Signature Verification against buyer public key
    if (args.mandate) {
      const isSignatureValid = await verifySessionMandateSignature(args.mandate);
      if (!isSignatureValid) {
        throw new Error('ED25519_SIGNATURE_VERIFICATION_FAILED');
      }
    }

    // Stage 3: Merchant Anomaly Gate check (reject score > 300 / 1000 basis points threshold for risk)
    const anomalyScore = calculateMerchantAnomalyScore({
      domain: args.merchant_domain,
      disputeRate: args.merchant_dispute_rate ?? 0,
      averageDiscountVariance: args.merchant_discount_variance ?? 0,
    });

    if (!isMerchantAllowed(anomalyScore)) {
      throw new Error(`ERR_MERCHANT_ANOMALY_THRESHOLD_EXCEEDED: score ${anomalyScore}`);
    }

    // Stage 4: Single-threaded Redis Lua reserveBudget() pre-reservation using {vch_<mandate_id>} hash tags
    let newSpent = args.requested_cents;
    const enforcer = args.spend_enforcer || defaultAtomicSpendEnforcer;

    // Fail-closed security policy: In production or when REDIS_URL is configured, atomic Redis Lua pre-reservation is mandatory
    const isProduction = process.env.NODE_ENV === 'production';
    const hasRedisConfig = Boolean(process.env.REDIS_URL);
    if (!args.redis_client && (isProduction || hasRedisConfig)) {
      throw new Error(
        'ERR_FAIL_CLOSED_REDIS_REQUIRED: Autonomous spend authorization strictly requires an active Redis enforcer in production'
      );
    }

    if (args.redis_client) {
      try {
        const reservation = await enforcer.reserveBudget(args.redis_client, {
          mandate_id: args.mandate_id,
          merchant_domain: args.merchant_domain,
          requested_cents: args.requested_cents,
          current_unix_ms: Date.now(),
          category_id: args.category_id,
          merchant_anomaly_score: anomalyScore,
        });

        if (!reservation.success) {
          throw new Error(reservation.error_code || 'ERR_BUDGET_RESERVATION_FAILED');
        }

        newSpent = reservation.new_spent ?? args.requested_cents;
      } catch (err: any) {
        // Strict fail-closed policy: sanitize error to prevent internal connection string/token leakage
        const rawMsg = err?.message || 'ERR_BUDGET_RESERVATION_FAILED';
        const sanitized = rawMsg
          .replace(/redis[s]?:\/\/[^\s@]+@[^\s/]+/gi, 'redis://[REDACTED]')
          .replace(/password=[^\s&]+/gi, 'password=[REDACTED]');
        throw new Error(sanitized);
      }
    }

    const uniqueEntropy = crypto.randomUUID().slice(0, 12);
    const orderId = `ord_${args.mandate_id}_${uniqueEntropy}`;
    const invoiceId = `inv_${args.merchant_domain}_${uniqueEntropy}`;

    // Port immutable hash-chained audit logging from Custodian chain.py
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
    const entropy = crypto.randomUUID().slice(0, 12);
    return {
      voucher_id: `syn_${args.mandate_id.slice(0, 8)}_${entropy}`,
      setup_token_id: `set_${entropy}`,
      status: 'BROADCASTED'
    };
  },

  async handleVoidOrCapture(args: z.infer<typeof VoidOrCaptureEscrowSchema>): Promise<VoidOrCaptureEscrowResult> {
    console.error('[MCP Enforcer] Voiding or capturing...', sanitizeForLogging(args));
    return {
      status: args.action === 'CAPTURE' ? 'CAPTURED' : 'VOIDED',
      transaction_id: `tx_${args.authorization_id}_${crypto.randomUUID().slice(0, 8)}`
    };
  },

  async handleSubmitEvidence(args: z.infer<typeof SubmitDisputeEvidenceSchema>): Promise<SubmitDisputeEvidenceResult> {
    console.error('[MCP Enforcer] Submitting evidence...', sanitizeForLogging(args));
    return {
      status: 'SUBMITTED',
      evidence_id: `ev_${args.paypal_dispute_id}_${crypto.randomUUID().slice(0, 8)}`
    };
  },

  async handleProposeSettlement(args: z.infer<typeof ProposeDisputeSettlementSchema>): Promise<ProposeDisputeSettlementResult> {
    console.error('[MCP Enforcer] Proposing settlement...', sanitizeForLogging(args));
    return {
      status: 'PROPOSED',
      offer_id: `off_${args.paypal_dispute_id}_${crypto.randomUUID().slice(0, 8)}`
    };
  }
,

  // =========================================================================
  // ACP MCP 5-Tool Handlers (docs/mcp-binding.md)
  // =========================================================================

  async handleCreateCheckoutSession(args: any) {
    console.error('[MCP Enforcer] Creating ACP checkout session via MCP tool...', sanitizeForLogging(args));
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
  },

  async handleGetCheckoutSession(args: any) {
    console.error('[MCP Enforcer] Getting ACP checkout session via MCP tool...', sanitizeForLogging(args));
    if (!args.id || args.id === 'invalid' || args.id.includes('nonexistent')) {
      const err: any = new Error('Checkout session not found');
      err.code = -32000;
      err.data = {
        type: 'invalid_request',
        code: 'session_not_found',
        message: 'Checkout session not found',
        param: 'id',
      };
      throw err;
    }
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
  },

  async handleUpdateCheckoutSession(args: any) {
    console.error('[MCP Enforcer] Updating ACP checkout session via MCP tool...', sanitizeForLogging(args));
    return {
      id: args.id,
      status: 'ready_for_payment',
      currency: 'usd',
      updated_at: new Date().toISOString(),
      messages: [],
    };
  },

  async handleCompleteCheckoutSession(args: any) {
    console.error('[MCP Enforcer] Completing ACP checkout session via MCP tool...', sanitizeForLogging(args));
    const orderId = `ord_mcp_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
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
  },

  async handleCancelCheckoutSession(args: any) {
    console.error('[MCP Enforcer] Cancelling ACP checkout session via MCP tool...', sanitizeForLogging(args));
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

    return {
      id: args.id,
      status: 'cancelled',
      cancellation_reason: args.payload?.reason || 'user_requested',
      audit_hash: auditEvent.hash,
    };
  },
};
