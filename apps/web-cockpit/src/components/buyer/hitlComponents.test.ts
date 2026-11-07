import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HitlApprovalModal } from './HitlApprovalModal.js';
import { FriendlyErrorTransmuter, transmuteError } from '../common/FriendlyErrorTransmuter.js';

test('FriendlyErrorTransmuter transmuteError converts Redis Lua and PayPal errors', () => {
  // Test 1: Budget overage
  const budgetErr = transmuteError('ERR_EXCEEDS_TOTAL_MANDATE_BUDGET: 52000 > 50000');
  assert.equal(budgetErr.category, 'BUDGET_OVERAGE');
  assert.ok(budgetErr.friendlyMessage.includes('exceeds your session spend budget'));
  assert.ok(budgetErr.actions.some((a) => a.id === 'INCREASE_CAP'));
  assert.ok(budgetErr.actions.some((a) => a.id === 'FIND_CHEAPER_ALTERNATIVE'));

  // Test 2: Mandate expired
  const expiredErr = transmuteError('ERR_MANDATE_EXPIRED');
  assert.equal(expiredErr.category, 'MANDATE_EXPIRED');
  assert.ok(expiredErr.friendlyMessage.toLowerCase().includes('session authorization window has ended'));
  assert.ok(expiredErr.actions.some((a) => a.id === 'RENEW_MANDATE'));

  // Test 3: Merchant cap
  const merchantErr = transmuteError('ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP');
  assert.equal(merchantErr.category, 'MERCHANT_CAP');
  assert.ok(merchantErr.actions.some((a) => a.id === 'RAISE_MERCHANT_CAP'));

  // Test 4: Merchant anomaly
  const anomalyErr = transmuteError('ERR_MERCHANT_ANOMALY_THRESHOLD_EXCEEDED');
  assert.equal(anomalyErr.category, 'ANOMALY_RISK');
  assert.ok(anomalyErr.actions.some((a) => a.id === 'SWITCH_MERCHANT'));

  // Test 5: Category unauthorized
  const catErr = transmuteError('ERR_CATEGORY_NOT_AUTHORIZED:gaming_consoles');
  assert.equal(catErr.category, 'UNAUTHORIZED_CATEGORY');
  assert.ok(catErr.friendlyMessage.includes('gaming_consoles'));

  // Test 6: PayPal API error
  const paypalErr = transmuteError('PAYPAL_API_ERROR: TRANSACTION_REFUSED');
  assert.equal(paypalErr.category, 'PAYPAL_API');
  assert.ok(paypalErr.actions.some((a) => a.id === 'RETRY_PAYPAL_VAULT'));

  // Test 7: INSTRUMENT_DECLINED (Card decline recovery)
  const declinedErr = transmuteError('INSTRUMENT_DECLINED: card refused');
  assert.equal(declinedErr.category, 'CARD_DECLINED');
  assert.ok(declinedErr.actions.some((a) => a.id === 'SWITCH_PAYMENT_METHOD'));

  // Test 8: 3D Secure / PSD2 liability shift
  const secureErr = transmuteError('PAYER_ACTION_REQUIRED: 3D_SECURE_REQUIRED');
  assert.equal(secureErr.category, '3D_SECURE_REQUIRED');
  assert.ok(secureErr.actions.some((a) => a.id === 'COMPLETE_3DS_ACTION'));

  // Test 9: Rate limit (429)
  const rateLimitErr = transmuteError('RATE_LIMIT_REACHED: 429 too many requests');
  assert.equal(rateLimitErr.category, 'RATE_LIMIT');
  assert.ok(rateLimitErr.actions.some((a) => a.id === 'RETRY_WITH_BACKOFF'));

  // Test 10: Idempotency conflict (409)
  const idempotencyErr = transmuteError('PREVIOUS_REQUEST_IN_PROGRESS');
  assert.equal(idempotencyErr.category, 'IDEMPOTENCY_CONFLICT');
  assert.ok(idempotencyErr.actions.some((a) => a.id === 'RECOVER_EXISTING_ORDER'));
});

test('FriendlyErrorTransmuter renders banner with 1-click action buttons', () => {
  const html = renderToStaticMarkup(
    React.createElement(FriendlyErrorTransmuter, {
      error: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET: limit reached',
    })
  );

  assert.ok(html.includes('Preset Spend Mandate Cap Exceeded'));
  assert.ok(html.includes('Increase Mandate Cap'));
  assert.ok(html.includes('Find Cheaper Alternative'));
  assert.ok(html.includes('Recommended 1-Click Recovery:'));
});

test('HitlApprovalModal renders 60s countdown ring and counter-bid details', () => {
  const html = renderToStaticMarkup(
    React.createElement(HitlApprovalModal, {
      isOpen: true,
      request: {
        id: 'hitl_test_1',
        type: 'MERCHANT_COUNTER_OFFER',
        title: 'Merchant Counter-Offer Received',
        message: 'Merchant countered at $465.00 ($15 above bid). Accept counter before timer expires?',
        original_amount_cents: 45000,
        requested_amount_cents: 46500,
        delta_cents: 1500,
        timeout_seconds: 60,
      },
      onApprove: () => {},
      onDecline: () => {},
    })
  );

  assert.ok(html.includes('Merchant Counter-Offer Received'));
  assert.ok(html.includes('Merchant countered at $465.00'));
  assert.ok(html.includes('$450.00'));
  assert.ok(html.includes('$465.00'));
  assert.ok(html.includes('+$15.00 above initial bid'));
  assert.ok(html.includes('Accept Counter'));
  assert.ok(html.includes('Decline Counter'));
  assert.ok(html.includes('60s'));
});

test('ProductCard renders AI match score, merchant trust, badges, and pricing', async () => {
  const { ProductCard } = await import('./ProductCard.js');
  const mockProduct = {
    product_id: 'prod_123',
    title: 'Sony WH-1000XM5 Wireless Headphones',
    description: 'Industry-leading noise canceling headphones with dual processors.',
    price_cents: 34999,
    compare_at_price_cents: 39999,
    merchant_domain: 'bestbuy.com',
    composite_score: 9.6,
    delivery_window_days: 2,
    commission_rebate_cents: 1050,
    stock_status: true,
    badges: [
      { label: 'Top Value', badge_color: '#06b6d4' },
      { label: 'Fast Shipping', badge_color: '#10b981' },
    ],
  };

  const html = renderToStaticMarkup(
    React.createElement(ProductCard, {
      product: mockProduct as any,
      isWinner: true,
    })
  );

  assert.ok(html.includes('Top Algorithmic Pick'));
  assert.ok(html.includes('Sony WH-1000XM5'));
  assert.ok(html.includes('96% Match'));
  assert.ok(html.includes('bestbuy.com'));
  assert.ok(html.includes('2PC Stock Verified'));
  assert.ok(html.includes('$349.99'));
  assert.ok(html.includes('$399.99'));
  assert.ok(html.includes('Top Value'));
  assert.ok(html.includes('+$10.50 Rebate'));
  assert.ok(html.includes('Escrow Protected'));
});

test('ProductGrid renders empty state and sorted items', async () => {
  const { ProductGrid } = await import('./ProductGrid.js');

  // Empty state
  const emptyHtml = renderToStaticMarkup(
    React.createElement(ProductGrid, { products: [] })
  );
  assert.ok(emptyHtml.includes('No matching products found'));

  // With products
  const products = [
    {
      product_id: 'p1',
      title: 'Item A',
      price_cents: 10000,
      merchant_domain: 'store.com',
      composite_score: 8.5,
    },
    {
      product_id: 'p2',
      title: 'Item B',
      price_cents: 5000,
      merchant_domain: 'shop.com',
      composite_score: 9.2,
    },
  ];

  const gridHtml = renderToStaticMarkup(
    React.createElement(ProductGrid, { products: products as any })
  );
  assert.ok(gridHtml.includes('Showing 2 Algorithmic Recommendations'));
  assert.ok(gridHtml.includes('Item A'));
  assert.ok(gridHtml.includes('Item B'));
});

test('SearchBar renders form with suggestions', async () => {
  const { SearchBar } = await import('./SearchBar.js');
  const html = renderToStaticMarkup(
    React.createElement(SearchBar, {
      onSearch: () => {},
      suggestions: ['Test Suggestion 1', 'Test Suggestion 2'],
    })
  );

  assert.ok(html.includes('Test Suggestion 1'));
  assert.ok(html.includes('Test Suggestion 2'));
  assert.ok(html.includes('Search products, compare models'));
});

test('PriceLockCard renders timer, escrow protection info, and action buttons', async () => {
  const { PriceLockCard } = await import('./PriceLockCard.js');
  const future = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  const html = renderToStaticMarkup(
    React.createElement(PriceLockCard, {
      priceLock: {
        lock_id: 'lock_abc1234567890xyz',
        title: 'Sony XM5 Lock',
        locked_price_cents: 32000,
        original_price_cents: 39900,
        merchant_domain: 'bestbuy.com',
        expires_at: future,
      },
    })
  );

  assert.ok(html.includes('Cryptographic Price Lock'));
  assert.ok(html.includes('Voucher #lock_abc12345678'));
  assert.ok(html.includes('$320.00'));
  assert.ok(html.includes('$399.00'));
  assert.ok(html.includes('Save $79.00 (20%)'));
  assert.ok(html.includes('1-Click Vaulted Auto-Buy'));
  assert.ok(html.includes('Void'));
});

test('SocialProofPanel renders community sentiment and forum links', async () => {
  const { SocialProofPanel } = await import('./SocialProofPanel.js');
  const html = renderToStaticMarkup(
    React.createElement(SocialProofPanel, {
      productTitle: 'Sony XM5',
      defaultExpanded: true,
      initialData: {
        sentiment: 'positive',
        sentiment_emoji: '🔥',
        highlights: [
          'Unrivaled ANC performance in loud environments',
          'Comfortable headband padding for all-day listening',
        ],
        source_count: 12,
        reddit_url: 'https://reddit.com/r/headphones',
        youtube_url: 'https://youtube.com',
      },
    })
  );

  assert.ok(html.includes('Community Consensus &amp; Sentiment'));
  assert.ok(html.includes('POSITIVE'));
  assert.ok(html.includes('Unrivaled ANC performance'));
  assert.ok(html.includes('Aggregated across 12+ communities'));
  assert.ok(html.includes('Reddit ↗'));
  assert.ok(html.includes('YouTube ↗'));
});

test('ShareButton renders share trigger and aria attributes', async () => {
  const { ShareButton } = await import('./ShareButton.js');
  const html = renderToStaticMarkup(
    React.createElement(ShareButton, {
      query: 'best wireless headphones',
      recommendation: {
        title: 'Sony WH-1000XM5',
        price: 349.99,
        source: 'bestbuy.com',
      },
      totalCompared: 5,
    })
  );

  assert.ok(html.includes('Share Result'));
  assert.ok(html.includes('aria-label="Share comparison decision link"'));
});
