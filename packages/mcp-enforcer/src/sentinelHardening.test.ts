import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { AtomicSpendEnforcer, LUA_SCRIPT } from './redis-lua-enforcer.js';
import { verifySessionMandateSignature } from './ed25519-verifier.js';
import { calculateMerchantAnomalyScore, isMerchantAllowed } from './merchant-anomaly-gate.js';
import { AuthorizeEscrowOrderSchema } from './custom-tools.js';

test('Redis Lua Enforcer: Comma-delimited category matching rejects substring bypasses', () => {
  // Simulate the exact Lua category check logic embedded in LUA_SCRIPT
  const checkCategory = (allowed_cats: string, cat_id: string): boolean => {
    if (allowed_cats === '*') return true;
    const bounded_cats = ',' + allowed_cats + ',';
    const bounded_target = ',' + cat_id + ',';
    return bounded_cats.includes(bounded_target);
  };

  const allowed = 'electronics,audio,gaming';

  // Exact matches should pass
  assert.equal(checkCategory(allowed, 'electronics'), true);
  assert.equal(checkCategory(allowed, 'audio'), true);
  assert.equal(checkCategory(allowed, 'gaming'), true);

  // Substrings that would have passed with unanchored string.find must now be strictly rejected
  assert.equal(checkCategory(allowed, 'tron'), false);
  assert.equal(checkCategory(allowed, 'elec'), false);
  assert.equal(checkCategory(allowed, 'audi'), false);
  assert.equal(checkCategory(allowed, 'ing'), false);
  assert.equal(checkCategory(allowed, ''), false);
  assert.equal(checkCategory(allowed, 'electronics_extra'), false);

  // Wildcard allows everything
  assert.equal(checkCategory('*', 'anything'), true);
  assert.equal(checkCategory('*', 'tron'), true);

  // Verify LUA_SCRIPT string contains comma wrapping logic
  assert.ok(LUA_SCRIPT.includes('local bounded_cats = "," .. allowed_cats .. ","'));
  assert.ok(LUA_SCRIPT.includes('local bounded_target = "," .. cat_id .. ","'));
  assert.ok(LUA_SCRIPT.includes('redis.call("EXPIRE", KEYS[2], ttl)'));
});

test('Redis Lua Enforcer: Rejects negative and zero spend amounts', async () => {
  const enforcer = new AtomicSpendEnforcer();
  let calledRedis = false;
  const mockRedis: any = {
    script: async () => 'mock_sha',
    evalsha: async () => {
      calledRedis = true;
      return [1, '1000'];
    },
    eval: async () => {
      calledRedis = true;
      return [1, '1000'];
    }
  };

  // Negative spend rejected immediately
  const negativeRes = await enforcer.reserveBudget(mockRedis, {
    mandate_id: 'vch_test_1',
    merchant_domain: 'store.com',
    requested_cents: -500,
    current_unix_ms: Date.now(),
    category_id: 'electronics',
    merchant_anomaly_score: 50
  });
  assert.equal(negativeRes.success, false);
  assert.equal(negativeRes.error_code, 'ERR_INVALID_SPEND_AMOUNT');
  assert.equal(calledRedis, false);

  // Zero spend rejected immediately
  const zeroRes = await enforcer.reserveBudget(mockRedis, {
    mandate_id: 'vch_test_1',
    merchant_domain: 'store.com',
    requested_cents: 0,
    current_unix_ms: Date.now(),
    category_id: 'electronics',
    merchant_anomaly_score: 50
  });
  assert.equal(zeroRes.success, false);
  assert.equal(zeroRes.error_code, 'ERR_INVALID_SPEND_AMOUNT');
  assert.equal(calledRedis, false);

  // Verify LUA_SCRIPT itself enforces positive req_cents
  assert.ok(LUA_SCRIPT.includes('if not req_cents or req_cents <= 0 then'));
  assert.ok(LUA_SCRIPT.includes('return {0, "ERR_INVALID_SPEND_AMOUNT"}'));
});

test('Ed25519 Verifier: Enforces buffer lengths, hex formatting, ACTIVE status and future expiration', async () => {
  // Generate valid Ed25519 keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pubDer = publicKey.export({ format: 'der', type: 'spki' });
  const rawPubHex = pubDer.subarray(12).toString('hex'); // 32 bytes (64 hex characters)

  const validMandateBase = {
    mandate_id: 'vch_ed25519_test',
    buyer_id: 'buyer_123',
    max_total_spend_cents: 50000,
    max_single_merchant_cents: 20000,
    cumulative_spent_cents: 0,
    currency_code: 'USD',
    allowed_category_ids: ['electronics'],
    public_key_hex: rawPubHex,
    expires_at: new Date(Date.now() + 3600 * 1000), // future
    status: 'ACTIVE' as const,
  };

  const messageObj = {
    mandate_id: validMandateBase.mandate_id,
    buyer_id: validMandateBase.buyer_id,
    max_total_spend_cents: validMandateBase.max_total_spend_cents,
    max_single_merchant_cents: validMandateBase.max_single_merchant_cents,
    currency_code: validMandateBase.currency_code,
    allowed_category_ids: validMandateBase.allowed_category_ids,
    expires_at: validMandateBase.expires_at.toISOString(),
    status: validMandateBase.status,
    public_key_hex: validMandateBase.public_key_hex,
  };

  const sigBuffer = crypto.sign(null, Buffer.from(JSON.stringify(messageObj), 'utf8'), privateKey);
  const validSigHex = sigBuffer.toString('hex'); // 64 bytes (128 hex characters)

  const validMandate = {
    ...validMandateBase,
    ed25519_signature_hex: validSigHex,
    created_at: new Date(),
  };

  // 1. Valid mandate succeeds
  const isValid = await verifySessionMandateSignature(validMandate);
  assert.equal(isValid, true);

  // 2. Non-hex characters in public key rejected
  const nonHexPub = await verifySessionMandateSignature({
    ...validMandate,
    public_key_hex: rawPubHex.slice(0, -2) + 'ZZ',
  });
  assert.equal(nonHexPub, false);

  // 3. Non-hex characters in signature rejected
  const nonHexSig = await verifySessionMandateSignature({
    ...validMandate,
    ed25519_signature_hex: validSigHex.slice(0, -2) + 'XY',
  });
  assert.equal(nonHexSig, false);

  // 4. Invalid public key length (e.g. 31 bytes instead of 32) rejected
  const truncatedPub = await verifySessionMandateSignature({
    ...validMandate,
    public_key_hex: rawPubHex.slice(2),
  });
  assert.equal(truncatedPub, false);

  // 5. Invalid signature length (e.g. 63 bytes instead of 64) rejected
  const truncatedSig = await verifySessionMandateSignature({
    ...validMandate,
    ed25519_signature_hex: validSigHex.slice(2),
  });
  assert.equal(truncatedSig, false);

  // 6. Non-ACTIVE status rejected
  const nonActiveMandate = await verifySessionMandateSignature({
    ...validMandate,
    status: 'EXPIRED',
  });
  assert.equal(nonActiveMandate, false);

  const revokedMandate = await verifySessionMandateSignature({
    ...validMandate,
    status: 'REVOKED',
  });
  assert.equal(revokedMandate, false);

  // 7. Expired mandate rejected
  const expiredMandate = await verifySessionMandateSignature({
    ...validMandate,
    expires_at: new Date(Date.now() - 1000), // past
  });
  assert.equal(expiredMandate, false);
});

test('Merchant Anomaly Gate: Corrected regex detects domain digits and clamps negative rates', () => {
  // Regex detection: domain with >= 5 consecutive digits receives penalty (+150)
  const suspiciousDomain = 'shop-12345.com';
  const normalDomain = 'shop-123.com';

  const scoreWith5Digits = calculateMerchantAnomalyScore({
    domain: suspiciousDomain,
    disputeRate: 0,
    averageDiscountVariance: 0,
  });
  assert.equal(scoreWith5Digits, 150);

  const scoreNormal = calculateMerchantAnomalyScore({
    domain: normalDomain,
    disputeRate: 0,
    averageDiscountVariance: 0,
  });
  assert.equal(scoreNormal, 0);

  // Negative bounds clamping via Math.max(0, ...)
  const negativeRatesScore = calculateMerchantAnomalyScore({
    domain: 'clean-store.com',
    disputeRate: -0.5,
    averageDiscountVariance: -1.0,
  });
  assert.equal(negativeRatesScore, 0);

  // High dispute rate penalty
  const highDisputeScore = calculateMerchantAnomalyScore({
    domain: 'clean-store.com',
    disputeRate: 0.15,
    averageDiscountVariance: 0,
  });
  assert.equal(highDisputeScore, 750); // 0.15 * 5000 = 750
  assert.equal(isMerchantAllowed(highDisputeScore), false); // > 300 rejected
});

test('AuthorizeEscrowOrderSchema: Refinement validates requested_cents strictly equals line-item sum', () => {
  const validPayload = {
    mandate_id: 'vch_escrow_1',
    merchant_domain: 'electronics-hub.com',
    requested_cents: 7500, // $75.00
    category_id: 'electronics',
    items: [
      { product_id: 'p1', price_cents: 2500, quantity: 2 }, // 5000
      { product_id: 'p2', price_cents: 2500, quantity: 1 }, // 2500 -> total 7500
    ],
  };

  const parsedValid = AuthorizeEscrowOrderSchema.safeParse(validPayload);
  assert.equal(parsedValid.success, true);

  // Mismatch: requested_cents does not equal sum of items
  const mismatchPayload = {
    ...validPayload,
    requested_cents: 5000, // mismatch: items sum to 7500
  };

  const parsedMismatch = AuthorizeEscrowOrderSchema.safeParse(mismatchPayload);
  assert.equal(parsedMismatch.success, false);
  if (!parsedMismatch.success) {
    assert.ok(
      parsedMismatch.error.issues.some(i =>
        i.message.includes('requested_cents must strictly equal the sum of (price_cents * quantity) across all items')
      )
    );
  }

  // 1-cent exploit attempt (reserving 1 cent for expensive items)
  const exploitPayload = {
    ...validPayload,
    requested_cents: 1,
  };
  const parsedExploit = AuthorizeEscrowOrderSchema.safeParse(exploitPayload);
  assert.equal(parsedExploit.success, false);
});
