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
  assert.ok(expiredErr.friendlyMessage.includes('Session authorization window has ended'));
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
  const paypalErr = transmuteError('INSTRUMENT_DECLINED: Payer action required');
  assert.equal(paypalErr.category, 'PAYPAL_API');
  assert.ok(paypalErr.actions.some((a) => a.id === 'RETRY_PAYPAL_VAULT'));
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
