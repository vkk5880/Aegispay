import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  MurthyroshanScoringEngine,
  ScoringEngine,
  rankItems,
  WEIGHT_PRESETS,
  merchantReputationWeight,
  REPUTATION_FIRST,
  computeScore,
  priceAffinityScore,
  computeCosineSimilarity,
  computePriceAffinity,
  computeMerchantReputation,
  computeShippingPenalty,
  detectPriceAnomaly,
  computeDealVerdict,
  defaultScoringEngine,
  SCORING_WEIGHT_PRESETS,
  assignProductBadges,
  ProductBadge,
  RankedProductItem,
} from './scoring-engine.js';
import { Channel3ProductDetail } from './channel3.client.js';

describe('Task 26: Murthyroshan Deterministic Mathematical Scoring Engine', () => {
  const sampleProducts: Channel3ProductDetail[] = [
    {
      product_id: 'prod_sony_xm5',
      title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Black',
      description: 'Industry leading noise canceling with two processors and 8 microphones.',
      category_id: 'audio_headphones',
      offers: [
        {
          id: 'off_sony_1',
          product_id: 'prod_sony_xm5',
          domain: 'sony.com', // Official store tier 1
          price: 35000, // $350.00
          compare_at_price: 39900,
          max_commission_rate: 0.10,
          shipping_fee_cents: 0,
          merchant_anomaly_score: 0.02,
          stock_status: 'IN_STOCK',
        },
      ],
      images: [{ url: 'https://example.com/sony.jpg', cleaned_url: 'https://example.com/sony_c.jpg' }],
    },
    {
      product_id: 'prod_bose_qc45',
      title: 'Bose QuietComfort 45 Bluetooth Wireless Headphones',
      description: 'Iconic quiet, comfort, and sound. TriPort acoustic architecture.',
      category_id: 'audio_headphones',
      offers: [
        {
          id: 'off_bose_1',
          product_id: 'prod_bose_qc45',
          domain: 'amazon.com', // Trusted retailer tier 2
          price: 27900, // $279.00
          compare_at_price: 32900,
          max_commission_rate: 0.08,
          shipping_fee_cents: 0,
          merchant_anomaly_score: 0.05,
          stock_status: 'IN_STOCK',
        },
      ],
      images: [{ url: 'https://example.com/bose.jpg', cleaned_url: 'https://example.com/bose_c.jpg' }],
    },
    {
      product_id: 'prod_generic_cheap',
      title: 'Ultra Bass Pro Wireless Bluetooth Headset Headphones with Mic',
      description: 'Cheap budget headphones with deep bass.',
      category_id: 'audio_headphones',
      offers: [
        {
          id: 'off_cheap_1',
          product_id: 'prod_generic_cheap',
          domain: 'shady-merch-deals.xyz', // Unknown merchant
          price: 3500, // $35.00 (Suspicious anomaly > 35% below median)
          compare_at_price: 15000,
          max_commission_rate: 0.05,
          shipping_fee_cents: 1200,
          merchant_anomaly_score: 0.85,
          stock_status: 'IN_STOCK',
        },
      ],
      images: [{ url: 'https://example.com/cheap.jpg', cleaned_url: 'https://example.com/cheap_c.jpg' }],
    },
  ];

  test('Guarantees 0% LLM math hallucination: returns identical deterministic ranking across repeated executions', () => {
    const engine = new MurthyroshanScoringEngine();
    const context = {
      query: 'Sony WH-1000XM5 wireless noise cancelling headphones',
      target_price_cents: 35000,
    };

    const run1 = engine.rankProducts(sampleProducts, context);
    const run2 = engine.rankProducts(sampleProducts, context);

    assert.strictEqual(run1.length, 3);
    assert.strictEqual(run2.length, 3);

    for (let i = 0; i < run1.length; i++) {
      assert.strictEqual(run1[i].product_id, run2[i].product_id);
      assert.strictEqual(run1[i].score, run2[i].score);
      assert.deepStrictEqual(run1[i].score_breakdown, run2[i].score_breakdown);
    }

    // Top ranked should be Sony WH-1000XM5 due to exact query match, tier 1 official domain, and exact target price
    assert.strictEqual(run1[0].product_id, 'prod_sony_xm5');
  });

  test('Cosine semantic relevance: higher score for exact title and query overlap', () => {
    const simHigh = computeCosineSimilarity('Sony WH-1000XM5 wireless noise cancelling', 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Black');
    const simLow = computeCosineSimilarity('Sony WH-1000XM5 wireless noise cancelling', 'Nomad Rugged Leather Phone Case Horween');

    assert.ok(simHigh > 0.7, `Expected high similarity > 0.7, got ${simHigh}`);
    assert.strictEqual(simLow, 0.0);
  });

  test('Price distance sensitivity: affinity drops proportionally as price deviates from target', () => {
    const target = 30000;
    const exact = computePriceAffinity(30000, target);
    const slightlyDifferent = computePriceAffinity(33000, target); // 10% deviation -> 0.90
    const farOff = computePriceAffinity(60000, target); // 100% deviation -> 0.00
    const wayTooHigh = computePriceAffinity(90000, target); // 200% deviation -> 0.00 bounded

    assert.strictEqual(exact, 1.0);
    assert.strictEqual(Math.round(slightlyDifferent * 100) / 100, 0.90);
    assert.strictEqual(farOff, 0.0);
    assert.strictEqual(wayTooHigh, 0.0);
  });

  test('Merchant reputation weighting: official brand stores outrank unknown merchants', () => {
    const officialOffer = sampleProducts[0].offers[0];
    const amazonOffer = sampleProducts[1].offers[0];
    const shadyOffer = sampleProducts[2].offers[0];

    const repOfficial = computeMerchantReputation(officialOffer);
    const repAmazon = computeMerchantReputation(amazonOffer);
    const repShady = computeMerchantReputation(shadyOffer);

    assert.strictEqual(repOfficial.tier, 'tier1');
    assert.strictEqual(repAmazon.tier, 'tier2_high');
    assert.strictEqual(repShady.tier, 'unknown');

    assert.ok(repOfficial.reputation > repAmazon.reputation, 'Tier 1 reputation should exceed Tier 2');
    assert.ok(repAmazon.reputation > repShady.reputation, 'Tier 2 reputation should exceed shady unknown');
  });

  test('Shipping latency penalty: fast free shipping incurs lower penalty than slow shipping', () => {
    const fastPenalty = computeShippingPenalty(2, 7);
    const standardPenalty = computeShippingPenalty(5, 7);
    const slowPenalty = computeShippingPenalty(10, 7);

    assert.ok(fastPenalty < standardPenalty);
    assert.strictEqual(slowPenalty, 1.0); // Bounded at 1.0
  });

  test('Weight adjustments: altering weights directly controls ranking priority', () => {
    const engine = new MurthyroshanScoringEngine();

    // 1. Heavy weight on cosine match -> Sony XM5 wins
    const contextSemantic = {
      query: 'Sony WH-1000XM5 wireless',
      target_price_cents: 25000,
      weights: {
        w1_cosine: 0.90,
        w2_price: 0.05,
        w3_reputation: 0.05,
        w4_shipping: 0.0,
      },
    };
    const resSemantic = engine.rankProducts(sampleProducts, contextSemantic);
    assert.strictEqual(resSemantic[0].product_id, 'prod_sony_xm5');

    // 2. Heavy weight on price match to target $279 -> Bose QC45 wins
    const contextPrice = {
      query: 'wireless headphones',
      target_price_cents: 27900,
      weights: {
        w1_cosine: 0.10,
        w2_price: 0.80,
        w3_reputation: 0.10,
        w4_shipping: 0.0,
      },
    };
    const resPrice = engine.rankProducts(sampleProducts, contextPrice);
    assert.strictEqual(resPrice[0].product_id, 'prod_bose_qc45');
  });

  test('Price anomaly detection flags suspicious severe markdowns (> 35% below median)', () => {
    const prices = [35000, 27900, 3500];
    const anomaly = detectPriceAnomaly(3500, prices);

    assert.strictEqual(anomaly.is_suspicious, true);
    assert.ok(anomaly.deviation_pct > 35, `Expected deviation > 35%, got ${anomaly.deviation_pct}%`);
  });

  test('Avoided brands elimination: sets score to 0.0 and tags elimination reason', () => {
    const engine = defaultScoringEngine;
    const context = {
      query: 'headphones',
      avoided_brands: ['bose'],
    };

    const results = engine.rankProducts(sampleProducts, context);
    const bose = results.find(r => r.product_id === 'prod_bose_qc45');

    assert.ok(bose);
    assert.strictEqual(bose?.eliminated, true);
    assert.strictEqual(bose?.score, 0.0);
    assert.ok(bose?.elimination_reason?.includes('Avoided brand'));
  });

  test('Deal verdict computation assigns CSS colours and descriptive badges', () => {
    const excellent = computeDealVerdict(0.92);
    const good = computeDealVerdict(0.70);
    const decent = computeDealVerdict(0.50);
    const waitSale = computeDealVerdict(0.30);
    const overpriced = computeDealVerdict(0.15);

    assert.strictEqual(excellent.verdict_text, 'Excellent deal. Buy now.');
    assert.strictEqual(excellent.verdict_colour, '#34d399');

    assert.strictEqual(good.verdict_text, 'Good value.');
    assert.strictEqual(good.verdict_colour, '#a78bfa');

    assert.strictEqual(decent.verdict_text, 'Decent pick.');
    assert.strictEqual(decent.verdict_colour, '#fbbf24');

    assert.strictEqual(waitSale.verdict_text, 'Wait for a sale.');
    assert.strictEqual(waitSale.verdict_colour, '#fb923c');

    assert.strictEqual(overpriced.verdict_text, 'Overpriced.');
    assert.strictEqual(overpriced.verdict_colour, '#f87171');
  });

  test('Bounded weight presets: supports DEFAULT, BUDGET_CONSCIOUS, SPEED_FIRST, REPUTATION_FIRST', () => {
    const engine = defaultScoringEngine;

    // Verify preset constants
    assert.strictEqual(SCORING_WEIGHT_PRESETS.DEFAULT.w1_cosine, 0.35);
    assert.strictEqual(SCORING_WEIGHT_PRESETS.BUDGET_CONSCIOUS.w2_price, 0.60);
    assert.strictEqual(SCORING_WEIGHT_PRESETS.SPEED_FIRST.w4_shipping, 0.40);
    assert.strictEqual(SCORING_WEIGHT_PRESETS.REPUTATION_FIRST.w3_reputation, 0.45);

    // BUDGET_CONSCIOUS prioritizes price affinity
    const budgetRes = engine.rankProducts(sampleProducts, {
      query: 'headphones',
      target_price_cents: 28000,
      preset: 'BUDGET_CONSCIOUS',
    });
    assert.strictEqual(budgetRes[0].product_id, 'prod_bose_qc45');

    // REPUTATION_FIRST prioritizes tier 1 official brand store
    const repRes = engine.rankProducts(sampleProducts, {
      query: 'headphones',
      preset: 'REPUTATION_FIRST',
    });
    assert.strictEqual(repRes[0].product_id, 'prod_sony_xm5');
  });

  test('Badge Engine: awards Best Value, Fastest Delivery, Top Rated Merchant, and Price Leader', () => {
    const engine = defaultScoringEngine;
    const results = engine.rankProducts(sampleProducts, {
      query: 'Sony WH-1000XM5 headphones',
      target_price_cents: 35000,
    });

    const allBadges = results.flatMap(r => r.badges || []);
    const badgeLabels = allBadges.map(b => b.label);

    assert.ok(badgeLabels.includes('Price Leader'), 'Should award Price Leader badge to cheapest candidate');
    assert.ok(badgeLabels.includes('Top Rated Merchant'), 'Should award Top Rated Merchant badge to tier 1 official merchant');
    assert.ok(badgeLabels.includes('Best Value'), 'Should award Best Value badge');
    assert.ok(badgeLabels.includes('Fastest Delivery'), 'Should award Fastest Delivery badge');

    // Price Leader badge should be on prod_generic_cheap
    const cheapItem = results.find(r => r.product_id === 'prod_generic_cheap');
    assert.ok(cheapItem?.badges?.some(b => b.label === 'Price Leader'));

    // Top Rated Merchant badge should be on prod_sony_xm5 (official store)
    const sonyItem = results.find(r => r.product_id === 'prod_sony_xm5');
    assert.ok(sonyItem?.badges?.some(b => b.label === 'Top Rated Merchant'));
  });

  test('Subagent 3A: computeScore verifies pure deterministic utility math formula: Score = w1*Cosine + w2*Price + w3*Rep - w4*Shipping', () => {
    // 1. Full 1.0 components with default weights (0.35 + 0.35 + 0.20 - 0.10*0 = 0.90)
    const score1 = computeScore(1.0, 1.0, 1.0, 0.0);
    assert.strictEqual(score1, 0.90);

    // 2. Full 1.0 components with full shipping penalty (0.35 + 0.35 + 0.20 - 0.10*1.0 = 0.80)
    const score2 = computeScore(1.0, 1.0, 1.0, 1.0);
    assert.strictEqual(score2, 0.80);

    // 3. Realistic components: Cosine 0.8, Price 0.9, Rep 0.95, Ship 0.2
    // w1=0.35, w2=0.35, w3=0.20, w4=0.10
    // Expected = 0.35*0.8 + 0.35*0.9 + 0.20*0.95 - 0.10*0.2
    //          = 0.28 + 0.315 + 0.19 - 0.02 = 0.765
    const score3 = computeScore(0.8, 0.9, 0.95, 0.2);
    assert.strictEqual(score3, 0.765);

    // 4. Object argument form
    const scoreObj = computeScore({
      cosineSim: 0.8,
      priceAffinity: 0.9,
      reputation: 0.95,
      shippingPenalty: 0.2,
    });
    assert.strictEqual(scoreObj, 0.765);

    // 5. Custom weights object: 50% cosine, 30% price, 15% rep, 5% ship
    // 0.50*1.0 + 0.30*0.5 + 0.15*0.8 - 0.05*0.1 = 0.50 + 0.15 + 0.12 - 0.005 = 0.765
    const scoreCustom = computeScore(1.0, 0.5, 0.8, 0.1, {
      w1_cosine: 0.50,
      w2_price: 0.30,
      w3_reputation: 0.15,
      w4_shipping: 0.05,
    });
    assert.strictEqual(scoreCustom, 0.765);

    // 6. Guaranteed 0% LLM math hallucination: repeated runs produce identical deterministic numbers
    for (let i = 0; i < 50; i++) {
      assert.strictEqual(computeScore(0.8, 0.9, 0.95, 0.2), 0.765);
    }
  });

  test('Subagent 3A: rankItems and ScoringEngine class export verification', () => {
    const context = {
      query: 'Sony WH-1000XM5 wireless noise cancelling headphones',
      target_price_cents: 35000,
    };

    // 1. Standalone rankItems function export
    const rankedViaFn = rankItems(sampleProducts, context);
    assert.strictEqual(rankedViaFn.length, 3);
    assert.strictEqual(rankedViaFn[0].product_id, 'prod_sony_xm5');

    // 2. ScoringEngine class instantiation and rankItems method
    const customEngine = new ScoringEngine();
    const rankedViaClassMethod = customEngine.rankItems(sampleProducts, context);
    assert.strictEqual(rankedViaClassMethod.length, 3);
    assert.strictEqual(rankedViaClassMethod[0].product_id, 'prod_sony_xm5');

    // 3. Verify rankItems output is identical across both paths
    assert.strictEqual(rankedViaFn[0].score, rankedViaClassMethod[0].score);
    assert.strictEqual(rankedViaFn[1].product_id, rankedViaClassMethod[1].product_id);
    assert.strictEqual(rankedViaFn[2].product_id, rankedViaClassMethod[2].product_id);
  });

  test('Subagent 3A: priceAffinityScore calculation and boundary checks', () => {
    // Exact target match
    assert.strictEqual(priceAffinityScore(35000, 35000), 1.0);

    // 10% deviation below or above target
    assert.strictEqual(priceAffinityScore(38500, 35000), 0.9);
    assert.strictEqual(priceAffinityScore(31500, 35000), 0.9);

    // 50% deviation
    assert.strictEqual(priceAffinityScore(52500, 35000), 0.5);

    // 100% deviation or more clamps to 0.0
    assert.strictEqual(priceAffinityScore(70000, 35000), 0.0);
    assert.strictEqual(priceAffinityScore(140000, 35000), 0.0);

    // Undefined or non-positive target defaults to 1.0 neutral
    assert.strictEqual(priceAffinityScore(35000, undefined), 1.0);
    assert.strictEqual(priceAffinityScore(35000, 0), 1.0);
  });

  test('Subagent 3A: merchantReputationWeight evaluation across tiers and domain strings', () => {
    const tier1Offer = sampleProducts[0].offers[0];
    const repTier1 = merchantReputationWeight(tier1Offer);
    assert.strictEqual(repTier1.tier, 'tier1');
    assert.strictEqual(repTier1.multiplier, 1.12);
    assert.ok(repTier1.reputation >= 0.9);

    // ValueOf / numeric coercion support
    assert.ok(Number(repTier1) >= 0.9);
    assert.strictEqual(repTier1.valueOf(), repTier1.reputation);

    // Direct domain string overload
    const repSonyDomain = merchantReputationWeight('sony.com');
    assert.strictEqual(repSonyDomain.tier, 'tier1');

    const repAmazonDomain = merchantReputationWeight('amazon.com');
    assert.strictEqual(repAmazonDomain.tier, 'tier2_high');

    const repUnknownDomain = merchantReputationWeight('shady-deals.xyz');
    assert.strictEqual(repUnknownDomain.tier, 'unknown');
  });

  test('Subagent 3A: WEIGHT_PRESETS and REPUTATION_FIRST exports', () => {
    assert.strictEqual(WEIGHT_PRESETS, SCORING_WEIGHT_PRESETS);
    assert.strictEqual(REPUTATION_FIRST, SCORING_WEIGHT_PRESETS.REPUTATION_FIRST);

    // Verify REPUTATION_FIRST gives 45% weight to merchant reputation
    assert.strictEqual(REPUTATION_FIRST.w3_reputation, 0.45);
    assert.strictEqual(REPUTATION_FIRST.w1_cosine, 0.25);
    assert.strictEqual(REPUTATION_FIRST.w2_price, 0.20);
    assert.strictEqual(REPUTATION_FIRST.w4_shipping, 0.10);

    // Verify all 4 presets exist in WEIGHT_PRESETS
    assert.ok(WEIGHT_PRESETS.DEFAULT);
    assert.ok(WEIGHT_PRESETS.BUDGET_CONSCIOUS);
    assert.ok(WEIGHT_PRESETS.SPEED_FIRST);
    assert.ok(WEIGHT_PRESETS.REPUTATION_FIRST);
  });

  test('Subagent 3B: assignProductBadges awards Price Leader, Best Value, Top Rated Merchant, and Fastest Delivery', () => {
    const rawItems: RankedProductItem[] = [
      {
        product_id: 'item_a',
        title: 'Sony Premium Headphones',
        description: 'Noise cancelling',
        category_id: 'audio',
        selected_offer: {
          id: 'off_a',
          product_id: 'item_a',
          domain: 'sony.com',
          price: 35000,
          compare_at_price: 39900,
          max_commission_rate: 0.1,
          merchant_anomaly_score: 0.02,
          stock_status: 'IN_STOCK',
        },
        score: 0.95,
        deal_verdict: { verdict_text: 'Excellent deal. Buy now.', verdict_colour: '#34d399' },
        score_breakdown: {
          cosine_similarity: 0.95,
          price_affinity: 0.90,
          reputation_score: 0.98, // Highest reputation -> Top Rated Merchant
          shipping_penalty: 0.40,
          raw_score: 0.85,
        },
        price_anomaly: { is_suspicious: false, deviation_pct: 0, median_price_cents: 25000 },
      },
      {
        product_id: 'item_b',
        title: 'Bose Value Headphones',
        description: 'Compact comfort',
        category_id: 'audio',
        selected_offer: {
          id: 'off_b',
          product_id: 'item_b',
          domain: 'amazon.com',
          price: 15000,
          compare_at_price: 22000,
          max_commission_rate: 0.08,
          merchant_anomaly_score: 0.05,
          stock_status: 'IN_STOCK',
        },
        score: 0.90, // Ratio 0.90 / 15000 = 0.00006 -> highest ratio -> Best Value
        deal_verdict: { verdict_text: 'Excellent deal. Buy now.', verdict_colour: '#34d399' },
        score_breakdown: {
          cosine_similarity: 0.85,
          price_affinity: 0.92,
          reputation_score: 0.85,
          shipping_penalty: 0.10, // Lowest penalty -> Fastest Delivery
          raw_score: 0.82,
        },
        price_anomaly: { is_suspicious: false, deviation_pct: 0, median_price_cents: 25000 },
      },
      {
        product_id: 'item_c',
        title: 'Budget Audio In-Ear',
        description: 'Ultra affordable earbuds',
        category_id: 'audio',
        selected_offer: {
          id: 'off_c',
          product_id: 'item_c',
          domain: 'deals.com',
          price: 2900, // Lowest price -> Price Leader
          compare_at_price: 5000,
          max_commission_rate: 0.05,
          merchant_anomaly_score: 0.15,
          stock_status: 'IN_STOCK',
        },
        score: 0.10, // Ratio 0.10 / 3000 = 0.000033 -> lower than item_b (0.000060)
        deal_verdict: { verdict_text: 'Decent pick.', verdict_colour: '#fbbf24' },
        score_breakdown: {
          cosine_similarity: 0.30,
          price_affinity: 0.50,
          reputation_score: 0.60,
          shipping_penalty: 0.50,
          raw_score: 0.10,
        },
        price_anomaly: { is_suspicious: false, deviation_pct: 0, median_price_cents: 25000 },
      },
      {
        product_id: 'item_eliminated',
        title: 'Avoided Brand Counterfeit',
        description: 'Should not get positive badges',
        category_id: 'audio',
        selected_offer: {
          id: 'off_elim',
          product_id: 'item_eliminated',
          domain: 'shady.xyz',
          price: 1000,
          compare_at_price: 1000,
          max_commission_rate: 0.0,
          merchant_anomaly_score: 0.99,
          stock_status: 'IN_STOCK',
        },
        score: 0.0,
        deal_verdict: { verdict_text: 'Overpriced.', verdict_colour: '#f87171' },
        score_breakdown: {
          cosine_similarity: 0.0,
          price_affinity: 0.0,
          reputation_score: 0.0,
          shipping_penalty: 1.0,
          raw_score: 0.0,
        },
        price_anomaly: { is_suspicious: true, deviation_pct: 90, median_price_cents: 25000 },
        eliminated: true,
        elimination_reason: 'Avoided brand',
      },
    ];

    const badged = assignProductBadges(rawItems);
    assert.strictEqual(badged.length, 4);

    // 1. Price Leader on cheapest active candidate (item_c @ $29.00)
    const itemC = badged.find(i => i.product_id === 'item_c');
    assert.ok(itemC?.badges?.some(b => b.label === 'Price Leader'));

    // 2. Best Value on highest utility score / price ratio (item_b)
    const itemB = badged.find(i => i.product_id === 'item_b');
    assert.ok(itemB?.badges?.some(b => b.label === 'Best Value'));

    // 3. Top Rated Merchant on highest reputation score (item_a from sony.com)
    const itemA = badged.find(i => i.product_id === 'item_a');
    assert.ok(itemA?.badges?.some(b => b.label === 'Top Rated Merchant'));

    // 4. Fastest Delivery on lowest shipping penalty (item_b @ 0.10)
    assert.ok(itemB?.badges?.some(b => b.label === 'Fastest Delivery'));

    // 5. Eliminated item receives no positive badges
    const elim = badged.find(i => i.product_id === 'item_eliminated');
    assert.strictEqual(elim?.badges?.length, 0);

    // 6. Single item overload signature: assignProductBadges(item, allItems)
    const singleResult = assignProductBadges(rawItems[0], rawItems);
    assert.strictEqual(singleResult.product_id, 'item_a');
    assert.ok(singleResult.badges?.some(b => b.label === 'Top Rated Merchant'));
  });
});
