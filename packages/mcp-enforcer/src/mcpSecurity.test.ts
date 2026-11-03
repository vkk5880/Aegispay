import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePublicImageUrl, toolHandlers, OptimizeBasketSchema } from './custom-tools.js';
import { AtomicSpendEnforcer } from './redis-lua-enforcer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('SSRF Defense: validatePublicImageUrl strictly rejects internal, private, metadata and non-http URLs', () => {
  // Loopback variants
  assert.equal(validatePublicImageUrl('http://127.0.0.1/test.png'), false);
  assert.equal(validatePublicImageUrl('http://127.0.0.2:8080/avatar.jpg'), false);
  assert.equal(validatePublicImageUrl('http://localhost/image.png'), false);
  assert.equal(validatePublicImageUrl('http://app.localhost/image.png'), false);
  assert.equal(validatePublicImageUrl('http://[::1]/secret.png'), false);

  // Link-local cloud metadata (AWS, GCP, Azure, DigitalOcean)
  assert.equal(validatePublicImageUrl('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(validatePublicImageUrl('http://169.254.1.1/test.png'), false);

  // RFC 1918 Private Subnets
  // 10.0.0.0/8
  assert.equal(validatePublicImageUrl('http://10.0.0.1/image.png'), false);
  assert.equal(validatePublicImageUrl('http://10.255.255.254/image.png'), false);
  // 172.16.0.0/12 (172.16.0.0 to 172.31.255.255)
  assert.equal(validatePublicImageUrl('http://172.16.0.1/image.png'), false);
  assert.equal(validatePublicImageUrl('http://172.25.10.20/image.png'), false);
  assert.equal(validatePublicImageUrl('http://172.31.255.255/image.png'), false);
  // 172.32.0.1 is public
  assert.equal(validatePublicImageUrl('http://172.32.0.1/image.png'), true);
  // 192.168.0.0/16
  assert.equal(validatePublicImageUrl('http://192.168.1.1/internal.jpg'), false);
  assert.equal(validatePublicImageUrl('http://192.168.100.50/photo.png'), false);
  // 0.0.0.0/8
  assert.equal(validatePublicImageUrl('http://0.0.0.0/image.png'), false);

  // Non-HTTP/HTTPS protocols
  assert.equal(validatePublicImageUrl('file:///etc/passwd'), false);
  assert.equal(validatePublicImageUrl('ftp://10.0.0.1/resource.png'), false);
  assert.equal(validatePublicImageUrl('gopher://127.0.0.1/'), false);
  assert.equal(validatePublicImageUrl('javascript:alert(1)'), false);

  // Valid public URLs should pass
  assert.equal(validatePublicImageUrl('https://images.channel3.ai/products/clean-123.jpg'), true);
  assert.equal(validatePublicImageUrl('https://cdn.paypal.com/assets/logo.png'), true);
  assert.equal(validatePublicImageUrl('http://example.com/item.png'), true);

  // Integrated Zod schema validation
  const validBasket = OptimizeBasketSchema.safeParse({
    allowance_voucher_id: 'voucher_1',
    image_url: 'https://images.channel3.ai/item.jpg',
  });
  assert.equal(validBasket.success, true);

  const ssrfBasket = OptimizeBasketSchema.safeParse({
    allowance_voucher_id: 'voucher_1',
    image_url: 'http://169.254.169.254/metadata',
  });
  assert.equal(ssrfBasket.success, false);
});

test('MCP Stdio Cleanliness: Tool handlers never write to stdout (console.log absent in custom-tools.ts)', async () => {
  // 1. Static check: custom-tools.ts must have zero console.log calls
  const sourcePath = path.resolve(__dirname, 'custom-tools.ts');
  const distPath = path.resolve(__dirname, '../src/custom-tools.ts');
  const targetPath = fs.existsSync(sourcePath) ? sourcePath : distPath;
  const sourceContent = fs.readFileSync(targetPath, 'utf8');

  // Must not have console.log
  const hasConsoleLog = /\bconsole\.log\s*\(/.test(sourceContent);
  assert.equal(hasConsoleLog, false, 'custom-tools.ts must not contain any console.log calls');

  // Must contain console.error
  assert.ok(sourceContent.includes('console.error'), 'Tool handlers must log to stderr using console.error');

  // 2. Runtime check: intercept process.stdout.write and execute all tool handlers
  let stdoutCaptured = '';
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = (chunk: any) => {
    stdoutCaptured += chunk.toString();
    return true;
  };

  try {
    await toolHandlers.handleOptimizeBasket({ allowance_voucher_id: 'test_v' });
    await toolHandlers.handleBroadcastIntent({
      mandate_id: 'vch_test',
      channel3_product_id: 'prod_1',
      merchant_domain: 'example.com',
      retail_offer_cents: 1000,
      buyer_bid_cents: 900,
    });
    await toolHandlers.handleVoidOrCapture({
      authorization_id: 'auth_1',
      action: 'VOID',
    });
    await toolHandlers.handleSubmitEvidence({
      paypal_dispute_id: 'PP-D-123',
    });
    await toolHandlers.handleProposeSettlement({
      paypal_dispute_id: 'PP-D-123',
      compromise_amount_cents: 500,
    });

    assert.equal(stdoutCaptured, '', 'stdout must remain 100% clean during all tool handler invocations to protect JSON-RPC stdio transport');
  } finally {
    process.stdout.write = originalStdoutWrite;
  }
});

test('Wire Real Enforcer: handleAuthorizeEscrow validates Ed25519 signature and invokes AtomicSpendEnforcer.reserveBudget', async () => {
  // Generate a valid Ed25519 keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubDer = publicKey.export({ format: 'der', type: 'spki' });
  const rawPubHex = pubDer.subarray(12).toString('hex'); // 32 bytes

  const mandateBase = {
    mandate_id: 'vch_sec_test',
    buyer_id: 'buyer_sec',
    max_total_spend_cents: 50000,
    max_single_merchant_cents: 20000,
    cumulative_spent_cents: 0,
    currency_code: 'USD',
    allowed_category_ids: ['electronics'],
    public_key_hex: rawPubHex,
    expires_at: new Date(Date.now() + 3600 * 1000),
    status: 'ACTIVE' as const,
  };

  const messageObj = {
    mandate_id: mandateBase.mandate_id,
    buyer_id: mandateBase.buyer_id,
    max_total_spend_cents: mandateBase.max_total_spend_cents,
    max_single_merchant_cents: mandateBase.max_single_merchant_cents,
    currency_code: mandateBase.currency_code,
    allowed_category_ids: mandateBase.allowed_category_ids,
    expires_at: mandateBase.expires_at.toISOString(),
    status: mandateBase.status,
    public_key_hex: mandateBase.public_key_hex,
  };

  const sigBuffer = crypto.sign(null, Buffer.from(JSON.stringify(messageObj), 'utf8'), privateKey);
  const validSigHex = sigBuffer.toString('hex');

  const validMandate = {
    ...mandateBase,
    ed25519_signature_hex: validSigHex,
    created_at: new Date(),
  };

  // Mock spend enforcer
  let reserveCalled = false;
  let reservedAmount = 0;
  const mockEnforcer: any = {
    reserveBudget: async (_redis: any, params: any) => {
      reserveCalled = true;
      reservedAmount = params.requested_cents;
      return { success: true, new_spent: params.requested_cents };
    },
  };

  // 1. Success case: valid signature and successful reservation
  const result = await toolHandlers.handleAuthorizeEscrow({
    mandate_id: 'vch_sec_test',
    merchant_domain: 'clean-merchant.com',
    requested_cents: 5000,
    category_id: 'electronics',
    items: [{ product_id: 'p1', price_cents: 5000, quantity: 1 }],
    mandate: validMandate,
    redis_client: {} as any,
    spend_enforcer: mockEnforcer,
  });

  assert.equal(result.status, 'AUTHORIZED');
  assert.equal(reserveCalled, true);
  assert.equal(reservedAmount, 5000);
  assert.ok(result.paypal_order_id.startsWith('ord_vch_sec_test'));

  // 2. Failure case: invalid Ed25519 signature rejects execution
  const tamperedMandate = {
    ...validMandate,
    ed25519_signature_hex: '00'.repeat(64),
  };

  await assert.rejects(
    async () => {
      await toolHandlers.handleAuthorizeEscrow({
        mandate_id: 'vch_sec_test',
        merchant_domain: 'clean-merchant.com',
        requested_cents: 5000,
        category_id: 'electronics',
        items: [{ product_id: 'p1', price_cents: 5000, quantity: 1 }],
        mandate: tamperedMandate,
        redis_client: {} as any,
        spend_enforcer: mockEnforcer,
      });
    },
    { message: 'ED25519_SIGNATURE_VERIFICATION_FAILED' }
  );

  // 3. Failure case: budget reservation error from AtomicSpendEnforcer rejects execution
  const failingEnforcer: any = {
    reserveBudget: async () => ({
      success: false,
      error_code: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET',
    }),
  };

  await assert.rejects(
    async () => {
      await toolHandlers.handleAuthorizeEscrow({
        mandate_id: 'vch_sec_test',
        merchant_domain: 'clean-merchant.com',
        requested_cents: 5000,
        category_id: 'electronics',
        items: [{ product_id: 'p1', price_cents: 5000, quantity: 1 }],
        mandate: validMandate,
        redis_client: {} as any,
        spend_enforcer: failingEnforcer,
      });
    },
    { message: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET' }
  );
});
