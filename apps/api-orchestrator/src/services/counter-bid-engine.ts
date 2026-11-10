import { verifySessionMandateSignature } from '@aegispay/mcp-enforcer';
import type { SpendMandate } from '@aegispay/shared-types';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { PayPalApimaticClient, defaultPayPalClient } from './paypal-apimatic.js';

const logger = createLogger('API:Services:Financial').child('CounterBidEngine');

export interface CounterBidTurn {
  turn_number: number;
  proposer: 'BUYER' | 'MERCHANT';
  offer_cents: number;
  timestamp: string;
  notes?: string;
}

export interface CounterBidRequest {
  mandate: SpendMandate;
  voucher_id: string;
  channel3_product_id: string;
  merchant_domain: string;
  retail_offer_cents: number;
  merchant_min_floor_cents: number;
  buyer_bid_cents: number;
  turn?: number; // 1 or 2 (defaults to 1)
  turn_history?: CounterBidTurn[];
  auto_accept_buffer_cents?: number; // Default buffer e.g. 1000 cents ($10) where agent can auto-accept without HITL
}

export interface CounterVoucher {
  counter_voucher_id: string;
  merchant_domain: string;
  channel3_product_id: string;
  original_retail_cents: number;
  buyer_original_bid_cents: number;
  merchant_counter_cents: number;
  discount_from_retail_pct: number;
  turn: number;
  expires_at: string;
}

export interface CounterBidResult {
  status: 'AUTO_ACCEPTED' | 'HITL_CONFIRMATION_REQUIRED' | 'REJECTED_OUT_OF_BOUNDS' | 'DIRECT_ACCEPTED';
  turn: number;
  max_turns_reached: boolean;
  merchant_counter_voucher?: CounterVoucher;
  ed25519_mandate_verified: boolean;
  policy_compliance: {
    within_total_budget: boolean;
    within_merchant_cap: boolean;
    mandate_active: boolean;
    remaining_budget_cents: number;
  };
  hitl_prompt?: {
    required: boolean;
    timeout_seconds: number;
    message: string;
    action_tokens: {
      accept_token: string;
      decline_token: string;
    };
  };
  resulting_order_id?: string;
  history: CounterBidTurn[];
}

export class CounterBidEngine {
  private paypalClient: PayPalApimaticClient;

  constructor(paypalClient?: PayPalApimaticClient) {
    this.paypalClient = paypalClient || defaultPayPalClient;
    logger.debug('CounterBidEngine initialized');
  }

  /**
   * Executes bounded 2-turn negotiation.
   * If merchant margin reserve floor sits between buyer bid and retail price:
   * Generates algorithmic merchant counter-voucher.
   * Evaluates counter against Ed25519 mandate limit; auto-accepts if within policy or triggers HITL prompt.
   */
  async evaluateCounterBid(request: CounterBidRequest): Promise<CounterBidResult> {
    const currentTurn = request.turn || 1;
    const history: CounterBidTurn[] = request.turn_history ? [...request.turn_history] : [];

    logger.info('Evaluating counter bid negotiation', {
      voucherId: request.voucher_id,
      channel3ProductId: request.channel3_product_id,
      merchantDomain: request.merchant_domain,
      buyerBidCents: request.buyer_bid_cents,
      retailOfferCents: request.retail_offer_cents,
      merchantMinFloorCents: request.merchant_min_floor_cents,
      currentTurn,
      historyLength: history.length,
      autoAcceptBufferCents: request.auto_accept_buffer_cents,
    });

    // Verify cryptographic Ed25519 mandate
    logger.debug('Verifying Ed25519 mandate signature', { mandateId: request.mandate.mandate_id });
    const isEd25519Valid = await verifySessionMandateSignature(request.mandate);
    logger.info('Ed25519 mandate signature verification completed', {
      mandateId: request.mandate.mandate_id,
      isValid: isEd25519Valid,
    });

    const now = Date.now();
    const isMandateActive =
      request.mandate.status === 'ACTIVE' &&
      new Date(request.mandate.expires_at).getTime() > now;

    const remainingBudget =
      request.mandate.max_total_spend_cents - request.mandate.cumulative_spent_cents;

    logger.debug('Evaluated mandate active status and remaining budget', {
      mandateId: request.mandate.mandate_id,
      status: request.mandate.status,
      expiresAt: request.mandate.expires_at,
      isMandateActive,
      remainingBudgetCents: remainingBudget,
      maxSingleMerchantCents: request.mandate.max_single_merchant_cents,
    });

    // Enforce maximum 2 negotiation turns per voucher to avoid denial-of-service loops
    const merchantTurnsCount = history.filter((h) => h.proposer === 'MERCHANT').length;
    if (currentTurn > 2 || merchantTurnsCount >= 2) {
      logger.warn('Negotiation turn limit exceeded (max 2 turns per voucher). Negotiation halted.', {
        voucherId: request.voucher_id,
        currentTurn,
        merchantTurnsCount,
      });

      return {
        status: 'REJECTED_OUT_OF_BOUNDS',
        turn: currentTurn,
        max_turns_reached: true,
        ed25519_mandate_verified: isEd25519Valid,
        policy_compliance: {
          within_total_budget: false,
          within_merchant_cap: false,
          mandate_active: isMandateActive,
          remaining_budget_cents: remainingBudget,
        },
        history: [
          ...history,
          {
            turn_number: currentTurn,
            proposer: 'MERCHANT',
            offer_cents: 0,
            timestamp: new Date().toISOString(),
            notes: `Negotiation turn limit exceeded (max 2 turns per voucher). Negotiation halted.`,
          },
        ],
      };
    }

    // Record buyer initial turn if history is empty
    if (history.length === 0) {
      logger.debug('Recording initial buyer synthetic intent bid in history', {
        buyerBidCents: request.buyer_bid_cents,
        channel3ProductId: request.channel3_product_id,
      });
      history.push({
        turn_number: 1,
        proposer: 'BUYER',
        offer_cents: request.buyer_bid_cents,
        timestamp: new Date().toISOString(),
        notes: `Buyer initial synthetic intent bid for SKU ${request.channel3_product_id}`,
      });
    }

    // Direct check: if buyer bid is already >= merchant floor, no counter needed
    if (request.buyer_bid_cents >= request.merchant_min_floor_cents) {
      const withinTotal = request.buyer_bid_cents <= remainingBudget;
      const withinMerchant = request.buyer_bid_cents <= request.mandate.max_single_merchant_cents;

      logger.info('Buyer bid meets or exceeds merchant floor; direct acceptance verdict', {
        voucherId: request.voucher_id,
        buyerBidCents: request.buyer_bid_cents,
        merchantMinFloorCents: request.merchant_min_floor_cents,
        withinTotal,
        withinMerchant,
        isEd25519Valid,
        isMandateActive,
      });

      return {
        status: 'DIRECT_ACCEPTED',
        turn: currentTurn,
        max_turns_reached: false,
        ed25519_mandate_verified: isEd25519Valid,
        policy_compliance: {
          within_total_budget: withinTotal,
          within_merchant_cap: withinMerchant,
          mandate_active: isMandateActive,
          remaining_budget_cents: remainingBudget,
        },
        resulting_order_id: `ORD-SYN-${Date.now()}`,
        history,
      };
    }

    // If floor is above retail price or unreasonable, reject out of bounds
    if (request.merchant_min_floor_cents > request.retail_offer_cents) {
      logger.warn('Merchant minimum floor price exceeds retail offer; rejecting out of bounds', {
        voucherId: request.voucher_id,
        merchantMinFloorCents: request.merchant_min_floor_cents,
        retailOfferCents: request.retail_offer_cents,
      });

      return {
        status: 'REJECTED_OUT_OF_BOUNDS',
        turn: currentTurn,
        max_turns_reached: currentTurn >= 2,
        ed25519_mandate_verified: isEd25519Valid,
        policy_compliance: {
          within_total_budget: false,
          within_merchant_cap: false,
          mandate_active: isMandateActive,
          remaining_budget_cents: remainingBudget,
        },
        history,
      };
    }

    // 2-Turn Bounded Negotiation:
    // If merchant margin reserve floor sits between buyer bid and retail price:
    // (buyer_bid < merchant_floor <= retail)
    // Turn 1: Merchant proposes a concession between retail and merchant floor.
    // Turn 2: If buyer counters or in turn 2, merchant drops directly to floor (Dutch auction concession).
    let merchantCounterCents: number;
    if (currentTurn === 1) {
      // Algorithmic merchant counter: midpoint between retail and merchant floor, biased towards floor
      // e.g., floor + 40% of (retail - floor)
      const marginGap = request.retail_offer_cents - request.merchant_min_floor_cents;
      merchantCounterCents = Math.round(request.merchant_min_floor_cents + marginGap * 0.40);
      logger.info('Turn 1 compromise bid calculated (40% margin concession above floor)', {
        marginGap,
        merchantMinFloorCents: request.merchant_min_floor_cents,
        retailOfferCents: request.retail_offer_cents,
        calculatedCounterCents: merchantCounterCents,
      });
    } else {
      // Turn 2: Merchant concedes to absolute floor
      merchantCounterCents = request.merchant_min_floor_cents;
      logger.info('Turn 2 Dutch auction concession calculated (dropped directly to floor)', {
        merchantMinFloorCents: request.merchant_min_floor_cents,
        calculatedCounterCents: merchantCounterCents,
      });
    }

    const discountFromRetailPct = Number(
      (((request.retail_offer_cents - merchantCounterCents) / request.retail_offer_cents) * 100).toFixed(2)
    );

    const counterVoucherId = `cvch_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const counterVoucher: CounterVoucher = {
      counter_voucher_id: counterVoucherId,
      merchant_domain: request.merchant_domain,
      channel3_product_id: request.channel3_product_id,
      original_retail_cents: request.retail_offer_cents,
      buyer_original_bid_cents: request.buyer_bid_cents,
      merchant_counter_cents: merchantCounterCents,
      discount_from_retail_pct: discountFromRetailPct,
      turn: currentTurn,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
    };

    logger.info('Merchant counter voucher minted', {
      counterVoucherId,
      merchantDomain: request.merchant_domain,
      counterCents: merchantCounterCents,
      discountPct: discountFromRetailPct,
      turn: currentTurn,
    });

    history.push({
      turn_number: currentTurn,
      proposer: 'MERCHANT',
      offer_cents: merchantCounterCents,
      timestamp: new Date().toISOString(),
      notes: `Merchant Turn ${currentTurn} algorithmic counter-offer at $${(merchantCounterCents / 100).toFixed(2)} (${discountFromRetailPct}% off retail)`,
    });

    // Policy Compliance Evaluation against Ed25519 Mandate
    const withinTotalBudget = merchantCounterCents <= remainingBudget;
    const withinMerchantCap = merchantCounterCents <= request.mandate.max_single_merchant_cents;
    const isCompliant = isEd25519Valid && isMandateActive && withinTotalBudget && withinMerchantCap;

    logger.debug('Evaluated policy compliance for merchant counter', {
      withinTotalBudget,
      withinMerchantCap,
      isEd25519Valid,
      isMandateActive,
      isCompliant,
    });

    const autoAcceptBuffer = request.auto_accept_buffer_cents ?? 1500; // default $15 allowance buffer over bid

    // If counter is within buyer's auto-accept buffer above their initial bid AND compliant with mandate:
    // Auto-accept!
    if (isCompliant && merchantCounterCents <= (request.buyer_bid_cents + autoAcceptBuffer)) {
      const resultingOrderId = `ORD-COUNTER-${Date.now()}`;
      logger.info('Negotiation verdict: AUTO_ACCEPTED (within auto-accept buffer and compliant)', {
        counterVoucherId,
        merchantCounterCents,
        buyerBidCents: request.buyer_bid_cents,
        autoAcceptBuffer,
        resultingOrderId,
      });

      return {
        status: 'AUTO_ACCEPTED',
        turn: currentTurn,
        max_turns_reached: currentTurn >= 2,
        merchant_counter_voucher: counterVoucher,
        ed25519_mandate_verified: isEd25519Valid,
        policy_compliance: {
          within_total_budget: withinTotalBudget,
          within_merchant_cap: withinMerchantCap,
          mandate_active: isMandateActive,
          remaining_budget_cents: remainingBudget,
        },
        resulting_order_id: resultingOrderId,
        history,
      };
    }

    // If counter exceeds auto-accept buffer, but still within mandate cap:
    // Trigger real-time 60s HITL confirmation prompt!
    if (isCompliant) {
      const diffCents = merchantCounterCents - request.buyer_bid_cents;
      const diffDollars = (diffCents / 100).toFixed(2);
      logger.info('Negotiation verdict: HITL_CONFIRMATION_REQUIRED (exceeds auto-buffer, within mandate)', {
        counterVoucherId,
        merchantCounterCents,
        buyerBidCents: request.buyer_bid_cents,
        diffCents,
        diffDollars,
      });

      return {
        status: 'HITL_CONFIRMATION_REQUIRED',
        turn: currentTurn,
        max_turns_reached: currentTurn >= 2,
        merchant_counter_voucher: counterVoucher,
        ed25519_mandate_verified: isEd25519Valid,
        policy_compliance: {
          within_total_budget: withinTotalBudget,
          within_merchant_cap: withinMerchantCap,
          mandate_active: isMandateActive,
          remaining_budget_cents: remainingBudget,
        },
        hitl_prompt: {
          required: true,
          timeout_seconds: 60,
          message: `Merchant countered at $${(merchantCounterCents / 100).toFixed(2)} ($${diffDollars} above your bid). Accept counter before timer expires?`,
          action_tokens: {
            accept_token: `hitl_acc_${counterVoucherId}`,
            decline_token: `hitl_dec_${counterVoucherId}`,
          },
        },
        history,
      };
    }

    // Exceeds mandate policy entirely
    logger.warn('Negotiation verdict: REJECTED_OUT_OF_BOUNDS (exceeds mandate policy constraints)', {
      counterVoucherId,
      merchantCounterCents,
      withinTotalBudget,
      withinMerchantCap,
      isEd25519Valid,
      isMandateActive,
    });

    return {
      status: 'REJECTED_OUT_OF_BOUNDS',
      turn: currentTurn,
      max_turns_reached: currentTurn >= 2,
      merchant_counter_voucher: counterVoucher,
      ed25519_mandate_verified: isEd25519Valid,
      policy_compliance: {
        within_total_budget: withinTotalBudget,
        within_merchant_cap: withinMerchantCap,
        mandate_active: isMandateActive,
        remaining_budget_cents: remainingBudget,
      },
      history,
    };
  }
}

export const defaultCounterBidEngine = new CounterBidEngine();
