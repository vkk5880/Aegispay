import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import {
  PayPalToolkitBridge,
  registerPayPalToolkitBridgeTools,
} from './paypal-toolkit-bridge.js';
import { createMCPServer } from './server.js';
import type { SpendMandate } from '@aegispay/shared-types';

test('PayPalToolkitBridge - Tool discovery and initialization', async () => {
  const bridge = new PayPalToolkitBridge({ sandbox: true });
  const tools = bridge.getAvailableTools();

  assert.ok(Array.isArray(tools), 'getAvailableTools should return an array');
  assert.ok(tools.length > 0, 'Should discover official PayPal tools');

  const methods = tools.map((t) => t.method);
  assert.ok(methods.includes('create_order'), 'Should include create_order');
  assert.ok(methods.includes('create_invoice'), 'Should include create_invoice');
  assert.ok(methods.includes('get_dispute'), 'Should include get_dispute');
});

test('PayPalToolkitBridge - Spend-mutating action blocks without SessionMandate', async () => {
  const bridge = new PayPalToolkitBridge({ sandbox: true });

  const result = await bridge.executeInterceptedTool('create_order', {
    intent: 'AUTHORIZE',
    purchase_units: [{ amount: { currency_code: 'USD', value: '150.00' } }],
  });

  assert.strictEqual(result.isError, true, 'Mutating action without mandate must fail');
  assert.ok(
    result.content[0].text.includes('BLOCKED_BY_ZERO_TRUST_GATE'),
    'Should block with BLOCKED_BY_ZERO_TRUST_GATE'
  );
  assert.strictEqual(result.structuredContent?.error, 'ERR_MANDATE_REQUIRED');
});

test('PayPalToolkitBridge - Spend-mutating action fails on invalid Ed25519 signature', async () => {
  const bridge = new PayPalToolkitBridge({ sandbox: true });

  const invalidMandate: SpendMandate = {
    mandate_id: 'vch_test_invalid_sig',
    buyer_id: 'usr_buyer_123',
    public_key_hex: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    max_total_spend_cents: 50000,
    max_single_merchant_cents: 50000,
    cumulative_spent_cents: 0,
    currency_code: 'USD',
    allowed_category_ids: ['PHYSICAL_GOODS'],
    ed25519_signature_hex: '00'.repeat(64),
    status: 'ACTIVE',
    expires_at: new Date(Date.now() + 3600000),
    created_at: new Date(),
  };

  const result = await bridge.executeInterceptedTool(
    'create_order',
    {
      intent: 'AUTHORIZE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '150.00' } }],
    },
    {
      mandate: invalidMandate,
      requested_cents: 15000,
    }
  );

  assert.strictEqual(result.isError, true, 'Invalid signature mandate must fail');
  assert.ok(
    result.content[0].text.includes('signature verification failed'),
    'Should indicate signature verification failed'
  );
  assert.strictEqual(result.structuredContent?.error, 'ERR_INVALID_MANDATE_SIGNATURE');
});

test('PayPalToolkitBridge - Read-only action succeeds and returns HATEOAS links', async () => {
  const bridge = new PayPalToolkitBridge({ sandbox: true });

  const result = await bridge.executeInterceptedTool('get_dispute', {
    dispute_id: 'PP-D-8823901',
  });

  assert.strictEqual(result.isError, undefined, 'Read-only action should succeed');
  assert.ok(result.structuredContent, 'Should have structuredContent');
  assert.strictEqual(result.structuredContent.dispute_id, 'PP-D-8823901');
  assert.ok(
    Array.isArray(result.structuredContent.links),
    'Should return HATEOAS links array'
  );
});

test('PayPalToolkitBridge - MCP Server registration with enableToolkitBridge', async () => {
  const server = createMCPServer({ enableToolkitBridge: true });
  assert.ok(server, 'Server should be created');

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-bridge-client', version: '1.0.0' });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const listResponse = await client.listTools();
  assert.ok(listResponse?.tools, 'Response should contain tools array');
  const toolNames = listResponse.tools.map((t) => t.name);

  // 11 Core Tools + 4 Wrapped Bridge Tools = 15 Tools
  assert.strictEqual(toolNames.length, 15, 'Should have 15 registered tools');
  assert.ok(toolNames.includes('paypal_create_order'), 'Includes paypal_create_order');
  assert.ok(toolNames.includes('paypal_create_invoice'), 'Includes paypal_create_invoice');
  assert.ok(toolNames.includes('paypal_get_dispute'), 'Includes paypal_get_dispute');
  assert.ok(toolNames.includes('paypal_create_shipment_tracking'), 'Includes paypal_create_shipment_tracking');

  // Verify calling a bridge tool via MCP Client: paypal_get_dispute
  const callResult = await client.callTool({
    name: 'paypal_get_dispute',
    arguments: { dispute_id: 'PP-D-998877' },
  });

  assert.ok(callResult.content, 'Call result should have content');
  const parsed = JSON.parse((callResult.content[0] as any).text);
  assert.strictEqual(parsed.dispute_id, 'PP-D-998877');

  await client.close();
  await server.server.close();
});
