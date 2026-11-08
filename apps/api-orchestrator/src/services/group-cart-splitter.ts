import { GroupExpenseSplit, GroupSplitParticipant } from '@aegispay/shared-types';

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

  if (!participants || participants.length === 0) {
    throw new Error('At least one participant is required to split an expense');
  }

  const grandTotalCents = Math.round(total_cents + tip_cents + tax_cents);
  if (grandTotalCents <= 0) {
    throw new Error('Total split amount must be greater than zero');
  }

  const totalWeight = participants.reduce((sum, p) => sum + (p.weight || 1), 0);

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
  }

  // Distribute residual cents to participants with highest fractional remainder
  let residualCents = grandTotalCents - allocatedCents;
  const sortedIndices = participantShares
    .map((item, idx) => ({ idx, remainder: item.fractional_remainder }))
    .sort((a, b) => b.remainder - a.remainder);

  let currentRank = 0;
  while (residualCents > 0) {
    const targetIdx = sortedIndices[currentRank % sortedIndices.length].idx;
    participantShares[targetIdx].share_cents += 1;
    residualCents -= 1;
    currentRank++;
  }

  return {
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
}
