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

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = SCORING_WEIGHT_PRESETS.DEFAULT;

export interface ScoringQueryContext {
  query: string;
  target_price_cents?: number;
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
  label: 'Best Value' | 'Fastest Delivery' | 'Top Rated Merchant' | 'Price Leader' | string;
  color: string;
  description?: string;
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
  badges?: ProductBadge[];
  price_anomaly: {
    is_suspicious: boolean;
    deviation_pct: number;
    median_price_cents: number;
  };
  eliminated?: boolean;
  elimination_reason?: string;
}

// Store Trust Configuration adapted from autonomous-commerce-agent
export const STORE_TRUST_TIERS = {
  tier1: {
    multiplier: 1.12,
    base_reputation: 0.95,
    keywords: [
      'official', 'brand store', 'authorized', 'apple', 'samsung', 'sony',
      'bose', 'anker', 'google', 'lenovo', 'dell', 'hp', 'asus', 'nomad',
      'oneplus', 'xiaomi', 'realme', 'oppo', 'vivo', 'motorola', 'nothing'
    ],
  },
  tier2_high: {
    multiplier: 1.06,
    base_reputation: 0.85,
    keywords: ['amazon', 'flipkart', 'bestbuy', 'walmart', 'target'],
  },
  tier2_low: {
    multiplier: 1.03,
    base_reputation: 0.75,
    keywords: ['croma', 'reliance', 'bhphotovideo', 'newegg', 'adorama', 'techmerchant.com', 'powerhub.net'],
  },
  unknown: {
    multiplier: 0.88,
    base_reputation: 0.50,
  },
};

// Deal Verdict mapping thresholds
const VERDICT_THRESHOLDS: Array<{ min_score: number; text: string; colour: string }> = [
  { min_score: 0.80, text: 'Excellent deal. Buy now.', colour: '#34d399' }, // emerald
  { min_score: 0.65, text: 'Good value.',              colour: '#a78bfa' }, // violet
  { min_score: 0.45, text: 'Decent pick.',             colour: '#fbbf24' }, // amber
  { min_score: 0.25, text: 'Wait for a sale.',         colour: '#fb923c' }, // orange
  { min_score: 0.00, text: 'Overpriced.',              colour: '#f87171' }, // red
];

export function computeDealVerdict(score: number): DealVerdict {
  for (const row of VERDICT_THRESHOLDS) {
    if (score >= row.min_score) {
      return { verdict_text: row.text, verdict_colour: row.colour };
    }
  }
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
    return 0.0;
  }

  const similarity = dotProduct / (Math.sqrt(queryNormSq) * Math.sqrt(docNormSq));
  return Math.max(0.0, Math.min(1.0, similarity));
}

/**
 * Price distance sensitivity formula:
 * Affinity = Math.max(0, 1 - |Price - Target| / Target)
 * If target is undefined or <= 0, defaults to 1.0 (neutral, no penalty).
 */
export function computePriceAffinity(priceCents: number, targetPriceCents?: number): number {
  if (!targetPriceCents || targetPriceCents <= 0) {
    return 1.0;
  }
  const deviation = Math.abs(priceCents - targetPriceCents);
  const ratio = deviation / targetPriceCents;
  const affinity = Math.max(0.0, 1.0 - ratio);
  return Math.min(1.0, affinity);
}

/**
 * Merchant reputation weighting:
 * Combines domain tier heuristics and Channel3 merchant_anomaly_score.
 * Returns float in [0.0, 1.0].
 */
export function computeMerchantReputation(offer: Channel3Offer): { reputation: number; tier: string; multiplier: number } {
  const domain = (offer.domain || '').toLowerCase();
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
  const anomalyScore = offer.merchant_anomaly_score ?? (1.0 - baseRep);
  const anomalyAdjustedReputation = Math.max(0.0, Math.min(1.0, 1.0 - anomalyScore));

  // Blend base tier reputation with anomaly check
  const finalRep = Math.min(1.0, Math.max(0.0, (baseRep * 0.5) + (anomalyAdjustedReputation * 0.5)));

  return {
    reputation: finalRep,
    tier,
    multiplier,
  };
}

/**
 * Shipping latency penalty:
 * Converts delivery days or estimated latency into a normalized penalty [0.0, 1.0].
 */
export function computeShippingPenalty(shippingDays: number, maxShippingDays: number = 7): number {
  if (shippingDays <= 0) return 0.0;
  const normalized = Math.min(1.0, shippingDays / Math.max(1, maxShippingDays));
  return normalized;
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
  if (allPricesCents.length < 3) {
    if (compareAtCents && compareAtCents > 0) {
      const markdownRatio = (compareAtCents - priceCents) / compareAtCents;
      if (markdownRatio >= 0.50) {
        return {
          is_suspicious: true,
          deviation_pct: Math.round(markdownRatio * 1000) / 10,
          median_price_cents: compareAtCents,
        };
      }
    }
    return { is_suspicious: false, deviation_pct: 0, median_price_cents: priceCents };
  }

  const sorted = [...allPricesCents].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  if (median <= 0) {
    return { is_suspicious: false, deviation_pct: 0, median_price_cents: 0 };
  }

  const deviation = (median - priceCents) / median;
  const isSuspicious = deviation > 0.35; // 35% below batch median
  const devPct = Math.round(deviation * 1000) / 10;

  return {
    is_suspicious: isSuspicious,
    deviation_pct: devPct,
    median_price_cents: Math.round(median),
  };
}

export class MurthyroshanScoringEngine {
  /**
   * Ingests raw Channel3 JSON-RPC products and returns mathematically ranked SKUs.
   * Pure deterministic calculation - 0% LLM math hallucination.
   */
  rankProducts(
    products: Channel3ProductDetail[],
    context: ScoringQueryContext
  ): RankedProductItem[] {
    if (!products || products.length === 0) {
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
      } else if (selectedOffer.price <= 0) {
        eliminated = true;
        eliminationReason = 'Invalid non-positive price';
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
      }

      // Step 8: Multiplicative Trust and Preference Boosts
      let brandBoost = 1.0;
      let sourceBoost = 1.0;

      if (preferredBrands.some(b => titleLower.includes(b))) {
        brandBoost = 1.08;
      }
      if (preferredSources.some(s => domainLower.includes(s))) {
        sourceBoost = 1.04;
      }

      let finalScore = rawScore * trustMultiplier * brandBoost * sourceBoost;

      if (eliminated) {
        finalScore = 0.0;
      }

      // Clamp score to [0.0000, 1.0000] and round to 4 decimal places
      const boundedScore = Math.max(0.0, Math.min(1.0, Math.round(finalScore * 10000) / 10000));
      const verdict = computeDealVerdict(boundedScore);

      scoredItems.push({
        product_id: product.product_id,
        title: product.title,
        description: product.description,
        category_id: product.category_id,
        selected_offer: selectedOffer,
        score: boundedScore,
        deal_verdict: verdict,
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

    // Badge Engine: Award badges across non-eliminated candidates
    // Badges: Best Value, Fastest Delivery, Top Rated Merchant, Price Leader
    const activeCandidates = scoredItems.filter(item => !item.eliminated);
    if (activeCandidates.length > 0) {
      // 1. Price Leader: Lowest price among active items
      let minPriceItem = activeCandidates[0];
      for (const item of activeCandidates) {
        if (item.selected_offer.price < minPriceItem.selected_offer.price) {
          minPriceItem = item;
        }
      }
      minPriceItem.badges = minPriceItem.badges || [];
      minPriceItem.badges.push({
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
      bestValueItem.badges = bestValueItem.badges || [];
      if (!bestValueItem.badges.some(b => b.label === 'Best Value')) {
        bestValueItem.badges.push({
          label: 'Best Value',
          color: '#00d4aa',
          description: 'Optimal balance of utility score, features, and price',
        });
      }

      // 3. Top Rated Merchant: Highest merchant reputation score
      let topMerchantItem = activeCandidates[0];
      for (const item of activeCandidates) {
        if (item.score_breakdown.reputation_score > topMerchantItem.score_breakdown.reputation_score) {
          topMerchantItem = item;
        }
      }
      topMerchantItem.badges = topMerchantItem.badges || [];
      if (!topMerchantItem.badges.some(b => b.label === 'Top Rated Merchant')) {
        topMerchantItem.badges.push({
          label: 'Top Rated Merchant',
          color: '#7c3aed',
          description: 'Official brand or highest trust tier retailer',
        });
      }

      // 4. Fastest Delivery: Lowest shipping penalty (lowest shipping days)
      let fastestDeliveryItem = activeCandidates[0];
      for (const item of activeCandidates) {
        if (item.score_breakdown.shipping_penalty < fastestDeliveryItem.score_breakdown.shipping_penalty) {
          fastestDeliveryItem = item;
        }
      }
      fastestDeliveryItem.badges = fastestDeliveryItem.badges || [];
      if (!fastestDeliveryItem.badges.some(b => b.label === 'Fastest Delivery')) {
        fastestDeliveryItem.badges.push({
          label: 'Fastest Delivery',
          color: '#38bdf8',
          description: 'Priority expedited shipping with minimal latency',
        });
      }
    }

    // Initialize empty badges array for items without badges for clean API contract
    for (const item of scoredItems) {
      item.badges = item.badges || [];
    }

    return scoredItems;
  }
}

export const defaultScoringEngine = new MurthyroshanScoringEngine();
