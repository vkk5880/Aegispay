import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  MurthyroshanScoringEngine,
  computeCosineSimilarity,
  computePriceAffinity,
  computeMerchantReputation,
  computeShippingPenalty,
  detectPriceAnomaly,
  computeDealVerdict,
  defaultScoringEngine,
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
});
