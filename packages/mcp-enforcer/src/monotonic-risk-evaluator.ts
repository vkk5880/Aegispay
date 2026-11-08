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

  try {
    resolvedAiVerdict = typeof aiVerdictOrFn === 'function' ? aiVerdictOrFn() : aiVerdictOrFn;
  } catch (error) {
    // If AI evaluation throws or fails, fail-closed to fallback severity
    resolvedAiVerdict = failClosed;
  }

  const detSeverity = SEVERITY_MAP[deterministicVerdict];
  const aiSeverity = SEVERITY_MAP[resolvedAiVerdict];

  // Strictly enforce max(Deterministic, AI)
  const maxSeverity = Math.max(detSeverity, aiSeverity);
  const finalVerdict = VERDICT_MAP[maxSeverity];
  const escalated = maxSeverity > detSeverity;

  let rationale = `Deterministic: ${deterministicVerdict} (level ${detSeverity}), AI: ${resolvedAiVerdict} (level ${aiSeverity}) -> Final: ${finalVerdict}`;
  if (escalated) {
    rationale += ` [ESCALATED by AI risk review: ${options.aiReason || 'Elevated risk detected'}]`;
  } else if (options.deterministicReason && maxSeverity === detSeverity) {
    rationale += ` [Governed by deterministic rule: ${options.deterministicReason}]`;
  }

  return {
    final_verdict: finalVerdict,
    deterministic_verdict: deterministicVerdict,
    ai_verdict: resolvedAiVerdict,
    escalated,
    rationale,
  };
}
