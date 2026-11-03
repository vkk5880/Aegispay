import { z } from 'zod';

// 1. optimize_channel3_multi_merchant_basket
export const OptimizeBasketSchema = z.object({
  allowance_voucher_id: z.string().max(64),
  search_query: z.string().optional(),
  category_ids: z.array(z.string()).optional(),
  hex_color: z.string().optional(),
  image_url: z.string().url().optional()
});

// 2. authorize_conditional_escrow_order
export const AuthorizeEscrowOrderSchema = z.object({
  mandate_id: z.string().max(32),
  merchant_domain: z.string().max(128),
  requested_cents: z.number().int().positive(),
  category_id: z.string(),
  items: z.array(z.object({
    product_id: z.string(),
    price_cents: z.number().int().positive(),
    quantity: z.number().int().positive()
  }))
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

// Stubs for handlers - these would connect to orchestrator/workflow layer in a real implementation
export const toolHandlers = {
  async handleOptimizeBasket(args: z.infer<typeof OptimizeBasketSchema>): Promise<OptimizeBasketResult> {
    console.log("Optimizing basket...", args);
    return {
      basket_total_cents: 0,
      assignments: [],
      net_buyer_expenditure_cents: 0
    };
  },

  async handleAuthorizeEscrow(args: z.infer<typeof AuthorizeEscrowOrderSchema>): Promise<AuthorizeEscrowOrderResult> {
    console.log("Authorizing escrow...", args);
    return {
      paypal_order_id: "mock_order_id",
      invoice_id: "mock_invoice_id",
      status: "AUTHORIZED"
    };
  },

  async handleBroadcastIntent(args: z.infer<typeof BroadcastSyntheticIntentSchema>): Promise<BroadcastSyntheticIntentResult> {
    console.log("Broadcasting synthetic intent...", args);
    return {
      voucher_id: "mock_voucher",
      setup_token_id: "mock_setup_token",
      status: "BROADCASTED"
    };
  },

  async handleVoidOrCapture(args: z.infer<typeof VoidOrCaptureEscrowSchema>): Promise<VoidOrCaptureEscrowResult> {
    console.log("Voiding or capturing...", args);
    return {
      status: "COMPLETED",
      transaction_id: "mock_tx_id"
    };
  },

  async handleSubmitEvidence(args: z.infer<typeof SubmitDisputeEvidenceSchema>): Promise<SubmitDisputeEvidenceResult> {
    console.log("Submitting evidence...", args);
    return {
      status: "SUBMITTED",
      evidence_id: "mock_evidence"
    };
  },

  async handleProposeSettlement(args: z.infer<typeof ProposeDisputeSettlementSchema>): Promise<ProposeDisputeSettlementResult> {
    console.log("Proposing settlement...", args);
    return {
      status: "PROPOSED",
      offer_id: "mock_offer"
    };
  }
};
