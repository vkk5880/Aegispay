import test from 'node:test';
import assert from 'node:assert/strict';
import { createMCPServer } from './server.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

test('MCP Enforcer Server - Tool Registration & Discovery', async (t) => {
  const server = createMCPServer();
  assert.ok(server, 'createMCPServer should return an instance');

  // Verify list_tools returns all 11 registered tools
  // (5 ACP checkout tools + 6 algorithmic/custodian gate tools)
  const handlers = (server as any)._requestHandlers;
  const listToolsHandler = handlers.get(ListToolsRequestSchema.shape.method.value);
  assert.ok(listToolsHandler, 'ListTools handler should be registered');

  const listResponse = await listToolsHandler({
    method: 'tools/list',
    params: {},
  });

  assert.ok(listResponse?.tools, 'Response should contain tools array');
  const toolNames = listResponse.tools.map((t: any) => t.name);

  const expectedTools = [
    // 6 Algorithmic / Custodian Gate Tools
    'optimize_channel3_multi_merchant_basket',
    'authorize_conditional_escrow_order',
    'broadcast_synthetic_intent_voucher',
    'void_or_capture_escrow_hold',
    'submit_dispute_evidence_bundle',
    'propose_dispute_partial_settlement',
    // 5 ACP Checkout Tools
    'create_checkout_session',
    'get_checkout_session',
    'update_checkout_session',
    'complete_checkout_session',
    'cancel_checkout_session',
  ];

  for (const expected of expectedTools) {
    assert.ok(
      toolNames.includes(expected),
      `Expected tool ${expected} to be registered, but found: ${toolNames.join(', ')}`
    );
  }
  assert.strictEqual(toolNames.length, 11, 'Exactly 11 tools should be registered');
});

test('MCP Enforcer Server - Call ACP Tools Execution', async (t) => {
  const server = createMCPServer();
  const handlers = (server as any)._requestHandlers;
  const callToolHandler = handlers.get(CallToolRequestSchema.shape.method.value);
  assert.ok(callToolHandler, 'CallTool handler should be registered');

  // 1. Test create_checkout_session
  const createResult = await callToolHandler({
    method: 'tools/call',
    params: {
      name: 'create_checkout_session',
      arguments: {
        meta: { api_version: '2026-01-30', request_id: 'req_test_1' },
        payload: {
          currency: 'USD',
          items: [
            { id: 'item_1', name: 'Smart Widget', quantity: 2, unit_price_cents: 2500 },
          ],
        },
      },
    },
  });

  assert.ok(createResult?.content?.[0]?.text, 'create_checkout_session should return text content');
  const sessionData = JSON.parse(createResult.content[0].text);
  assert.ok(sessionData.id, 'Session should have an id');
  assert.strictEqual(sessionData.status, 'ready_for_payment');
  assert.strictEqual(sessionData.line_items.length, 1);
  assert.ok(sessionData.totals.find((tot: any) => tot.type === 'total').amount > 0);

  // 2. Test get_checkout_session
  const getResult = await callToolHandler({
    method: 'tools/call',
    params: {
      name: 'get_checkout_session',
      arguments: {
        meta: { api_version: '2026-01-30' },
        id: sessionData.id,
      },
    },
  });
  const getSessionData = JSON.parse(getResult.content[0].text);
  assert.strictEqual(getSessionData.id, sessionData.id);

  // 3. Test update_checkout_session
  const updateResult = await callToolHandler({
    method: 'tools/call',
    params: {
      name: 'update_checkout_session',
      arguments: {
        meta: { api_version: '2026-01-30' },
        id: sessionData.id,
        payload: { order_notes: 'Rush delivery please' },
      },
    },
  });
  const updateSessionData = JSON.parse(updateResult.content[0].text);
  assert.strictEqual(updateSessionData.id, sessionData.id);

  // 4. Test complete_checkout_session
  const completeResult = await callToolHandler({
    method: 'tools/call',
    params: {
      name: 'complete_checkout_session',
      arguments: {
        meta: { api_version: '2026-01-30' },
        id: sessionData.id,
        payload: {
          payment_method: { type: 'paypal_vault_v3' },
        },
      },
    },
  });
  const completeSessionData = JSON.parse(completeResult.content[0].text);
  assert.strictEqual(completeSessionData.status, 'completed');
  assert.ok(completeSessionData.order?.id);

  // 5. Test cancel_checkout_session
  const cancelResult = await callToolHandler({
    method: 'tools/call',
    params: {
      name: 'cancel_checkout_session',
      arguments: {
        meta: { api_version: '2026-01-30' },
        id: sessionData.id,
        payload: { reason: 'changed_mind' },
      },
    },
  });
  const cancelSessionData = JSON.parse(cancelResult.content[0].text);
  assert.strictEqual(cancelSessionData.status, 'cancelled');
});
