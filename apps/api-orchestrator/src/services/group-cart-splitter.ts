import { GroupExpenseSplit, GroupSplitParticipant, createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('API:Services:CatalogAndDisputes');

export interface SplitOptions {
  total_cents: number;
  tip_cents?: number;
  tax_cents?: number;
  participants: Array<{ id: string; name: string; weight?: number }>;
}

/**
 * Pure deterministic multi-party cart and expense splitter.
 * Guarantees integer-cent float safety and exact conservation of money:
 * Sum(shares.map(s => s.share_cents)) === (total_cents + tip_cents + tax_cents).
 *
 * Any remainder cents resulting from division (e.g., 1000 cents among 3 people)
 * are deterministically distributed one cent at a time to the highest weighted participants.
 */
export function splitGroupExpense(options: SplitOptions): GroupExpenseSplit {
  const { total_cents, tip_cents = 0, tax_cents = 0, participants } = options;

  logger.info('[GroupCartSplitter] splitGroupExpense invoked', {
    total_cents,
    tip_cents,
    tax_cents,
    participantCount: participants?.length || 0,
    participants: sanitizeForLogging(participants),
  });

  if (!participants || participants.length === 0) {
    logger.error('[GroupCartSplitter] Cannot split expense: empty or undefined participants array');
    throw new Error('At least one participant is required to split an expense');
  }

  const grandTotalCents = Math.round(total_cents + tip_cents + tax_cents);
  if (grandTotalCents <= 0) {
    logger.error('[GroupCartSplitter] Invalid split grand total', {
      grandTotalCents,
      total_cents,
      tip_cents,
      tax_cents,
    });
    throw new Error('Total split amount must be greater than zero');
  }

  const totalWeight = participants.reduce((sum, p) => sum + (p.weight || 1), 0);
  logger.debug('[GroupCartSplitter] Calculated total weight for split allocation', {
    totalWeight,
    grandTotalCents,
  });

  // Initial integer floor allocation and fractional remainder tracking
  let allocatedCents = 0;
  const participantShares: {
    participant_id: string;
    share_cents: number;
    fractional_remainder: number;
    percentage: number;
  }[] = [];

  for (const p of participants) {
    const weight = p.weight || 1;
    const proportion = weight / totalWeight;
    const exactShare = grandTotalCents * proportion;
    const floorShare = Math.floor(exactShare);
    const remainder = exactShare - floorShare;

    allocatedCents += floorShare;
    participantShares.push({
      participant_id: p.id,
      share_cents: floorShare,
      fractional_remainder: remainder,
      percentage: Number((proportion * 100).toFixed(2)),
    });

    logger.debug('[GroupCartSplitter] Initial participant share computed', {
      participantId: p.id,
      weight,
      proportion,
      floorShare,
      fractionalRemainder: remainder,
    });
  }

  // Distribute residual cents to participants with highest fractional remainder
  let residualCents = grandTotalCents - allocatedCents;
  logger.debug('[GroupCartSplitter] Residual cents to allocate', {
    grandTotalCents,
    allocatedCents,
    residualCents,
  });

  const sortedIndices = participantShares
    .map((item, idx) => ({ idx, remainder: item.fractional_remainder }))
    .sort((a, b) => b.remainder - a.remainder);

  let currentRank = 0;
  while (residualCents > 0) {
    const targetIdx = sortedIndices[currentRank % sortedIndices.length].idx;
    participantShares[targetIdx].share_cents += 1;
    logger.debug('[GroupCartSplitter] Distributed residual cent', {
      recipientId: participantShares[targetIdx].participant_id,
      newShareCents: participantShares[targetIdx].share_cents,
      remainingResidual: residualCents - 1,
    });
    residualCents -= 1;
    currentRank++;
  }

  const splitResult: GroupExpenseSplit = {
    total_cents: grandTotalCents,
    tip_cents,
    tax_cents,
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      weight: p.weight ?? 1,
    })),
    shares: participantShares.map((p) => ({
      participant_id: p.participant_id,
      share_cents: p.share_cents,
      percentage: p.percentage,
    })),
    rounding_residual_cents: 0,
  };

  const verificationSum = splitResult.shares.reduce((acc, s) => acc + s.share_cents, 0);
  const isExactConservation = verificationSum === grandTotalCents;

  if (!isExactConservation) {
    logger.error('[GroupCartSplitter] Monetary conservation violation detected!', {
      grandTotalCents,
      verificationSum,
      difference: grandTotalCents - verificationSum,
    });
  } else {
    logger.info('[GroupCartSplitter] Group expense split completed with exact monetary conservation', {
      grandTotalCents,
      participantsCount: splitResult.participants.length,
      verificationSum,
    });
  }

  return splitResult;
}
