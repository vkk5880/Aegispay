import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  toolHandlers,
  AuthorizeEscrowOrderSchema,
} from './custom-tools.js';
import { AtomicSpendEnforcer, LUA_SCRIPT } from './redis-lua-enforcer.js';
import { calculateMerchantAnomalyScore, isMerchantAllowed } from './merchant-anomaly-gate.js';
import { verifySessionMandateSignature } from './ed25519-verifier.js';
import type { SpendMandate } from '@aegispay/shared-types';

function createValidMandateAndKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubDer = publicKey.export({ format: 'der', type: 'spki' });
  const rawPubHex = pubDer.subarray(12).toString('hex'); // 32 bytes = 64 hex chars

  const mandateBase = {
    mandate_id: `vch_${crypto.randomUUID().slice(0, 8)}`,
    buyer_id: `buyer_${crypto.randomUUID().slice(0, 8)}`,
    max_total_spend_cents: 50000,
    max_single_merchant_cents: 20000,
    cumulative_spent_cents: 0,
    currency_code: 'USD',
    allowed_category_ids: ['electronics', 'apparel'],
    public_key_hex: rawPubHex,
    expires_at: new Date(Date.now() + 3600 * 1000), // 1 hour in the future
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

  const validMandate: SpendMandate = {
    ...mandateBase,
    ed25519_signature_hex: validSigHex,
    created_at: new Date(),
  };

  return { validMandate, privateKey, rawPubHex };
}

test('Custodian Gate - Stage 1: Strict Zod Schema & Arithmetic Refinement', async () => {
  // 1. Line-item sum mismatch strictly rejected
  const mismatchPayload = {
    mandate_id: 'vch_custodian_1',
    merchant_domain: 'bestbuy.com',
    requested_cents: 10000, // $100.00
    category_id: 'electronics',
    items: [
      { product_id: 'p1', price_cents: 4000, quantity: 2 }, // 8000 != 10000
    ],
  };

  const parsedMismatch = AuthorizeEscrowOrderSchema.safeParse(mismatchPayload);
  assert.equal(parsedMismatch.success, false);
  if (!parsedMismatch.success) {
    assert.ok(
      parsedMismatch.error.issues.some((i) =>
        i.message.includes('requested_cents must strictly equal the sum of (price_cents * quantity) across all items')
      )
    );
  }

  // 2. Negative spend strictly rejected by schema
  const negativePayload = {
    mandate_id: 'vch_custodian_1',
    merchant_domain: 'bestbuy.com',
    requested_cents: -500,
    category_id: 'electronics',
    items: [{ product_id: 'p1', price_cents: -500, quantity: 1 }],
  };
  const parsedNegative = AuthorizeEscrowOrderSchema.safeParse(negativePayload);
  assert.equal(parsedNegative.success, false);

  // 3. Zero spend strictly rejected
  const zeroPayload = {
    mandate_id: 'vch_custodian_1',
    merchant_domain: 'bestbuy.com',
    requested_cents: 0,
    category_id: 'electronics',
    items: [{ product_id: 'p1', price_cents: 0, quantity: 1 }],
  };
  const parsedZero = AuthorizeEscrowOrderSchema.safeParse(zeroPayload);
  assert.equal(parsedZero.success, false);

  // 4. Empty items array strictly rejected
  const emptyItemsPayload = {
    mandate_id: 'vch_custodian_1',
    merchant_domain: 'bestbuy.com',
    requested_cents: 100,
    category_id: 'electronics',
    items: [],
  };
  const parsedEmpty = AuthorizeEscrowOrderSchema.safeParse(emptyItemsPayload);
  assert.equal(parsedEmpty.success, false);

  // 5. Valid arithmetic matches exactly
  const validPayload = {
    mandate_id: 'vch_custodian_1',
    merchant_domain: 'bestbuy.com',
    requested_cents: 9500,
    category_id: 'electronics',
    items: [
      { product_id: 'p1', price_cents: 3000, quantity: 2 }, // 6000
      { product_id: 'p2', price_cents: 3500, quantity: 1 }, // 3500 => sum 9500
    ],
  };
  const parsedValid = AuthorizeEscrowOrderSchema.safeParse(validPayload);
  assert.equal(parsedValid.success, true);
});

test('Custodian Gate - Stage 2: Ed25519 Cryptographic Signature Verification', async () => {
  const { validMandate } = createValidMandateAndKeypair();

  // 1. Valid mandate verifies cleanly
  const verified = await verifySessionMandateSignature(validMandate);
  assert.equal(verified, true);

  // 2. Unsigned/tampered signature rejected
  const tamperedSigMandate: SpendMandate = {
    ...validMandate,
    ed25519_signature_hex: '00'.repeat(64),
  };
  const tamperedVerified = await verifySessionMandateSignature(tamperedSigMandate);
  assert.equal(tamperedVerified, false);

  await assert.rejects(
    async () => {
      await toolHandlers.handleAuthorizeEscrow({
        mandate_id: validMandate.mandate_id,
        merchant_domain: 'store.com',
        requested_cents: 3000,
        category_id: 'electronics',
        items: [{ product_id: 'p1', price_cents: 3000, quantity: 1 }],
        mandate: tamperedSigMandate,
      });
    },
    { message: 'ED25519_SIGNATURE_VERIFICATION_FAILED' }
  );

  // 3. Expired mandate rejected
  const expiredMandate: SpendMandate = {
    ...validMandate,
    expires_at: new Date(Date.now() - 5000), // past
  };
  const expiredVerified = await verifySessionMandateSignature(expiredMandate);
  assert.equal(expiredVerified, false);

  // 4. Revoked mandate rejected
  const revokedMandate: SpendMandate = {
    ...validMandate,
    status: 'REVOKED',
  };
  const revokedVerified = await verifySessionMandateSignature(revokedMandate);
  assert.equal(revokedVerified, false);

  // 5. Tampered payload (e.g. higher max_total_spend_cents than signed) rejected
  const alteredSpendMandate: SpendMandate = {
    ...validMandate,
    max_total_spend_cents: 999999, // tampered amount
  };
  const alteredVerified = await verifySessionMandateSignature(alteredSpendMandate);
  assert.equal(alteredVerified, false);
});

test('Custodian Gate - Stage 3: Merchant Anomaly Gate (reject score > 300 / 1000)', async () => {
  const { validMandate } = createValidMandateAndKeypair();

  // 1. High-anomaly merchant domain (>= 5 consecutive digits => +150 score)
  const suspiciousDomain = 'checkout-12345.com';
  const anomalyScoreDigits = calculateMerchantAnomalyScore({
    domain: suspiciousDomain,
    disputeRate: 0,
    averageDiscountVariance: 0,
  });
  assert.equal(anomalyScoreDigits, 150);
  assert.equal(isMerchantAllowed(anomalyScoreDigits), true); // 150 <= 300 allowed

  // 2. High dispute rate (> 10% dispute rate triggers disputeRate * 5000, e.g. 0.15 * 5000 = 750)
  const highDisputeScore = calculateMerchantAnomalyScore({
    domain: 'clean-store.com',
    disputeRate: 0.15, // > 0.10 -> 0.15 * 5000 = 750
    averageDiscountVariance: 0,
  });
  assert.equal(highDisputeScore, 750);
  assert.equal(isMerchantAllowed(highDisputeScore), false);

  // Verify handleAuthorizeEscrow strictly rejects high-anomaly merchant
  await assert.rejects(
    async () => {
      await toolHandlers.handleAuthorizeEscrow({
        mandate_id: validMandate.mandate_id,
        merchant_domain: 'clean-store.com',
        merchant_dispute_rate: 0.15, // triggers high dispute penalty
        requested_cents: 2000,
        category_id: 'electronics',
        items: [{ product_id: 'p1', price_cents: 2000, quantity: 1 }],
        mandate: validMandate,
      });
    },
    /ERR_MERCHANT_ANOMALY_THRESHOLD_EXCEEDED/
  );

  // 3. Cumulative penalty (digits + discount variance + dispute rate) exceeding 300
  const combinedScore = calculateMerchantAnomalyScore({
    domain: 'fraud-88888.com', // 150
    disputeRate: 0.08,         // 0.08 * 1000 = 80
    averageDiscountVariance: 0.95, // (0.95 - 0.85) * 2000 = 200 (floating point floor => 429 or 430)
  });
  assert.ok(combinedScore > 300);
  assert.equal(isMerchantAllowed(combinedScore), false);
});

test('Custodian Gate - Stage 4: Single-Threaded Redis Lua reserveBudget() Pre-Reservation', async () => {
  const { validMandate } = createValidMandateAndKeypair();
  const enforcer = new AtomicSpendEnforcer();

  // 1. Budget Overage simulation in Redis Lua
  const mockRedisBudgetOverage: any = {
    script: async () => 'mock_sha',
    evalsha: async () => [0, 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET'],
  };

  await assert.rejects(
    async () => {
      await toolHandlers.handleAuthorizeEscrow({
        mandate_id: validMandate.mandate_id,
        merchant_domain: 'legit-store.com',
        requested_cents: 4500,
        category_id: 'electronics',
        items: [{ product_id: 'p1', price_cents: 4500, quantity: 1 }],
        mandate: validMandate,
        redis_client: mockRedisBudgetOverage,
        spend_enforcer: enforcer,
      });
    },
    { message: 'ERR_EXCEEDS_TOTAL_MANDATE_BUDGET' }
  );

  // 2. Single Merchant Cap Overage simulation in Redis Lua
  const mockRedisMerchantOverage: any = {
    script: async () => 'mock_sha',
    evalsha: async () => [0, 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP'],
  };

  await assert.rejects(
    async () => {
      await toolHandlers.handleAuthorizeEscrow({
        mandate_id: validMandate.mandate_id,
        merchant_domain: 'legit-store.com',
        requested_cents: 4500,
        category_id: 'electronics',
        items: [{ product_id: 'p1', price_cents: 4500, quantity: 1 }],
        mandate: validMandate,
        redis_client: mockRedisMerchantOverage,
        spend_enforcer: enforcer,
      });
    },
    { message: 'ERR_EXCEEDS_SINGLE_MERCHANT_EXPOSURE_CAP' }
  );

  // 3. Cluster Hash Tag verification: keys use {vch_<mandate_id>}
  let evaluatedKeys: string[] = [];
  const mockRedisCaptureKeys: any = {
    script: async () => 'mock_sha',
    evalsha: async (_sha: string, _keyCount: number, ...args: any[]) => {
      evaluatedKeys = [args[0], args[1]];
      return [1, '4500'];
    },
  };

  const result = await toolHandlers.handleAuthorizeEscrow({
    mandate_id: 'cust_abc123',
    merchant_domain: 'legit-store.com',
    requested_cents: 4500,
    category_id: 'electronics',
    items: [{ product_id: 'p1', price_cents: 4500, quantity: 1 }],
    mandate: validMandate,
    redis_client: mockRedisCaptureKeys,
    spend_enforcer: enforcer,
  });

  assert.equal(result.status, 'AUTHORIZED');
  assert.equal(result.spent_cents, 4500);
  assert.equal(evaluatedKeys[0], 'aegis:{vch_cust_abc123}:mandate');
  assert.equal(evaluatedKeys[1], 'aegis:{vch_cust_abc123}:exposure:legit-store.com');
  assert.ok(result.paypal_order_id.startsWith('ord_cust_abc123_'));
  assert.ok(result.invoice_id.startsWith('inv_legit-store.com_'));
});
