import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryTransport, createMcpHandler } from '@modelcontextprotocol/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMCPServer, HardenedStdioServerTransport, DEFAULT_MAX_BUFFER_SIZE } from './server.js';

test('MCP Enforcer Server v2 - In-Process Client Tool Registration & Discovery', async (t) => {
  const server = createMCPServer();
  assert.ok(server, 'createMCPServer should return an McpServer instance');

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'aegispay-test-client', version: '1.0.0' });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const listResponse = await client.listTools();
  assert.ok(listResponse?.tools, 'Response should contain tools array');
  const toolNames = listResponse.tools.map((tool) => tool.name);

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

  await client.close();
  await server.server.close();
});

test('MCP Enforcer Server v2 - ACP Checkout Tools Execution with Structured Content', async (t) => {
  const server = createMCPServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'aegispay-test-client', version: '1.0.0' });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  // 1. Test create_checkout_session
  const createResult: any = await client.callTool({
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
  });

  assert.ok(createResult?.content?.[0]?.text, 'create_checkout_session should return text content');
  const sessionData = createResult.structuredContent || JSON.parse(createResult.content[0].text);
  assert.ok(sessionData.id, 'Session should have an id');
  assert.strictEqual(sessionData.status, 'ready_for_payment');
  assert.strictEqual(sessionData.line_items.length, 1);
  assert.ok(sessionData.totals.find((tot: any) => tot.type === 'total').amount > 0);

  // 2. Test get_checkout_session
  const getResult: any = await client.callTool({
    name: 'get_checkout_session',
    arguments: {
      meta: { api_version: '2026-01-30' },
      id: sessionData.id,
    },
  });
  const getSessionData = getResult.structuredContent || JSON.parse(getResult.content[0].text);
  assert.strictEqual(getSessionData.id, sessionData.id);

  // 3. Test update_checkout_session
  const updateResult: any = await client.callTool({
    name: 'update_checkout_session',
    arguments: {
      meta: { api_version: '2026-01-30' },
      id: sessionData.id,
      payload: { order_notes: 'Rush delivery please' },
    },
  });
  const updateSessionData = updateResult.structuredContent || JSON.parse(updateResult.content[0].text);
  assert.strictEqual(updateSessionData.id, sessionData.id);

  // 4. Test complete_checkout_session
  const completeResult: any = await client.callTool({
    name: 'complete_checkout_session',
    arguments: {
      meta: { api_version: '2026-01-30' },
      id: sessionData.id,
      payload: {
        payment_method: { type: 'paypal_vault_v3' },
      },
    },
  });
  const completeSessionData = completeResult.structuredContent || JSON.parse(completeResult.content[0].text);
  assert.strictEqual(completeSessionData.status, 'completed');
  assert.ok(completeSessionData.order?.id);

  // 5. Test cancel_checkout_session
  const cancelResult: any = await client.callTool({
    name: 'cancel_checkout_session',
    arguments: {
      meta: { api_version: '2026-01-30' },
      id: sessionData.id,
      payload: { reason: 'changed_mind' },
    },
  });
  const cancelSessionData = cancelResult.structuredContent || JSON.parse(cancelResult.content[0].text);
  assert.strictEqual(cancelSessionData.status, 'cancelled');

  await client.close();
  await server.server.close();
});

test('MCP Enforcer Server v2 - Custodian Gate Tools Execution', async (t) => {
  const server = createMCPServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'aegispay-test-client', version: '1.0.0' });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  // 1. optimize_channel3_multi_merchant_basket
  const optResult: any = await client.callTool({
    name: 'optimize_channel3_multi_merchant_basket',
    arguments: {
      allowance_voucher_id: 'vch_test_123',
      search_query: 'running shoes',
      items: [
        { product_id: 'prod_1', merchant_domain: 'store1.com', price_cents: 4000, quantity: 1 },
        { product_id: 'prod_2', merchant_domain: 'store2.com', price_cents: 6000, quantity: 1 },
      ],
    },
  });
  const optData = optResult.structuredContent || JSON.parse(optResult.content[0].text);
  assert.strictEqual(optData.basket_total_cents, 10000);
  assert.strictEqual(optData.assignments.length, 2);

  // 2. broadcast_synthetic_intent_voucher
  const broadcastResult: any = await client.callTool({
    name: 'broadcast_synthetic_intent_voucher',
    arguments: {
      mandate_id: 'mandate_synth_1',
      channel3_product_id: 'prod_camera_99',
      merchant_domain: 'electronics.com',
      retail_offer_cents: 50000,
      buyer_bid_cents: 45000,
    },
  });
  const broadcastData = broadcastResult.structuredContent || JSON.parse(broadcastResult.content[0].text);
  assert.ok(broadcastData.voucher_id.startsWith('syn_'));
  assert.strictEqual(broadcastData.status, 'BROADCASTED');

  // 3. void_or_capture_escrow_hold
  const captureResult: any = await client.callTool({
    name: 'void_or_capture_escrow_hold',
    arguments: {
      authorization_id: 'auth_paypal_hold_77',
      action: 'CAPTURE',
      amount_cents: 4500,
    },
  });
  const captureData = captureResult.structuredContent || JSON.parse(captureResult.content[0].text);
  assert.strictEqual(captureData.status, 'CAPTURED');

  // 4. submit_dispute_evidence_bundle
  const evidenceResult: any = await client.callTool({
    name: 'submit_dispute_evidence_bundle',
    arguments: {
      paypal_dispute_id: 'PP-D-12345',
      carrier_tracking_number: '1Z9999999999999999',
      policy_proof_text: 'Buyer verified non-delivery confirmation',
      vision_defect_mask: [0, 0, 100, 100],
    },
  });
  const evidenceData = evidenceResult.structuredContent || JSON.parse(evidenceResult.content[0].text);
  assert.strictEqual(evidenceData.status, 'SUBMITTED');

  // 5. propose_dispute_partial_settlement
  const settlementResult: any = await client.callTool({
    name: 'propose_dispute_partial_settlement',
    arguments: {
      paypal_dispute_id: 'PP-D-12345',
      compromise_amount_cents: 2500,
    },
  });
  const settlementData = settlementResult.structuredContent || JSON.parse(settlementResult.content[0].text);
  assert.strictEqual(settlementData.status, 'PROPOSED');

  // 6. authorize_conditional_escrow_order under $500 threshold
  const escrowResult: any = await client.callTool({
    name: 'authorize_conditional_escrow_order',
    arguments: {
      mandate_id: 'mandate_small_1',
      merchant_domain: 'store.com',
      requested_cents: 3000,
      category_id: 'electronics',
      items: [
        { product_id: 'prod_usb_cable', price_cents: 3000, quantity: 1 },
      ],
    },
  });
  const escrowData = escrowResult.structuredContent || JSON.parse(escrowResult.content[0].text);
  assert.strictEqual(escrowData.status, 'AUTHORIZED');
  assert.ok(escrowData.paypal_order_id);

  await client.close();
  await server.server.close();
});

test('MCP Enforcer Server v2 - Human-in-the-Loop input_required Elicitation for >$500 Escrow', async (t) => {
  const server = createMCPServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'aegispay-test-client', version: '1.0.0' });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  // Request $750 (75,000 cents) without prior approval -> triggers input_required
  const promptResult: any = await client.callTool({
    name: 'authorize_conditional_escrow_order',
    arguments: {
      mandate_id: 'mandate_large_1',
      merchant_domain: 'store.com',
      requested_cents: 75000,
      category_id: 'electronics',
      items: [
        { product_id: 'prod_laptop', price_cents: 75000, quantity: 1 },
      ],
    },
  });

  // Protocol revision 2026-07-28 input_required response / elicitation requirement check
  assert.ok(
    promptResult.resultType === 'input_required' ||
      (promptResult.isError && (promptResult.content?.[0] as any)?.text?.includes('approval')),
    'High value escrow must require approval elicitation or input_required'
  );

  // When confirmed: true is provided (e.g. buyer operator approved), authorization completes
  const approvedResult: any = await client.callTool({
    name: 'authorize_conditional_escrow_order',
    arguments: {
      mandate_id: 'mandate_large_1',
      merchant_domain: 'store.com',
      requested_cents: 75000,
      category_id: 'electronics',
      confirmed: true,
      items: [
        { product_id: 'prod_laptop', price_cents: 75000, quantity: 1 },
      ],
    },
  });

  const approvedData = approvedResult.structuredContent || JSON.parse(approvedResult.content[0].text);
  assert.strictEqual(approvedData.status, 'AUTHORIZED');
  assert.ok(approvedData.paypal_order_id);

  await client.close();
  await server.server.close();
});

test('MCP Enforcer Server v2 - Validation Errors and Unknown Tool Handling', async (t) => {
  const server = createMCPServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'aegispay-test-client', version: '1.0.0' });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  // 1. Tool not found
  await assert.rejects(
    async () => {
      await client.callTool({
        name: 'non_existent_tool',
        arguments: {},
      });
    },
    (err: any) => {
      return err.message.includes('not found') || err.code === -32601;
    }
  );

  // 2. Missing required parameter in optimize_channel3_multi_merchant_basket
  const invalidBasketRes = await client.callTool({
    name: 'optimize_channel3_multi_merchant_basket',
    arguments: {
      // missing required allowance_voucher_id
      search_query: 'shoes',
    },
  });
  assert.strictEqual(invalidBasketRes.isError, true);
  assert.ok((invalidBasketRes.content[0] as any).text.includes('allowance_voucher_id'));

  // 3. Invalid items in create_checkout_session
  const invalidSessionRes = await client.callTool({
    name: 'create_checkout_session',
    arguments: {
      meta: { api_version: '2026-01-30' },
      payload: {
        currency: 'usd',
        items: [], // violates min(1) constraint
      },
    },
  });
  assert.strictEqual(invalidSessionRes.isError, true);
  assert.ok((invalidSessionRes.content[0] as any).text.includes('items'));

  await client.close();
  await server.server.close();
});

test('MCP Enforcer Server v2 - Streamable HTTP Handler Fetch Face', async (t) => {
  const handler = createMcpHandler(() => createMCPServer());

  // Wrap fetch for web Request compatibility
  const customFetch = (input: any, init?: any) => {
    const req = input instanceof Request ? input : new Request(input, init);
    return handler.fetch(req);
  };

  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    fetch: customFetch,
  });
  const client = new Client({ name: 'streamable-test-client', version: '1.0.0' });
  await client.connect(transport);

  const list = await client.listTools();
  assert.strictEqual(list.tools.length, 11);

  const pingResult: any = await client.callTool({
    name: 'broadcast_synthetic_intent_voucher',
    arguments: {
      mandate_id: 'mandate_streamable_1',
      channel3_product_id: 'prod_streamable_99',
      merchant_domain: 'example.com',
      retail_offer_cents: 20000,
      buyer_bid_cents: 18000,
    },
  });

  assert.ok(pingResult.content[0].text);
  assert.strictEqual(pingResult.isError, undefined);

  await client.close();
});

test('HardenedStdioServerTransport - Parse Error (-32700), Invalid Request (-32600), and Buffer Overflow', async (t) => {
  const { Readable, Writable } = await import('node:stream');

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
