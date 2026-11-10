import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('MCP:Enforcer:MerchantAnomalyGate', { stream: 'stderr' });

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
  logger.debug('Evaluating merchant anomaly score', { context: sanitizeForLogging(context) });

  let score = 0;
  const rawDisputeRate = context.disputeRate ?? 0;
  const disputeRate = Math.max(0, rawDisputeRate);

  const rawDiscountVariance = context.averageDiscountVariance ?? 0;
  const averageDiscountVariance = Math.max(0, rawDiscountVariance);

  logger.debug('Sanitized merchant anomaly input parameters', {
    domain: context.domain,
    rawDisputeRate,
    disputeRate,
    rawDiscountVariance,
    averageDiscountVariance,
  });

  // Base penalty for extremely high dispute rates (e.g., > 10%)
  if (disputeRate > 0.1) {
    const penalty = disputeRate * 5000;
    score += penalty;
    logger.warn('Elevated dispute rate penalty applied (>10% threshold breached)', {
      disputeRate,
      threshold: 0.1,
      multiplier: 5000,
      penaltyAdded: penalty,
      currentScore: score,
    });
  } else {
    const penalty = disputeRate * 1000;
    score += penalty;
    logger.debug('Standard dispute rate penalty applied (<=10% threshold)', {
      disputeRate,
      threshold: 0.1,
      multiplier: 1000,
      penaltyAdded: penalty,
      currentScore: score,
    });
  }

  // Penalty for suspicious markdowns (e.g., > 85% discount)
  if (averageDiscountVariance > 0.85) {
    const markdownPenalty = (averageDiscountVariance - 0.85) * 2000;
    score += markdownPenalty;
    logger.warn('Suspicious discount variance penalty applied (>85% markdown)', {
      averageDiscountVariance,
      threshold: 0.85,
      multiplier: 2000,
      penaltyAdded: markdownPenalty,
      currentScore: score,
    });
  } else {
    logger.debug('Discount variance within normal bounds (<=85%)', {
      averageDiscountVariance,
      threshold: 0.85,
      currentScore: score,
    });
  }

  // Simple heuristic for suspicious domains (e.g., very long strings or random chars)
  // In a real system, this would be a more sophisticated model or list
  const isDomainTooLong = context.domain.length > 30;
  const hasConsecutiveDigits = /\d{5,}/.test(context.domain);

  if (isDomainTooLong || hasConsecutiveDigits) {
    score += 150;
    logger.warn('Suspicious domain structure detected', {
      domain: context.domain,
      domainLength: context.domain.length,
      isDomainTooLong,
      hasConsecutiveDigits,
      penaltyAdded: 150,
      currentScore: score,
    });
  } else {
    logger.debug('Domain structure verified safe', {
      domain: context.domain,
      domainLength: context.domain.length,
      isDomainTooLong,
      hasConsecutiveDigits,
      currentScore: score,
    });
  }

  const boundedScore = Math.min(Math.floor(score), 1000);
  logger.info('Calculated merchant anomaly score', {
    domain: context.domain,
    rawScore: score,
    boundedScore,
    maxThreshold: 1000,
  });

  return boundedScore;
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
  const allowed = score <= 300;
  if (allowed) {
    logger.info('Merchant risk anomaly check PASSED', {
      anomalyScore: score,
      riskThreshold: 300,
      verdict: 'ALLOWED',
    });
  } else {
    logger.warn('Merchant risk anomaly check REJECTED (exceeds threshold 300)', {
      anomalyScore: score,
      riskThreshold: 300,
      verdict: 'REJECTED',
      excessScore: score - 300,
    });
  }
  return allowed;
}
