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

test('MCP Enforcer Server - Protocol Error Codes & Invalid Requests', async (t) => {
  const server = createMCPServer();
  const sentMessages: any[] = [];
  const mockTransport: any = {
    start: async () => {},
    send: async (msg: any) => {
      sentMessages.push(msg);
    },
    close: async () => {},
  };
  await server.connect(mockTransport);

  const flushTicks = async () => new Promise((resolve) => setTimeout(resolve, 20));

  // 1. Method Not Found (-32601) - Unknown JSON-RPC method
  sentMessages.length = 0;
  await mockTransport.onmessage({
    jsonrpc: '2.0',
    method: 'unknown/method_xyz',
    params: {},
    id: 101,
  });
  await flushTicks();
  assert.strictEqual(sentMessages.length, 1);
  assert.strictEqual(sentMessages[0].id, 101);
  assert.strictEqual(sentMessages[0].error.code, -32601);
  assert.ok(sentMessages[0].error.message.includes('Method not found'));

  // 2. Tool Not Found (-32601) - tools/call with unknown tool name
  sentMessages.length = 0;
  await mockTransport.onmessage({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'non_existent_tool',
      arguments: {},
    },
    id: 102,
  });
  await flushTicks();
  assert.strictEqual(sentMessages.length, 1);
  assert.strictEqual(sentMessages[0].id, 102);
  assert.strictEqual(sentMessages[0].error.code, -32601);
  assert.ok(sentMessages[0].error.message.includes('Tool not found'));

  // 3. Invalid Params (-32602) - Built-in custodian tool missing required fields
  sentMessages.length = 0;
  await mockTransport.onmessage({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'optimize_channel3_multi_merchant_basket',
      arguments: {
        // Missing required 'allowance_voucher_id'
        search_query: 'shoes',
      },
    },
    id: 103,
  });
  await flushTicks();
  assert.strictEqual(sentMessages.length, 1);
  assert.strictEqual(sentMessages[0].id, 103);
  assert.strictEqual(sentMessages[0].error.code, -32602);
  assert.ok(sentMessages[0].error.message.includes('Invalid arguments'));

  // 4. Invalid Params (-32602) - ACP tool missing required properties
  sentMessages.length = 0;
  await mockTransport.onmessage({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'create_checkout_session',
      arguments: {
        meta: {
          // Missing api_version
        },
        payload: {
          currency: 'USD',
          items: [], // violates min(1) items constraint
        },
      },
    },
    id: 104,
  });
  await flushTicks();
  assert.strictEqual(sentMessages.length, 1);
  assert.strictEqual(sentMessages[0].id, 104);
  assert.strictEqual(sentMessages[0].error.code, -32602);
  assert.ok(sentMessages[0].error.message.includes('Invalid params'));
});

test('HardenedStdioServerTransport - Parse Error (-32700), Invalid Request (-32600), and Buffer Overflow', async (t) => {
  const { Readable, Writable } = await import('node:stream');
  const { HardenedStdioServerTransport } = await import('./server.js');

  const stdin = new Readable({ read() {} });
  let stdoutOutput = '';
  const stdout = new Writable({
    write(chunk, enc, cb) {
      stdoutOutput += chunk.toString();
      cb();
    },
  });

  const transport = new HardenedStdioServerTransport(stdin, stdout, {
    maxBufferSize: 256, // small limit to test buffer overflow
  });

  let errorCaught: any = null;
  transport.onerror = (err) => {
    errorCaught = err;
  };

  await transport.start();
  const flushTicks = async () => new Promise((resolve) => setTimeout(resolve, 20));

  // 1. Test Parse Error (-32700): Malformed JSON
  stdoutOutput = '';
  stdin.push('{"jsonrpc": "2.0", unclosed_json\n');
  await flushTicks();
  assert.ok(stdoutOutput.includes('"code":-32700'));
  assert.ok(stdoutOutput.includes('Parse error'));

  // 2. Test Invalid Request (-32600): JSON is valid syntax, but not a valid JSON-RPC 2.0 message
  stdoutOutput = '';
  stdin.push('{"jsonrpc": "1.0", "method": "test"}\n');
  await flushTicks();
  assert.ok(stdoutOutput.includes('"code":-32600'));
  assert.ok(stdoutOutput.includes('Invalid Request'));

  // Another Invalid Request variant (missing jsonrpc and method/id/result)
  stdoutOutput = '';
  stdin.push('{"foo": "bar"}\n');
  await flushTicks();
  assert.ok(stdoutOutput.includes('"code":-32600'));

  // 3. Test Buffer Overflow: Chunk larger than maxBufferSize
  stdoutOutput = '';
  stdin.push('X'.repeat(300));
  await flushTicks();
  assert.ok(stdoutOutput.includes('"code":-32700'));
  assert.ok(stdoutOutput.includes('exceeded maximum size'));

  await transport.close();
});

test('ACP Manifest Audit - Strict Schema Completeness against Shared Types', async (t) => {
  const { generateACPManifest } = await import('./acp-manifest.js');
  const manifest = generateACPManifest();

  assert.strictEqual(manifest.protocol, 'OPENAI_ACP_v1');
  assert.ok(manifest.actions.length >= 7, 'Manifest must declare core commerce actions');

  const actionNames = manifest.actions.map((a) => a.name);
  assert.ok(actionNames.includes('create_checkout_session'));
  assert.ok(actionNames.includes('get_checkout_session'));
  assert.ok(actionNames.includes('update_checkout_session'));
  assert.ok(actionNames.includes('complete_checkout_session'));
  assert.ok(actionNames.includes('cancel_checkout_session'));

  // Check create_checkout_session parameter declarations
  const createAction = manifest.actions.find((a) => a.name === 'create_checkout_session');
  assert.ok(createAction?.parameters?.properties?.meta);
  assert.ok(createAction?.parameters?.properties?.payload);
  const payloadProps = createAction?.parameters?.properties?.payload?.properties;
  assert.ok(payloadProps?.currency);
  assert.ok(payloadProps?.items);
  assert.ok(payloadProps?.buyer);
  assert.ok(payloadProps?.fulfillment_details);
  assert.ok(payloadProps?.affiliate_attribution);

  // Check complete_checkout_session payment_method declaration
  const completeAction = manifest.actions.find((a) => a.name === 'complete_checkout_session');
  assert.ok(completeAction?.parameters?.properties?.payload?.properties?.payment_method);
  const paymentMethodProps = completeAction.parameters.properties.payload.properties.payment_method.properties;
  assert.ok(paymentMethodProps?.type);
  assert.ok(paymentMethodProps?.token);
  assert.ok(paymentMethodProps?.mandate_signature);
});
