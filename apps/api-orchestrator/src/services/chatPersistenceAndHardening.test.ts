import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PrepareCheckoutInputSchema,
  PrepareCheckoutOutputSchema,
  ProductVariantOptionSchema,
  RecoveryPillSchema,
  ProductCardData,
} from '@aegispay/shared-types';
import {
  createOrGetChatSession,
  saveChatMessage,
  getChatSessionWithMessages,
  listChatSessions,
  deleteChatSession,
  clearChatSessionsStore,
} from './user-memory.js';
import {
  createPrepareCheckoutTool,
  transformToProductCard,
} from './mastra-tools.js';
import { defaultShoppingAssistant } from './shopping-assistant.js';

test('Phase 4: Chat History Persistence - create, append turns, retrieve and cascade delete', async () => {
  clearChatSessionsStore();
  const testSessionId = `test_sess_${Date.now()}`;
  const buyerId = 'test_buyer_42';

  // 1. Create or get session
  const session = await createOrGetChatSession(
    testSessionId,
    buyerId,
    'Ergonomic Mechanical Keyboard Setup',
    { preferred_category: 'Electronics', budget_cap_cents: 25000 }
  );

  assert.equal(session.id, testSessionId);
  assert.equal(session.buyer_id, buyerId);
  assert.equal(session.title, 'Ergonomic Mechanical Keyboard Setup');
  assert.equal(session.message_count, 0);

  // 2. Append User Message Turn
  const userMsg = await saveChatMessage({
    session_id: testSessionId,
    role: 'user',
    content: 'Find me ergonomic split keyboards under $250 with hot-swappable switches',
    selected_product_ids: ['kbd_01', 'kbd_02'],
  });

  assert.ok(userMsg.id);
  assert.equal(userMsg.session_id, testSessionId);
  assert.equal(userMsg.role, 'user');
  assert.deepEqual(userMsg.selected_product_ids, ['kbd_01', 'kbd_02']);

  // 3. Append Assistant Message Turn with Attached Products
  const mockCard: ProductCardData = {
    product_id: 'kbd_01',
    title: 'ErgoDox Pro Wireless Split Keyboard',
    description: 'Ortholinear mechanical keyboard with hot-swappable Gateron Brown switches.',
    category_id: 'Keyboards',
    price_cents: 21900,
    compare_at_price_cents: 24900,
    commission_rebate_cents: 2190,
    commission_rate: 0.1,
    rating: 4.9,
    review_count: 88,
    free_shipping: true,
    shipping_fee_cents: 0,
    merchant_domain: 'ergodox.com',
    merchant_credibility_score: 96,
    stock_status: 'IN_STOCK',
    delivery_window: '2-3 Business Days',
    specs: {
      Layout: 'Split Ortholinear',
      Switches: 'Hot-Swappable Brown',
      Wireless: 'Bluetooth 5.0 + 2.4GHz',
    },
    variants: [
      { id: 'kbd_01_v1', name: 'Midnight Black', price_cents: 21900, stock_status: 'IN_STOCK' },
      { id: 'kbd_01_v2', name: 'Silver Frost', price_cents: 21900, stock_status: 'IN_STOCK' },
    ],
  };

  const assistantMsg = await saveChatMessage({
    session_id: testSessionId,
    role: 'assistant',
    content: 'Here are the top ergonomic split mechanical keyboards discovered in your price range:',
    action: 'DISCOVER',
    attached_products: [mockCard],
    selected_product_ids: ['kbd_01'],
  });

  assert.ok(assistantMsg.id);
  assert.equal(assistantMsg.role, 'assistant');
  assert.equal(assistantMsg.attached_products?.length, 1);
  assert.equal(assistantMsg.attached_products?.[0].product_id, 'kbd_01');

  // 4. Retrieve Full Thread with Attached Products
  const thread = await getChatSessionWithMessages(testSessionId);
  assert.ok(thread.session);
  assert.equal(thread.session.id, testSessionId);
  assert.equal(thread.messages.length, 2);
  assert.equal(thread.messages[0].role, 'user');
  assert.equal(thread.messages[1].role, 'assistant');
  assert.equal(thread.messages[1].attached_products?.[0].title, 'ErgoDox Pro Wireless Split Keyboard');

  // 5. List Sessions for Buyer
  const sessions = await listChatSessions(buyerId);
  assert.ok(sessions.length >= 1);
  assert.equal(sessions[0].id, testSessionId);
  assert.equal(sessions[0].message_count, 2);

  // 6. Delete Session & Verify Cascade
  const deleted = await deleteChatSession(testSessionId);
  assert.equal(deleted, true);

  const afterDelete = await getChatSessionWithMessages(testSessionId);
  assert.equal(afterDelete.session, null);
  assert.equal(afterDelete.messages.length, 0);
});

test('Phase 5: Upgrade E - Strict Zod Quantity Cap Guardrail (1 <= quantity <= 5)', () => {
  // Valid Quantities: 1 to 5
  for (let q = 1; q <= 5; q++) {
    const valid = PrepareCheckoutInputSchema.safeParse({
      product_id: 'ch3_anc_headphone_01',
      quantity: q,
    });
    assert.ok(valid.success, `Quantity ${q} should be valid`);
    assert.equal(valid.data.quantity, q);
  }

  // Reject quantity: 0
  const zeroResult = PrepareCheckoutInputSchema.safeParse({
    product_id: 'ch3_anc_headphone_01',
    quantity: 0,
  });
  assert.equal(zeroResult.success, false);

  // Reject quantity: 6 (above limit)
  const sixResult = PrepareCheckoutInputSchema.safeParse({
    product_id: 'ch3_anc_headphone_01',
    quantity: 6,
  });
  assert.equal(sixResult.success, false);

  // Reject hallucinated/injection quantity: 9999
  const overflowResult = PrepareCheckoutInputSchema.safeParse({
    product_id: 'ch3_anc_headphone_01',
    quantity: 9999,
  });
  assert.equal(overflowResult.success, false);

  // Reject negative quantity: -1
  const negativeResult = PrepareCheckoutInputSchema.safeParse({
    product_id: 'ch3_anc_headphone_01',
    quantity: -1,
  });
  assert.equal(negativeResult.success, false);

  // Reject non-integer float quantity: 2.5
  const floatResult = PrepareCheckoutInputSchema.safeParse({
    product_id: 'ch3_anc_headphone_01',
    quantity: 2.5,
  });
  assert.equal(floatResult.success, false);
});

test('Phase 5: Upgrade E & F - prepare_checkout Live Spend Grounding & Proactive Recovery Pills', async () => {
  const tool = createPrepareCheckoutTool();

  // Scenario 1: Successful hold within budget
  const normalResult = (await tool.execute!(
    {
      product_id: 'ch3_anc_headphone_01',
      quantity: 2,
      budget_cap_cents: 80000,
      zip_code: '94016',
    },
    {} as any
  )) as any;

  assert.equal(normalResult.all_held, true);
  assert.ok(normalResult.reservation_id);
  assert.equal(normalResult.hitl_required, false);
  assert.equal(normalResult.requires_approval, false);
  assert.ok(normalResult.total_expenditure_cents > 0);

  // Scenario 2: Budget Exceeded triggers HITL and yields 1-Tap Recovery Pills
  const overBudgetResult = (await tool.execute!(
    {
      product_id: 'ch3_anc_headphone_01',
      quantity: 2,
      budget_cap_cents: 5000, // unrealistically low $50 cap for $600+ headphones
      zip_code: '94016',
    },
    {} as any
  )) as any;

  assert.equal(overBudgetResult.hitl_required, true);
  assert.equal(overBudgetResult.requires_approval, true);
  assert.ok(Array.isArray(overBudgetResult.recovery_pills));
  assert.ok(overBudgetResult.recovery_pills.length >= 1);

  // Verify Recovery Pill conforms to RecoveryPillSchema
  for (const pill of overBudgetResult.recovery_pills) {
    const parsePill = RecoveryPillSchema.safeParse(pill);
    assert.ok(parsePill.success, `Recovery pill schema invalid: ${JSON.stringify(parsePill)}`);
    assert.ok(pill.label);
    assert.ok(pill.message_prompt);
  }

  const budgetPill = overBudgetResult.recovery_pills.find((p: any) => p.action === 'ADJUST_BUDGET');
  assert.ok(budgetPill);
  assert.ok(budgetPill.label.includes('Adjust Budget Cap'));
});

test('Phase 5: Upgrade G - Product Card Variant Selection Normalization', () => {
  const sampleDetail = {
    product_id: 'ch3_var_test_01',
    title: 'Bose QuietComfort 45 Headphones',
    description: 'Premium noise cancelling over-ear headphones.',
    category_id: 'Electronics',
    images: [{ url: 'https://img.test/bose.jpg', cleaned_url: 'https://img.test/bose_clean.jpg' }],
    offers: [
      {
        id: 'off_01',
        product_id: 'ch3_var_test_01',
        domain: 'bose.com',
        price: 27900,
        compare_at_price: 32900,
        max_commission_rate: 0.1,
        shipping_fee_cents: 0,
        merchant_anomaly_score: 0.02,
        stock_status: 'IN_STOCK',
      },
    ],
  };

  const card = transformToProductCard(sampleDetail as any);
  assert.ok(card.variants);
  assert.ok(card.variants.length >= 2);

  for (const variant of card.variants) {
    const valid = ProductVariantOptionSchema.safeParse(variant);
    assert.ok(valid.success, `Variant schema invalid: ${JSON.stringify(valid)}`);
    assert.ok(variant.id);
    assert.ok(variant.name);
    assert.ok(typeof variant.price_cents === 'number');
  }

  assert.equal(card.selected_variant_id, card.variants[0].id);
});
