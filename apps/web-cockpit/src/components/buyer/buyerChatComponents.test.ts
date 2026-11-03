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
