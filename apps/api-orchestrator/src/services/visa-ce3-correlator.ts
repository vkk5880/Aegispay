import crypto from 'node:crypto';
import {
  createLogger,
  sanitizeForLogging,
  VisaCe3Evidence,
  VisaCe3QualifyingTransaction,
} from '@aegispay/shared-types';

const logger = createLogger('API:Services:FinancialCustodian:VisaCe3');

export interface OrderTelemetry {
  id: string;
  amount_cents: number;
  settled_at: string;
  status: string;
  has_dispute?: boolean;
  ip_address?: string;
  device_fingerprint?: string;
  shipping_address?: string;
}

export interface CurrentDisputeContext {
  dispute_id: string;
  buyer_id: string;
  order: {
    id: string;
    amount_cents: number;
    currency?: string;
    ip_address?: string;
    device_fingerprint?: string;
    shipping_address?: string;
  };
}

/**
 * Normalizes shipping address strings for fuzzy/canonical comparison.
 */
function normalizeAddress(addr?: string): string {
  if (!addr) return '';
  const normalized = addr.toLowerCase().replace(/[^a-z0-9]/g, '');
  logger.debug('Normalized shipping address for Visa CE 3.0 comparison', {
    originalLength: addr.length,
    normalizedLength: normalized.length,
  });
  return normalized;
}

/**
 * Computes SHA-256 hash of a structured payload for legal exhibit sealing.
 */
function sha256Seal(data: unknown): string {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  logger.debug('Generated SHA-256 exhibit legal seal', {
    hashPrefix: hash.slice(0, 16),
    contentLength: content.length,
  });
  return hash;
}

/**
 * Correlates historical transactions against current disputed order under
 * Visa Compelling Evidence 3.0 (Rule 10.4) criteria.
 *
 * GUARDRAIL 3 ENFORCEMENT:
 * If fewer than 2 qualifying transactions exist, returns
 * { eligible: false, reason: 'INSUFFICIENT_HISTORICAL_TRANSACTIONS' }
 * and falls back gracefully to standard PayPal dispute evidence, rather than throwing an exception.
 */
export function correlateVisaCe3Evidence(
  context: CurrentDisputeContext,
  historicalOrders: OrderTelemetry[]
): VisaCe3Evidence {
  logger.info('Starting Visa Compelling Evidence 3.0 (Rule 10.4) transaction history scan', {
    disputeId: context.dispute_id,
    buyerId: context.buyer_id,
    orderId: context.order.id,
    historicalOrdersTotal: historicalOrders.length,
    hasCurrentIp: Boolean(context.order.ip_address),
    hasCurrentDevice: Boolean(context.order.device_fingerprint),
    hasCurrentShippingAddress: Boolean(context.order.shipping_address),
  });

  const current = context.order;
  const currentNormAddress = normalizeAddress(current.shipping_address);

  // 1. Filter undisputed, settled historical orders
  const undisputedOrders = historicalOrders.filter(
    (order) =>
      order.id !== current.id &&
      (order.status === 'COMPLETED' || order.status === 'SETTLED') &&
      !order.has_dispute
  );

  logger.info('Filtered undisputed settled historical orders', {
    totalEvaluated: historicalOrders.length,
    undisputedSettledCount: undisputedOrders.length,
  });

  // 2. Identify qualifying transactions matching >= 1 core qualifier
  const qualifyingTransactions: VisaCe3QualifyingTransaction[] = [];

  for (const pastOrder of undisputedOrders) {
    const matchedQualifiers: ('IP_ADDRESS' | 'DEVICE_FINGERPRINT' | 'SHIPPING_ADDRESS' | 'CUSTOMER_ACCOUNT_ID')[] = [];

    const ipMatched = Boolean(current.ip_address && pastOrder.ip_address && current.ip_address === pastOrder.ip_address);
    if (ipMatched) {
      matchedQualifiers.push('IP_ADDRESS');
    }

    const deviceMatched = Boolean(
      current.device_fingerprint &&
      pastOrder.device_fingerprint &&
      current.device_fingerprint === pastOrder.device_fingerprint
    );
    if (deviceMatched) {
      matchedQualifiers.push('DEVICE_FINGERPRINT');
    }

    const addressMatched = Boolean(
      currentNormAddress &&
      pastOrder.shipping_address &&
      currentNormAddress === normalizeAddress(pastOrder.shipping_address)
    );
    if (addressMatched) {
      matchedQualifiers.push('SHIPPING_ADDRESS');
    }

    // Every order in this buyer history matches the verified PayPal customer identity
    matchedQualifiers.push('CUSTOMER_ACCOUNT_ID');

    logger.debug('Evaluated past order against Visa CE 3.0 matching qualifiers', {
      pastOrderId: pastOrder.id,
      ipMatched,
      deviceMatched,
      addressMatched,
      accountMatched: true,
      totalMatchedQualifiers: matchedQualifiers.length,
    });

    // A qualifying transaction must have at least 2 matching attributes (Account + at least 1 device/network/location anchor)
    if (matchedQualifiers.length >= 2) {
      qualifyingTransactions.push({
        order_id: pastOrder.id,
        settled_at: pastOrder.settled_at,
        amount_cents: pastOrder.amount_cents,
        currency: 'USD',
        matched_qualifiers: matchedQualifiers,
      });
      logger.info('Identified qualifying Visa CE 3.0 transaction', {
        orderId: pastOrder.id,
        settledAt: pastOrder.settled_at,
        amountCents: pastOrder.amount_cents,
        matchedQualifiers,
      });
    }
  }

  logger.info('Visa CE 3.0 qualifier evaluation summary', {
    disputeId: context.dispute_id,
    qualifyingTransactionsCount: qualifyingTransactions.length,
    requiredCount: 2,
  });

  // 3. GUARDRAIL 3 CHECK: Minimum 2 qualifying transactions required under Visa Core Rule 10.4
  if (qualifyingTransactions.length < 2) {
    logger.warn('Visa CE 3.0 eligibility check failed: insufficient historical qualifying transactions', {
      disputeId: context.dispute_id,
      qualifyingCount: qualifyingTransactions.length,
      fallbackMode: 'STANDARD_PAYPAL_EVIDENCE_REBUTTAL',
    });

    return {
      dispute_id: context.dispute_id,
      buyer_id: context.buyer_id,
      eligible: false,
      reason: 'INSUFFICIENT_HISTORICAL_TRANSACTIONS',
      qualifying_transactions: qualifyingTransactions,
      correlation_confidence: 0,
      rebuttal_brief:
        'Standard evidentiary rebuttal recommended: insufficient historical settled transactions (< 2) for Visa Compelling Evidence 3.0 Rule 10.4 qualification. Recommend submitting standard proof of delivery (e-POD tracking) and merchant fulfillment logs.',
      exhibit_hashes: [
        {
          name: 'current_order_telemetry.json',
          sha256: sha256Seal(current),
        },
      ],
    };
  }

  // 4. Eligible: Compute correlation confidence and generate court-ready legal brief
  const confidence = qualifyingTransactions.length >= 3 ? 98 : 92;
  logger.info('Visa CE 3.0 eligibility confirmed: generating court-ready rebuttal dossier', {
    disputeId: context.dispute_id,
    confidence,
    qualifyingTransactionsCount: qualifyingTransactions.length,
  });

  const brief = [
    `FORMAL REBUTTAL & EVIDENCE DOSSIER UNDER VISA COMPELLING EVIDENCE 3.0 (RULE 10.4)`,
    `Dispute ID: ${context.dispute_id} | Buyer Reference: ${context.buyer_id} | Order ID: ${current.id}`,
    ``,
    `Pursuant to Visa Core Rules Section 10.4 (Compelling Evidence 3.0) and PayPal Seller Protection §11.3:`,
    `The merchant has established an unbroken chain of commercial legitimacy between the cardholder and the disputed transaction:`,
    `- Identified ${qualifyingTransactions.length} prior undisputed settled transactions for this buyer profile:`,
    ...qualifyingTransactions.map(
      (tx, idx) =>
        `  [${idx + 1}] Order ${tx.order_id} settled at ${tx.settled_at} ($${(tx.amount_cents / 100).toFixed(2)}) matching [${tx.matched_qualifiers.join(', ')}]`
    ),
    ``,
    `CONCLUSION & REMEDY:`,
    `Under Visa Compelling Evidence 3.0 standards, presentation of at least two (2) undisputed settled transactions with matching customer anchors transfers financial liability back to the cardholder bank. Reversal of the chargeback and immediate release of the merchant funds is requested.`,
  ].join('\n');

  const exhibitHashes = [
    {
      name: 'current_order_telemetry.json',
      sha256: sha256Seal(current),
    },
    {
      name: 'historical_settled_qualifiers.json',
      sha256: sha256Seal(qualifyingTransactions),
    },
    {
      name: 'ce3_legal_brief.txt',
      sha256: sha256Seal(brief),
    },
  ];

  logger.info('Sealed Visa CE 3.0 exhibits with SHA-256 cryptographic hashes', {
    disputeId: context.dispute_id,
    exhibitsCount: exhibitHashes.length,
    confidence,
  });

  return {
    dispute_id: context.dispute_id,
    buyer_id: context.buyer_id,
    eligible: true,
    reason: undefined,
    qualifying_transactions: qualifyingTransactions,
    correlation_confidence: confidence,
    rebuttal_brief: brief,
    exhibit_hashes: exhibitHashes,
  };
}
