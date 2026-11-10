import {
  SyntheticIntentEngine,
  defaultSyntheticIntentEngine,
  SyntheticIntentProposal,
  SyntheticIntentEvaluation,
  isValidPayPalVaultSetupToken,
} from './synthetic-intent.js';
import {
  CounterBidEngine,
  defaultCounterBidEngine,
  CounterBidRequest,
  CounterBidResult,
} from './counter-bid-engine.js';
import {
  createLogger,
  sanitizeForLogging,
} from '@aegispay/shared-types';

export interface IntentMatchResult {
  evaluation: SyntheticIntentEvaluation;
  vault_token_valid: boolean;
  floor_confidential: boolean;
}

const logger = createLogger('API:Services:AIWorkflows').child('IntentMatcher');

export class IntentMatcher {
  private syntheticEngine: SyntheticIntentEngine;
  private counterEngine: CounterBidEngine;

  constructor(syntheticEngine?: SyntheticIntentEngine, counterEngine?: CounterBidEngine) {
    this.syntheticEngine = syntheticEngine || defaultSyntheticIntentEngine;
    this.counterEngine = counterEngine || defaultCounterBidEngine;
    logger.info('[IntentMatcher:init] IntentMatcher initialized', {
      hasCustomSyntheticEngine: Boolean(syntheticEngine),
      hasCustomCounterEngine: Boolean(counterEngine),
    });
  }

  /**
   * Evaluates synthetic intent proposal and validates PayPal Vault setup token binding.
   * Merchant floor price is strictly preserved and never exposed in the response.
   */
  async matchAndIssueVoucher(proposal: SyntheticIntentProposal): Promise<IntentMatchResult> {
    const endTimer = logger.time('IntentMatcher:matchAndIssueVoucher');
    logger.info('[IntentMatcher:matchAndIssueVoucher] Commencing intent matching and voucher evaluation', {
      mandateId: proposal.mandate_id,
      buyerBidCents: proposal.buyer_bid_cents,
      buyerBudgetCapCents: proposal.buyer_budget_cap_cents,
      retailOfferCents: proposal.retail_offer_cents,
      merchantDomain: proposal.merchant_domain,
      productId: proposal.channel3_product_id,
      commissionRebateRate: proposal.commission_rebate_rate,
      merchantMinFloorDiscountPct: proposal.merchant_min_floor_discount_pct,
    });

    const effectiveBidCents = proposal.buyer_bid_cents ?? proposal.buyer_budget_cap_cents;
    const budgetOverageCents = Math.max(0, proposal.retail_offer_cents - effectiveBidCents);
    const overagePercentage = proposal.retail_offer_cents > 0
      ? (budgetOverageCents / proposal.retail_offer_cents) * 100
      : 0;
    logger.debug('[IntentMatcher:budget_comparison]', {
      effectiveBidCents,
      budgetOverageCents,
      overagePercentage: overagePercentage.toFixed(2),
    });

    let evaluation: SyntheticIntentEvaluation;
    try {
      evaluation = await this.syntheticEngine.evaluateAndIssueVoucher(proposal);
      logger.info(`[IntentMatcher:matchAndIssueVoucher] Synthetic intent evaluation outcome`, {
        voucherId: evaluation.voucher_id,
        eligible: evaluation.eligible_for_synthetic_intent,
        negotiationStatus: evaluation.negotiation_status,
        overagePercentage: evaluation.overage_percentage,
        autoCleared: evaluation.auto_cleared,
        reason: evaluation.reason,
      });
    } catch (err: any) {
      logger.error('[IntentMatcher:matchAndIssueVoucher] Evaluation failed in SyntheticIntentEngine', {
        proposal: sanitizeForLogging(proposal),
        error: sanitizeForLogging(err),
        stack: err?.stack,
      });
      throw err;
    }

    const vaultToken = evaluation.paypal_vault_setup_token_id;
    let vaultTokenValid = false;
    if (vaultToken) {
      vaultTokenValid = isValidPayPalVaultSetupToken(vaultToken);
      logger.info(`[IntentMatcher:vault_token_validation] Token ${vaultToken} format validity: ${vaultTokenValid}`);
    } else {
      logger.warn('[IntentMatcher:vault_token_validation] No paypal_vault_setup_token_id found on evaluation payload');
    }

    // Guarantee merchant floor confidentiality in response
    const sanitizedEvaluation: SyntheticIntentEvaluation = { ...evaluation };
    if ('merchant_min_floor_cents' in (sanitizedEvaluation as any)) {
      logger.debug('[IntentMatcher:floor_confidentiality] Stripping confidential merchant_min_floor_cents from evaluation');
      delete (sanitizedEvaluation as any).merchant_min_floor_cents;
    } else {
      logger.debug('[IntentMatcher:floor_confidentiality] merchant_min_floor_cents not present on evaluation payload');
    }

    const isFloorConfidential = (sanitizedEvaluation as any).merchant_min_floor_cents === undefined;
    logger.info('[IntentMatcher:matchAndIssueVoucher] Completed intent matching and voucher evaluation', {
      voucherId: sanitizedEvaluation.voucher_id,
      eligible: sanitizedEvaluation.eligible_for_synthetic_intent,
      negotiationStatus: sanitizedEvaluation.negotiation_status,
      vaultTokenValid,
      floorConfidential: isFloorConfidential,
    });

    endTimer(`voucherId=${sanitizedEvaluation.voucher_id || 'none'}, eligible=${sanitizedEvaluation.eligible_for_synthetic_intent}`);
    return {
      evaluation: sanitizedEvaluation,
      vault_token_valid: vaultTokenValid,
      floor_confidential: isFloorConfidential,
    };
  }

  /**
   * Executes bounded counter-bid negotiation enforcing max 2 turns
   * and floor price confidentiality.
   */
  async negotiateCounter(request: CounterBidRequest): Promise<CounterBidResult> {
    const endTimer = logger.time('IntentMatcher:negotiateCounter');
    logger.info('[IntentMatcher:negotiateCounter] Initiating counter-bid evaluation', {
      voucherId: request.voucher_id,
      buyerBidCents: request.buyer_bid_cents,
      retailOfferCents: request.retail_offer_cents,
      turn: request.turn,
      merchantDomain: request.merchant_domain,
      autoAcceptBufferCents: request.auto_accept_buffer_cents,
    });

    let result: CounterBidResult;
    try {
      result = await this.counterEngine.evaluateCounterBid(request);
      logger.info(`[IntentMatcher:negotiateCounter] Counter-bid settled with status: ${result.status}`, {
        status: result.status,
        turn: result.turn,
        maxTurnsReached: result.max_turns_reached,
        mandateVerified: result.ed25519_mandate_verified,
        policyCompliance: result.policy_compliance,
        hasHitlPrompt: Boolean(result.hitl_prompt?.required),
        hasOrderResult: Boolean(result.resulting_order_id),
      });
    } catch (err: any) {
      logger.error('[IntentMatcher:negotiateCounter] Evaluation failed in CounterBidEngine', {
        request: sanitizeForLogging(request),
        error: sanitizeForLogging(err),
        stack: err?.stack,
      });
      throw err;
    }

    // Ensure merchant floor cents is not leaked in merchant_counter_voucher
    if (result.merchant_counter_voucher) {
      if ('merchant_floor_cents' in (result.merchant_counter_voucher as any)) {
        logger.debug('[IntentMatcher:negotiateCounter] Stripping confidential merchant_floor_cents from counter voucher');
        delete (result.merchant_counter_voucher as any).merchant_floor_cents;
      }
    } else {
      logger.debug('[IntentMatcher:negotiateCounter] No merchant_counter_voucher returned in result');
    }

    endTimer(`status=${result.status}, turn=${result.turn}`);
    return result;
  }

  /**
   * Static helper verifying setup token binding to a voucher ID
   */
  static isSetupTokenBound(voucherId: string, tokenId: string): boolean {
    logger.debug('[IntentMatcher:isSetupTokenBound] Verifying voucher-token binding', {
      voucherId,
      hasTokenId: Boolean(tokenId),
    });

    if (!voucherId || !tokenId) {
      logger.debug('[IntentMatcher:isSetupTokenBound] Either voucherId or tokenId missing, returning false', {
        hasVoucherId: Boolean(voucherId),
        hasTokenId: Boolean(tokenId),
      });
      return false;
    }

    const isVoucherValid = voucherId.startsWith('syn_');
    const isTokenValid = isValidPayPalVaultSetupToken(tokenId);
    const bound = isVoucherValid && isTokenValid;

    logger.debug('[IntentMatcher:isSetupTokenBound] Validation result', {
      voucherId,
      isVoucherValid,
      isTokenValid,
      bound,
    });

    return bound;
  }
}

export const defaultIntentMatcher = new IntentMatcher();
