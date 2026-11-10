import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('MCP:Enforcer:MonotonicRiskEvaluator', { stream: 'stderr' });

export type RiskVerdict = 'ALLOW' | 'HOLD' | 'BLOCK';

const SEVERITY_MAP: Record<RiskVerdict, number> = {
  ALLOW: 0,
  HOLD: 1,
  BLOCK: 2,
};

const VERDICT_MAP: Record<number, RiskVerdict> = {
  0: 'ALLOW',
  1: 'HOLD',
  2: 'BLOCK',
};

export interface MonotonicRiskResult {
  final_verdict: RiskVerdict;
  deterministic_verdict: RiskVerdict;
  ai_verdict: RiskVerdict;
  escalated: boolean;
  rationale: string;
}

/**
 * Evaluates the final policy verdict under the Monotonic Tightening Contract:
 * FinalVerdict = max(DeterministicVerdict, AIRiskVerdict)
 * where ALLOW (0) < HOLD (1) < BLOCK (2).
 *
 * An AI evaluator or LLM review can ONLY tighten / escalate risk, NEVER relax it.
 * If AI evaluation fails or errors, it fails closed to the specified fallback severity (default HOLD).
 */
export function evaluateMonotonicRisk(
  deterministicVerdict: RiskVerdict,
  aiVerdictOrFn: RiskVerdict | (() => RiskVerdict),
  options: {
    failClosedFallback?: RiskVerdict;
    deterministicReason?: string;
    aiReason?: string;
  } = {}
): MonotonicRiskResult {
  const failClosed = options.failClosedFallback ?? 'HOLD';
  let resolvedAiVerdict: RiskVerdict;

  logger.debug('Starting monotonic risk evaluation', {
    deterministicVerdict,
    failClosedFallback: failClosed,
    deterministicReason: options.deterministicReason,
    aiReason: options.aiReason,
  });

  try {
    if (typeof aiVerdictOrFn === 'function') {
      logger.debug('Invoking dynamic AI risk verdict evaluation function');
      resolvedAiVerdict = aiVerdictOrFn();
      logger.debug('Dynamic AI risk evaluation function completed', { resolvedAiVerdict });
    } else {
      resolvedAiVerdict = aiVerdictOrFn;
      logger.debug('Static AI risk verdict provided', { resolvedAiVerdict });
    }
  } catch (error) {
    // If AI evaluation throws or fails, fail-closed to fallback severity
    resolvedAiVerdict = failClosed;
    logger.error('AI risk evaluation crashed or failed; failing closed to fallback severity', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      failClosedFallback: failClosed,
      resolvedAiVerdict,
    });
  }

  const detSeverity = SEVERITY_MAP[deterministicVerdict];
  const aiSeverity = SEVERITY_MAP[resolvedAiVerdict];

  logger.debug('Mapped policy verdicts to monotonic severity levels', {
    deterministicVerdict,
    detSeverity,
    resolvedAiVerdict,
    aiSeverity,
    severityScale: 'ALLOW(0) < HOLD(1) < BLOCK(2)',
  });

  // Strictly enforce max(Deterministic, AI)
  const maxSeverity = Math.max(detSeverity, aiSeverity);
  const finalVerdict = VERDICT_MAP[maxSeverity];
  const escalated = maxSeverity > detSeverity;

  let rationale = `Deterministic: ${deterministicVerdict} (level ${detSeverity}), AI: ${resolvedAiVerdict} (level ${aiSeverity}) -> Final: ${finalVerdict}`;
  if (escalated) {
    rationale += ` [ESCALATED by AI risk review: ${options.aiReason || 'Elevated risk detected'}]`;
    logger.warn('Monotonic risk ESCALATED by AI review (risk tightened)', {
      deterministicVerdict,
      aiVerdict: resolvedAiVerdict,
      finalVerdict,
      escalated: true,
      reason: options.aiReason,
      rationale,
    });
  } else if (options.deterministicReason && maxSeverity === detSeverity) {
    rationale += ` [Governed by deterministic rule: ${options.deterministicReason}]`;
    logger.info('Deterministic policy retained (AI did not tighten further)', {
      deterministicVerdict,
      aiVerdict: resolvedAiVerdict,
      finalVerdict,
      escalated: false,
      deterministicReason: options.deterministicReason,
      rationale,
    });
  } else {
    logger.info('Monotonic policy evaluation concluded without escalation', {
      deterministicVerdict,
      aiVerdict: resolvedAiVerdict,
      finalVerdict,
      escalated: false,
      rationale,
    });
  }

  const result: MonotonicRiskResult = {
    final_verdict: finalVerdict,
    deterministic_verdict: deterministicVerdict,
    ai_verdict: resolvedAiVerdict,
    escalated,
    rationale,
  };

  logger.debug('Monotonic risk evaluation complete', { result: sanitizeForLogging(result) });
  return result;
}
