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
  generateComparisonMatrix,
  ComparisonMatrixSchema as ReExportedComparisonMatrixSchema,
  createCommercePipelineWorkflow,
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

test('Mastra Shopping Assistant: Supports dynamic deploy-time and per-request model selection', async () => {
  const service = new ShoppingAssistantService();

  // Test 1: Per-request override to Anthropic Claude 3.5 Sonnet
  const claudeRes = await service.processMessage({
    message: 'Find headphones',
    model: 'anthropic/claude-3-5-sonnet',
  });
  assert.equal(claudeRes.active_model, 'anthropic/claude-3-5-sonnet');
  assert.ok(claudeRes.thought_trace?.some(t => t.includes('anthropic/claude-3-5-sonnet')));

  // Test 2: Per-request override to Gemini 1.5 Pro
  const geminiProRes = await service.processMessage({
    message: 'Compare studio gear',
    action: 'COMPARE',
    model: 'google/gemini-1.5-pro',
  });
  assert.equal(geminiProRes.active_model, 'google/gemini-1.5-pro');
  assert.ok(geminiProRes.thought_trace?.some(t => t.includes('google/gemini-1.5-pro')));

  // Test 3: Default model resolution
  const defaultRes = await service.processMessage({
    message: 'Show specs',
    action: 'DETAILS',
  });
  assert.ok(defaultRes.active_model);
});

test('Subagent 3B: generateComparisonMatrix generates structured side-by-side matrices matching compare_agent.py', async () => {
  // 1. Verify schema export parity
  assert.strictEqual(ComparisonMatrixSchema, ReExportedComparisonMatrixSchema);

  // 2. Sample products for comparison
  const candidates = [
    {
      product_id: 'prod_sony_1',
      title: 'Sony WH-1000XM5 Wireless Headphones',
      description: 'Industry leading noise cancellation',
      category_id: 'electronics',
      price_cents: 35000,
      compare_at_price_cents: 39900,
      commission_rebate_cents: 2625,
      commission_rate: 0.10,
      rating: 4.9,
      review_count: 512,
      shipping_fee_cents: 0,
      free_shipping: true,
      merchant_domain: 'sony.com',
      merchant_credibility_score: 98,
      stock_status: 'IN_STOCK' as const,
      delivery_window: '2-3 Business Days',
      image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',
      cleaned_image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',
    },
    {
      product_id: 'prod_bose_1',
      title: 'Bose QuietComfort 45 Headphones',
      description: 'Legendary noise cancelling and lightweight comfort',
      category_id: 'electronics',
      price_cents: 27900,
      compare_at_price_cents: 32900,
      commission_rebate_cents: 1674,
      commission_rate: 0.08,
      rating: 4.7,
      review_count: 320,
      shipping_fee_cents: 0,
      free_shipping: true,
      merchant_domain: 'amazon.com',
      merchant_credibility_score: 95,
      stock_status: 'IN_STOCK' as const,
      delivery_window: '1-2 Business Days',
      image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',
      cleaned_image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',
    },
  ];

  const matrix = generateComparisonMatrix(candidates);

  // 3. Strict schema validation
  const validation = ComparisonMatrixSchema.safeParse(matrix);
  assert.ok(validation.success, `Matrix validation failed: ${JSON.stringify(validation)}`);

  // 4. Matrix assertions
  assert.strictEqual(matrix.products.length, 2);
  assert.deepEqual(matrix.product_ids, ['prod_sony_1', 'prod_bose_1']);
  assert.ok(matrix.winner_product_id);
  assert.ok(matrix.rationale && matrix.rationale.length > 0);

  // 5. Attributes matching compare_agent.py
  const rowLabels = matrix.rows.map(r => r.attribute);
  assert.ok(rowLabels.includes('Retail Price'));
  assert.ok(rowLabels.includes('Commission Rebate'));
  assert.ok(rowLabels.includes('Net Effective Price'));
  assert.ok(rowLabels.includes('Customer Rating'));
  assert.ok(rowLabels.includes('Merchant Credibility'));
  assert.ok(rowLabels.includes('Delivery Window'));
  assert.ok(rowLabels.includes('Stock Status'));
  assert.ok(rowLabels.includes('Deal Verdict'));
  assert.ok(rowLabels.includes('30-Day Historical Trend'));

  // 6. Highlighted winning product
  const netRow = matrix.rows.find(r => r.attribute === 'Net Effective Price');
  assert.strictEqual(netRow?.highlighted_product_id, matrix.winner_product_id);

  // 7. Empty array edge case
  const emptyMatrix = generateComparisonMatrix([]);
  assert.strictEqual(emptyMatrix.products.length, 0);
  assert.strictEqual(emptyMatrix.rows.length, 0);
});

test('Subagent 3B: Mastra Commerce Workflow DAG properly wires all 4 pipeline steps (discover_products -> score_and_rank -> solve_knapsack_cart -> execute_escrow_hold)', async () => {
  const service = new ShoppingAssistantService();

  // 1. Verify workflow instance and committed structure
  assert.ok(service.commerceWorkflow, 'commerceWorkflow should be defined on service');
  assert.strictEqual(service.pipelineWorkflow, service.commerceWorkflow);

  // 2. Execute full 4-step DAG run
  const run = await service.commerceWorkflow.createRun();
  const runResult = await run.start({
    inputData: {
      query: 'wireless noise cancelling studio headphones',
      budget_cap_cents: 45000,
      zip_code: '94016',
      limit: 5,
    },
  });

  assert.strictEqual(runResult.status, 'success');

  // 3. Verify exact execution path: all 4 steps executed sequentially
  assert.deepEqual(runResult.stepExecutionPath, [
    'discover_products',
    'score_and_rank',
    'solve_knapsack_cart',
    'execute_escrow_hold',
  ]);

  // 4. Verify step 1: discover_products output
  const discoverStep = runResult.steps.discover_products;
  assert.strictEqual(discoverStep.status, 'success');
  assert.ok(discoverStep.output.products.length > 0);
  assert.ok(discoverStep.output.total_found > 0);

  // 5. Verify step 2: score_and_rank output
  const scoreStep = runResult.steps.score_and_rank;
  assert.strictEqual(scoreStep.status, 'success');
  assert.ok(scoreStep.output.ranked_products.length > 0);
  assert.ok(scoreStep.output.top_winner_id);

  // 6. Verify step 3: solve_knapsack_cart output
  const cartStep = runResult.steps.solve_knapsack_cart;
  assert.strictEqual(cartStep.status, 'success');
  assert.ok(cartStep.output.cart);
  assert.ok(cartStep.output.cart.net_buyer_expenditure_cents > 0);
  assert.ok(cartStep.output.cart.total_commission_rebate_cents > 0);
  assert.ok(cartStep.output.target_product_ids.length > 0);

  // 7. Verify step 4: execute_escrow_hold output
  const escrowStep = runResult.steps.execute_escrow_hold;
  assert.strictEqual(escrowStep.status, 'success');
  assert.strictEqual(escrowStep.output.all_held, true);
  assert.ok(escrowStep.output.reservation_id);
  assert.strictEqual(escrowStep.output.action, 'BUY');

  // 8. Test executeCommercePipeline helper
  const pipelineResult = await service.executeCommercePipeline({
    query: 'studio headphones',
    budget_cap_cents: 40000,
    zip_code: '94016',
  });
  assert.strictEqual(pipelineResult.success, true);
  assert.strictEqual(pipelineResult.all_held, true);
  assert.ok(pipelineResult.reservation_id);
  assert.ok(pipelineResult.cart);

  // 9. Test createCommercePipelineWorkflow factory export
  const factoryWf = createCommercePipelineWorkflow(service);
  assert.ok(factoryWf);
});

test('Checkpoint 5.1-5.3: processMessage fails over cleanly to local-reasoner on simulated error', async () => {
  const service = new ShoppingAssistantService();
  // Override chatWorkflow.createRun to simulate an upstream 429/error
  (service as any).chatWorkflow.createRun = async () => ({
    start: async () => {
      throw new Error('429 Rate Limit Exceeded: Upstream LLM provider quota exhausted');
    },
  });

  const res = await service.processMessage({
    message: 'pay $150 to Acme for electronics',
  });

  assert.ok(res);
  assert.strictEqual(res.active_model, 'local-financial-reasoner-v1');
  assert.ok(res.products && res.products.length > 0);
  assert.ok(res.thought_trace && res.thought_trace.some((t: string) => t.includes('[Circuit Breaker Fallback]')));
});
