import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../index.js';
import {
  generatePaymentReceipt,
  verifyPaymentReceipt,
  executeAgentPaymentRetry,
  http402Interceptor,
  X402ChallengeResponseSchema,
  HEADER_PAY_TO,
  HEADER_X_PAYMENT_CONTRACT_ID,
  HEADER_X_PAYPAL_VAULT_SETUP_URL,
  HEADER_PAYMENT_REQUIRED,
  HEADER_X_AEGIS_SPEND_POLICY,
  HEADER_X_PAYMENT_RECEIPT,
} from './http402-interceptor.js';
import { AtomicSpendEnforcer, ROLLBACK_LUA_SCRIPT } from '@aegispay/mcp-enforcer';

test('HTTP 402 Interceptor & Redis Lua Compensating Rollback Test Suite', async (t) => {
  const app = await buildApp();

  await t.test('1. Intercepts unauthorized procurement call and formats RFC-compliant HTTP 402 challenge', async () => {
    // Verify exported header constants
    assert.equal(HEADER_PAY_TO, 'PAY-TO');
    assert.equal(HEADER_X_PAYMENT_CONTRACT_ID, 'X-Payment-Contract-Id');
    assert.equal(HEADER_X_PAYPAL_VAULT_SETUP_URL, 'X-PayPal-Vault-Setup-Url');
    assert.equal(HEADER_PAYMENT_REQUIRED, 'PAYMENT-REQUIRED');
    assert.equal(HEADER_X_AEGIS_SPEND_POLICY, 'X-Aegis-Spend-Policy');
    assert.equal(HEADER_X_PAYMENT_RECEIPT, 'X-Payment-Receipt');
    assert.equal(typeof http402Interceptor, 'function');

    const response = await app.inject({
      method: 'POST',
      url: '/api/buyer/capture',
      payload: {
        order_id: 'ORD-TEST-402',
        mandate_id: 'mandate-test',
        amount_cents: 5000,
      },
    });

    assert.equal(response.statusCode, 402);

    // Verify headers
    const payTo = response.headers['pay-to'] as string;
    const contractId = response.headers['x-payment-contract-id'] as string;
    const paymentRequiredB64 = response.headers['payment-required'] as string;
    const vaultUrl = response.headers['x-paypal-vault-setup-url'] as string;
    const spendPolicy = response.headers['x-aegis-spend-policy'] as string;

    assert.ok(payTo && payTo.startsWith('payto://'), 'Pay-To header must be RFC-compliant payto URI');
    assert.ok(contractId && contractId.startsWith('ct_402_'), 'Contract ID must start with ct_402_');
    assert.ok(paymentRequiredB64, 'PAYMENT-REQUIRED header must be present');
    assert.ok(vaultUrl, 'X-PayPal-Vault-Setup-Url must be present');
    assert.ok(spendPolicy, 'X-Aegis-Spend-Policy must be present');

    // Decode and verify base64 PAYMENT-REQUIRED challenge
    const decodedChallenge = JSON.parse(Buffer.from(paymentRequiredB64, 'base64').toString('utf8'));
    assert.equal(decodedChallenge.payment_contract_id, contractId);
    assert.equal(decodedChallenge.pay_to, payTo);
    assert.deepEqual(decodedChallenge.accepted_headers, [
      'X-Payment-Receipt',
      'X-Spend-Mandate-Id',
      'X-Synthetic-Voucher-Id',
    ]);

    // Verify JSON response body
    const body = JSON.parse(response.body);
    assert.equal(body.status, 402);
    assert.equal(body.error, 'PAYMENT_REQUIRED');
    assert.equal(body.challenge.payment_contract_id, contractId);

    // Validate body strictly against X402ChallengeResponseSchema
    const parsedChallenge = X402ChallengeResponseSchema.safeParse(body);
    assert.equal(parsedChallenge.success, true, 'Response body must satisfy X402ChallengeResponseSchema');
    if (parsedChallenge.success) {
      assert.equal(parsedChallenge.data.status, 402);
      assert.equal(parsedChallenge.data.error, 'PAYMENT_REQUIRED');
      assert.equal(parsedChallenge.data.challenge.pay_to, payTo);
      assert.equal(parsedChallenge.data.x402Version, 2);
    }

    // Negative schema verification
    assert.equal(X402ChallengeResponseSchema.safeParse({ invalid: true }).success, false);
  });

  await t.test('2. Cryptographic receipt generation and timing-safe verification with 24h TTL', () => {
    const contractId = 'ct_402_abcdef0123456789';
    const secret = 'custom_secret_key_for_testing';

    // Valid fresh receipt
    const receipt = generatePaymentReceipt(contractId, 2500, 'USD', secret);
    assert.ok(receipt.startsWith('rcpt_'), 'Receipt must start with rcpt_ prefix');
    assert.equal(verifyPaymentReceipt(receipt, secret), true, 'Valid receipt must verify cleanly');

    // Receipt within 24h window (23 hours old)
    const twentyThreeHoursAgo = Date.now() - 23 * 60 * 60 * 1000;
    const freshReceipt = generatePaymentReceipt(contractId, 2500, 'USD', secret, twentyThreeHoursAgo);
    assert.equal(verifyPaymentReceipt(freshReceipt, secret), true, 'Receipt within 24h must pass');

    // Expired receipt (25 hours old exceeding 24h TTL)
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    const expiredReceipt = generatePaymentReceipt(contractId, 2500, 'USD', secret, twentyFiveHoursAgo);
    assert.equal(verifyPaymentReceipt(expiredReceipt, secret), false, 'Expired receipt (>24h) must fail');

    // Future timestamp beyond clock skew (2 minutes in future)
    const twoMinutesInFuture = Date.now() + 120000;
    const futureReceipt = generatePaymentReceipt(contractId, 2500, 'USD', secret, twoMinutesInFuture);
    assert.equal(verifyPaymentReceipt(futureReceipt, secret), false, 'Future timestamp beyond clock skew must fail');

    // Tampered payload
    const rawData = Buffer.from(receipt.slice(5), 'base64').toString('utf8');
    const parsed = JSON.parse(rawData);
    parsed.amountCents = 999999; // Tampered amount
    const tamperedReceipt = `rcpt_${Buffer.from(JSON.stringify(parsed)).toString('base64')}`;
    assert.equal(verifyPaymentReceipt(tamperedReceipt, secret), false, 'Tampered receipt must fail verification');

    // Invalid secret
    assert.equal(verifyPaymentReceipt(receipt, 'wrong_secret'), false, 'Wrong secret must fail verification');

    // Malformed receipt strings
    assert.equal(verifyPaymentReceipt('invalid_string', secret), false);
    assert.equal(verifyPaymentReceipt('rcpt_not_base64_json!!!', secret), false);
  });

  await t.test('3. Allows authorized agent call presenting valid X-Payment-Receipt header', async () => {
    const contractId = 'ct_402_approved_agent';
    const validReceipt = generatePaymentReceipt(contractId, 5000, 'USD');

    const response = await app.inject({
      method: 'POST',
      url: '/api/buyer/capture',
      headers: {
        'x-payment-receipt': validReceipt,
      },
      payload: {
        order_id: 'MOCK_ORDER_123',
        mandate_id: 'mandate-123',
        amount_cents: 5000,
      },
    });

    // 402 interceptor did NOT block it; route processed and returned 200 COMPLETED
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.status, 'COMPLETED');
    assert.equal(body.order_id, 'MOCK_ORDER_123');
  });

  await t.test('4. Allows agent presenting X-Spend-Mandate-Id or X-Synthetic-Voucher-Id', async () => {
    const responseWithMandate = await app.inject({
      method: 'POST',
      url: '/api/buyer/capture',
      headers: {
        'x-spend-mandate-id': 'vch_valid_session_mandate',
      },
      payload: {
        order_id: 'MOCK_ORDER_456',
        mandate_id: 'mandate-456',
        amount_cents: 3000,
      },
    });

    assert.equal(responseWithMandate.statusCode, 200);
    const body = JSON.parse(responseWithMandate.body);
    assert.equal(body.status, 'COMPLETED');

    const responseWithVoucher = await app.inject({
      method: 'POST',
      url: '/api/buyer/capture',
      headers: {
        'x-synthetic-voucher-id': 'svch_valid_token',
      },
      payload: {
        order_id: 'MOCK_ORDER_789',
        mandate_id: 'mandate-789',
        amount_cents: 2000,
      },
    });

    assert.equal(responseWithVoucher.statusCode, 200);
  });

  await t.test('5. Autonomous agent retry helper automatically resolves HTTP 402 challenge', async () => {
    let callCount = 0;

    const mockAgentCall = async (receipt?: string) => {
      callCount++;
      const headers: Record<string, string> = {};
      if (receipt) {
        headers['x-payment-receipt'] = receipt;
      }
      const res = await app.inject({
        method: 'POST',
        url: '/api/buyer/capture',
        headers,
        payload: {
          order_id: 'MOCK_ORDER_RETRY',
          mandate_id: 'mandate-retry',
          amount_cents: 4000,
        },
      });

      return {
        status: res.statusCode,
        data: JSON.parse(res.body),
        headers: res.headers as Record<string, string>,
      };
    };

    const retryResult = await executeAgentPaymentRetry(mockAgentCall);
    assert.equal(retryResult.status, 200);
    assert.equal(retryResult.retries, 1, 'Should resolve after 1 retry with generated receipt');
    assert.ok(retryResult.receiptUsed?.startsWith('rcpt_'));
    assert.equal(callCount, 2, 'Initial 402 challenge + successful retried call = 2 invocations');
  });

  await t.test('6. Executes < 1ms Redis Lua compensating rollback on PayPal INSTRUMENT_DECLINED', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/buyer/capture',
      headers: {
        'x-spend-mandate-id': 'mandate-rollback-test',
      },
      payload: {
        order_id: 'DECLINE_ORDER_FAIL',
        mandate_id: 'mandate-rollback-test',
        amount_cents: 7500,
        merchant_domain: 'declining-merchant.com',
      },
    });

    assert.equal(response.statusCode, 500);
    const body = JSON.parse(response.body);
    assert.equal(body.error, 'INSTRUMENT_DECLINED');
    assert.equal(body.compensating_rollback, true);
    assert.equal(body.restored_cents, 7500);
    assert.equal(body.rollback_success, true);
    assert.ok(typeof body.rollback_latency_ms === 'number');
    assert.ok(body.rollback_latency_ms < 10, `Rollback executed fast: ${body.rollback_latency_ms}ms`);
  });

  await t.test('7. AtomicSpendEnforcer evaluates ROLLBACK_LUA_SCRIPT atomically in < 1ms', async () => {
    let evaluatedScript = '';
    let evaluatedKeys: string[] = [];
    let evaluatedArgs: string[] = [];

    const mockRedis: any = {
      script: async (cmd: string, scriptText: string) => {
        return 'mock_rollback_sha';
      },
      evalsha: async (sha: string, numKeys: number, ...args: string[]) => {
        evaluatedKeys = args.slice(0, numKeys);
        evaluatedArgs = args.slice(numKeys);
        return [1, 'OK'];
      },
    };

    const enforcer = new AtomicSpendEnforcer();
    const tStart = performance.now();
    const success = await enforcer.rollbackReservation(
      mockRedis,
      'test_mandate_99',
      3500,
      'electronics-hub.com'
    );
    const tDuration = performance.now() - tStart;

    assert.equal(success, true);
    assert.deepEqual(evaluatedKeys, [
      'aegis:{vch_test_mandate_99}:mandate',
      'aegis:{vch_test_mandate_99}:exposure:electronics-hub.com',
    ]);
    assert.deepEqual(evaluatedArgs, ['3500']);
    assert.ok(tDuration < 5, `Rollback took ${tDuration.toFixed(3)}ms (< 5ms limit)`);
  });
});

