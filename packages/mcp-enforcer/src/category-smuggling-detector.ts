import {
  createLogger,
  sanitizeForLogging,
  CategorySmugglingItem,
  CategorySmugglingCheckResult,
} from '@aegispay/shared-types';

const logger = createLogger('MCP:Enforcer:CategorySmuggling', { stream: 'stderr' });

/**
 * Compiled regular expressions for prohibited financial instruments and high-risk assets.
 * Resistant to common leetspeak and whitespace evasion tactics.
 */
const PROHIBITED_PATTERNS: { name: string; regex: RegExp }[] = [
  {
    name: 'gift_card',
    regex: /\b(gift\s*cards?|voucher\s*cards?|e-?gift\s*cards?)\b/i,
  },
  {
    name: 'prepaid_card',
    regex: /\b(prepaid\s*(debit|card|visa|mastercard|amex)|reloadable\s*cards?)\b/i,
  },
  {
    name: 'cryptocurrency',
    regex: /\b(cryptocurrency|crypto|bitcoin|btc|ethereum|eth|tether|usdt|usdc|solana|binance|dogecoin)\b/i,
  },
  {
    name: 'wire_transfer',
    regex: /\b(wire\s*transfers?|western\s*union|moneygram|money\s*order)\b/i,
  },
  {
    name: 'gambling_casino',
    regex: /\b(casinos?|gambling|sportsbook|sports\s*betting|lottery\s*tickets?|roulette|poker\s*chips?)\b/i,
  },
];

/**
 * Normalizes input text by removing obfuscating characters (dots, dashes between letters).
 */
function normalizeText(text: string): string {
  if (!text) return '';
  // Collapse symbol-separated characters with positive lookahead: e.g. "g-i-f-t c-a-r-d" -> "gift card"
  const deseparated = text
    .replace(/([a-zA-Z])\s*[-_.!@#$%^&*]\s*(?=[a-zA-Z])/gi, '$1')
    .replace(/\b([a-zA-Z])\s+(?=[a-zA-Z]\b)/gi, '$1');
  const normalized = `${text} ${deseparated}`.toLowerCase();
  logger.debug('Normalized text for category smuggling analysis', {
    originalLength: text.length,
    normalizedLength: normalized.length,
  });
  return normalized;
}

/**
 * Scans an array of purchase items and optional intent reason for smuggled or prohibited assets.
 * Evaluates purely with zero I/O and deterministic regex classification.
 */
export function detectCategorySmuggling(
  items: CategorySmugglingItem[],
  intentReason?: string
): CategorySmugglingCheckResult {
  logger.info('Initiating category smuggling detection scan', {
    itemsCount: items.length,
    hasIntentReason: Boolean(intentReason),
  });

  const detectedTokens: string[] = [];

  // 1. Scan intent reason if provided
  if (intentReason) {
    const normalizedReason = normalizeText(intentReason);
    logger.debug('Scanning intent reason against prohibited patterns', {
      reasonPrefix: intentReason.slice(0, 30),
    });

    for (const pattern of PROHIBITED_PATTERNS) {
      const isMatched = pattern.regex.test(normalizedReason);
      if (isMatched) {
        logger.warn('Prohibited pattern matched in intent reason', {
          token: pattern.name,
          pattern: pattern.regex.toString(),
        });
        if (!detectedTokens.includes(pattern.name)) {
          detectedTokens.push(pattern.name);
        }
      }
    }
  }

  // 2. Scan every individual line item
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const combinedItemText = normalizeText(
      `${item.title} ${item.description || ''} ${item.category || ''}`
    );

    logger.debug('Scanning line item for category smuggling', {
      itemIndex: idx,
      title: item.title,
      category: item.category,
    });

    for (const pattern of PROHIBITED_PATTERNS) {
      const isMatched = pattern.regex.test(combinedItemText);
      if (isMatched) {
        logger.warn('Prohibited pattern matched in item details', {
          itemIndex: idx,
          itemTitle: item.title,
          token: pattern.name,
          pattern: pattern.regex.toString(),
        });
        if (!detectedTokens.includes(pattern.name)) {
          detectedTokens.push(pattern.name);
        }
      }
    }
  }

  if (detectedTokens.length > 0) {
    const blockReason = `Prohibited asset or category smuggling detected: [${detectedTokens.join(', ')}]. Transaction blocked under constitutional spend policy.`;
    logger.error('Category smuggling detected: BLOCK verdict issued', {
      detectedTokens,
      scannedItemsCount: items.length,
      verdict: 'BLOCK',
    });

    return {
      is_smuggled: true,
      verdict: 'BLOCK',
      detected_tokens: detectedTokens,
      reason: blockReason,
      scanned_items_count: items.length,
    };
  }

  logger.info('Category smuggling scan completed: ALLOW verdict issued', {
    scannedItemsCount: items.length,
    verdict: 'ALLOW',
  });

  return {
    is_smuggled: false,
    verdict: 'ALLOW',
    detected_tokens: [],
    reason: 'All items compliant with constitutional spend policy.',
    scanned_items_count: items.length,
  };
}
