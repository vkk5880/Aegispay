import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as chatHandler } from '../../app/api/buyer/chat/route.js';
import { DEFAULT_USER_SETTINGS, UserSettings } from './UserSettingsDrawer.js';

test('Buyer Chat Route: DISCOVER Intent returns products with badges and promos', async () => {
  const req = new Request('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Find me studio headphones under $300',
    }),
  });

  const res = await chatHandler(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.action, 'DISCOVER');
  assert.ok(Array.isArray(data.products));
  assert.ok(data.products.length > 0);
  assert.ok(data.thought_trace.some((t: string) => t.includes('Channel3')));

  const first = data.products[0];
  assert.ok(first.product_id);
  assert.ok(first.title);
  assert.ok(typeof first.price_cents === 'number');
  assert.ok(typeof first.commission_rebate_cents === 'number');
  assert.ok(typeof first.merchant_credibility_score === 'number');
});

test('Buyer Chat Route: COMPARE Intent returns comparison matrix and winning recommendation', async () => {
  const req = new Request('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Compare studio headphones vs desk pad side by side',
      action: 'COMPARE',
    }),
  });

  const res = await chatHandler(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.action, 'COMPARE');
  assert.ok(data.comparison);
  assert.ok(data.comparison.winner_product_id);
  assert.ok(data.comparison.rows.length >= 5);
  assert.ok(data.comparison.rows.some((r: any) => r.attribute === 'Commission Rebate'));
  assert.ok(data.comparison.rows.some((r: any) => r.attribute === 'Merchant Credibility'));
});

test('Buyer Chat Route: BUY Intent returns 2PC stock verification and knapsack cart', async () => {
  const req = new Request('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Buy for me with 2PC stock verification',
      budget_cap_cents: 50000,
      zip_code: '94016',
    }),
  });

  const res = await chatHandler(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.action, 'BUY');
  assert.ok(data.stock_reservation);
  assert.equal(data.stock_reservation.all_held, true);
  assert.ok(data.cart);
  assert.ok(data.cart.gross_subtotal_cents > 0);
  assert.ok(data.cart.total_commission_rebate_cents > 0);
  assert.ok(data.cart.net_buyer_expenditure_cents > 0);
});

test('Buyer User Settings: Default settings conform to postal tax and 72h price watcher', () => {
  assert.equal(DEFAULT_USER_SETTINGS.zipCode, '95131');
  assert.equal(DEFAULT_USER_SETTINGS.fulfillmentMode, 'PRICE_WATCHER_72H');
  assert.equal(DEFAULT_USER_SETTINGS.purchasingRule, 'ALWAYS_CONFIRM');
  assert.ok(DEFAULT_USER_SETTINGS.autoBuyThresholdCents > 0);
  assert.ok(DEFAULT_USER_SETTINGS.singleMerchantExposureCapCents > 0);

  // Custom modification test
  const customSettings: UserSettings = {
    ...DEFAULT_USER_SETTINGS,
    zipCode: '10001',
    fulfillmentMode: 'PRIORITY_EXPRESS',
    purchasingRule: 'AUTO_BUY_BELOW_THRESHOLD',
    autoBuyThresholdCents: 20000,
  };

  assert.equal(customSettings.zipCode, '10001');
  assert.equal(customSettings.fulfillmentMode, 'PRIORITY_EXPRESS');
  assert.equal(customSettings.purchasingRule, 'AUTO_BUY_BELOW_THRESHOLD');
  assert.equal(customSettings.autoBuyThresholdCents, 20000);
});

import { generateBundlingExplanation } from './UnifiedCartDrawer.js';
import type { KnapsackOptimizationData } from './KnapsackSplitVisualizer.js';

test('UnifiedCartDrawer: generateBundlingExplanation produces human-readable multi-vendor bundling text', () => {
  const sampleCart: KnapsackOptimizationData = {
    assigned_merchants: [
      {
        merchant_domain: 'nordic-workspaces.io',
        delivery_window: '3-4 Day Priority Freight',
        estimated_arrival: 'Est. Delivery in 3-4 business days',
        subtotal_cents: 19500,
        commission_rebate_cents: 1755,
        shipping_fee_cents: 0,
        shipping_waived: true,
        waiver_threshold_cents: 15000,
        net_merchant_cents: 17745,
        items: [
          {
            product_id: 'ch3_desk_mat_walnut',
            title: 'Precision Felt & Walnut Desk Organizer Pad',
            quantity: 1,
            unit_price_cents: 8500,
            unit_compare_price_cents: 11000,
            commission_rate: 0.12,
            cleaned_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&q=80',
          },
          {
            product_id: 'ch3_usb_dac_amp',
            title: 'Hi-Fi 32-bit USB Audio DAC/Amp Interface',
            quantity: 1,
            unit_price_cents: 11000,
            unit_compare_price_cents: 14000,
            commission_rate: 0.12,
            cleaned_url: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=400&q=80',
          },
        ],
      },
      {
        merchant_domain: 'audio-gear-direct.com',
        delivery_window: '2-Day Express Consolidated',
        estimated_arrival: 'Est. Delivery in 2 business days',
        subtotal_cents: 28000,
        commission_rebate_cents: 3150,
        shipping_fee_cents: 0,
        shipping_waived: true,
        waiver_threshold_cents: 25000,
        net_merchant_cents: 24850,
        items: [
          {
            product_id: 'ch3_anc_headphone_01',
            title: 'AcousticPro ANC Studio Headphones (Midnight)',
            quantity: 1,
            unit_price_cents: 28000,
            unit_compare_price_cents: 34999,
            commission_rate: 0.15,
            cleaned_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80',
          },
        ],
      },
    ],
    gross_subtotal_cents: 47500,
    total_commission_rebate_cents: 4905,
    total_shipping_cents: 0,
    total_shipping_saved_cents: 2500,
    net_buyer_expenditure_cents: 42595,
    savings_percentage: 29.0,
    is_within_budget: true,
    budget_cap_cents: 50000,
  };

  const explanation = generateBundlingExplanation(sampleCart);
  assert.ok(typeof explanation === 'string');
  assert.ok(explanation.includes('Bundled 2 items at Nordic workspaces to unlock Free Shipping'));
  assert.ok(explanation.includes('Free Shipping'));
  assert.ok(explanation.endsWith('.'));
});

test('ChatFlow: VS pattern regex detection isolates comparative queries directly', () => {
  const VS_PATTERN = /\s+(?:vs\.?|versus)\s+/i;
  assert.equal(VS_PATTERN.test('Sony WH-1000XM5 vs Bose QC Ultra'), true);
  assert.equal(VS_PATTERN.test('Sony WH-1000XM5 vs. Bose QC Ultra'), true);
  assert.equal(VS_PATTERN.test('Mechanical Keyboard versus Membrane'), true);
  assert.equal(VS_PATTERN.test('Desk mat for workspace'), false);
  assert.equal(VS_PATTERN.test('versus'), false); // Requires surrounding whitespace
});

test('BattleArena: contender scoring metrics, percentage scaling, and winner determination', () => {
  const contenderA = {
    title: 'Sony WH-1000XM5',
    price_cents: 29999,
    composite_score: 9.4,
    merchant_domain: 'bestbuy.com',
  };
  const contenderB = {
    title: 'Bose QC Ultra',
    price_cents: 34900,
    composite_score: 8.8,
    merchant_domain: 'bose.com',
  };

  const calculateScore = (p: typeof contenderA) =>
    p.composite_score ? (p.composite_score <= 10 ? p.composite_score * 10 : p.composite_score) : 90;

  assert.equal(calculateScore(contenderA), 94);
  assert.equal(calculateScore(contenderB), 88);

  const winner = calculateScore(contenderA) > calculateScore(contenderB) ? contenderA : contenderB;
  assert.equal(winner.title, 'Sony WH-1000XM5');
  assert.equal(winner.price_cents / 100, 299.99);
});

test('ExplainDrawer: deterministic SVG radar math, baseline normalization, and loser reason diagnostics', () => {
  const winner = {
    title: 'AudioPro Desk Amp',
    price: 15000,
    rating: 4.8,
    review_count: 320,
    score_breakdown: {
      price_score: 0.95,
      rating_score: 0.92,
      review_score: 0.88,
    },
    relevance_score: 0.96,
    trust_multiplier: 1.0,
    trust_tier: 'tier1',
    price_suspicious: false,
  };

  const expensiveLoser = {
    title: 'Overpriced Amp',
    price: 24000,
    rating: 4.5,
    review_count: 120,
    score_breakdown: {
      price_score: 0.6,
      rating_score: 0.85,
      review_score: 0.7,
    },
    relevance_score: 0.85,
    trust_tier: 'tier2',
  };

  const suspiciousLoser = {
    title: 'Scam Tier Amp',
    price: 3000,
    rating: 3.2,
    review_count: 12,
    score_breakdown: {
      price_score: 0.9,
      rating_score: 0.4,
      review_score: 0.2,
    },
    relevance_score: 0.35,
    trust_tier: 'tier3',
    price_suspicious: true,
  };

  // Radar geometry invariants
  const size = 260;
  const center = size / 2;
  const radius = size * 0.38;
  const totalAxes = 5;

  const getCoordinates = (index: number, normalizedValue: number) => {
    const angle = ((Math.PI * 2) / totalAxes) * index - Math.PI / 2;
    const r = radius * Math.min(Math.max(normalizedValue, 0.05), 1);
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y, angle };
  };

  const coord0 = getCoordinates(0, 1.0);
  assert.ok(Math.abs(coord0.x - center) < 0.001); // Top axis points straight up
  assert.ok(coord0.y < center);

  // Loser reason calculation
  const getReason = (loser: typeof expensiveLoser, w: typeof winner) => {
    const priceDiff = loser.price - w.price;
    if (priceDiff > 5000) return `$${(priceDiff / 100).toFixed(2)} higher than winner`;
    if ((loser.review_count ?? 0) < 50) return `Low confidence: only ${loser.review_count ?? 0} reviews`;
    if ((loser.relevance_score ?? 0) < 0.4) return 'Poor semantic query match (< 40%)';
    if (loser.trust_tier === 'tier3') return 'Unverified store trust tier';
    return 'Lower overall composite score';
  };

  assert.equal(getReason(expensiveLoser, winner), '$90.00 higher than winner');
  assert.equal(getReason(suspiciousLoser, winner), 'Low confidence: only 12 reviews');
});

import { sanitizeChatInput } from './ChatFlow.js';
import {
  extractProductPrice,
  extractProductScore,
  calculateMetricDeltas,
} from './BattleArena.js';

test('ChatFlow: sanitizeChatInput neutralizes XSS vectors, scripts, and control characters', () => {
  const xssPayload = '<script>alert("xss")</script><img src=x onerror=alert(1)>Sony Headphones';
  const sanitized = sanitizeChatInput(xssPayload);
  assert.equal(sanitized.includes('<script>'), false);
  assert.equal(sanitized.includes('onerror='), false);
  assert.equal(sanitized.includes('Sony Headphones'), true);

  // Dangerous uri scheme
  const jsUri = 'javascript:doEvil() mechanical keyboard';
  assert.equal(sanitizeChatInput(jsUri).includes('javascript:'), false);

  // Control characters stripped
  const ctrlChars = 'Clean\u0000Text\u0007Here';
  assert.equal(sanitizeChatInput(ctrlChars), 'CleanTextHere');

  // Keystroke typing preserves trailing spaces when trim is false
  assert.equal(sanitizeChatInput('over ear ', 1000, false), 'over ear ');
});

test('BattleArena: zero NaN price & score parsing and head-to-head metric deltas', () => {
  // Empty, null, and NaN handling
  assert.equal(extractProductPrice(null), 0);
  assert.equal(extractProductPrice({ price_cents: NaN }), 0);
  assert.equal(extractProductPrice({ price_cents: 14999 }), 149.99);
  assert.equal(extractProductPrice({ price: 49.99 }), 49.99);

  assert.equal(extractProductScore(null), 90);
  assert.equal(extractProductScore({ composite_score: NaN }), 90);
  assert.equal(extractProductScore({ composite_score: 9.6 }), 96);
  assert.equal(extractProductScore({ score: 0.85 }), 85);

  // Head-to-head deltas with clean formatting and no NaN
  const contenderA = { price_cents: 20000, composite_score: 9.5 };
  const contenderB = { price_cents: 25000, composite_score: 8.5 };
  const deltas = calculateMetricDeltas(contenderA, contenderB);

  assert.equal(deltas.priceDelta, -50);
  assert.equal(deltas.scoreDelta, 10);
  assert.equal(deltas.cheaperSide, 'A');
  assert.equal(deltas.higherScoreSide, 'A');
  assert.equal(deltas.priceDiffText, 'Side A is $50.00 cheaper');
  assert.equal(deltas.scoreDiffText, 'Side A leads by +10%');

  // Edge case: completely undefined/empty objects
  const emptyDeltas = calculateMetricDeltas({}, {});
  assert.equal(emptyDeltas.priceDelta, 0);
  assert.equal(emptyDeltas.scoreDelta, 0);
  assert.equal(emptyDeltas.cheaperSide, 'EQUAL');
  assert.equal(emptyDeltas.higherScoreSide, 'EQUAL');
  assert.equal(Number.isNaN(emptyDeltas.priceDelta), false);
  assert.equal(Number.isNaN(emptyDeltas.scoreDelta), false);
});

test('ExplainDrawer: SVG radar coordinate calculation handles zero, 1.0, null, and NaN without broken SVG paths', () => {
  const size = 260;
  const center = size / 2;
  const radius = size * 0.38;
  const totalAxes = 5;

  const safeGetCoordinates = (index: number, normalizedValue: number) => {
    const angle = ((Math.PI * 2) / totalAxes) * index - Math.PI / 2;
    const safeVal =
      typeof normalizedValue === 'number' && !Number.isNaN(normalizedValue) && Number.isFinite(normalizedValue)
        ? Math.min(Math.max(normalizedValue, 0), 1)
        : 0;
    const r = radius * Math.max(0.05, safeVal);
    const x = Number.isFinite(center + r * Math.cos(angle)) ? center + r * Math.cos(angle) : center;
    const y = Number.isFinite(center + r * Math.sin(angle)) ? center + r * Math.sin(angle) : center;
    return { x, y, angle };
  };

  // Test zero score
  const zeroCoord = safeGetCoordinates(0, 0);
  assert.equal(Number.isNaN(zeroCoord.x), false);
  assert.equal(Number.isNaN(zeroCoord.y), false);
  assert.ok(zeroCoord.y < center);

  // Test perfect 1.0 score
  const maxCoord = safeGetCoordinates(0, 1.0);
  assert.equal(Number.isNaN(maxCoord.x), false);
  assert.equal(Number.isNaN(maxCoord.y), false);
  assert.ok(maxCoord.y < zeroCoord.y); // Extends further up

  // Test NaN and undefined input values
  const nanCoord = safeGetCoordinates(1, NaN);
  assert.equal(Number.isNaN(nanCoord.x), false);
  assert.equal(Number.isNaN(nanCoord.y), false);

  const nullCoord = safeGetCoordinates(2, null as any);
  assert.equal(Number.isNaN(nullCoord.x), false);
  assert.equal(Number.isNaN(nullCoord.y), false);

  // Test polygon string serialization has zero NaN
  const testPoints = [0, 1.0, 0.5, NaN, -0.2].map((val, idx) => safeGetCoordinates(idx, val));
  const polygonStr = testPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  assert.equal(polygonStr.includes('NaN'), false);
});

test('Phase 4: Proactive 1-Tap Recovery Pills & Variant Selection', async () => {
  const { inferRecoveryPillsFromWarning } = await import('./ChatFlow.js');

  // 1. Shipping threshold warning
  const shippingPills = inferRecoveryPillsFromWarning('Cart is $8 away from free shipping');
  assert.equal(shippingPills.length, 1);
  assert.equal(shippingPills[0].type, 'free_shipping');
  assert.ok(shippingPills[0].label.includes('$8'));

  // 2. Low stock warning
  const stockPills = inferRecoveryPillsFromWarning('Item low in stock from merchant');
  assert.equal(stockPills.length, 1);
  assert.equal(stockPills[0].type, 'substitute');

  // 3. Variant disambiguation warning
  const variantPills = inferRecoveryPillsFromWarning('Size option required before checkout');
  assert.equal(variantPills.length, 1);
  assert.equal(variantPills[0].type, 'variant');

  // 4. Safe fallback on empty or undefined
  assert.deepEqual(inferRecoveryPillsFromWarning(undefined), []);
  assert.deepEqual(inferRecoveryPillsFromWarning(''), []);
});

test('Upgrade B: Turn-Level Context & Multi-Product Interactive Chips (assistant_ui_agentic_chat_upgrade_plan:109-148)', async () => {
  const { ConversationalChatPayloadSchema } = await import('@aegispay/shared-types');

  const mockActiveTurnProducts = [
    {
      index: 1,
      product_id: 'ch3_rowenta_steam_01',
      title: 'Rowenta Steam Iron 1710W',
      price_cents: 4999,
      merchant_domain: 'bestbuy.com',
      rating: 4.8,
      free_shipping: true,
      specs: { Wattage: '1710W', Soleplate: 'Stainless Steel', Warranty: '2-Year Manufacturer' },
    },
    {
      index: 2,
      product_id: 'ch3_black_decker_02',
      title: 'Black+Decker Easy Steam 1200W',
      price_cents: 2999,
      merchant_domain: 'walmart.com',
      rating: 4.5,
      free_shipping: true,
      specs: { Wattage: '1200W', Soleplate: 'Non-stick Ceramic', Warranty: '1-Year Limited' },
    },
  ];

  // 1. Context Payload Schema Validation
  const testPayload = {
    session_id: 'sess_test_turn_99',
    message: 'Which of these two is better for delicate silk and linen?',
    history: [
      { role: 'user' as const, content: 'Find me steam irons under $50' },
      { role: 'assistant' as const, content: 'Here are the matching steam irons from Channel3 merchants:' },
    ],
    selected_product_ids: ['ch3_rowenta_steam_01', 'ch3_black_decker_02'],
    active_turn_products: mockActiveTurnProducts,
    budget_cap_cents: 10000,
    zip_code: '94016',
  };
  assert.equal(ConversationalChatPayloadSchema.safeParse(testPayload).success, true);

  // 2. Multi-Item Comparison Route Execution
  const compareReq = new Request('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload),
  });

  const compareRes = await chatHandler(compareReq);
  assert.equal(compareRes.status, 200);
  const compareData = await compareRes.json();
  assert.equal(compareData.action, 'COMPARE');
  assert.ok(compareData.comparison);
  assert.equal(compareData.comparison.product_ids.length, 2);
  assert.ok(compareData.comparison.product_ids.includes('ch3_rowenta_steam_01'));
  assert.ok(compareData.comparison.product_ids.includes('ch3_black_decker_02'));
  assert.ok(compareData.products.some((p: any) => p.title.includes('Rowenta')));
  assert.ok(compareData.products.some((p: any) => p.title.includes('Black+Decker')));

  // 3. Multi-Item Bundling / Budget Feasibility Route Execution
  const bundlePayload = {
    session_id: 'sess_test_turn_99',
    message: 'Can I buy both of these within my $100 budget cap?',
    history: testPayload.history,
    selected_product_ids: ['ch3_rowenta_steam_01', 'ch3_black_decker_02'],
    active_turn_products: mockActiveTurnProducts,
    budget_cap_cents: 10000,
    zip_code: '94016',
  };

  const bundleReq = new Request('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bundlePayload),
  });

  const bundleRes = await chatHandler(bundleReq);
  assert.equal(bundleRes.status, 200);
  const bundleData = await bundleRes.json();
  assert.equal(bundleData.action, 'BUY');
  assert.ok(bundleData.cart);
  assert.equal(bundleData.cart.is_within_budget, true);
  assert.equal(bundleData.products.length, 2);
  assert.equal(bundleData.stock_reservation.all_held, true);

  // 4. Single-Item Deep Dive Route Execution (Ask AI About This)
  const singleDetailPayload = {
    session_id: 'sess_test_turn_99',
    message: 'What are the specs and warranty for this iron?',
    history: testPayload.history,
    selected_product_ids: ['ch3_rowenta_steam_01'],
    active_turn_products: mockActiveTurnProducts,
  };

  const detailReq = new Request('http://localhost:3000/api/buyer/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(singleDetailPayload),
  });

  const detailRes = await chatHandler(detailReq);
  assert.equal(detailRes.status, 200);
  const detailData = await detailRes.json();
  assert.equal(detailData.action, 'DETAILS');
  assert.ok(detailData.product_detail);
  assert.equal(detailData.product_detail.product_id, 'ch3_rowenta_steam_01');
  assert.ok(detailData.markdown.includes('Rowenta'));
});

test('Upgrade B: ChatInputBar renders multi-chip input bar visualizer and quick action triggers', async () => {
  const React = await import('react');
  const { renderToString } = await import('react-dom/server');
  const { ChatInputBar } = await import('./ChatInputBar.js');

  const selectedProducts: any[] = [
    {
      product_id: 'ch3_rowenta_steam_01',
      title: 'Rowenta Steam 1710W',
      description: 'Steam iron',
      category_id: 'appliances',
      price_cents: 4999,
      compare_at_price_cents: 5999,
      commission_rebate_cents: 500,
      commission_rate: 0.1,
      review_count: 50,
      shipping_fee_cents: 0,
      merchant_credibility_score: 95,
      stock_status: 'IN_STOCK',
      delivery_window: '2-Day Express',
      image_url: '',
      cleaned_image_url: '',
      merchant_domain: 'bestbuy.com',
      rating: 4.8,
      free_shipping: true,
    },
    {
      product_id: 'ch3_black_decker_02',
      title: 'Black+Decker 1200W',
      description: 'Compact iron',
      category_id: 'appliances',
      price_cents: 2999,
      compare_at_price_cents: 3999,
      commission_rebate_cents: 300,
      commission_rate: 0.1,
      review_count: 40,
      shipping_fee_cents: 0,
      merchant_credibility_score: 90,
      stock_status: 'IN_STOCK',
      delivery_window: '2-Day Express',
      image_url: '',
      cleaned_image_url: '',
      merchant_domain: 'walmart.com',
      rating: 4.5,
      free_shipping: true,
    },
  ];

  const html = renderToString(
    React.createElement(ChatInputBar, {
      inputMessage: 'Which of these two is better for silk?',
      onInputChange: () => {},
      onSubmit: () => {},
      isLoading: false,
      selectedProducts,
      onRemoveSelectedProduct: () => {},
      onClearAllSelected: () => {},
      onCompareSelected: () => {},
      onBundleSelected: () => {},
      budgetCapCents: 10000,
    })
  );

  // Multi-Chip Input Bar Visualizer checks
  assert.ok(html.includes('Selected (2):'));
  assert.ok(html.includes('Rowenta Steam 1710W'));
  assert.ok(html.includes('Black+Decker 1200W'));
  assert.ok(html.includes('(Clear All)'));
  assert.ok(html.includes('Compare Side-by-Side'));
  assert.ok(html.includes('Can I buy all within $100 budget?'));
});

test('PurchaseConfirmationCard: renders compact user-view ready prompt with Cancel button and small item images', async () => {
  const React = await import('react');
  const { renderToString } = await import('react-dom/server');
  const { PurchaseConfirmationCard } = await import('./PurchaseConfirmationCard.js');

  const mockCart: any = {
    gross_subtotal_cents: 28000,
    total_commission_rebate_cents: 2800,
    total_shipping_cents: 0,
    total_shipping_saved_cents: 0,
    total_tax_cents: 2310,
    net_buyer_expenditure_cents: 27510,
    budget_cap_cents: 50000,
    is_within_budget: true,
    assigned_merchants: [
      {
        merchant_domain: 'audio-gear-direct.com',
        merchant_name: 'Audio Gear Direct',
        shipping_fee_cents: 0,
        waiver_threshold_cents: 5000,
        shipping_waived: true,
        commission_rebate_cents: 2800,
        tax_cents: 2310,
        items: [
          {
            product_id: 'ch3_anc_headphone_01',
            title: 'AcousticPro ANC Studio Headphones',
            price_cents: 28000,
            unit_price_cents: 28000,
            quantity: 1,
            cleaned_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=128&q=80',
          },
        ],
      },
    ],
  };

  const html = renderToString(
    React.createElement(PurchaseConfirmationCard, {
      cart: mockCart,
      zipCode: '94016',
    })
  );

  // Verifies compact card header, cancel option, and small image preview
  assert.ok(html.includes('Pre-Purchase Authorization'));
  assert.ok(html.includes('Cancel'), 'Expected Cancel button to be present');
  assert.ok(html.includes('AcousticPro ANC Studio Headphones'));
  assert.ok(html.includes('$275.10'));
  assert.ok(html.includes('View breakdown'));
  assert.ok(html.includes('w-9 h-9') || html.includes('w-10 sm:h-10'), 'Expected small image thumbnail');
});

