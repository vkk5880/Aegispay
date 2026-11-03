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
