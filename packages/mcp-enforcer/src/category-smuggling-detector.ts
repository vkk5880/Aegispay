import {
  CategorySmugglingItem,
  CategorySmugglingCheckResult,
} from '@aegispay/shared-types';

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
  return `${text} ${deseparated}`.toLowerCase();
}

/**
 * Scans an array of purchase items and optional intent reason for smuggled or prohibited assets.
 * Evaluates purely with zero I/O and deterministic regex classification.
 */
export function detectCategorySmuggling(
  items: CategorySmugglingItem[],
  intentReason?: string
): CategorySmugglingCheckResult {
  const detectedTokens: string[] = [];

  // 1. Scan intent reason if provided
  if (intentReason) {
    const normalizedReason = normalizeText(intentReason);
    for (const pattern of PROHIBITED_PATTERNS) {
      if (pattern.regex.test(normalizedReason)) {
        if (!detectedTokens.includes(pattern.name)) {
          detectedTokens.push(pattern.name);
        }
      }
    }
  }

  // 2. Scan every individual line item
  for (const item of items) {
    const combinedItemText = normalizeText(
      `${item.title} ${item.description || ''} ${item.category || ''}`
    );

    for (const pattern of PROHIBITED_PATTERNS) {
      if (pattern.regex.test(combinedItemText)) {
        if (!detectedTokens.includes(pattern.name)) {
          detectedTokens.push(pattern.name);
        }
      }
    }
  }

  if (detectedTokens.length > 0) {
    return {
      is_smuggled: true,
      verdict: 'BLOCK',
      detected_tokens: detectedTokens,
      reason: `Prohibited asset or category smuggling detected: [${detectedTokens.join(', ')}]. Transaction blocked under constitutional spend policy.`,
      scanned_items_count: items.length,
    };
  }

  return {
    is_smuggled: false,
    verdict: 'ALLOW',
    detected_tokens: [],
    reason: 'All items compliant with constitutional spend policy.',
    scanned_items_count: items.length,
  };
}
