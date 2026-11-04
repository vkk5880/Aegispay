import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProductCardDataSchema,
  ComparisonMatrixSchema,
  ExplainableCartPayloadSchema,
} from '@aegispay/shared-types';
import {
  ShoppingAssistantService,
  defaultShoppingAssistant,
} from './shopping-assistant.js';

test('Mastra Shopping Assistant: DISCOVER workflow emits valid ProductCardData[] and thought trace', async () => {
  const service = new ShoppingAssistantService();
  const response = await service.processMessage({
    message: 'Find me studio headphones under $300',
  });

  assert.equal(response.action, 'DISCOVER');
  assert.ok(Array.isArray(response.products));
  assert.ok(response.products.length > 0);
  assert.ok(response.thought_trace && response.thought_trace.length > 0);

  // Validate every product adheres to ProductCardDataSchema with zero markdown regex parsing
  for (const product of response.products) {
    const parsed = ProductCardDataSchema.safeParse(product);
    assert.ok(parsed.success, `Product validation failed: ${JSON.stringify(parsed)}`);
    assert.ok(product.product_id);
    assert.ok(product.title);
    assert.ok(typeof product.price_cents === 'number');
    assert.ok(typeof product.commission_rebate_cents === 'number');
    assert.ok(product.merchant_credibility_score >= 0);
  }

  assert.ok(response.thought_trace.some(t => t.includes('Mastra Workflow DAG') || t.includes('Channel3')));
});

test('Mastra Shopping Assistant: COMPARE workflow emits valid ComparisonMatrixSchema', async () => {
  const service = new ShoppingAssistantService();
  const response = await service.processMessage({
    message: 'Compare studio headphones vs desk pad side by side',
    action: 'COMPARE',
  });

  assert.equal(response.action, 'COMPARE');
  assert.ok(response.comparison);

  // Strict Zod schema validation
  const parsedMatrix = ComparisonMatrixSchema.safeParse(response.comparison);
  assert.ok(parsedMatrix.success, `Matrix validation failed: ${JSON.stringify(parsedMatrix)}`);

  assert.ok(response.comparison.winner_product_id);
  assert.ok(response.comparison.rows.length >= 5);
  assert.ok(response.comparison.rows.some(r => r.attribute === 'Commission Rebate'));
  assert.ok(response.comparison.rows.some(r => r.attribute === 'Merchant Credibility'));
});

test('Mastra Shopping Assistant: DETAILS workflow emits valid ProductCardDataSchema', async () => {
  const service = new ShoppingAssistantService();
  const response = await service.processMessage({
    message: 'Show specs and details for AcousticPro ANC headphones',
    action: 'DETAILS',
  });

  assert.equal(response.action, 'DETAILS');
  assert.ok(response.product_detail);

  // Strict Zod schema validation
  const parsedDetail = ProductCardDataSchema.safeParse(response.product_detail);
  assert.ok(parsedDetail.success, `Detail validation failed: ${JSON.stringify(parsedDetail)}`);

  assert.ok(response.product_detail.specs);
  assert.ok(response.product_detail.merchant_domain);
  assert.ok(response.product_detail.cleaned_image_url);
});

test('Mastra Shopping Assistant: BUY workflow emits valid ExplainableCartPayloadSchema & 2PC hold', async () => {
  const service = new ShoppingAssistantService();
  const response = await service.processMessage({
    message: 'Buy for me with 2PC stock verification',
    budget_cap_cents: 50000,
    zip_code: '94016',
    action: 'BUY',
  });

  assert.equal(response.action, 'BUY');
  assert.ok(response.stock_reservation);
  assert.equal(response.stock_reservation.all_held, true);
  assert.ok(response.cart);

  // Strict Zod schema validation on ExplainableCartPayloadSchema
  const parsedCart = ExplainableCartPayloadSchema.safeParse(response.cart);
  assert.ok(parsedCart.success, `Cart validation failed: ${JSON.stringify(parsedCart)}`);

  assert.ok(response.cart.gross_subtotal_cents > 0);
  assert.ok(response.cart.total_commission_rebate_cents > 0);
  assert.ok(response.cart.net_buyer_expenditure_cents > 0);
  assert.ok(response.cart.assigned_merchants.length > 0);
});

test('Mastra Tools: Typed tool calls execute and validate schemas', async () => {
  const service = defaultShoppingAssistant;

  // 1. discover_products
  const discoverOutput = await service.discoverTool.execute!(
    { query: 'headphones', limit: 3 },
    {} as any
  );
  assert.ok(discoverOutput && 'products' in discoverOutput);
  assert.ok(discoverOutput.products.length > 0);

  // 2. score_and_rank
  const scoreOutput = await service.scoreTool.execute!(
    { query: 'headphones', products: discoverOutput.products },
    {} as any
  );
  assert.ok(scoreOutput && 'ranked_products' in scoreOutput);
  assert.ok(scoreOutput.ranked_products.length > 0);

  // 3. verify_and_checkout
  const verifyOutput = await service.verifyCheckoutTool.execute!(
    { product_ids: [discoverOutput.products[0].product_id] },
    {} as any
  );
  assert.ok(verifyOutput && 'all_held' in verifyOutput);
  assert.equal(verifyOutput.all_held, true);

  // 4. solve_knapsack_cart
  const cartOutput = await service.solveCartTool.execute!(
    { product_ids: [discoverOutput.products[0].product_id], budget_cap_cents: 50000 },
    {} as any
  );
  assert.ok(cartOutput && 'cart' in cartOutput);
  assert.ok(cartOutput.cart.gross_subtotal_cents > 0);
});
