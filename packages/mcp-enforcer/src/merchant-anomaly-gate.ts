export interface MerchantContext {
  domain: string;
  disputeRate: number; // 0.0 to 1.0
  averageDiscountVariance: number; // 0.0 to 1.0 (e.g., if compare_at_price markdowns are 85%, variance is 0.85)
}

/**
 * Calculates a merchant anomaly score based on domain, dispute rates, and discount variances.
 *
 * @param context Merchant contextual data
 * @returns A score scaled from 0 to 1000. Higher is more anomalous.
 */
export function calculateMerchantAnomalyScore(context: MerchantContext): number {
  let score = 0;

  // Base penalty for extremely high dispute rates (e.g., > 10%)
  if (context.disputeRate > 0.1) {
    score += context.disputeRate * 5000;
  } else {
    score += context.disputeRate * 1000;
  }

  // Penalty for suspicious markdowns (e.g., > 85% discount)
  if (context.averageDiscountVariance > 0.85) {
    score += (context.averageDiscountVariance - 0.85) * 2000;
  }

  // Simple heuristic for suspicious domains (e.g., very long strings or random chars)
  // In a real system, this would be a more sophisticated model or list
  if (context.domain.length > 30 || /\\d{5,}/.test(context.domain)) {
    score += 150;
  }

  return Math.min(Math.floor(score), 1000);
}

/**
 * Pre-flight check to determine if a merchant is allowed to process the transaction
 * based on their anomaly score.
 *
 * @param score The computed anomaly score (0 to 1000)
 * @returns true if allowed, false if rejected
 */
export function isMerchantAllowed(score: number): boolean {
  // As per section 3.2, score > 300 is rejected
  return score <= 300;
}
