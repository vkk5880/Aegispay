import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HitlApprovalModal } from './HitlApprovalModal.js';
import { PayPalV6SdkMount } from './PayPalV6SdkMount.js';
import { DisputeModal, validateEvidenceFile } from './DisputeModal.js';
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

test('HitlApprovalModal accessibility audit: verifies role dialog, aria-modal, and focus target attributes', () => {
  const html = renderToStaticMarkup(
    React.createElement(HitlApprovalModal, {
      isOpen: true,
      request: {
        id: 'hitl_a11y_test',
        type: 'CAP_OVERAGE_EXCEPTION',
        title: 'Spend Cap Exception Requested',
        message: 'Agent requested $520.00 spend ($20 over cap).',
        original_amount_cents: 50000,
        requested_amount_cents: 52000,
        delta_cents: 2000,
        timeout_seconds: 45,
      },
      onApprove: () => {},
      onDecline: () => {},
    })
  );

  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes('aria-modal="true"'));
  assert.ok(html.includes('aria-labelledby="hitl-approval-title"'));
  assert.ok(html.includes('id="hitl-approval-title"'));
  assert.ok(html.includes('Spend Cap Exception Requested'));
  assert.ok(html.includes('45s'));
  assert.ok(html.includes('Block Spend'));
  assert.ok(html.includes('Approve 1-Time'));
});

test('PayPalV6SdkMount renders session timer, funding sources, and hold amount', () => {
  const html = renderToStaticMarkup(
    React.createElement(PayPalV6SdkMount, {
      orderAmountCents: 45000,
      orderIntent: 'AUTHORIZE',
      currency: 'USD',
      clientId: 'sb-test-client',
    })
  );

  assert.ok(html.includes('PayPal JS SDK v6 Web Components Mount'));
  assert.ok(html.includes('15-Min Session Token'));
  assert.ok(html.includes('Session Window:'));
  assert.ok(html.includes('$450.00'));
  assert.ok(html.includes('AUTHORIZE (72h Price-Drop Watcher)'));
  assert.ok(html.includes('PayPal'));
  assert.ok(html.includes('Venmo'));
  assert.ok(html.includes('Pay Later'));
  assert.ok(html.includes('Authorize with PayPal'));
  assert.ok(html.includes('APIMatic Context Security'));
  assert.ok(html.includes('15-MIN EPHEMERAL GRANTED'));
});

test('DisputeModal renders accessible dialog and form inputs', () => {
  const html = renderToStaticMarkup(
    React.createElement(DisputeModal, {
      isOpen: true,
      disputeId: 'PP-D-998811',
      orderId: 'PP-ORD-V6-123',
      disputeAmountCents: 8500,
      onClose: () => {},
      onSubmitEvidence: () => {},
    })
  );

  assert.ok(html.includes('role="dialog"'));
  assert.ok(html.includes('aria-modal="true"'));
  assert.ok(html.includes('aria-labelledby="dispute-modal-title"'));
  assert.ok(html.includes('Submit Dispute Evidence Bundle'));
  assert.ok(html.includes('PP-D-998811'));
  assert.ok(html.includes('PP-ORD-V6-123'));
  assert.ok(html.includes('MERCHANDISE_NOT_AS_DESCRIBED'));
  assert.ok(html.includes('Cancel'));
  assert.ok(html.includes('Submit Evidence'));
});

test('DisputeModal validateEvidenceFile strictly enforces file size limits and MIME types', () => {
  // Test 1: Null/undefined file
  const nullCheck = validateEvidenceFile(null as any);
  assert.equal(nullCheck.valid, false);
  assert.ok(nullCheck.error?.includes('No file provided'));

  // Test 2: Empty file (0 bytes)
  const emptyCheck = validateEvidenceFile({
    name: 'empty.png',
    size: 0,
    type: 'image/png',
  });
  assert.equal(emptyCheck.valid, false);
  assert.ok(emptyCheck.error?.includes('empty'));

  // Test 3: Oversized file (>10MB)
  const oversizedCheck = validateEvidenceFile({
    name: 'heavy_damage_video.mp4',
    size: 11 * 1024 * 1024,
    type: 'video/mp4',
  });
  assert.equal(oversizedCheck.valid, false);
  assert.ok(oversizedCheck.error?.includes('exceeds the 10MB maximum limit'));

  // Test 4: Disallowed MIME type (executable / script / html)
  const scriptCheck = validateEvidenceFile({
    name: 'exploit.sh',
    size: 1024,
    type: 'application/x-sh',
  });
  assert.equal(scriptCheck.valid, false);
  assert.ok(scriptCheck.error?.includes('Unsupported file type'));

  const htmlCheck = validateEvidenceFile({
    name: 'phish.html',
    size: 2048,
    type: 'text/html',
  });
  assert.equal(htmlCheck.valid, false);
  assert.ok(htmlCheck.error?.includes('Unsupported file type'));

  // Test 5: Valid JPEG
  const jpegCheck = validateEvidenceFile({
    name: 'damage_photo.jpg',
    size: 2.5 * 1024 * 1024,
    type: 'image/jpeg',
  });
  assert.equal(jpegCheck.valid, true);
  assert.equal(jpegCheck.error, undefined);

  // Test 6: Valid PNG
  const pngCheck = validateEvidenceFile({
    name: 'box_tear.png',
    size: 4 * 1024 * 1024,
    type: 'image/png',
  });
  assert.equal(pngCheck.valid, true);

  // Test 7: Valid WEBP
  const webpCheck = validateEvidenceFile({
    name: 'package_label.webp',
    size: 512 * 1024,
    type: 'image/webp',
  });
  assert.equal(webpCheck.valid, true);

  // Test 8: Valid PDF dossier
  const pdfCheck = validateEvidenceFile({
    name: 'postal_affidavit.pdf',
    size: 8 * 1024 * 1024,
    type: 'application/pdf',
  });
  assert.equal(pdfCheck.valid, true);
});
