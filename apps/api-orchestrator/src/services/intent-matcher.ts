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

export interface IntentMatchResult {
  evaluation: SyntheticIntentEvaluation;
  vault_token_valid: boolean;
  floor_confidential: boolean;
}

export class IntentMatcher {
  private syntheticEngine: SyntheticIntentEngine;
  private counterEngine: CounterBidEngine;

  constructor(syntheticEngine?: SyntheticIntentEngine, counterEngine?: CounterBidEngine) {
    this.syntheticEngine = syntheticEngine || defaultSyntheticIntentEngine;
    this.counterEngine = counterEngine || defaultCounterBidEngine;
  }

  /**
   * Evaluates synthetic intent proposal and validates PayPal Vault setup token binding.
   * Merchant floor price is strictly preserved and never exposed in the response.
   */
  async matchAndIssueVoucher(proposal: SyntheticIntentProposal): Promise<IntentMatchResult> {
    const evaluation = await this.syntheticEngine.evaluateAndIssueVoucher(proposal);

    const vaultTokenValid = evaluation.paypal_vault_setup_token_id
      ? isValidPayPalVaultSetupToken(evaluation.paypal_vault_setup_token_id)
      : false;

    // Guarantee merchant floor confidentiality in response
    const sanitizedEvaluation: SyntheticIntentEvaluation = { ...evaluation };
    delete (sanitizedEvaluation as any).merchant_min_floor_cents;

    return {
      evaluation: sanitizedEvaluation,
      vault_token_valid: vaultTokenValid,
      floor_confidential: (sanitizedEvaluation as any).merchant_min_floor_cents === undefined,
    };
  }

  /**
   * Executes bounded counter-bid negotiation enforcing max 2 turns
   * and floor price confidentiality.
   */
  async negotiateCounter(request: CounterBidRequest): Promise<CounterBidResult> {
    const result = await this.counterEngine.evaluateCounterBid(request);

    // Ensure merchant floor cents is not leaked in merchant_counter_voucher
    if (result.merchant_counter_voucher) {
      delete (result.merchant_counter_voucher as any).merchant_floor_cents;
    }

    return result;
  }

  /**
   * Static helper verifying setup token binding to a voucher ID
   */
  static isSetupTokenBound(voucherId: string, tokenId: string): boolean {
    if (!voucherId || !tokenId) return false;
    const isVoucherValid = voucherId.startsWith('syn_');
    const isTokenValid = isValidPayPalVaultSetupToken(tokenId);
    return isVoucherValid && isTokenValid;
  }
}

export const defaultIntentMatcher = new IntentMatcher();
