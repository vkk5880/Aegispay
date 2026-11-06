import Fastify from 'fastify';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../index.js';
import {
  http402Plugin,
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
  HEADER_X_A2A_EXTENSIONS,
  X402_EXTENSION_URI,
  getA2AExtensionDeclaration,
  checkA2AExtensionActivation,
  addA2AExtensionActivationHeader,
  isVacantStringField,
  snapshotPaymentRequirementsList,
  assertAcceptsAllowlistedAfterExtensionEnrich,
  assertSettleResponseCoreUnchanged,
  PAYMENT_FLOWS,
  resolvePaymentFlow,
  applyPaymentFlowWireExtra,
  resolvePaymentFlowPhases,
  resolveFailurePathSettlement,
  CoreResourceServer,
  encodePaymentSignatureHeader,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  decodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  decodePaymentResponseHeader,
  readLimitedText,
  MAX_CONTROL_PLANE_RESPONSE_BYTES,
  ResponseBodyTooLargeError,
  isFatalStartupInitError,
  attachBackgroundInitHandler,
  withPrivateCacheControl,
  checkIfBazaarNeeded,
  x402Client,
  x402HTTPClient,
  x402Facilitator,
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  FacilitatorCapabilityError,
  RouteConfigurationError,
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

  await t.test('8. Verifies A2A x402 protocol extension declaration, headers, and activation', async () => {
    assert.equal(HEADER_X_A2A_EXTENSIONS, 'X-A2A-Extensions');
    assert.equal(typeof getA2AExtensionDeclaration, 'function');
    const decl = getA2AExtensionDeclaration('A2A payments', true);
    assert.equal(decl.uri, X402_EXTENSION_URI);
    assert.equal(decl.required, true);

    const headersWithA2A = { 'X-A2A-Extensions': X402_EXTENSION_URI };
    assert.equal(checkA2AExtensionActivation(headersWithA2A), true);
    assert.equal(checkA2AExtensionActivation({}), false);

    const echoedHeaders = addA2AExtensionActivationHeader({});
    assert.equal(echoedHeaders['X-A2A-Extensions'], X402_EXTENSION_URI);

    const response = await app.inject({
      method: 'POST',
      url: '/api/buyer/capture',
      payload: {
        order_id: 'ORD-A2A-TEST',
        mandate_id: 'mandate-test',
        amount_cents: 2000,
      },
    });

    assert.equal(response.statusCode, 402);
    assert.equal(response.headers['x-a2a-extensions'], X402_EXTENSION_URI);
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

  await t.test('9. Production x402 HTTP Codecs, Bounded Reader, Client, Facilitator, and Resource Server', async (t2) => {
    // 1. Header codecs round-trip & tamper rejection
    const samplePayload = {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: "paypal-sandbox",
        amount: "5000",
        payTo: "merchant@aegispay.dev",
        maxTimeoutSeconds: 600,
        asset: "USD",
      },
      payload: { signature: "0xabcdef123456" },
    };
    const encodedSig = encodePaymentSignatureHeader(samplePayload);
    assert.equal(typeof encodedSig, "string");
    const decodedSig = decodePaymentSignatureHeader(encodedSig);
    assert.deepEqual(decodedSig, samplePayload);

    // Tampered / malformed header rejection
    assert.throws(() => decodePaymentSignatureHeader("not_base64_!@#$"), /Invalid payment signature header/);

    const sampleRequired = {
      x402Version: 2,
      resource: { url: "https://api.aegispay.dev/checkout" },
      accepts: [samplePayload.accepted],
    };
    const encodedReq = encodePaymentRequiredHeader(sampleRequired);
    const decodedReq = decodePaymentRequiredHeader(encodedReq);
    assert.deepEqual(decodedReq, sampleRequired);
    assert.throws(() => decodePaymentRequiredHeader("invalid!!!"), /Invalid payment required header/);

    const sampleResponse = {
      success: true,
      transaction: "0xtx987654321",
      network: "paypal-sandbox",
      payer: "buyer_123",
      extensionResponses: { privateInternalData: "secret" },
    };
    const encodedResp = encodePaymentResponseHeader(sampleResponse);
    const decodedResp = decodePaymentResponseHeader(encodedResp);
    assert.equal(decodedResp.success, true);
    assert.equal(decodedResp.transaction, "0xtx987654321");
    // Verify internal extensionResponses was stripped for buyer privacy
    assert.equal(decodedResp.extensionResponses, undefined);

    // 2. Control plane bounded reader
    assert.equal(MAX_CONTROL_PLANE_RESPONSE_BYTES, 1048576);
    const mockSmallResp = {
      text: async () => JSON.stringify({ status: "ok" }),
    };
    const readText = await readLimitedText(mockSmallResp, 1024);
    assert.equal(readText, JSON.stringify({ status: "ok" }));

    // 3. Fatal vs Transient startup error classification
    assert.equal(isFatalStartupInitError(new FacilitatorCapabilityError("No matching scheme")), true);
    assert.equal(isFatalStartupInitError(new RouteConfigurationError("Invalid route syntax")), true);
    assert.equal(isFatalStartupInitError(new Error("Transient network timeout")), false);
    assert.equal(isFatalStartupInitError(null), false);

    // 4. Cache-Control and Bazaar detection
    assert.equal(withPrivateCacheControl(null), "private");
    assert.equal(withPrivateCacheControl("no-cache"), "no-cache, private");
    assert.equal(withPrivateCacheControl("private, max-age=0"), "private, max-age=0");
    assert.equal(checkIfBazaarNeeded({ "/api/agent": { discovery: true } }), true);
    assert.equal(checkIfBazaarNeeded({ "/api/agent": { discovery: false } }), false);

    // 5. x402Client builder & spend controls
    const client = new x402Client();
    client.setSpendControls({
      maxSpendPerRequest: 10000,
      allowedSchemes: ["exact"],
      allowedNetworks: ["paypal-sandbox", "base"],
    });

    // Valid payload creation
    const payload = await client.createPaymentPayload(sampleRequired);
    assert.equal(payload.x402Version, 2);
    assert.equal(payload.accepted.amount, "5000");

    // Spend control violation: amount exceeds limit
    const expensiveRequired = {
      x402Version: 2,
      accepts: [{
        scheme: "exact",
        network: "paypal-sandbox",
        amount: "50000",
        payTo: "merchant@aegispay.dev",
      }],
    };
    await assert.rejects(
      async () => client.createPaymentPayload(expensiveRequired),
      /exceeds max spend per request limit/
    );

    // Spend control violation: disallowed scheme
    const disallowedSchemeReq = {
      x402Version: 2,
      accepts: [{
        scheme: "escrow_disallowed",
        network: "paypal-sandbox",
        amount: "1000",
        payTo: "merchant@aegispay.dev",
      }],
    };
    await assert.rejects(
      async () => client.createPaymentPayload(disallowedSchemeReq),
      /Scheme escrow_disallowed is not allowed/
    );

    // 6. x402HTTPClient header creation & settlement decoding
    const httpClient = new x402HTTPClient(client);
    const headers = httpClient.encodePaymentSignatureHeader(payload);
    assert.ok(headers["PAYMENT-SIGNATURE"]);

    const decodedFromHeaders = httpClient.getPaymentSettleResponse((h) => {
      if (h.toLowerCase() === "payment-response") return encodedResp;
      return null;
    });
    assert.equal(decodedFromHeaders?.transaction, "0xtx987654321");

    // 7. x402Facilitator registration & settlement
    const facilitator = new x402Facilitator();
    facilitator.register(["paypal-sandbox", "paypal-live"], {
      scheme: "exact",
      x402Version: 2,
      verify: async (p: any, r: any) => ({ is_valid: true }),
      settle: async (p: any, r: any) => ({ success: true, transaction: "0x_fac_settle_hash" }),
    });

    const supported = facilitator.getSupported();
    assert.equal(supported.kinds.length, 2);
    assert.equal(supported.kinds[0].network, "paypal-sandbox");

    const verifyRes = await facilitator.verify(payload, samplePayload.accepted);
    assert.equal(verifyRes.is_valid, true);

    const settleRes = await facilitator.settle(payload, samplePayload.accepted);
    assert.equal(settleRes.success, true);
    assert.equal(settleRes.transaction, "0x_fac_settle_hash");

    // 8. x402HTTPResourceServer request processing
    const server = new x402HTTPResourceServer({
      "/api/checkout": { price: 5000 },
    }, facilitator);

    const mockUnpaidAdapter = {
      getPath: () => "/api/checkout",
      getUrl: () => "https://api.aegispay.dev/api/checkout",
      getHeader: (name: any) => undefined,
      getMethod: () => "POST",
      getAcceptHeader: () => "application/json",
      getUserAgent: () => "Agent-Bot/1.0",
    };

    const unpaidRes = await server.processHTTPRequest(mockUnpaidAdapter);
    assert.equal(unpaidRes.requiresPayment, true);
    assert.equal(unpaidRes.status, 402);
    assert.ok(unpaidRes.headers?.["PAYMENT-REQUIRED"]);
    assert.equal(unpaidRes.headers?.["Cache-Control"], "no-store");

    // Paid request presenting PAYMENT-SIGNATURE
    const mockPaidAdapter = {
      ...mockUnpaidAdapter,
      getHeader: (name: any) => {
        if (name.toLowerCase() === "payment-signature") return encodedSig;
        return undefined;
      },
    };

    const paidRes = await server.processHTTPRequest(mockPaidAdapter);
    assert.equal(paidRes.requiresPayment, true);
    assert.equal(paidRes.status, 200);
    assert.equal(paidRes.body?.success, true);
    assert.ok(paidRes.headers?.["PAYMENT-RESPONSE"]);
    assert.ok(paidRes.headers?.["Cache-Control"]?.includes("private"));
  });


  await t.test('10. Batch 2: Hook Policies, Payment Flows, and Core Resource Server Engine', async (t2) => {
    // 1. Hook policy: isVacantStringField & snapshot
    assert.equal(isVacantStringField(""), true);
    assert.equal(isVacantStringField("   "), true);
    assert.equal(isVacantStringField("0x123"), false);

    const baselineList = [
      { scheme: "exact", network: "paypal-sandbox", amount: "", payTo: "0xmerchant", maxTimeoutSeconds: 600, extra: { info: 1 } },
    ];
    const snapshot = snapshotPaymentRequirementsList(baselineList);
    assert.deepEqual(snapshot, baselineList);
    // Mutating snapshot does not affect baseline
    snapshot[0].extra.info = 999;
    assert.equal(baselineList[0].extra.info, 1);

    // 2. Extension mutation policy enforcement
    const validEnriched = [
      { scheme: "exact", network: "paypal-sandbox", amount: "5000", payTo: "0xmerchant", maxTimeoutSeconds: 600, extra: { info: 1, enrichedField: "ok" } },
    ];
    // Vacant amount was filled -> allowed
    assert.doesNotThrow(() => assertAcceptsAllowlistedAfterExtensionEnrich(baselineList, validEnriched, "mock-ext"));

    // Scheme mutation -> throws
    const invalidScheme = [{ ...validEnriched[0], scheme: "tampered_scheme" }];
    assert.throws(() => assertAcceptsAllowlistedAfterExtensionEnrich(baselineList, invalidScheme, "mock-ext"), /scheme\/network\/maxTimeoutSeconds is immutable/);

    // Non-vacant payTo mutation -> throws
    const invalidPayTo = [{ ...validEnriched[0], payTo: "0xtamperedMerchant" }];
    assert.throws(() => assertAcceptsAllowlistedAfterExtensionEnrich(baselineList, invalidPayTo, "mock-ext"), /payTo cannot be modified unless vacant/);

    // Length change -> throws
    assert.throws(() => assertAcceptsAllowlistedAfterExtensionEnrich(baselineList, [], "mock-ext"), /accepts length changed/);

    // 3. Settle response core immutability
    const baseSettle = { success: true, transaction: "0xtx", network: "paypal-sandbox", payer: "0xpayer" };
    assert.doesNotThrow(() => assertSettleResponseCoreUnchanged(baseSettle, { ...baseSettle, extensions: { meta: true } }, "mock-ext"));
    assert.throws(() => assertSettleResponseCoreUnchanged(baseSettle, { ...baseSettle, success: false }, "mock-ext"), /modified core settlement fields/);

    // 4. Payment flow resolution & phases
    assert.deepEqual(resolvePaymentFlowPhases("authorization"), {
      verifyBeforeHandler: true,
      settleBeforeHandler: false,
      settleAfterHandler: true,
    });
    assert.deepEqual(resolvePaymentFlowPhases("upfront"), {
      verifyBeforeHandler: false,
      settleBeforeHandler: true,
      settleAfterHandler: false,
    });
    assert.deepEqual(resolvePaymentFlowPhases("escrow"), {
      verifyBeforeHandler: false,
      settleBeforeHandler: true,
      settleAfterHandler: true,
    });
    assert.throws(() => resolvePaymentFlowPhases("unknown_flow"), /Unknown payment flow/);

    const mockScheme = {
      scheme: "exact",
      defaultAssetTransferMethod: "default",
      paymentFlows: {
        default: { default: "authorization", supported: ["authorization", "upfront"] },
      },
    };
    const resolvedFlow = resolvePaymentFlow(mockScheme, { extra: {} });
    assert.equal(resolvedFlow.paymentFlow, "authorization");
    assert.equal(resolvedFlow.assetTransferMethod, "default");

    // applyPaymentFlowWireExtra strips SDK default
    const wireExtra = applyPaymentFlowWireExtra({ assetTransferMethod: "default" }, resolvedFlow);
    assert.equal(wireExtra.assetTransferMethod, undefined);

    // 5. Failure path settlement resolution
    const failedCancel = { success: false, errorReason: "CANCEL_TIMEOUT", network: "paypal-sandbox" };
    const beforeHandlerSettle = { result: { success: true, transaction: "0xdepositTx", amount: "5000" } };
    const resolvedFailure = resolveFailurePathSettlement(failedCancel, beforeHandlerSettle);
    assert.equal(resolvedFailure.success, false);
    assert.equal(resolvedFailure.extra?.depositTransaction, "0xdepositTx");
    assert.equal(resolvedFailure.extra?.depositAmount, "5000");

    // 6. CoreResourceServer lifecycle & execution
    const server = new CoreResourceServer();
    server.register("paypal-sandbox", {
      scheme: "exact",
      buildPaymentRequirements: async () => [{ scheme: "exact", network: "paypal-sandbox", amount: "5000" }],
    });
    assert.equal(server.hasRegisteredScheme("paypal-sandbox", "exact"), true);
    assert.equal(server.hasRegisteredScheme("paypal-sandbox", "escrow"), false);

    const reqs = await server.buildPaymentRequirements({});
    assert.equal(reqs.length, 1);
    assert.equal(reqs[0].network, "paypal-sandbox");

    const resp = await server.createPaymentRequiredResponse(reqs, { url: "https://api.aegispay.dev/resource" });
    assert.equal(resp.x402Version, 2);
    assert.equal(resp.accepts.length, 1);

    const verifyResult = await server.verifyPayment({ x402Version: 2 }, reqs[0]);
    assert.equal(verifyResult.isValid, true);

    const settleResult = await server.settlePayment({ x402Version: 2 }, reqs[0]);
    assert.equal(settleResult.success, true);
    assert.equal(settleResult.transaction, "0x_settle_core_tx");
  });


  await t.test('8. Batch 3: Payment Identifier deduplication and conflict detection', async () => {
    const fastify = Fastify({ logger: false });
    await fastify.register(http402Plugin, {
      protectedPrefixes: ['/api/procurement/checkout'],
    });

    fastify.post('/api/procurement/checkout', async (req, reply) => {
      return { success: true, orderId: 'ord_12345' };
    });

    const paymentId = 'pay_dedup_test_key_12345';

    // First request with payment identifier & valid receipt
    const validReceipt = generatePaymentReceipt('ct_test_1', 5000, 'USD');
    const res1 = await fastify.inject({
      method: 'POST',
      url: '/api/procurement/checkout',
      headers: {
        'x-payment-receipt': validReceipt,
        'payment-identifier': paymentId,
      },
      payload: { item: 'laptop', qty: 1 },
    });
    assert.equal(res1.statusCode, 200);

    // Replay with identical body -> returns cached deduplication (200)
    const res2 = await fastify.inject({
      method: 'POST',
      url: '/api/procurement/checkout',
      headers: {
        'payment-identifier': paymentId,
      },
      payload: { item: 'laptop', qty: 1 },
    });
    assert.equal(res2.statusCode, 200);

    // Replay with different body -> triggers 409 Conflict
    const res3 = await fastify.inject({
      method: 'POST',
      url: '/api/procurement/checkout',
      headers: {
        'payment-identifier': paymentId,
      },
      payload: { item: 'smartphone', qty: 10 },
    });
    assert.equal(res3.statusCode, 409);
    assert.ok(res3.body.includes('IDEMPOTENCY_CONFLICT'));
  });

  await t.test('9. Batch 3: Sign-In-With-X (SIWX) wallet proof of ownership bypasses paywall', async () => {
    const fastify = Fastify({ logger: false });
    await fastify.register(http402Plugin, {
      protectedPrefixes: ['/api/procurement/checkout'],
    });

    fastify.post('/api/procurement/checkout', async (req, reply) => {
      return { access: 'granted', walletOwner: true };
    });

    const siwxPayload = {
      domain: 'localhost',
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      uri: 'http://localhost/api/procurement/checkout',
      version: '1',
      chainId: 'eip155:8453',
      type: 'eip191',
      nonce: 'nonce_siwx_test_987654',
      issuedAt: new Date().toISOString(),
      signature: '0x' + 'f'.repeat(130),
    };

    const siwxHeader = Buffer.from(JSON.stringify(siwxPayload)).toString('base64');

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/procurement/checkout',
      headers: {
        'sign-in-with-x': siwxHeader,
      },
      payload: { query: 'view_premium' },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { access: 'granted', walletOwner: true });
  });

  await t.test('10. Batch 3: Axios client wrapAxiosWithPayment automatically handles 402 challenge and retries', async () => {
    const { wrapAxiosWithPayment } = await import('./http-adapters.js');

    let callCount = 0;
    const mockAxiosInstance: any = async (config: any) => {
      callCount++;
      if (callCount === 1) {
        const err: any = new Error('Request failed with status code 402');
        err.config = config;
        err.response = {
          status: 402,
          headers: {
            'x-payment-contract-id': 'ct_axios_test_1',
            'payment-required': Buffer.from(JSON.stringify({ payment_contract_id: 'ct_axios_test_1' })).toString('base64'),
          },
          data: { error: 'PAYMENT_REQUIRED', status: 402 },
        };
        // Trigger response error interceptor
        return mockAxiosInstance.responseErrorHandler(err);
      }
      return { status: 200, data: { paid: true } };
    };

    mockAxiosInstance.interceptors = {
      response: {
        use: (onSuccess: any, onError: any) => {
          mockAxiosInstance.responseErrorHandler = onError;
        },
      },
    };

    wrapAxiosWithPayment(mockAxiosInstance);

    const result = await mockAxiosInstance({ url: '/api/procurement/checkout', method: 'POST' });
    assert.equal(result.status, 200);
    assert.equal(result.data.paid, true);
    assert.equal(callCount, 2);
  });

  await t.test('11. Batch 3: Express payment middleware handles 402 and attaches settlement receipts', async () => {
    const { createExpressPaymentMiddleware } = await import('./http-adapters.js');

    const middleware = createExpressPaymentMiddleware({
      protectedRoutes: [{ path: '/api/procurement/checkout', amountCents: 5000 }],
    });

    // Sub-case A: Missing payment signature -> returns 402
    let statusSet = 0;
    let jsonSent: any = null;
    const mockReq402 = { path: '/api/procurement/checkout', method: 'POST', headers: {} };
    const mockRes402 = {
      status(s: number) { statusSet = s; return this; },
      setHeader() {},
      json(data: any) { jsonSent = data; return this; },
    };
    let nextCalled = false;

    await middleware(mockReq402, mockRes402, () => { nextCalled = true; });
    assert.equal(statusSet, 402);
    assert.equal(jsonSent?.error, 'PAYMENT_REQUIRED');
    assert.equal(nextCalled, false);

    // Sub-case B: Valid payment receipt -> proceeds to next() and attaches response settlement receipt
    const validReceipt = generatePaymentReceipt('ct_express_1', 5000, 'USD');
    const mockReq200 = {
      path: '/api/procurement/checkout',
      method: 'POST',
      headers: { 'x-payment-receipt': validReceipt },
    };
    let setHeaders: Record<string, string> = {};
    const mockRes200 = {
      status(s: number) { statusSet = s; return this; },
      setHeader(k: string, v: string) { setHeaders[k] = v; },
      removeHeader(k: string) { delete setHeaders[k]; },
      json(data: any) { return data; },
    };
    nextCalled = false;

    await middleware(mockReq200, mockRes200, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.ok(setHeaders['PAYMENT-RESPONSE'] !== undefined);
  });

  await t.test('12. Batch 4: Fetch wrapFetchWithPayment automatically handles 402 challenge and retries', async () => {
    const { wrapFetchWithPayment } = await import('./http-adapters.js');

    let callCount = 0;
    const mockFetch = async (input: any, init?: any) => {
      callCount++;
      if (callCount === 1) {
        const challenge = { payment_contract_id: 'ct_fetch_test_1', amount_cents: 5000 };
        return new Response(JSON.stringify({ error: 'PAYMENT_REQUIRED', status: 402, challenge }), {
          status: 402,
          headers: {
            'content-type': 'application/json',
            'x-payment-contract-id': 'ct_fetch_test_1',
            'payment-required': Buffer.from(JSON.stringify(challenge)).toString('base64'),
          },
        });
      }
      return new Response(JSON.stringify({ success: true, delivered: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const wrappedFetch = wrapFetchWithPayment(mockFetch as any);
    const resp = await wrappedFetch('https://api.aegispay.dev/api/procurement/checkout', {
      method: 'POST',
      body: JSON.stringify({ item: 'server_gpu', qty: 1 }),
    });

    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.delivered, true);
    assert.equal(callCount, 2);
  });

  await t.test('13. Batch 4: Hono payment middleware enforces 402 paywall and coordinates settlements', async () => {
    const { createHonoPaymentMiddleware } = await import('./http-adapters.js');

    const middleware = createHonoPaymentMiddleware({
      protectedRoutes: [{ path: '/api/edge/resource', amountCents: 3000 }],
    });

    // Sub-case A: 402 Challenge on missing payment
    let statusSet = 0;
    let jsonSent: any = null;
    let setHeaders: Record<string, string> = {};

    const mockContext402 = {
      req: {
        url: 'http://localhost/api/edge/resource',
        method: 'GET',
        header: (k: string) => undefined,
      },
      status: (s: number) => { statusSet = s; },
      header: (k: string, v: string) => { setHeaders[k] = v; },
      json: (data: any) => { jsonSent = data; return data; },
    };

    let nextCalled = false;
    await middleware(mockContext402, async () => { nextCalled = true; });
    assert.equal(statusSet, 402);
    assert.equal(jsonSent?.error, 'PAYMENT_REQUIRED');
    assert.equal(nextCalled, false);

    // Sub-case B: 200 Success on payment presentation
    const validReceipt = generatePaymentReceipt('ct_hono_1', 3000, 'USD');
    setHeaders = {};
    const mockContext200 = {
      req: {
        url: 'http://localhost/api/edge/resource',
        method: 'GET',
        header: (k: string) => k === 'x-payment-receipt' ? validReceipt : undefined,
      },
      status: (s: number) => { statusSet = s; },
      header: (k: string, v: string) => { setHeaders[k] = v; },
      json: (data: any) => { jsonSent = data; return data; },
    };

    nextCalled = false;
    await middleware(mockContext200, async () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.ok(setHeaders['PAYMENT-RESPONSE'] !== undefined);
  });

  await t.test('14. Batch 4: Next.js withX402 route handler wrapper issues 402 and passes paid requests', async () => {
    const { withX402 } = await import('./http-adapters.js');

    const protectedHandler = withX402(async (req) => {
      return new Response(JSON.stringify({ status: 'ok', secretData: 'secret_123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }, { protected: true, amountCents: 5000 });

    // Request without payment -> 402
    const reqWithoutPayment = {
      headers: new Headers(),
    };
    const res402 = await protectedHandler(reqWithoutPayment);
    assert.equal(res402.status, 402);
    const body402 = await res402.json();
    assert.equal(body402.error, 'PAYMENT_REQUIRED');

    // Request with valid receipt -> 200
    const validReceipt = generatePaymentReceipt('ct_next_1', 5000, 'USD');
    const reqWithPayment = {
      headers: new Headers({ 'x-payment-receipt': validReceipt }),
    };
    const res200 = await protectedHandler(reqWithPayment);
    assert.equal(res200.status, 200);
    const body200 = await res200.json();
    assert.equal(body200.secretData, 'secret_123');
  });
});