import crypto from 'node:crypto';
import { z } from 'zod';
import { verifySessionMandateSignature } from './ed25519-verifier.js';
import { calculateMerchantAnomalyScore, isMerchantAllowed } from './merchant-anomaly-gate.js';
import { defaultAtomicSpendEnforcer, AtomicSpendEnforcer } from './redis-lua-enforcer.js';
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
    return {
      basket_total_cents: 0,
      assignments: [],
      net_buyer_expenditure_cents: 0
    };
  },

  async handleAuthorizeEscrow(args: z.infer<typeof AuthorizeEscrowOrderSchema>): Promise<AuthorizeEscrowOrderResult> {
    console.error('[MCP Enforcer] Authorizing escrow...', sanitizeForLogging(args));

    // Sequential 4-Stage Custodian Verification Gate:
    // Stage 1: Strict Zod schema refinement ensuring requested_cents === sum(price_cents * quantity)
    // (Validated upfront via AuthorizeEscrowOrderSchema)

    // Stage 2: Ed25519 Cryptographic Signature Verification against buyer public key
    if (args.mandate) {
      const isSignatureValid = await verifySessionMandateSignature(args.mandate);
      if (!isSignatureValid) {
        throw new Error('ED25519_SIGNATURE_VERIFICATION_FAILED');
      }
    }

    // Stage 3: Merchant Anomaly Gate check (reject score > 300 / 1000)
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
        throw new Error(reservation.error_code || 'ERR_BUDGET_RESERVATION_FAILED');
      }

      newSpent = reservation.new_spent ?? args.requested_cents;
    }

    const uniqueEntropy = crypto.randomUUID().slice(0, 12);
    return {
      paypal_order_id: `ord_${args.mandate_id}_${uniqueEntropy}`,
      invoice_id: `inv_${args.merchant_domain}_${uniqueEntropy}`,
      status: 'AUTHORIZED',
      spent_cents: newSpent,
      merchant_anomaly_score: anomalyScore,
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
};
