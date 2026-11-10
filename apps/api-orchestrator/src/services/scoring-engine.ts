/**
 * apps/api-orchestrator/src/services/scoring-engine.ts
 *
 * Deterministic Mathematical Scoring Engine for Channel3 Product Results.
 * Harvested and adapted from Murthyroshan autonomous-commerce-agent.
 *
 * Guaranteed 0% LLM math hallucination:
 * The LLM never ranks items or does arithmetic; this deterministic engine computes scores.
 *
 * Multi-attribute composite utility formula:
 * Score = w1 * CosineSim + w2 * (1 - |Price - Target| / Target) + w3 * Reputation - w4 * ShippingDays
 */

import { Channel3ProductDetail, Channel3Offer } from './channel3.client.js';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('API:Services:ScoringEngine');

export interface ScoringWeights {
  w1_cosine: number;       // default 0.35
  w2_price: number;        // default 0.35
  w3_reputation: number;   // default 0.20
  w4_shipping: number;     // default 0.10
}

export type ScoringPreset = 'DEFAULT' | 'BUDGET_CONSCIOUS' | 'SPEED_FIRST' | 'REPUTATION_FIRST';

export const SCORING_WEIGHT_PRESETS: Record<ScoringPreset, ScoringWeights> = {
  DEFAULT: {
    w1_cosine: 0.35,
    w2_price: 0.35,
    w3_reputation: 0.20,
    w4_shipping: 0.10,
  },
  BUDGET_CONSCIOUS: {
    w1_cosine: 0.20,
    w2_price: 0.60,
    w3_reputation: 0.15,
    w4_shipping: 0.05,
  },
  SPEED_FIRST: {
    w1_cosine: 0.25,
    w2_price: 0.20,
    w3_reputation: 0.15,
    w4_shipping: 0.40,
  },
  REPUTATION_FIRST: {
    w1_cosine: 0.25,
    w2_price: 0.20,
    w3_reputation: 0.45,
    w4_shipping: 0.10,
  },
};

export const WEIGHT_PRESETS = SCORING_WEIGHT_PRESETS;
export const REPUTATION_FIRST = SCORING_WEIGHT_PRESETS.REPUTATION_FIRST;
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = SCORING_WEIGHT_PRESETS.DEFAULT;

export interface ScoringQueryContext {
  query: string;
  target_price_cents?: number;
  max_price_cents?: number;
  category_id?: string;
  preset?: ScoringPreset;
  weights?: Partial<ScoringWeights>;
  max_shipping_days?: number; // normalization baseline, defaults to 7 days
  preferred_brands?: string[];
  preferred_sources?: string[];
  avoided_brands?: string[];
}

export interface ScoreBreakdown {
  cosine_similarity: number;
  price_affinity: number;
  reputation_score: number;
  shipping_penalty: number;
  raw_score: number;
  brand_boost_multiplier?: number;
  source_boost_multiplier?: number;
  anomaly_penalty_multiplier?: number;
}

export interface DealVerdict {
  verdict_text: string;
  verdict_colour: string; // CSS-friendly hex code
}

export interface ProductBadge {
  label: 'Best Value' | 'Fastest Delivery' | 'Top Rated Merchant' | 'Price Leader' | 'Most Reviewed' | 'Top Rated' | 'Budget Pick' | 'Premium Pick' | 'Preferred Brand' | 'Low Confidence' | 'Penalized Rating' | string;
  color: string;
  description?: string;
  note?: string;
}

export interface PrimaryBadge {
  tier: 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'eliminated';
  label: string;
  color: string;
  icon: string;
  description: string;
  trust_multiplier: number;
  suspicious_override: boolean;
  original_tier?: string;
}

export interface RankedProductItem {
  product_id: string;
  title: string;
  description: string;
  category_id: string;
  selected_offer: Channel3Offer;
  score: number; // Final deterministic composite utility score [0.0000, 1.0000]
  deal_verdict: DealVerdict;
  score_breakdown: ScoreBreakdown;
  primary_badge?: PrimaryBadge;
  badges?: ProductBadge[];
  secondary_badges?: ProductBadge[];
  adjusted_rating?: number;
  rating_verified?: boolean;
  price_anomaly: {
    is_suspicious: boolean;
    deviation_pct: number;
    median_price_cents: number;
  };
  eliminated?: boolean;
  elimination_reason?: string;
}

// Store Trust Configuration adapted from autonomous-commerce-agent
export const OFFICIAL_STORE_KEYWORDS = [
  'oneplus', 'samsung', 'apple', 'xiaomi', 'realme', 'oppo',
  'vivo', 'sony', 'motorola', 'nothing', 'iqoo', 'boat',
  'noise', 'hp', 'dell', 'lenovo', 'asus', 'acer', 'canon',
  'nikon', 'dyson', 'official', 'brand store', 'authorized',
  'bose', 'anker', 'google', 'nomad'
];

export const HIGH_TRUST_RETAILERS = ['amazon', 'flipkart'];

export const TRUSTED_RETAILER_KEYWORDS = [
  'croma', 'reliance digital', 'reliance', 'vijay sales', 'tatacliq',
  'meesho', 'jiomart', 'snapdeal', 'paytm mall', 'bestbuy', 'walmart',
  'target', 'bhphotovideo', 'newegg', 'adorama', 'techmerchant.com', 'powerhub.net'
];

export const STORE_TRUST_TIERS = {
  tier1: {
    multiplier: 1.12,
    base_reputation: 0.95,
    keywords: OFFICIAL_STORE_KEYWORDS,
  },
  tier2_high: {
    multiplier: 1.06,
    base_reputation: 0.85,
    keywords: HIGH_TRUST_RETAILERS,
  },
  tier2_low: {
    multiplier: 1.03,
    base_reputation: 0.75,
    keywords: TRUSTED_RETAILER_KEYWORDS,
  },
  unknown: {
    multiplier: 0.88,
    base_reputation: 0.50,
  },
};

export function classifyStoreTier(source: string): 'tier1' | 'tier2_high' | 'tier2_low' | 'tier3' {
  const s = (source || '').toLowerCase();
  if (OFFICIAL_STORE_KEYWORDS.some(kw => s.includes(kw))) {
    logger.debug(`classifyStoreTier: "${source}" classified as tier1 (Official Store keyword match)`);
    return 'tier1';
  }
  if (HIGH_TRUST_RETAILERS.some(kw => s.includes(kw))) {
    logger.debug(`classifyStoreTier: "${source}" classified as tier2_high (High Trust Retailer match)`);
    return 'tier2_high';
  }
  if (TRUSTED_RETAILER_KEYWORDS.some(kw => s.includes(kw))) {
    logger.debug(`classifyStoreTier: "${source}" classified as tier2_low (Trusted Retailer keyword match)`);
    return 'tier2_low';
  }
  logger.debug(`classifyStoreTier: "${source}" classified as tier3 (Unverified Seller)`);
  return 'tier3';
}

export function buildPrimaryBadge(product: {
  domain?: string;
  source?: string;
  eliminated?: boolean;
  elimination_reason?: string;
  price_suspicious?: boolean;
  anomaly_deviation_pct?: number;
  anomaly_median_price_cents?: number;
  trust_multiplier?: number;
}): PrimaryBadge {
  const source = product.domain || product.source || '';
  const eliminated = Boolean(product.eliminated);
  const suspicious = Boolean(product.price_suspicious);

  logger.debug(`buildPrimaryBadge: evaluating badge for source="${source}", eliminated=${eliminated}, suspicious=${suspicious}`);

  if (eliminated) {
    logger.debug(`buildPrimaryBadge: product eliminated ("${product.elimination_reason || 'Unknown reason'}"), assigning Eliminated badge`);
    return {
      tier: 'eliminated',
      label: 'Eliminated',
      color: '#3a3a3a',
      icon: 'block',
      description: product.elimination_reason || 'Removed by policy or constraint',
      trust_multiplier: 0.0,
      suspicious_override: false,
    };
  }

  const storeTier = classifyStoreTier(source);

  if (suspicious) {
    logger.warn(`buildPrimaryBadge: product marked suspicious (${product.anomaly_deviation_pct?.toFixed(1) || '35.0'}% deviation), assigning tier4 Suspicious Listing badge`);
    return {
      tier: 'tier4',
      label: 'Suspicious Listing',
      color: '#ef4444',
      icon: 'alert_circle',
      description: `Price is ${product.anomaly_deviation_pct?.toFixed(1) || '35.0'}% below median $${(((product.anomaly_median_price_cents || 0)) / 100).toFixed(2)}. Verify before purchasing.`,
      trust_multiplier: product.trust_multiplier ?? 0.88,
      suspicious_override: true,
      original_tier: storeTier,
    };
  }

  if (storeTier === 'tier1') {
    logger.debug(`buildPrimaryBadge: assigning tier1 Official Store badge`);
    return {
      tier: 'tier1',
      label: 'Official Store',
      color: '#00d4aa',
      icon: 'shield',
      description: 'Full official warranty guaranteed.',
      trust_multiplier: product.trust_multiplier ?? 1.12,
      suspicious_override: false,
    };
  }

  if (storeTier === 'tier2_high' || storeTier === 'tier2_low') {
    logger.debug(`buildPrimaryBadge: assigning tier2 Trusted Retailer badge`);
    return {
      tier: 'tier2',
      label: 'Trusted Retailer',
      color: '#7c3aed',
      icon: 'seal',
      description: 'Established retailer with buyer protection.',
      trust_multiplier: product.trust_multiplier ?? (storeTier === 'tier2_high' ? 1.06 : 1.03),
      suspicious_override: false,
    };
  }

  logger.debug(`buildPrimaryBadge: assigning tier3 Unverified Seller badge`);
  return {
    tier: 'tier3',
    label: 'Unverified Seller',
    color: '#e8a045',
    icon: 'warning_triangle',
    description: 'Check seller ratings before purchasing.',
    trust_multiplier: product.trust_multiplier ?? 0.88,
    suspicious_override: false,
  };
}

export const NEUTRAL_RATING = 2.5;
export const CONFIDENCE_FLOOR = 100;

export function computeConfidenceAdjustedRating(
  rating: number,
  reviewCount: number
): { adjusted_rating: number; rating_verified: boolean } {
  logger.debug(`computeConfidenceAdjustedRating: input rating=${rating}, reviewCount=${reviewCount}`);
  if (rating <= 0.0) {
    logger.debug(`computeConfidenceAdjustedRating: non-positive rating <= 0.0, fallback to NEUTRAL_RATING=${NEUTRAL_RATING}`);
    return { adjusted_rating: NEUTRAL_RATING, rating_verified: false };
  }
  const confidence = Math.min(Math.max(0, reviewCount), CONFIDENCE_FLOOR) / CONFIDENCE_FLOOR;
  const adjusted = Math.round((confidence * rating + (1 - confidence) * NEUTRAL_RATING) * 10000) / 10000;
  logger.debug(`computeConfidenceAdjustedRating: confidence=${confidence.toFixed(4)}, adjusted_rating=${adjusted}`);
  return { adjusted_rating: adjusted, rating_verified: true };
}

export function logNormalize(values: number[]): number[] {
  if (!values || values.length === 0) {
    logger.debug('logNormalize: empty values array received');
    return [];
  }
  const logged = values.map(v => {
    const safeV = Number.isFinite(v) ? Math.max(0, v) : 0;
    return Math.log1p(safeV);
  });
  const min = Math.min(...logged);
  const max = Math.max(...logged);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max || max - min <= 0) {
    logger.debug(`logNormalize: min === max or non-finite spread (min=${min}, max=${max}), returning array of 1.0`);
    return values.map(() => 1.0);
  }
  const spread = max - min;
  return logged.map(v => {
    const norm = (v - min) / spread;
    return Number.isFinite(norm) ? Math.max(0.0, Math.min(1.0, norm)) : 1.0;
  });
}

// Deal Verdict mapping thresholds
const VERDICT_THRESHOLDS: Array<{ min_score: number; text: string; colour: string }> = [
  { min_score: 0.80, text: 'Excellent deal. Buy now.', colour: '#34d399' }, // emerald
  { min_score: 0.65, text: 'Good value.',              colour: '#a78bfa' }, // violet
  { min_score: 0.45, text: 'Decent pick.',             colour: '#fbbf24' }, // amber
  { min_score: 0.25, text: 'Wait for a sale.',         colour: '#fb923c' }, // orange
  { min_score: 0.00, text: 'Overpriced.',              colour: '#f87171' }, // red
];

export function computeDealVerdict(score: number): DealVerdict {
  logger.debug(`computeDealVerdict: evaluating deal verdict for score=${score}`);
  for (const row of VERDICT_THRESHOLDS) {
    if (score >= row.min_score) {
      logger.debug(`computeDealVerdict: score=${score} matched min_score=${row.min_score} -> "${row.text}"`);
      return { verdict_text: row.text, verdict_colour: row.colour };
    }
  }
  logger.debug(`computeDealVerdict: score=${score} fell through to fallback "Overpriced."`);
  return { verdict_text: 'Overpriced.', verdict_colour: '#f87171' };
}

/**
 * Tokenize string into a frequency map of normalized words.
 */
function tokenizeToTermFrequency(text: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!text) return map;

  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);

  for (const token of tokens) {
    map.set(token, (map.get(token) || 0) + 1);
  }
  return map;
}

/**
 * Cosine similarity between two term-frequency maps.
 * Returns float in [0.0, 1.0].
 */
export function computeCosineSimilarity(query: string, document: string): number {
  const tfQuery = tokenizeToTermFrequency(query);
  const tfDoc = tokenizeToTermFrequency(document);

  if (tfQuery.size === 0 || tfDoc.size === 0) {
    logger.debug(`computeCosineSimilarity: empty term frequency map (tfQuery=${tfQuery.size}, tfDoc=${tfDoc.size}), returning 0.0`);
    return 0.0;
  }

  let dotProduct = 0;
  let queryNormSq = 0;
  let docNormSq = 0;

  for (const [, count] of tfQuery) {
    queryNormSq += count * count;
  }

  for (const [, count] of tfDoc) {
    docNormSq += count * count;
  }

  for (const [term, qCount] of tfQuery) {
    const dCount = tfDoc.get(term);
    if (dCount !== undefined) {
      dotProduct += qCount * dCount;
    }
  }

  if (queryNormSq === 0 || docNormSq === 0) {
    logger.debug('computeCosineSimilarity: zero norm encountered, returning 0.0');
    return 0.0;
  }

  const similarity = dotProduct / (Math.sqrt(queryNormSq) * Math.sqrt(docNormSq));
  const boundedSim = Math.max(0.0, Math.min(1.0, similarity));
  logger.debug(`computeCosineSimilarity: query="${query.slice(0, 30)}...", doc="${document.slice(0, 30)}..." -> similarity=${boundedSim.toFixed(4)}`);
  return boundedSim;
}

/**
 * Price distance sensitivity formula:
 * Affinity = Math.max(0, 1 - |Price - Target| / Target)
 * If target is undefined or <= 0, defaults to 1.0 (neutral, no penalty).
 */
export function computePriceAffinity(priceCents: number, targetPriceCents?: number): number {
  if (
    targetPriceCents === undefined ||
    targetPriceCents === null ||
    !Number.isFinite(targetPriceCents) ||
    targetPriceCents <= 0
  ) {
    logger.debug(`computePriceAffinity: target price unconfigured or <= 0 (target=${targetPriceCents}), defaulting to 1.0`);
    return 1.0;
  }
  const safePrice = Number.isFinite(priceCents) && priceCents >= 0 ? priceCents : 0;
  const deviation = Math.abs(safePrice - targetPriceCents);
  const ratio = deviation / targetPriceCents;
  if (!Number.isFinite(ratio)) {
    logger.debug('computePriceAffinity: non-finite ratio, returning 0.0');
    return 0.0;
  }
  const affinity = Math.max(0.0, 1.0 - ratio);
  const finalAffinity = Math.min(1.0, affinity);
  logger.debug(`computePriceAffinity: price=${priceCents}, target=${targetPriceCents}, deviation=${deviation}, affinity=${finalAffinity.toFixed(4)}`);
  return finalAffinity;
}

export const priceAffinityScore = computePriceAffinity;

export interface MerchantReputationResult {
  reputation: number;
  tier: string;
  multiplier: number;
  valueOf(): number;
}

/**
 * Merchant reputation weighting:
 * Combines domain tier heuristics and Channel3 merchant_anomaly_score.
 * Returns float in [0.0, 1.0].
 */
export function computeMerchantReputation(
  offer: Channel3Offer | { domain?: string; merchant_anomaly_score?: number }
): MerchantReputationResult {
  const domain = (offer?.domain || '').toLowerCase();
  let tier = 'unknown';
  let multiplier = STORE_TRUST_TIERS.unknown.multiplier;
  let baseRep = STORE_TRUST_TIERS.unknown.base_reputation;

  if (STORE_TRUST_TIERS.tier1.keywords.some(kw => domain.includes(kw))) {
    tier = 'tier1';
    multiplier = STORE_TRUST_TIERS.tier1.multiplier;
    baseRep = STORE_TRUST_TIERS.tier1.base_reputation;
  } else if (STORE_TRUST_TIERS.tier2_high.keywords.some(kw => domain.includes(kw))) {
    tier = 'tier2_high';
    multiplier = STORE_TRUST_TIERS.tier2_high.multiplier;
    baseRep = STORE_TRUST_TIERS.tier2_high.base_reputation;
  } else if (STORE_TRUST_TIERS.tier2_low.keywords.some(kw => domain.includes(kw))) {
    tier = 'tier2_low';
    multiplier = STORE_TRUST_TIERS.tier2_low.multiplier;
    baseRep = STORE_TRUST_TIERS.tier2_low.base_reputation;
  }

  // Factor in merchant_anomaly_score if present in Channel3 offer (0 = safe, 1 = fraudulent)
  const anomalyScore = offer?.merchant_anomaly_score ?? (1.0 - baseRep);
  const anomalyAdjustedReputation = Math.max(0.0, Math.min(1.0, 1.0 - anomalyScore));

  // Blend base tier reputation with anomaly check
  const finalRep = Math.min(1.0, Math.max(0.0, (baseRep * 0.5) + (anomalyAdjustedReputation * 0.5)));

  logger.debug(`computeMerchantReputation: domain="${domain}", tier=${tier}, multiplier=${multiplier}, baseRep=${baseRep}, anomalyScore=${anomalyScore}, finalRep=${finalRep.toFixed(4)}`);

  return {
    reputation: finalRep,
    tier,
    multiplier,
    valueOf() {
      return finalRep;
    },
  };
}

export function merchantReputationWeight(
  offerOrDomain: Channel3Offer | { domain?: string; merchant_anomaly_score?: number } | string
): MerchantReputationResult {
  if (typeof offerOrDomain === 'string') {
    return computeMerchantReputation({ domain: offerOrDomain });
  }
  return computeMerchantReputation(offerOrDomain);
}

/**
 * Shipping latency penalty:
 * Converts delivery days or estimated latency into a normalized penalty [0.0, 1.0].
 */
export function computeShippingPenalty(shippingDays: number, maxShippingDays: number = 7): number {
  if (!Number.isFinite(shippingDays) || shippingDays <= 0) {
    logger.debug(`computeShippingPenalty: non-positive shippingDays (${shippingDays}), penalty=0.0`);
    return 0.0;
  }
  const safeMax = Number.isFinite(maxShippingDays) && maxShippingDays > 0 ? maxShippingDays : 7;
  const normalized = Math.min(1.0, Math.max(0.0, shippingDays / safeMax));
  const penalty = Number.isFinite(normalized) ? normalized : 0.0;
  logger.debug(`computeShippingPenalty: days=${shippingDays}, max=${safeMax}, penalty=${penalty.toFixed(4)}`);
  return penalty;
}

/**
 * Detects suspicious price anomalies across a batch of products.
 * Flagged if price is > 35% below median of the batch (or > 50% below compare_at_price).
 */
export function detectPriceAnomaly(
  priceCents: number,
  allPricesCents: number[],
  compareAtCents?: number
): { is_suspicious: boolean; deviation_pct: number; median_price_cents: number } {
  const safePrice = Number.isFinite(priceCents) && priceCents >= 0 ? priceCents : 0;
  const validPrices = (allPricesCents || []).filter(p => Number.isFinite(p) && p > 0);

  logger.debug(`detectPriceAnomaly: price=${safePrice}, validBatchCount=${validPrices.length}, compareAt=${compareAtCents}`);

  if (validPrices.length < 3) {
    if (compareAtCents && Number.isFinite(compareAtCents) && compareAtCents > 0) {
      const markdownRatio = (compareAtCents - safePrice) / compareAtCents;
      if (Number.isFinite(markdownRatio) && markdownRatio >= 0.50) {
        const devPct = Math.round(markdownRatio * 1000) / 10;
        logger.warn(`detectPriceAnomaly: batch size < 3, but price $${(safePrice / 100).toFixed(2)} is ${devPct}% below compare_at $${(compareAtCents / 100).toFixed(2)} -> SUSPICIOUS`);
        return {
          is_suspicious: true,
          deviation_pct: devPct,
          median_price_cents: compareAtCents,
        };
      }
    }
    logger.debug(`detectPriceAnomaly: batch size < 3 and compare_at check passed -> not suspicious`);
    return { is_suspicious: false, deviation_pct: 0, median_price_cents: safePrice };
  }

  const sorted = [...validPrices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  if (!Number.isFinite(median) || median <= 0) {
    logger.debug(`detectPriceAnomaly: invalid median calculated (${median}), returning non-suspicious`);
    return { is_suspicious: false, deviation_pct: 0, median_price_cents: 0 };
  }

  const deviation = (median - safePrice) / median;
  const isSuspicious = Number.isFinite(deviation) && deviation > 0.35; // 35% below batch median
  const devPct = Number.isFinite(deviation) ? Math.round(deviation * 1000) / 10 : 0;

  if (isSuspicious) {
    logger.warn(`detectPriceAnomaly: price $${(safePrice / 100).toFixed(2)} is ${devPct}% below batch median $${(median / 100).toFixed(2)} -> SUSPICIOUS`);
  } else {
    logger.debug(`detectPriceAnomaly: price $${(safePrice / 100).toFixed(2)} vs batch median $${(median / 100).toFixed(2)} (dev=${devPct}%) -> normal`);
  }

  return {
    is_suspicious: isSuspicious,
    deviation_pct: Math.max(0, devPct),
    median_price_cents: Math.round(median),
  };
}

export interface ComputeScoreInput {
  cosineSim?: number;
  cosine_similarity?: number;
  priceAffinity?: number;
  price_affinity?: number;
  reputation?: number;
  reputation_score?: number;
  shippingPenalty?: number;
  shipping_penalty?: number;
  weights?: Partial<ScoringWeights>;
}

/**
 * Pure deterministic multi-attribute composite utility formula:
 * Score = w1 * CosineSim + w2 * PriceAffinity + w3 * Reputation - w4 * ShippingPenalty
 * Guaranteed 0% LLM math hallucination.
 */
export function computeScore(
  cosineOrInput: number | ComputeScoreInput,
  priceAffinity?: number,
  reputation?: number,
  shippingPenalty?: number,
  weights?: Partial<ScoringWeights>
): number {
  let c = 0;
  let p = 0;
  let r = 0;
  let s = 0;
  let w = DEFAULT_SCORING_WEIGHTS;

  if (typeof cosineOrInput === 'object' && cosineOrInput !== null) {
    c = cosineOrInput.cosineSim ?? cosineOrInput.cosine_similarity ?? 0;
    p = cosineOrInput.priceAffinity ?? cosineOrInput.price_affinity ?? 0;
    r = cosineOrInput.reputation ?? cosineOrInput.reputation_score ?? 0;
    s = cosineOrInput.shippingPenalty ?? cosineOrInput.shipping_penalty ?? 0;
    if (cosineOrInput.weights) {
      w = { ...DEFAULT_SCORING_WEIGHTS, ...cosineOrInput.weights };
    }
  } else {
    c = typeof cosineOrInput === 'number' ? cosineOrInput : 0;
    p = priceAffinity ?? 0;
    r = reputation ?? 0;
    s = shippingPenalty ?? 0;
    if (weights) {
      w = { ...DEFAULT_SCORING_WEIGHTS, ...weights };
    }
  }

  const rawScore =
    (w.w1_cosine * c) +
    (w.w2_price * p) +
    (w.w3_reputation * r) -
    (w.w4_shipping * s);

  const boundedScore = Math.max(0.0, Math.min(1.0, Math.round(rawScore * 10000) / 10000));
  logger.debug(`computeScore: c=${c}, p=${p}, r=${r}, s=${s}, rawScore=${rawScore.toFixed(4)}, bounded=${boundedScore}`);

  return boundedScore;
}

/**
 * Assigns trust and recognition badges across scored products based on comparative metrics.
 * Badges awarded:
 * - 'Price Leader': Lowest upfront price among active items
 * - 'Best Value': Highest utility score to price ratio
 * - 'Top Rated Merchant': Highest merchant reputation score (tier 1 official / high trust)
 * - 'Fastest Delivery': Lowest shipping penalty / expedited delivery
 */
export function assignProductBadges(
  items: RankedProductItem[]
): RankedProductItem[];
export function assignProductBadges(
  item: RankedProductItem,
  allItems: RankedProductItem[]
): RankedProductItem;
export function assignProductBadges(
  input: RankedProductItem[] | RankedProductItem,
  allScored?: RankedProductItem[]
): RankedProductItem[] | RankedProductItem {
  if (Array.isArray(input)) {
    logger.debug(`assignProductBadges: evaluating badges for batch of ${input.length} products`);
    const activeCandidates = input.filter(item => !item.eliminated);
    for (const item of input) {
      item.badges = item.badges || [];
      // Always attach primary badge to every item
      item.primary_badge = buildPrimaryBadge({
        domain: item.selected_offer.domain,
        eliminated: item.eliminated,
        elimination_reason: item.elimination_reason,
        price_suspicious: item.price_anomaly.is_suspicious,
        anomaly_deviation_pct: item.price_anomaly.deviation_pct,
        anomaly_median_price_cents: item.price_anomaly.median_price_cents,
        trust_multiplier: item.score_breakdown.brand_boost_multiplier,
      });
    }

    // Eliminated items must receive ZERO secondary positive badges
    for (const item of input) {
      if (item.eliminated) {
        logger.debug(`assignProductBadges: clearing secondary badges for eliminated product ${item.product_id}`);
        item.badges = [];
        item.secondary_badges = [];
      }
    }

    if (activeCandidates.length > 0) {
      logger.debug(`assignProductBadges: awarding comparative badges among ${activeCandidates.length} active candidates`);

      // Helper to push unique badge
      const pushBadge = (target: RankedProductItem, badge: ProductBadge) => {
        target.badges = target.badges || [];
        if (!target.badges.some(b => b.label === badge.label)) {
          target.badges.push(badge);
          logger.debug(`assignProductBadges: awarded badge "${badge.label}" to product ${target.product_id}`);
        }
      };

      // 1. Price Leader: Lowest price among active items
      let minPriceItem = activeCandidates[0];
      for (const item of activeCandidates) {
        if (item.selected_offer.price < minPriceItem.selected_offer.price) {
          minPriceItem = item;
        }
      }
      pushBadge(minPriceItem, {
        label: 'Price Leader',
        color: '#e8a045',
        description: 'Lowest upfront price among verified offerings',
      });

      // 2. Best Value: Highest utility score to price ratio
      let bestValueItem = activeCandidates[0];
      let bestValueRatio = bestValueItem.score / (bestValueItem.selected_offer.price || 1);
      for (const item of activeCandidates) {
        const ratio = item.score / (item.selected_offer.price || 1);
        if (ratio > bestValueRatio) {
          bestValueRatio = ratio;
          bestValueItem = item;
        }
      }
      pushBadge(bestValueItem, {
        label: 'Best Value',
        color: '#00d4aa',
        description: 'Optimal balance of utility score, features, and price',
      });

      // 3. Top Rated Merchant: Highest merchant reputation score
      let topMerchantItem = activeCandidates[0];
      for (const item of activeCandidates) {
        if (item.score_breakdown.reputation_score > topMerchantItem.score_breakdown.reputation_score) {
          topMerchantItem = item;
        }
      }
      pushBadge(topMerchantItem, {
        label: 'Top Rated Merchant',
        color: '#7c3aed',
        description: 'Official brand or highest trust tier retailer',
      });

      // 4. Fastest Delivery: Lowest shipping penalty (lowest shipping days)
      let fastestDeliveryItem = activeCandidates[0];
      for (const item of activeCandidates) {
        if (item.score_breakdown.shipping_penalty < fastestDeliveryItem.score_breakdown.shipping_penalty) {
          fastestDeliveryItem = item;
        }
      }
      pushBadge(fastestDeliveryItem, {
        label: 'Fastest Delivery',
        color: '#38bdf8',
        description: 'Priority expedited shipping with minimal latency',
      });

      // 5. Budget Pick: Lowest price among trusted stores only
      const trustedCandidates = activeCandidates.filter(item => {
        const tier = classifyStoreTier(item.selected_offer.domain);
        return tier === 'tier1' || tier === 'tier2_high' || tier === 'tier2_low';
      });
      if (trustedCandidates.length > 0) {
        const budgetPickItem = trustedCandidates.reduce((min, cur) =>
          cur.selected_offer.price < min.selected_offer.price ? cur : min, trustedCandidates[0]
        );
        pushBadge(budgetPickItem, {
          label: 'Budget Pick',
          color: '#e8a045',
          description: 'Lowest price from a verified trusted merchant',
        });
      }

      // 6. Premium Pick: Highest price AND in top 2 scores
      const sortedByScore = [...activeCandidates].sort((a, b) => b.score - a.score);
      const top2 = sortedByScore.slice(0, 2);
      const highestPriceItem = activeCandidates.reduce((max, cur) =>
        cur.selected_offer.price > max.selected_offer.price ? cur : max, activeCandidates[0]
      );
      if (top2.some(t => t.product_id === highestPriceItem.product_id)) {
        pushBadge(highestPriceItem, {
          label: 'Premium Pick',
          color: '#f5f5f5',
          description: 'High-end flagship tier with premier performance',
        });
      }

      // 7. Preferred Brand
      for (const item of activeCandidates) {
        if (item.score_breakdown.brand_boost_multiplier && item.score_breakdown.brand_boost_multiplier > 1.0) {
          pushBadge(item, {
            label: 'Preferred Brand',
            color: '#e8a045',
            description: 'Matches user brand preference',
          });
        }
      }

      // Synchronize secondary_badges
      for (const item of activeCandidates) {
        item.secondary_badges = [...(item.badges || [])];
      }
    }

    return input;
  } else {
    const all = allScored && allScored.length > 0 ? allScored : [input];
    assignProductBadges(all);
    return input;
  }
}

/**
 * Normalizes factor weights so they sum exactly to 1.0.
 */
export function normalizeWeights(
  weights?: Partial<ScoringWeights>,
  fallback: ScoringWeights = DEFAULT_SCORING_WEIGHTS
): ScoringWeights {
  const w1 = Number.isFinite(weights?.w1_cosine) ? Math.max(0, weights!.w1_cosine!) : fallback.w1_cosine;
  const w2 = Number.isFinite(weights?.w2_price) ? Math.max(0, weights!.w2_price!) : fallback.w2_price;
  const w3 = Number.isFinite(weights?.w3_reputation) ? Math.max(0, weights!.w3_reputation!) : fallback.w3_reputation;
  const w4 = Number.isFinite(weights?.w4_shipping) ? Math.max(0, weights!.w4_shipping!) : fallback.w4_shipping;

  const total = w1 + w2 + w3 + w4;
  if (!Number.isFinite(total) || total <= 0) {
    logger.debug('normalizeWeights: total <= 0, returning default weights');
    return { ...DEFAULT_SCORING_WEIGHTS };
  }

  const nw1 = Math.round((w1 / total) * 10000) / 10000;
  const nw2 = Math.round((w2 / total) * 10000) / 10000;
  const nw3 = Math.round((w3 / total) * 10000) / 10000;
  const nw4 = Math.round((1.0 - (nw1 + nw2 + nw3)) * 10000) / 10000;

  logger.debug(`normalizeWeights: w1=${nw1}, w2=${nw2}, w3=${nw3}, w4=${nw4}`);
  return {
    w1_cosine: nw1,
    w2_price: nw2,
    w3_reputation: nw3,
    w4_shipping: Math.max(0, nw4),
  };
}

/**
 * Clamps any score strictly to [0.0, 100.0] or specified bounds.
 */
export function clampScore(score: number, min = 0, max = 100): number {
  if (!Number.isFinite(score)) return min;
  return Math.max(min, Math.min(max, score));
}

/**
 * Clamps normalized score strictly to [0.0, 100.0] scale.
 */
export function normalizeScore100(score: number): number {
  return clampScore(Math.round(score * 10000) / 100, 0, 100);
}

export interface LosingReasonDiagnostic {
  primary: string;
  stats: string[];
}

/**
 * Deterministic Losing-Reason Diagnostic Generator.
 * Compares an underperforming candidate against the benchmark winner item.
 */
export function generateLosingReason(
  loser: any,
  winner: any
): LosingReasonDiagnostic {
  logger.debug(`generateLosingReason: comparing loser (${loser?.product_id}) against winner (${winner?.product_id})`);
  if (loser?.eliminated && loser?.elimination_reason) {
    logger.debug(`generateLosingReason: loser was eliminated: ${loser.elimination_reason}`);
    return {
      primary: loser.elimination_reason,
      stats: ['Eliminated by policy constraint'],
    };
  }

  const loserPrice = loser?.selected_offer?.price ?? loser?.price ?? 0;
  const winnerPrice = winner?.selected_offer?.price ?? winner?.price ?? 0;
  const priceDiff = loserPrice - winnerPrice;

  const loserRating = loser?.adjusted_rating ?? loser?.rating ?? 0;
  const winnerRating = winner?.adjusted_rating ?? winner?.rating ?? 0;
  const ratingDiff = loserRating - winnerRating;

  const loserReviewCount = loser?.review_count ?? 120;
  const winnerReviewCount = winner?.review_count ?? 120;
  const reviewDiff = loserReviewCount - winnerReviewCount;

  const loserCosine = loser?.score_breakdown?.cosine_similarity ?? loser?.relevance_score ?? 0;
  const isSuspicious = loser?.price_anomaly?.is_suspicious ?? false;
  const trustTier = loser?.primary_badge?.tier ?? loser?.trust_tier ?? 'unknown';

  let primary = 'Lower overall composite score';
  if (priceDiff > 5000) {
    primary = `$${(priceDiff / 100).toFixed(2)} higher than winner`;
  } else if (loserReviewCount < 50) {
    primary = `Low confidence: only ${loserReviewCount} reviews`;
  } else if (loserCosine < 0.40) {
    primary = 'Poor semantic query match (< 40%)';
  } else if (trustTier === 'tier3' || trustTier === 'unknown') {
    primary = 'Unverified store trust tier';
  } else if (isSuspicious) {
    primary = 'Anomaly detected (> 35% median price drop)';
  }

  const stats: string[] = [];
  if (priceDiff !== 0) {
    stats.push(
      `Price: $${(winnerPrice / 100).toFixed(2)} vs $${(loserPrice / 100).toFixed(2)} (${priceDiff > 0 ? '+' : ''}$${(priceDiff / 100).toFixed(2)})`
    );
  }
  if (ratingDiff !== 0) {
    stats.push(
      `Rating: ${winnerRating} vs ${loserRating} (${ratingDiff > 0 ? '+' : ''}${ratingDiff.toFixed(1)})`
    );
  }
  if (reviewDiff !== 0) {
    stats.push(
      `Reviews: ${winnerReviewCount} vs ${loserReviewCount} (${reviewDiff > 0 ? '+' : ''}${reviewDiff})`
    );
  }

  logger.debug(`generateLosingReason: primary="${primary}", stats=${stats.join('; ')}`);
  return { primary, stats };
}

export class MurthyroshanScoringEngine {
  /**
   * Assign badges across scored products.
   */
  assignProductBadges(items: RankedProductItem[]): RankedProductItem[] {
    return assignProductBadges(items);
  }

  assignBadges(items: RankedProductItem[]): RankedProductItem[] {
    return assignProductBadges(items);
  }

  /**
   * Alias for rankProducts to satisfy the rankItems interface.
   */
  rankItems(
    products: Channel3ProductDetail[],
    context: ScoringQueryContext
  ): RankedProductItem[] {
    return this.rankProducts(products, context);
  }

  /**
   * Ingests raw Channel3 JSON-RPC products and returns mathematically ranked SKUs.
   * Pure deterministic calculation - 0% LLM math hallucination.
   */
  rankProducts(
    products: Channel3ProductDetail[],
    context: ScoringQueryContext
  ): RankedProductItem[] {
    logger.info(`rankProducts: starting ranking for ${products?.length ?? 0} products with query="${context.query}"`, sanitizeForLogging({
      target_price_cents: context.target_price_cents,
      max_price_cents: context.max_price_cents,
      preset: context.preset,
      preferred_brands: context.preferred_brands,
      avoided_brands: context.avoided_brands,
    }));

    if (!products || products.length === 0) {
      logger.debug('rankProducts: zero products provided, returning empty array');
      return [];
    }

    const baseWeights = context.preset
      ? SCORING_WEIGHT_PRESETS[context.preset] || DEFAULT_SCORING_WEIGHTS
      : DEFAULT_SCORING_WEIGHTS;

    const weights: ScoringWeights = {
      w1_cosine: context.weights?.w1_cosine ?? baseWeights.w1_cosine,
      w2_price: context.weights?.w2_price ?? baseWeights.w2_price,
      w3_reputation: context.weights?.w3_reputation ?? baseWeights.w3_reputation,
      w4_shipping: context.weights?.w4_shipping ?? baseWeights.w4_shipping,
    };
    logger.debug('rankProducts: applied weights', weights);

    const maxShippingDays = context.max_shipping_days || 7;
    const preferredBrands = (context.preferred_brands || []).map(b => b.toLowerCase().trim()).filter(Boolean);
    const preferredSources = (context.preferred_sources || []).map(s => s.toLowerCase().trim()).filter(Boolean);
    const avoidedBrands = (context.avoided_brands || []).map(a => a.toLowerCase().trim()).filter(Boolean);

    // Collect best in-stock offer prices for batch median calculation
    const candidates = products.map(product => {
      const inStock = product.offers.filter(o => o.stock_status !== 'OUT_OF_STOCK');
      const selectedOffer = inStock.length > 0
        ? inStock.reduce((min, cur) => (cur.price < min.price ? cur : min), inStock[0])
        : product.offers[0] || {
            id: `off_mock_${product.product_id}`,
            product_id: product.product_id,
            domain: 'unknown',
            price: 9900,
            compare_at_price: 9900,
            max_commission_rate: 0.1,
            merchant_anomaly_score: 0.5,
            stock_status: 'IN_STOCK' as const,
          };
      return { product, selectedOffer };
    });

    const allPricesCents = candidates.map(c => c.selectedOffer.price);
    logger.debug(`rankProducts: evaluated candidate offers, prices: [${allPricesCents.map(p => `$${(p / 100).toFixed(2)}`).join(', ')}]`);

    const scoredItems: RankedProductItem[] = [];

    for (const { product, selectedOffer } of candidates) {
      const titleLower = (product.title || '').toLowerCase();
      const descLower = (product.description || '').toLowerCase();
      const domainLower = (selectedOffer.domain || '').toLowerCase();

      // Step 1: Hard Eliminations (Avoided brands or negative price)
      let eliminated = false;
      let eliminationReason: string | undefined;

      const hitAvoided = avoidedBrands.find(avoided => titleLower.includes(avoided) || descLower.includes(avoided));
      if (hitAvoided) {
        eliminated = true;
        eliminationReason = `Avoided brand: "${hitAvoided}"`;
        logger.info(`rankProducts: product ${product.product_id} eliminated - matches avoided brand "${hitAvoided}"`);
      } else if (selectedOffer.price <= 0) {
        eliminated = true;
        eliminationReason = 'Invalid non-positive price';
        logger.warn(`rankProducts: product ${product.product_id} eliminated - non-positive price (${selectedOffer.price})`);
      } else if (context.max_price_cents && selectedOffer.price > context.max_price_cents) {
        eliminated = true;
        eliminationReason = `Exceeds max price $${(context.max_price_cents / 100).toFixed(2)}`;
        logger.info(`rankProducts: product ${product.product_id} eliminated - price $${(selectedOffer.price / 100).toFixed(2)} exceeds cap $${(context.max_price_cents / 100).toFixed(2)}`);
      }

      // Step 2: Cosine Semantic Relevance
      const docText = `${product.title} ${product.description || ''} ${product.category_id || ''}`;
      const cosineSim = computeCosineSimilarity(context.query, docText);

      // Step 3: Price Distance Sensitivity
      const priceAffinity = computePriceAffinity(selectedOffer.price, context.target_price_cents);

      // Step 4: Merchant Reputation Weighting
      const { reputation, multiplier: trustMultiplier } = computeMerchantReputation(selectedOffer);

      // Step 5: Shipping Latency Penalty
      // Estimate shipping days from shipping fee / threshold / metadata
      const shippingDays = selectedOffer.shipping_fee_cents === 0 ? 3 : 5; // default express 3 days, standard 5 days
      const shippingPenalty = computeShippingPenalty(shippingDays, maxShippingDays);

      // Step 6: Composite Utility Formula
      // Score = w1 * CosineSim + w2 * (1 - |Price - Target| / Target) + w3 * Reputation - w4 * ShippingDays
      let rawScore =
        (weights.w1_cosine * cosineSim) +
        (weights.w2_price * priceAffinity) +
        (weights.w3_reputation * reputation) -
        (weights.w4_shipping * shippingPenalty);

      // Step 7: Price Anomaly Detection & Dampening
      const anomaly = detectPriceAnomaly(
        selectedOffer.price,
        allPricesCents,
        selectedOffer.compare_at_price
      );
      let anomalyMultiplier = 1.0;
      if (anomaly.is_suspicious) {
        anomalyMultiplier = 0.5; // 50% discount dampener for suspicious listings
        rawScore *= anomalyMultiplier;
        logger.warn(`rankProducts: product ${product.product_id} damped 50% due to price anomaly`);
      }

      // Step 8: Multiplicative Trust and Preference Boosts
      let brandBoost = 1.0;
      let sourceBoost = 1.0;

      if (preferredBrands.some(b => titleLower.includes(b))) {
        brandBoost = 1.08;
        logger.debug(`rankProducts: product ${product.product_id} received 1.08x preferred brand boost`);
      }
      if (preferredSources.some(s => domainLower.includes(s))) {
        sourceBoost = 1.04;
        logger.debug(`rankProducts: product ${product.product_id} received 1.04x preferred source boost`);
      }

      let finalScore = rawScore * trustMultiplier * brandBoost * sourceBoost;

      if (eliminated) {
        finalScore = 0.0;
        logger.debug(`rankProducts: product ${product.product_id} score zeroed out due to elimination`);
      }

      // Clamp score to [0.0000, 1.0000] and round to 4 decimal places
      const boundedScore = Math.max(0.0, Math.min(1.0, Math.round(finalScore * 10000) / 10000));
      const verdict = computeDealVerdict(boundedScore);

      const ratingConf = computeConfidenceAdjustedRating((product as any).rating ?? 4.8, (product as any).review_count ?? 120);

      logger.debug(`rankProducts: product ${product.product_id} scored: final=${boundedScore}, verdict="${verdict.verdict_text}"`);

      scoredItems.push({
        product_id: product.product_id,
        title: product.title,
        description: product.description,
        category_id: product.category_id,
        selected_offer: selectedOffer,
        score: boundedScore,
        deal_verdict: verdict,
        adjusted_rating: ratingConf.adjusted_rating,
        rating_verified: ratingConf.rating_verified,
        score_breakdown: {
          cosine_similarity: Math.round(cosineSim * 10000) / 10000,
          price_affinity: Math.round(priceAffinity * 10000) / 10000,
          reputation_score: Math.round(reputation * 10000) / 10000,
          shipping_penalty: Math.round(shippingPenalty * 10000) / 10000,
          raw_score: Math.round(rawScore * 10000) / 10000,
          brand_boost_multiplier: brandBoost > 1.0 ? brandBoost : undefined,
          source_boost_multiplier: sourceBoost > 1.0 ? sourceBoost : undefined,
          anomaly_penalty_multiplier: anomalyMultiplier < 1.0 ? anomalyMultiplier : undefined,
        },
        price_anomaly: anomaly,
        eliminated: eliminated || undefined,
        elimination_reason: eliminationReason,
      });
    }

    // Sort descending by score; if tied, sort by selected_offer.price ascending (cheaper first)
    scoredItems.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.selected_offer.price - b.selected_offer.price;
    });

    logger.debug(`rankProducts: sorted ${scoredItems.length} products, top winner=${scoredItems[0]?.product_id} ($${(scoredItems[0]?.selected_offer.price / 100).toFixed(2)})`);

    // Badge Engine: Award badges across non-eliminated candidates
    // Badges: Best Value, Fastest Delivery, Top Rated Merchant, Price Leader
    assignProductBadges(scoredItems);

    logger.info(`rankProducts completed: top score=${scoredItems[0]?.score ?? 0}, winner_id=${scoredItems[0]?.product_id || 'none'}`);
    return scoredItems;
  }
}

export const defaultScoringEngine = new MurthyroshanScoringEngine();

export const ScoringEngine = MurthyroshanScoringEngine;
export type ScoringEngine = MurthyroshanScoringEngine;

export function rankItems(
  products: Channel3ProductDetail[],
  context: ScoringQueryContext
): RankedProductItem[] {
  return defaultScoringEngine.rankProducts(products, context);
}
