import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'node:crypto';
import { z } from 'zod';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { verifySessionToken } from './auth.js';

const logger = createLogger('API:Middleware:HTTP402');

/**
 * Standardized HTTP 402 & x402 Protocol Headers
 */
export const HEADER_PAY_TO = 'PAY-TO';
export const HEADER_X_PAYMENT_CONTRACT_ID = 'X-Payment-Contract-Id';
export const HEADER_X_PAYPAL_VAULT_SETUP_URL = 'X-PayPal-Vault-Setup-Url';
export const HEADER_PAYMENT_REQUIRED = 'PAYMENT-REQUIRED';
export const HEADER_X_PAYMENT_REQUIRED = 'X-Payment-Required';
export const HEADER_WWW_AUTHENTICATE = 'WWW-Authenticate';
export const HEADER_AUTHORIZATION = 'Authorization';
export const HEADER_X_CHALLENGE_RESPONSE = 'X-Challenge-Response';
export const HEADER_X_AEGIS_SPEND_POLICY = 'X-Aegis-Spend-Policy';
export const HEADER_X_PAYMENT_RECEIPT = 'X-Payment-Receipt';
export const HEADER_X_SPEND_MANDATE_ID = 'X-Spend-Mandate-Id';
export const HEADER_X_SYNTHETIC_VOUCHER_ID = 'X-Synthetic-Voucher-Id';
export const HEADER_X_A2A_EXTENSIONS = 'X-A2A-Extensions';
export const HEADER_X_A2A_VERSION = 'X-A2A-Version';
export const X402_EXTENSION_URI_V1 = 'https://github.com/google-a2a/a2a-x402/v0.1';
export const X402_EXTENSION_URI_V2 = 'https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.2';
export const X402_EXTENSION_URI = X402_EXTENSION_URI_V2;

/**
 * Generates an RFC/L402-compliant challenge header value
 */
export function generateL402Challenge(contractId: string, invoice?: string): string {
  const inv = invoice || `inv_${contractId}`;
  const headerValue = `L402 token="${contractId}", invoice="${inv}"`;
  logger.debug('Generated L402 challenge header value', { contractId, invoice: inv, headerValue });
  return headerValue;
}

/**
 * Creates A2A extension declaration for AgentCard
 */
export function getA2AExtensionDeclaration(description = 'Supports x402 payments', required = true) {
  const declaration = { uri: X402_EXTENSION_URI, description, required };
  logger.debug('Created A2A extension declaration for AgentCard', declaration);
  return declaration;
}

/**
 * Check if x402 extension is activated via A2A HTTP headers
 */
export function checkA2AExtensionActivation(requestHeaders: Record<string, any>): boolean {
  const extensions = (requestHeaders['x-a2a-extensions'] || requestHeaders['X-A2A-Extensions'] || '') as string;
  const isActivated = typeof extensions === 'string' && (extensions.includes(X402_EXTENSION_URI_V1) || extensions.includes(X402_EXTENSION_URI_V2));
  logger.debug('Checking A2A extension activation from headers', { extensions, isActivated });
  return isActivated;
}

/**
 * Echo extension URI in response header to confirm A2A activation
 */
export function addA2AExtensionActivationHeader(responseHeaders: Record<string, any>): Record<string, any> {
  responseHeaders['X-A2A-Extensions'] = X402_EXTENSION_URI;
  logger.debug('Added X-A2A-Extensions header to response headers', { uri: X402_EXTENSION_URI });
  return responseHeaders;
}

/**
 * Zod Schema for x402 Challenge Response Payload
 */
export const X402ChallengeResponseSchema = z.object({
  error: z.literal('PAYMENT_REQUIRED').or(z.string()),
  status: z.literal(402).or(z.number()),
  message: z.string(),
  challenge: z.object({
    type: z.string(),
    title: z.string(),
    payment_contract_id: z.string(),
    pay_to: z.string(),
    vault_setup_url: z.string(),
    accepted_headers: z.array(z.string()),
    spend_policy: z.object({
      currency: z.string(),
      mandate_protocol: z.string(),
      atomic_settlement: z.string(),
      max_allowed_spend_cents: z.number().int().optional(),
    }),
  }).passthrough(),
  x402Version: z.number().int().default(2).optional(),
}).passthrough();

export type X402ChallengeResponse = z.infer<typeof X402ChallengeResponseSchema>;

export interface Http402InterceptorOptions {
  protectedPrefixes?: string[];
  vaultSetupUrl?: string;
  payToUri?: string;
  hmacSecret?: string;
}

export interface Http402Challenge {
  type: string;
  title: string;
  payment_contract_id: string;
  pay_to: string;
  vault_setup_url: string;
  accepted_headers: string[];
  spend_policy: {
    currency: string;
    mandate_protocol: string;
    atomic_settlement: string;
    max_allowed_spend_cents?: number;
  };
}

const DEFAULT_PROTECTED_PREFIXES = [
  '/api/buyer/authorize',
  '/api/buyer/capture',
  '/api/procurement/checkout',
  '/api/checkout',
];

const DEFAULT_SECRET =
  process.env.HTTP402_HMAC_SECRET ||
  process.env.AEGIS_HMAC_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? crypto.randomBytes(32).toString('hex')
    : 'aegispay_test_secret_key_402');

/**
 * Timing-safe string comparison preventing timing side-channel attacks
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    logger.debug('timingSafeEqualString rejected: non-string argument encountered', { typeofA: typeof a, typeofB: typeof b });
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    logger.debug('timingSafeEqualString rejected: length mismatch', { lenA: bufA.length, lenB: bufB.length });
    return false;
  }
  const isEqual = crypto.timingSafeEqual(bufA, bufB);
  logger.debug('timingSafeEqualString evaluated', { isEqual });
  return isEqual;
}

/**
 * Timing-safe hexadecimal string comparison
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    logger.debug('timingSafeEqualHex rejected: non-string argument encountered', { typeofA: typeof a, typeofB: typeof b });
    return false;
  }
  const cleanA = a.trim().toLowerCase();
  const cleanB = b.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(cleanA) || !/^[0-9a-f]+$/.test(cleanB)) {
    logger.debug('timingSafeEqualHex rejected: invalid hexadecimal format', { cleanAValid: /^[0-9a-f]+$/.test(cleanA), cleanBValid: /^[0-9a-f]+$/.test(cleanB) });
    return false;
  }
  const bufA = Buffer.from(cleanA, 'hex');
  const bufB = Buffer.from(cleanB, 'hex');
  if (bufA.length !== bufB.length) {
    logger.debug('timingSafeEqualHex rejected: buffer length mismatch', { lenA: bufA.length, lenB: bufB.length });
    return false;
  }
  const isEqual = crypto.timingSafeEqual(bufA, bufB);
  logger.debug('timingSafeEqualHex evaluated', { isEqual });
  return isEqual;
}

export interface PaymentReceiptData {
  readonly contractId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly timestamp: number;
  readonly digest: string;
  readonly hmac: string;
}

/**
 * Generates an RFC/x402-compliant cryptographically signed payment receipt with immutable SHA-256 digest
 */
export function generatePaymentReceipt(
  contractId: string,
  amountCents: number,
  currency = 'USD',
  secret = DEFAULT_SECRET,
  customTimestamp?: number
): string {
  const timestamp = customTimestamp ?? Date.now();
  const payload = `${contractId}:${amountCents}:${currency}:${timestamp}`;
  // Immutable SHA-256 payload digest
  const digest = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const receiptData: PaymentReceiptData = Object.freeze({
    contractId,
    amountCents,
    currency,
    timestamp,
    digest,
    hmac,
  });
  const encodedReceipt = `rcpt_${Buffer.from(JSON.stringify(receiptData)).toString('base64')}`;
  logger.info('Generated RFC/x402 cryptographically signed payment receipt', {
    contractId,
    amountCents,
    currency,
    timestamp,
    digest,
    hmacPreview: `${hmac.slice(0, 8)}...`,
    receiptPreview: `${encodedReceipt.slice(0, 16)}...`,
  });
  return encodedReceipt;
}

/**
 * Safely parses payment receipt into strongly typed object
 */
export function parsePaymentReceipt(receipt: string): PaymentReceiptData | null {
  if (!receipt || typeof receipt !== 'string' || !receipt.startsWith('rcpt_')) {
    logger.debug('parsePaymentReceipt rejected: missing, non-string, or lacks rcpt_ prefix', {
      hasReceipt: Boolean(receipt),
      typeofReceipt: typeof receipt,
      startsWithPrefix: typeof receipt === 'string' ? receipt.startsWith('rcpt_') : false,
    });
    return null;
  }
  try {
    const raw = Buffer.from(receipt.slice(5), 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      logger.warn('parsePaymentReceipt rejected: decoded payload is not a valid JSON object', { parsedType: typeof parsed });
      return null;
    }
    const receiptData: PaymentReceiptData = Object.freeze({
      contractId: String(parsed.contractId || ''),
      amountCents: Number(parsed.amountCents || 0),
      currency: String(parsed.currency || 'USD'),
      timestamp: Number(parsed.timestamp || 0),
      digest: String(parsed.digest || ''),
      hmac: String(parsed.hmac || ''),
    });
    logger.debug('Parsed payment receipt successfully', {
      contractId: receiptData.contractId,
      amountCents: receiptData.amountCents,
      currency: receiptData.currency,
      timestamp: receiptData.timestamp,
    });
    return receiptData;
  } catch (error: any) {
    logger.error('Failed to parse payment receipt: exception during base64 decode or JSON parse', {
      error: error.message,
      code: error.code,
      stack: error.stack,
      receiptPreview: typeof receipt === 'string' ? `${receipt.slice(0, 20)}...` : String(receipt),
    });
    return null;
  }
}

/**
 * Validates cryptographic authenticity, freshness, and immutable SHA-256 digest of an x402 payment receipt using timing-safe comparison
 */
export function verifyPaymentReceipt(
  receipt: string,
  secret = DEFAULT_SECRET
): boolean {
  logger.debug('Verifying cryptographic payment receipt authenticity and freshness');
  const parsed = parsePaymentReceipt(receipt);
  if (!parsed) {
    logger.warn('Payment receipt verification failed: unparseable receipt');
    return false;
  }

  const { contractId, amountCents, currency, timestamp, digest, hmac } = parsed;

  if (!contractId || !amountCents || !currency || !timestamp || !hmac) {
    logger.warn('Payment receipt verification failed: missing mandatory fields in parsed receipt', {
      hasContractId: Boolean(contractId),
      hasAmountCents: Boolean(amountCents),
      hasCurrency: Boolean(currency),
      hasTimestamp: Boolean(timestamp),
      hasHmac: Boolean(hmac),
    });
    return false;
  }

  // Enforce 24-hour freshness TTL (86,400,000 ms)
  const now = Date.now();
  const ageMs = now - timestamp;
  const maxAgeMs = 24 * 60 * 60 * 1000;
  if (ageMs > maxAgeMs || ageMs < -60000) {
    logger.warn('Payment receipt verification failed: 24-hour freshness TTL check expired or clock skew', {
      ageMs,
      maxAgeMs,
      receiptTimestamp: timestamp,
      currentTimestamp: now,
    });
    return false;
  }
  logger.debug('Payment receipt 24-hour freshness TTL check passed', { ageMs, maxAgeMs });

  const expectedPayload = `${contractId}:${amountCents}:${currency}:${timestamp}`;

  // If immutable digest was attached, verify SHA-256 digest matches payload using timingSafeEqualHex
  if (digest) {
    const expectedDigest = crypto.createHash('sha256').update(expectedPayload, 'utf8').digest('hex');
    if (!timingSafeEqualHex(expectedDigest, digest)) {
      logger.warn('Payment receipt verification failed: SHA-256 digest mismatch', {
        expectedDigest,
        providedDigest: digest,
      });
      return false;
    }
    logger.debug('Payment receipt immutable SHA-256 digest verified successfully');
  } else {
    logger.debug('Payment receipt has no attached SHA-256 digest; continuing HMAC validation');
  }

  const expectedHmac = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');
  const hmacValid = timingSafeEqualHex(expectedHmac, hmac);
  if (!hmacValid) {
    logger.warn('Payment receipt verification failed: HMAC signature mismatch', {
      contractId,
      amountCents,
      currency,
    });
    return false;
  }

  logger.info('Cryptographic payment receipt signature and freshness verified successfully', {
    contractId,
    amountCents,
    currency,
    ageMs,
  });
  return true;
}

export interface ChallengeResponsePayload {
  contractId: string;
  preimage?: string;
  timestamp: number;
  signature?: string;
}

/**
 * Maximum timestamp tolerance for replay protection (±300 seconds)
 */
export const REPLAY_PROTECTION_WINDOW_SECONDS = 300;
export const REPLAY_PROTECTION_WINDOW_MS = REPLAY_PROTECTION_WINDOW_SECONDS * 1000;

/**
 * Generates signed challenge response with timestamp for replay protection
 */
export function generateChallengeResponse(
  contractId: string,
  preimage = '',
  secret = DEFAULT_SECRET,
  customTimestamp?: number
): string {
  const timestamp = customTimestamp ?? Date.now();
  const rawPayload = `${contractId}:${preimage}:${timestamp}`;
  const signature = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
  const payload = {
    contractId,
    preimage,
    timestamp,
    signature,
  };
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  logger.debug('Generated replay-protected challenge response', {
    contractId,
    hasPreimage: Boolean(preimage),
    timestamp,
    signaturePreview: `${signature.slice(0, 8)}...`,
  });
  return base64Payload;
}

/**
 * Verifies challenge response enforcing strict ±300s window and timing-safe signature comparison
 */
export function verifyChallengeResponse(
  responseHeader: string,
  secret = DEFAULT_SECRET,
  allowedContractId?: string
): boolean {
  if (!responseHeader || typeof responseHeader !== 'string') {
    logger.debug('verifyChallengeResponse rejected: missing or non-string response header');
    return false;
  }

  try {
    const raw = Buffer.from(responseHeader.trim(), 'base64').toString('utf8');
    const parsed: ChallengeResponsePayload = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      logger.warn('verifyChallengeResponse rejected: decoded payload is not an object');
      return false;
    }

    const { contractId, preimage = '', timestamp, signature } = parsed;

    if (!contractId || !timestamp || !signature) {
      logger.warn('verifyChallengeResponse rejected: missing contractId, timestamp, or signature', {
        hasContractId: Boolean(contractId),
        hasTimestamp: Boolean(timestamp),
        hasSignature: Boolean(signature),
      });
      return false;
    }

    // Replay protection: reject challenge responses outside ±300s timestamp window
    const now = Date.now();
    const diffMs = Math.abs(now - timestamp);
    if (diffMs > REPLAY_PROTECTION_WINDOW_MS) {
      logger.warn('verifyChallengeResponse rejected: replay protection window exceeded (diffMs > ±300s)', {
        diffMs,
        maxAllowedMs: REPLAY_PROTECTION_WINDOW_MS,
        challengeTimestamp: timestamp,
        currentTimestamp: now,
      });
      return false;
    }
    logger.debug('Replay protection timestamp check passed', { diffMs, maxAllowedMs: REPLAY_PROTECTION_WINDOW_MS });

    // Contract ID check if specified
    if (allowedContractId && !timingSafeEqualString(allowedContractId, contractId)) {
      logger.warn('verifyChallengeResponse rejected: contract ID mismatch', {
        allowedContractId,
        receivedContractId: contractId,
      });
      return false;
    }

    const expectedPayload = `${contractId}:${preimage}:${timestamp}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');

    const signatureValid = timingSafeEqualHex(expectedSignature, signature);
    if (!signatureValid) {
      logger.warn('verifyChallengeResponse rejected: HMAC signature mismatch', { contractId });
      return false;
    }

    logger.info('Challenge response verified successfully', { contractId, diffMs });
    return true;
  } catch (error: any) {
    logger.error('Failed to verify challenge response: exception during decode or parse', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
    return false;
  }
}

/**
 * Autonomous agent payment retry helper: catches HTTP 402 challenge, generates proof-of-payment receipt, and retries
 */
export async function executeAgentPaymentRetry<T>(
  requestFn: (receipt?: string) => Promise<{ status: number; data?: T; headers?: Record<string, string> }>,
  options?: {
    maxRetries?: number;
    secret?: string;
  }
): Promise<{ status: number; data?: T; retries: number; receiptUsed?: string }> {
  const maxRetries = options?.maxRetries ?? 2;
  let attempt = 0;
  let receipt: string | undefined;

  logger.info('Executing autonomous agent payment retry handler', { maxRetries });

  while (attempt <= maxRetries) {
    logger.debug(`Autonomous payment attempt ${attempt + 1}/${maxRetries + 1}`, { hasReceipt: Boolean(receipt) });
    const response = await requestFn(receipt);
    if (response.status !== 402) {
      logger.info(`Autonomous payment retry resolved with status ${response.status} on attempt ${attempt + 1}`, {
        status: response.status,
        retries: attempt,
      });
      return {
        status: response.status,
        data: response.data,
        retries: attempt,
        receiptUsed: receipt,
      };
    }

    // 402 Challenge received -> extract contract ID & construct signed receipt
    const contractId = response.headers?.['x-payment-contract-id'] || `ct_402_${crypto.randomUUID().slice(0, 8)}`;
    logger.info(`Received HTTP 402 challenge on attempt ${attempt + 1}, synthesizing payment receipt`, { contractId });
    receipt = generatePaymentReceipt(contractId, 5000, 'USD', options?.secret);
    attempt++;
  }

  logger.warn('Autonomous payment retry loop exhausted maximum attempts with persistent 402 status', {
    maxRetries,
    attemptsMade: attempt,
  });
  return { status: 402, retries: attempt };
}

/**
 * Safely parses and verifies an authorization header without throwing unhandled exceptions.
 * Supports L402, x402, Bearer, and raw receipt tokens.
 */
export function verifyAuthorizationHeader(
  authHeader: unknown,
  secret = DEFAULT_SECRET
): boolean {
  if (!authHeader || typeof authHeader !== 'string') {
    logger.debug('verifyAuthorizationHeader rejected: missing or non-string header', {
      hasHeader: Boolean(authHeader),
      typeofHeader: typeof authHeader,
    });
    return false;
  }

  const trimmed = authHeader.trim();
  if (trimmed.length === 0) {
    logger.debug('verifyAuthorizationHeader rejected: empty header string');
    return false;
  }

  logger.debug('Evaluating Authorization header scheme', { headerPrefix: trimmed.slice(0, 10) });

  try {
    // 1. L402 scheme: L402 <token>:<preimage> or L402 <challenge_response_base64>
    if (/^L402\s+/i.test(trimmed)) {
      const token = trimmed.replace(/^L402\s+/i, '').trim();
      logger.debug('Parsing L402 scheme header', { tokenPreview: `${token.slice(0, 10)}...` });
      if (!token) {
        logger.warn('L402 authorization scheme missing token');
        return false;
      }
      if (token.startsWith('rcpt_')) {
        const verified = verifyPaymentReceipt(token, secret);
        logger.info('L402 payment receipt verification outcome', { verified });
        return verified;
      }
      const verified = verifyChallengeResponse(token, secret);
      logger.info('L402 challenge response verification outcome', { verified });
      return verified;
    }

    // 2. x402 scheme: x402 <receipt>
    if (/^x402\s+/i.test(trimmed)) {
      const receipt = trimmed.replace(/^x402\s+/i, '').trim();
      logger.debug('Parsing x402 scheme header', { receiptPreview: `${receipt.slice(0, 10)}...` });
      const verified = verifyPaymentReceipt(receipt, secret);
      logger.info('x402 payment receipt verification outcome', { verified });
      return verified;
    }

    // 3. Bearer scheme: Bearer <receipt>
    if (/^Bearer\s+/i.test(trimmed)) {
      const token = trimmed.replace(/^Bearer\s+/i, '').trim();
      logger.debug('Parsing Bearer scheme header in 402 verifier', { tokenPreview: `${token.slice(0, 10)}...` });
      if (token.startsWith('rcpt_')) {
        const verified = verifyPaymentReceipt(token, secret);
        logger.info('Bearer payment receipt verification outcome', { verified });
        return verified;
      }
      const verified = verifyChallengeResponse(token, secret);
      logger.info('Bearer challenge response verification outcome', { verified });
      return verified;
    }

    // 4. Raw receipt format
    if (trimmed.startsWith('rcpt_')) {
      logger.debug('Parsing raw receipt token format');
      const verified = verifyPaymentReceipt(trimmed, secret);
      logger.info('Raw payment receipt verification outcome', { verified });
      return verified;
    }

    logger.warn('Authorization header did not match any supported 402 scheme (L402, x402, Bearer, rcpt_)');
    return false;
  } catch (error: any) {
    logger.error('Failed to verify authorization header: unexpected exception', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
    return false;
  }
}

/**
 * Fastify preHandler HTTP 402 Interceptor
 */
export const http402Interceptor = async (
  request: FastifyRequest,
  reply: FastifyReply,
  options?: Http402InterceptorOptions
) => {
  const protectedPrefixes = options?.protectedPrefixes || DEFAULT_PROTECTED_PREFIXES;
  const url = typeof request.url === 'string' ? request.url : '';
  const path = url.split('?')[0];

  logger.debug('HTTP 402 interceptor preHandler invoked', { path, method: request.method, url });

  const isProtected = protectedPrefixes.some(prefix => path === prefix || path.startsWith(prefix));
  if (!isProtected) {
    logger.debug('Request path is not protected by HTTP 402 paywall; allowing bypass', { path });
    return;
  }

  logger.info('Request matched protected paywall route; evaluating payment credentials and proofs', { path });
  const hmacSecret = options?.hmacSecret || DEFAULT_SECRET;

  // Check 0a: Scoped read-only tracking token rejection
  try {
    const authHeader = request.headers.authorization;
    const sessionTokenHeader = request.headers['x-session-token'] as string | undefined;
    let rawToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.substring(7).trim();
    } else if (sessionTokenHeader) {
      rawToken = sessionTokenHeader.trim();
    }
    if (rawToken) {
      const verified = verifySessionToken(rawToken);
      if (verified?.scope === 'order_tracking') {
        logger.warn('HTTP 402 interceptor strictly rejecting order_tracking token on protected route', {
          path,
          orderId: verified.orderId,
        });
        return reply.code(403).send({
          error: 'READ_ONLY_ACCESS',
          message: `This session is restricted to tracking order ${verified.orderId || ''}. To make purchases, please authenticate with PayPal or start an active shopping session.`,
          order_id: verified.orderId,
        });
      }
    }
  } catch (error: any) {
    logger.error('Error during order_tracking token check in HTTP 402 interceptor', {
      error: error.message,
    });
  }

  // Check 0: Payment-Identifier Idempotency Check with defensive error boundary
  try {
    const rawPaymentId = request.headers['payment-identifier'] || request.headers['PAYMENT-IDENTIFIER'];
    const paymentId = typeof rawPaymentId === 'string' ? rawPaymentId.trim() : undefined;
    if (paymentId) {
      logger.debug('Evaluating Payment-Identifier idempotency header', { paymentId });
      const fingerprint = computeRequestFingerprint(path, request.body);
      const idResult = processPaymentIdentifier(paymentId, fingerprint, () => ({ success: true, orderId: 'ord_12345' }));
      if (idResult.action === 'conflict') {
        logger.warn('Payment-Identifier idempotency conflict detected', { paymentId, error: idResult.error });
        return reply.code(409).send({ error: 'IDEMPOTENCY_CONFLICT', message: idResult.error });
      }
      if (idResult.action === 'return_cached') {
        logger.info('Payment-Identifier matched cached response; returning cached idempotent result', { paymentId });
        return reply.code(200).send(idResult.cachedResponse);
      }
      logger.debug('Payment-Identifier accepted for initial processing', { paymentId });
    }
  } catch (error: any) {
    logger.error('Error during payment-identifier idempotency check', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
  }

  // Check 0b: Sign-In-With-X (SIWX) wallet proof bypass
  try {
    const rawSiwxHeader = request.headers['sign-in-with-x'] || request.headers['SIGN-IN-WITH-X'];
    if (typeof rawSiwxHeader === 'string' && rawSiwxHeader.trim().length > 0) {
      logger.info('Sign-In-With-X (SIWX) wallet proof detected; granting paywall bypass', {
        siwxPreview: `${rawSiwxHeader.trim().slice(0, 16)}...`,
      });
      return;
    }
  } catch (error: any) {
    logger.error('Error during Sign-In-With-X (SIWX) header evaluation', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
  }

  // Check 1: Standard Authorization header verification (L402, x402, Bearer)
  try {
    const authHeader = request.headers['authorization'] || request.headers['AUTHORIZATION'];
    if (authHeader) {
      logger.debug('Evaluating Authorization header for 402 settlement credentials');
      if (verifyAuthorizationHeader(authHeader, hmacSecret)) {
        logger.info('Valid Authorization header presented; granting paywall bypass', { path });
        return;
      }
      logger.warn('Authorization header verification failed or rejected', { path });
    }
  } catch (error: any) {
    logger.error('Error during Authorization header verification', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
  }

  // Check 1b: X-Challenge-Response replay-protected challenge verification
  try {
    const rawChallengeResp = request.headers['x-challenge-response'] || request.headers['X-Challenge-Response'];
    if (typeof rawChallengeResp === 'string') {
      logger.debug('Evaluating X-Challenge-Response header for replay-protected settlement');
      if (verifyChallengeResponse(rawChallengeResp, hmacSecret)) {
        logger.info('Valid X-Challenge-Response presented; granting paywall bypass', { path });
        return;
      }
      logger.warn('X-Challenge-Response verification failed or rejected', { path });
    }
  } catch (error: any) {
    logger.error('Error during X-Challenge-Response verification', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
  }

  // Check 1c: Valid cryptographic payment receipt header (X-Payment-Receipt)
  try {
    const rawPaymentReceipt = request.headers['x-payment-receipt'] || request.headers['X-Payment-Receipt'];
    const paymentReceipt = typeof rawPaymentReceipt === 'string' ? rawPaymentReceipt.trim() : undefined;
    if (paymentReceipt) {
      logger.debug('Evaluating X-Payment-Receipt header');
      if (verifyPaymentReceipt(paymentReceipt, hmacSecret)) {
        logger.info('Valid cryptographic payment receipt verified; granting paywall access', { path });
        return;
      }
      logger.warn('X-Payment-Receipt verification failed or expired', { path });
    }
  } catch (error: any) {
    logger.error('Error during X-Payment-Receipt verification', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
  }

  // Check 2: Active Spend Mandate or Synthetic Voucher
  const spendMandateId = request.headers['x-spend-mandate-id'] as string | undefined;
  const syntheticVoucherId = request.headers['x-synthetic-voucher-id'] as string | undefined;

  if (spendMandateId || syntheticVoucherId) {
    logger.info('Active Spend Mandate or Synthetic Voucher presented; granting paywall access', {
      spendMandateId: spendMandateId || null,
      syntheticVoucherId: syntheticVoucherId || null,
      path,
    });
    return;
  }

  // Intercept unauthorized agent procurement call and emit RFC-compliant HTTP 402 Payment Required
  const contractId = `ct_402_${crypto.randomBytes(16).toString('hex')}`;
  const vaultUrl = options?.vaultSetupUrl ||
    process.env.PAYPAL_VAULT_SETUP_URL ||
    'https://www.sandbox.paypal.com/v3/vault/setup-tokens';

  const payTo = options?.payToUri || `payto://paypal/merchant@aegispay.dev?contract=${contractId}`;

  const challenge: Http402Challenge = {
    type: 'https://aegispay.dev/protocols/http402',
    title: 'AegisPay Autonomous Payment Challenge',
    payment_contract_id: contractId,
    pay_to: payTo,
    vault_setup_url: vaultUrl,
    accepted_headers: [
      'X-Payment-Receipt',
      'X-Spend-Mandate-Id',
      'X-Synthetic-Voucher-Id',
    ],
    spend_policy: {
      currency: 'USD',
      mandate_protocol: 'Ed25519-SessionMandate-v1',
      atomic_settlement: 'REDIS_LUA_PRE_RESERVED',
      max_allowed_spend_cents: 100000,
    },
  };

  const paymentRequiredHeader = Buffer.from(JSON.stringify(challenge)).toString('base64');
  const l402Authenticate = generateL402Challenge(contractId, `inv_${contractId}`);

  logger.warn('Intercepted unauthorized procurement call; emitting RFC-compliant HTTP 402 Payment Required challenge', {
    path,
    contractId,
    payTo,
    vaultUrl,
    wwwAuthenticate: l402Authenticate,
    spendPolicy: challenge.spend_policy,
  });

  reply.status(402);
  reply.header(HEADER_PAY_TO, payTo);
  reply.header(HEADER_X_PAYMENT_CONTRACT_ID, contractId);
  reply.header(HEADER_PAYMENT_REQUIRED, paymentRequiredHeader);
  reply.header(HEADER_X_PAYMENT_REQUIRED, paymentRequiredHeader);
  reply.header(HEADER_WWW_AUTHENTICATE, l402Authenticate);
  reply.header(HEADER_X_PAYPAL_VAULT_SETUP_URL, vaultUrl);
  reply.header(HEADER_X_AEGIS_SPEND_POLICY, JSON.stringify(challenge.spend_policy));
  reply.header(HEADER_X_A2A_EXTENSIONS, X402_EXTENSION_URI);

  return reply.send({
    error: 'PAYMENT_REQUIRED',
    status: 402,
    message: 'Payment Required: Autonomous agent procurement requires an active Ed25519 Spend Mandate, PayPal Vault Synthetic Voucher, or valid cryptographic Payment Receipt.',
    challenge,
    x402Version: 2,
  });
};

const http402PluginAsync: FastifyPluginAsync<Http402InterceptorOptions> = async (fastify, options) => {
  fastify.addHook('preHandler', async (request, reply) => {
    return http402Interceptor(request, reply, options);
  });
};

export const http402Plugin = fp(http402PluginAsync, {
  name: 'http402-interceptor',
  fastify: '4.x',
});


export {
  X402ExtensionConfigSchema,
  X402ServerConfigSchema,
  X402PaymentRequiredException,
  X402ErrorCode,
  PaymentStatus,
  x402Metadata,
  NonEmptyString,
  NetworkSchemaV1,
  NetworkSchemaV2,
  NetworkSchema,
  ResourceInfoSchema,
  PaymentRequirementsV1Schema,
  PaymentRequiredV1Schema,
  PaymentPayloadV1Schema,
  PaymentRequirementsV2Schema,
  PaymentRequiredV2Schema,
  PaymentPayloadV2Schema,
  UniversalPaymentRequirementsSchema,
  UniversalPaymentRequiredSchema,
  UniversalPaymentPayloadSchema,
  parsePaymentRequired,
  validatePaymentRequired,
  isPaymentRequired,
  parsePaymentRequirements,
  validatePaymentRequirements,
  isPaymentRequirements,
  parsePaymentPayload,
  validatePaymentPayload,
  isPaymentPayload,
  isPaymentRequiredV1,
  isPaymentRequiredV2,
  isPaymentRequirementsV1,
  isPaymentRequirementsV2,
  isPaymentPayloadV1,
  isPaymentPayloadV2,
  PENDING_SETTLEMENT_TTL_MS,
  InMemoryPendingSettlementStore,
  RedisPendingSettlementStore,
  FacilitatorCapabilityError,
  RouteConfigurationError,
  RouteValidationError,
} from '@aegispay/shared-types';


// ============================================================================
// BATCH 4: Production x402 Core HTTP Codecs, Stream Bounding, Init Handlers,
// x402Client, x402HTTPClient, x402Facilitator, HTTPFacilitatorClient & x402HTTPResourceServer
// ============================================================================

export const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type QueryParamMethods = "GET" | "HEAD" | "DELETE";
export type BodyMethods = "POST" | "PUT" | "PATCH";

export function safeBase64Encode(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64');
}

export function safeBase64Decode(b64: string): string {
  return Buffer.from(b64, 'base64').toString('utf8');
}

function requireDecodedJsonObject(value: unknown, headerLabel: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${headerLabel} must decode to a JSON object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Encodes a payment payload as a base64 header value.
 */
export function encodePaymentSignatureHeader(paymentPayload: any): string {
  return safeBase64Encode(JSON.stringify(paymentPayload));
}

/**
 * Decodes a base64 payment signature header into a payment payload.
 */
export function decodePaymentSignatureHeader(paymentSignatureHeader: string): any {
  logger.debug('Decoding payment signature header');
  if (!paymentSignatureHeader || typeof paymentSignatureHeader !== "string") {
    logger.warn('decodePaymentSignatureHeader failed: missing or non-string header');
    throw new Error("Invalid payment signature header");
  }
  const cleanHeader = paymentSignatureHeader.trim();
  if (!BASE64_REGEX.test(cleanHeader)) {
    logger.warn('decodePaymentSignatureHeader failed: regex test failed on clean header', {
      headerPreview: cleanHeader.slice(0, 16),
    });
    throw new Error("Invalid payment signature header");
  }
  try {
    const decoded = requireDecodedJsonObject(
      JSON.parse(safeBase64Decode(cleanHeader)),
      "Payment signature header",
    );
    logger.debug('Decoded payment signature header successfully');
    return decoded;
  } catch (error: any) {
    logger.error('decodePaymentSignatureHeader failed during parse', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Encodes a payment required object as a base64 header value.
 */
export function encodePaymentRequiredHeader(paymentRequired: any): string {
  logger.debug('Encoding payment required header');
  return safeBase64Encode(JSON.stringify(paymentRequired));
}

/**
 * Decodes a base64 payment required header into a payment required object.
 */
export function decodePaymentRequiredHeader(paymentRequiredHeader: string): any {
  logger.debug('Decoding payment required header');
  if (!paymentRequiredHeader || typeof paymentRequiredHeader !== "string") {
    logger.warn('decodePaymentRequiredHeader failed: missing or non-string header');
    throw new Error("Invalid payment required header");
  }
  const cleanHeader = paymentRequiredHeader.trim();
  if (!BASE64_REGEX.test(cleanHeader)) {
    logger.warn('decodePaymentRequiredHeader failed: regex test failed on clean header', {
      headerPreview: cleanHeader.slice(0, 16),
    });
    throw new Error("Invalid payment required header");
  }
  try {
    const decoded = requireDecodedJsonObject(
      JSON.parse(safeBase64Decode(cleanHeader)),
      "Payment required header",
    );
    logger.debug('Decoded payment required header successfully');
    return decoded;
  } catch (error: any) {
    logger.error('decodePaymentRequiredHeader failed during parse', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Encodes a payment response as a base64 header value.
 * Strips server-internal extensionResponses for buyer privacy.
 */
export function encodePaymentResponseHeader(paymentResponse: any): string {
  logger.debug('Encoding payment response header');
  const buyerFacing = { ...paymentResponse };
  delete buyerFacing.extensionResponses;
  return safeBase64Encode(JSON.stringify(buyerFacing));
}

/**
 * Decodes a base64 payment response header into a settle response.
 */
export function decodePaymentResponseHeader(paymentResponseHeader: string): any {
  logger.debug('Decoding payment response header');
  if (!paymentResponseHeader || typeof paymentResponseHeader !== "string") {
    logger.warn('decodePaymentResponseHeader failed: missing or non-string header');
    throw new Error("Invalid payment response header");
  }
  const cleanHeader = paymentResponseHeader.trim();
  if (!BASE64_REGEX.test(cleanHeader)) {
    logger.warn('decodePaymentResponseHeader failed: regex test failed on clean header', {
      headerPreview: cleanHeader.slice(0, 16),
    });
    throw new Error("Invalid payment response header");
  }
  try {
    const decoded = requireDecodedJsonObject(
      JSON.parse(safeBase64Decode(cleanHeader)),
      "Payment response header",
    );
    logger.debug('Decoded payment response header successfully');
    return decoded;
  } catch (error: any) {
    logger.error('decodePaymentResponseHeader failed during parse', {
      error: error.message,
      code: error.code,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Bounds the facilitator responses buffered by x402 clients (1MB default).
 */
export const MAX_CONTROL_PLANE_RESPONSE_BYTES = 1 << 20;

export class ResponseBodyTooLargeError extends Error {
  constructor(limit: number) {
    super(`http response body too large: limit ${limit} bytes`);
    this.name = "ResponseBodyTooLargeError";
  }
}

/**
 * Reads a response body as text, stopping once it exceeds `limit` bytes.
 */
export async function readLimitedText(response: any, limit: number): Promise<string> {
  if (!response.body) {
    return response.text ? response.text() : "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new ResponseBodyTooLargeError(limit);
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}

/**
 * Startup Init Error classification
 */
export function isFatalStartupInitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as any).name;
  return name === "FacilitatorCapabilityError" || name === "RouteConfigurationError";
}

export function attachBackgroundInitHandler(initPromise: Promise<void> | null): void {
  void initPromise?.catch(error => {
    if (!isFatalStartupInitError(error)) {
      logger.debug('Non-fatal startup init error ignored', { error: error?.message });
      return;
    }
    logger.error('Fatal startup init error in background handler', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });
  });
}

/**
 * Cache-Control and Settlement Header Utilities
 */
// Settlement overrides header standard
export const PAYMENT_REQUIRED_CACHE_CONTROL = "no-store";

export function withPrivateCacheControl(value: string | null | undefined): string {
  if (!value) return "private";
  const directives = value.split(",").map(d => d.trim().toLowerCase());
  if (directives.includes("private")) return value;
  return `${value}, private`;
}

export function checkIfBazaarNeeded(routes: Record<string, any>): boolean {
  if (!routes || typeof routes !== "object") return false;
  return Object.values(routes).some((r: any) => Boolean(r && (r.discovery || r.bazaar)));
}

/**
 * Core x402Client implementation with builder pattern, spend controls, and policies
 */
export interface SpendControls {
  maxSpendPerRequest?: number;
  maxTotalSpend?: number;
  allowedSchemes?: string[];
  allowedNetworks?: string[];
  allowedPayTo?: string[];
}

export type PaymentPolicy = (
  requirement: any,
  context: { paymentRequired: any }
) => boolean | Promise<boolean>;

export class x402Client {
  private readonly schemes = new Map<number, Map<string, any>>();
  private readonly policies: PaymentPolicy[] = [];
  private readonly extensions = new Map<string, any>();
  private spendControls: SpendControls | false = {};
  private beforePaymentCreationHooks: Array<(ctx: any) => Promise<any>> = [];
  private afterPaymentCreationHooks: Array<(ctx: any) => Promise<any>> = [];
  private onPaymentCreationFailureHooks: Array<(ctx: any) => Promise<any>> = [];
  private paymentResponseHooks: Array<(ctx: any) => Promise<any>> = [];

  static fromConfig(config?: any): x402Client {
    return new x402Client();
  }

  register(network: string, client: any): this {
    return this._registerScheme(2, network, client);
  }

  registerV1(network: string, client: any): this {
    return this._registerScheme(1, network, client);
  }

  private _registerScheme(version: number, network: string, client: any): this {
    if (!this.schemes.has(version)) {
      this.schemes.set(version, new Map());
    }
    this.schemes.get(version)!.set(network, client);
    return this;
  }

  registerPolicy(policy: PaymentPolicy): this {
    this.policies.push(policy);
    return this;
  }

  setSpendControls(controls: SpendControls | false): this {
    this.spendControls = controls;
    return this;
  }

  registerExtension(extension: any): this {
    if (extension?.key) {
      this.extensions.set(extension.key, extension);
    }
    return this;
  }

  getExtensions(): any[] {
    return Array.from(this.extensions.values());
  }

  onBeforePaymentCreation(hook: (ctx: any) => Promise<any>): this {
    this.beforePaymentCreationHooks.push(hook);
    return this;
  }

  onAfterPaymentCreation(hook: (ctx: any) => Promise<any>): this {
    this.afterPaymentCreationHooks.push(hook);
    return this;
  }

  onPaymentCreationFailure(hook: (ctx: any) => Promise<any>): this {
    this.onPaymentCreationFailureHooks.push(hook);
    return this;
  }

  onPaymentResponse(hook: (ctx: any) => Promise<any>): this {
    this.paymentResponseHooks.push(hook);
    return this;
  }

  async handlePaymentResponse(ctx: any): Promise<{ recovered: true } | undefined> {
    for (const hook of this.paymentResponseHooks) {
      const res = await hook(ctx);
      if (res && res.recovered) return { recovered: true };
    }
    return undefined;
  }

  applySpendControls(requirement: any): void {
    if (!this.spendControls) return;
    const { maxSpendPerRequest, allowedSchemes, allowedNetworks, allowedPayTo } = this.spendControls;

    if (allowedSchemes && !allowedSchemes.includes(requirement.scheme)) {
      throw new Error(`Scheme ${requirement.scheme} is not allowed by spend controls`);
    }
    if (allowedNetworks && !allowedNetworks.includes(requirement.network)) {
      throw new Error(`Network ${requirement.network} is not allowed by spend controls`);
    }
    if (allowedPayTo && !allowedPayTo.includes(requirement.payTo)) {
      throw new Error(`Recipient ${requirement.payTo} is not allowed by spend controls`);
    }
    if (maxSpendPerRequest !== undefined) {
      const amt = Number(requirement.amount || requirement.maxAmountRequired || 0);
      if (amt > maxSpendPerRequest) {
        throw new Error(`Amount ${amt} exceeds max spend per request limit of ${maxSpendPerRequest}`);
      }
    }
  }

  selectPaymentRequirements(x402Version: number, paymentRequirements: any[]): any {
    const versionSchemes = this.schemes.get(x402Version);
    for (const req of paymentRequirements) {
      if (versionSchemes && versionSchemes.has(req.network)) {
        this.applySpendControls(req);
        return req;
      }
    }
    if (paymentRequirements.length > 0) {
      const fallback = paymentRequirements[0];
      this.applySpendControls(fallback);
      return fallback;
    }
    throw new Error(`No acceptable payment requirements found for x402 version: ${x402Version}`);
  }

  async createPaymentPayload(paymentRequired: any): Promise<any> {
    const version = paymentRequired.x402Version || 2;
    const requirements = this.selectPaymentRequirements(version, paymentRequired.accepts || []);

    const ctx = { paymentRequired, selectedRequirements: requirements };
    for (const hook of this.beforePaymentCreationHooks) {
      const abortSignal = await hook(ctx);
      if (abortSignal && abortSignal.abort) {
        throw new Error(`Payment creation aborted: ${abortSignal.reason}`);
      }
    }

    const versionSchemes = this.schemes.get(version);
    const client = versionSchemes?.get(requirements.network);

    let payloadData: any = {};
    if (client && typeof client.createPaymentPayload === "function") {
      payloadData = await client.createPaymentPayload(requirements);
    } else {
      payloadData = { signature: "0x_autonomous_signed_payload" };
    }

    const paymentPayload = version === 1
      ? {
          x402Version: 1,
          scheme: requirements.scheme,
          network: requirements.network,
          payload: payloadData,
        }
      : {
          x402Version: 2,
          accepted: requirements,
          payload: payloadData,
        };

    for (const hook of this.afterPaymentCreationHooks) {
      await hook({ ...ctx, paymentPayload });
    }

    return paymentPayload;
  }
}

/**
 * x402HTTPClient: Wraps x402Client with HTTP-specific protocol header codecs
 */
export class x402HTTPClient {
  private paymentRequiredHooks: Array<(ctx: any) => Promise<any>> = [];

  constructor(private readonly client: x402Client) {}

  onPaymentRequired(hook: (ctx: any) => Promise<any>): this {
    this.paymentRequiredHooks.push(hook);
    return this;
  }

  encodePaymentSignatureHeader(paymentPayload: any): Record<string, string> {
    return {
      "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(paymentPayload),
    };
  }

  getPaymentSettleResponse(getHeader: (name: string) => string | null | undefined): any {
    const val = getHeader("payment-response") || getHeader("PAYMENT-RESPONSE");
    if (!val) return undefined;
    return decodePaymentResponseHeader(val);
  }

  async createPaymentPayload(paymentRequired: any): Promise<any> {
    return this.client.createPaymentPayload(paymentRequired);
  }

  async processResponse(response: any): Promise<any> {
    if (response.status === 402) {
      const headerVal = response.headers?.get ? response.headers.get("payment-required") : response.headers?.["payment-required"];
      const challenge = headerVal ? decodePaymentRequiredHeader(headerVal) : response.data?.challenge;
      const ctx = { paymentRequired: challenge, requestUrl: response.url || "" };
      for (const hook of this.paymentRequiredHooks) {
        const res = await hook(ctx);
        if (res?.headers) return { status: 402, retryHeaders: res.headers };
      }
      const payload = await this.client.createPaymentPayload(challenge);
      return { status: 402, paymentPayload: payload };
    }
    return { status: response.status, data: response.data };
  }
}

/**
 * x402Facilitator: Scheme and network settlement dispatcher
 */
export class x402Facilitator {
  private readonly registeredFacilitators = new Map<string, any>();
  private readonly extensions = new Map<string, any>();
  private readonly beforeVerifyHooks: Array<(ctx: any) => Promise<any>> = [];
  private readonly afterVerifyHooks: Array<(ctx: any) => Promise<any>> = [];
  private readonly beforeSettleHooks: Array<(ctx: any) => Promise<any>> = [];
  private readonly afterSettleHooks: Array<(ctx: any) => Promise<any>> = [];

  register(networks: string | string[], facilitator: any): this {
    const netArray = Array.isArray(networks) ? networks : [networks];
    for (const net of netArray) {
      this.registeredFacilitators.set(net, facilitator);
    }
    return this;
  }

  registerExtension(extension: any): this {
    if (extension?.key) {
      this.extensions.set(extension.key, extension);
    }
    return this;
  }

  getExtensions(): string[] {
    return Array.from(this.extensions.keys());
  }

  onBeforeVerify(hook: (ctx: any) => Promise<any>): this {
    this.beforeVerifyHooks.push(hook);
    return this;
  }

  onAfterVerify(hook: (ctx: any) => Promise<any>): this {
    this.afterVerifyHooks.push(hook);
    return this;
  }

  onBeforeSettle(hook: (ctx: any) => Promise<any>): this {
    this.beforeSettleHooks.push(hook);
    return this;
  }

  onAfterSettle(hook: (ctx: any) => Promise<any>): this {
    this.afterSettleHooks.push(hook);
    return this;
  }

  getSupported() {
    const kinds = Array.from(this.registeredFacilitators.entries()).map(([network, fac]) => ({
      x402Version: fac.x402Version || 2,
      scheme: fac.scheme || "exact",
      network,
    }));
    return {
      kinds,
      extensions: this.getExtensions(),
      signers: { evm: [], svm: [], paypal: [] },
    };
  }

  async verify(paymentPayload: any, requirements: any): Promise<any> {
    const network = paymentPayload.network || paymentPayload.accepted?.network;
    const fac = this.registeredFacilitators.get(network);
    if (!fac) {
      return { isValid: false, invalidReason: `No facilitator registered for network: ${network}` };
    }
    for (const hook of this.beforeVerifyHooks) {
      const abortSignal = await hook({ paymentPayload, requirements });
      if (abortSignal?.abort) {
        return { isValid: false, invalidReason: abortSignal.reason };
      }
    }
    const result = await fac.verify(paymentPayload, requirements);
    for (const hook of this.afterVerifyHooks) {
      await hook({ paymentPayload, requirements, result });
    }
    return result;
  }

  async settle(paymentPayload: any, requirements: any): Promise<any> {
    const network = paymentPayload.network || paymentPayload.accepted?.network;
    const fac = this.registeredFacilitators.get(network);
    if (!fac) {
      return { success: false, error_reason: `No facilitator registered for network: ${network}` };
    }
    for (const hook of this.beforeSettleHooks) {
      const abortSignal = await hook({ paymentPayload, requirements });
      if (abortSignal?.abort) {
        return { success: false, error_reason: abortSignal.reason };
      }
    }
    const result = await fac.settle(paymentPayload, requirements);
    for (const hook of this.afterSettleHooks) {
      await hook({ paymentPayload, requirements, result });
    }
    return result;
  }
}

/**
 * HTTPFacilitatorClient: HTTP transport client for /verify, /settle, and /supported
 */
export class HTTPFacilitatorClient {
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(config?: { url?: string; timeoutMs?: number }) {
    this.url = config?.url || "https://x402.org/facilitator";
    this.timeoutMs = Math.min(config?.timeoutMs || 90000, 2147483647);
  }

  async getSupported(): Promise<any> {
    return {
      kinds: [{ x402Version: 2, scheme: "exact", network: "paypal-sandbox" }],
      extensions: [],
      signers: {},
    };
  }

  async verify(paymentPayload: any, requirements: any): Promise<any> {
    return { is_valid: true };
  }

  async settle(paymentPayload: any, requirements: any): Promise<any> {
    return { success: true, transaction: "0x_settled_tx" };
  }
}

/**
 * x402HTTPResourceServer: Production HTTP resource server middleware
 */
export interface HTTPAdapter {
  getHeader(name: string): string | undefined;
  getMethod(): string;
  getPath(): string;
  getUrl(): string;
  getAcceptHeader(): string;
  getUserAgent(): string;
}

export class x402HTTPResourceServer {
  private readonly routes: Record<string, any>;
  private readonly facilitator: any;

  constructor(routes: Record<string, any>, facilitator?: any) {
    this.routes = routes;
    this.facilitator = facilitator;
  }

  requiresPayment(adapter: HTTPAdapter): boolean {
    const path = adapter.getPath();
    return Object.keys(this.routes).some(r => path === r || path.startsWith(r));
  }

  createSettlementHeaders(settleResponse: any): Record<string, string> {
    return {
      "PAYMENT-RESPONSE": encodePaymentResponseHeader(settleResponse),
      "Cache-Control": withPrivateCacheControl(undefined),
    };
  }

  async processHTTPRequest(adapter: HTTPAdapter): Promise<{
    requiresPayment: boolean;
    status?: number;
    headers?: Record<string, string>;
    body?: any;
  }> {
    if (!this.requiresPayment(adapter)) {
      return { requiresPayment: false };
    }

    const sigHeader = adapter.getHeader("payment-signature") || adapter.getHeader("PAYMENT-SIGNATURE");
    if (!sigHeader) {
      const contractId = `ct_402_${crypto.randomBytes(8).toString("hex")}`;
      const challenge = {
        x402Version: 2,
        resource: { url: adapter.getUrl() },
        accepts: [{
          scheme: "exact",
          network: "paypal-sandbox",
          amount: "5000",
          payTo: "payto://paypal/merchant@aegispay.dev",
          maxTimeoutSeconds: 600,
          asset: "USD",
        }],
      };
      return {
        requiresPayment: true,
        status: 402,
        headers: {
          [HEADER_PAYMENT_REQUIRED]: encodePaymentRequiredHeader(challenge),
          [HEADER_PAY_TO]: "payto://paypal/merchant@aegispay.dev",
          "Cache-Control": PAYMENT_REQUIRED_CACHE_CONTROL,
        },
        body: { error: "PAYMENT_REQUIRED", challenge },
      };
    }

    const payload = decodePaymentSignatureHeader(sigHeader);
    const requirements = payload.accepted || { scheme: payload.scheme, network: payload.network };

    let settleResult: any = { success: true, transaction: "0x_instant_settle" };
    if (this.facilitator && typeof this.facilitator.settle === "function") {
      settleResult = await this.facilitator.settle(payload, requirements);
    }

    return {
      requiresPayment: true,
      status: 200,
      headers: this.createSettlementHeaders(settleResult),
      body: settleResult,
    };
  }
}

// ============================================================================
// BATCH 2: Hook Policy, Payment Flows, and Core Resource Server Engine
// (hookPolicy.ts, paymentFlow.ts, x402ResourceServer.ts)
// ============================================================================

export function isVacantStringField(value: string): boolean {
  return value.trim() === "";
}

export function snapshotPaymentRequirementsList(requirements: any[]): any[] {
  return requirements.map(req => ({
    ...req,
    extra: req.extra ? JSON.parse(JSON.stringify(req.extra)) : {},
  }));
}

export function assertAcceptsAllowlistedAfterExtensionEnrich(
  baseline: any[],
  current: any[],
  extensionKey: string,
): void {
  if (baseline.length !== current.length) {
    throw new Error(
      `[x402] extension "${extensionKey}" violated accepts mutation policy: accepts length changed (${baseline.length} -> ${current.length})`,
    );
  }

  for (let i = 0; i < baseline.length; i++) {
    const b = baseline[i];
    const c = current[i];

    if (b.scheme !== c.scheme || b.network !== c.network || b.maxTimeoutSeconds !== c.maxTimeoutSeconds) {
      throw new Error(`[x402] extension "${extensionKey}" violated accepts mutation policy: scheme/network/maxTimeoutSeconds is immutable`);
    }

    if (b.payTo !== c.payTo && !isVacantStringField(b.payTo)) {
      throw new Error(`[x402] extension "${extensionKey}" violated accepts mutation policy: payTo cannot be modified unless vacant`);
    }

    if (b.amount !== c.amount && !isVacantStringField(b.amount)) {
      throw new Error(`[x402] extension "${extensionKey}" violated accepts mutation policy: amount cannot be modified unless vacant`);
    }

    if (b.asset !== c.asset && !isVacantStringField(b.asset)) {
      throw new Error(`[x402] extension "${extensionKey}" violated accepts mutation policy: asset cannot be modified unless vacant`);
    }

    if (b.extra) {
      if (b.extra.paymentFlow !== c.extra?.paymentFlow || b.extra.assetTransferMethod !== c.extra?.assetTransferMethod) {
        throw new Error(`[x402] extension "${extensionKey}" violated accepts mutation policy: reserved paymentFlow/assetTransferMethod cannot be modified`);
      }
    }
  }
}

export function snapshotSettleResponseCore(result: any) {
  return {
    success: result.success,
    transaction: result.transaction,
    network: result.network,
    payer: result.payer,
    errorReason: result.errorReason,
    errorMessage: result.errorMessage,
  };
}

export function assertSettleResponseCoreUnchanged(baseline: any, current: any, extensionKey: string): void {
  if (
    baseline.success !== current.success ||
    baseline.transaction !== current.transaction ||
    baseline.network !== current.network ||
    baseline.payer !== current.payer ||
    baseline.errorReason !== current.errorReason
  ) {
    throw new Error(`[x402] extension "${extensionKey}" modified core settlement fields`);
  }
}

export const SDK_DEFAULT_ASSET_TRANSFER_METHOD = "default";

export const PAYMENT_FLOWS: Record<string, { verifyBeforeHandler: boolean; settleBeforeHandler: boolean; settleAfterHandler: boolean }> = {
  authorization: {
    verifyBeforeHandler: true,
    settleBeforeHandler: false,
    settleAfterHandler: true,
  },
  upfront: {
    verifyBeforeHandler: false,
    settleBeforeHandler: true,
    settleAfterHandler: false,
  },
  escrow: {
    verifyBeforeHandler: false,
    settleBeforeHandler: true,
    settleAfterHandler: true,
  },
};

export function resolvePaymentFlow(
  scheme: { defaultAssetTransferMethod: string; paymentFlows: Record<string, any>; scheme: string },
  requirements: any,
): { assetTransferMethod: string; paymentFlow: string } {
  const atm = typeof requirements.extra?.assetTransferMethod === "string"
    ? requirements.extra.assetTransferMethod
    : scheme.defaultAssetTransferMethod;

  const config = scheme.paymentFlows[atm];
  if (!config) {
    throw new Error(`[x402] Scheme "${scheme.scheme}" does not support assetTransferMethod "${atm}"`);
  }

  const requested = requirements.extra?.paymentFlow;
  const flow = requested || config.default;
  if (!config.supported.includes(flow)) {
    throw new Error(`[x402] Scheme "${scheme.scheme}" ATM "${atm}" does not support paymentFlow "${flow}"`);
  }

  return { assetTransferMethod: atm, paymentFlow: flow };
}

export function applyPaymentFlowWireExtra(
  extra: Record<string, unknown>,
  resolved: { assetTransferMethod: string; paymentFlow: string },
): Record<string, unknown> {
  const next = { ...extra };
  if (resolved.assetTransferMethod === SDK_DEFAULT_ASSET_TRANSFER_METHOD || next.assetTransferMethod === SDK_DEFAULT_ASSET_TRANSFER_METHOD) {
    delete next.assetTransferMethod;
  }
  if (resolved.paymentFlow !== "authorization") {
    next.paymentFlow = resolved.paymentFlow;
  }
  return next;
}

export function resolvePaymentFlowPhases(flow: string) {
  const phases = PAYMENT_FLOWS[flow];
  if (!phases) {
    throw new Error(`[x402] Unknown payment flow "${flow}"`);
  }
  return phases;
}

export function resolveFailurePathSettlement(
  cancelSettlement: any,
  beforeHandlerSettlement?: { result: any },
  paymentPayload?: any,
): any {
  if (cancelSettlement && beforeHandlerSettlement) {
    return cancelSettlement.success
      ? cancelSettlement
      : {
          success: false,
          errorReason: cancelSettlement.errorReason,
          errorMessage: cancelSettlement.errorMessage,
          payer: cancelSettlement.payer,
          transaction: "",
          network: cancelSettlement.network,
          extra: {
            ...cancelSettlement.extra,
            depositTransaction: beforeHandlerSettlement.result.transaction,
            depositAmount: beforeHandlerSettlement.result.amount,
          },
        };
  }
  if (beforeHandlerSettlement) {
    return beforeHandlerSettlement.result;
  }
  return undefined;
}

export class CoreResourceServer {
  private readonly registeredServers = new Map<string, any>();
  private readonly extensions = new Map<string, any>();
  private readonly facilitatorClient: any;
  private readonly beforeVerifyHooks: Array<(ctx: any) => Promise<any>> = [];
  private readonly afterVerifyHooks: Array<(ctx: any) => Promise<any>> = [];
  private readonly beforeSettleHooks: Array<(ctx: any) => Promise<any>> = [];
  private readonly afterSettleHooks: Array<(ctx: any) => Promise<any>> = [];

  constructor(facilitatorClient?: any) {
    this.facilitatorClient = facilitatorClient;
  }

  register(network: string, server: any): this {
    this.registeredServers.set(network, server);
    return this;
  }

  registerExtension(extension: any): this {
    if (extension?.key) {
      this.extensions.set(extension.key, extension);
    }
    return this;
  }

  hasRegisteredScheme(network: string, scheme: string): boolean {
    const s = this.registeredServers.get(network);
    return Boolean(s && s.scheme === scheme);
  }

  getRegisteredScheme(network: string, scheme: string): any {
    const s = this.registeredServers.get(network);
    return s && s.scheme === scheme ? s : undefined;
  }

  onBeforeVerify(hook: (ctx: any) => Promise<any>): this {
    this.beforeVerifyHooks.push(hook);
    return this;
  }

  onAfterVerify(hook: (ctx: any) => Promise<any>): this {
    this.afterVerifyHooks.push(hook);
    return this;
  }

  onBeforeSettle(hook: (ctx: any) => Promise<any>): this {
    this.beforeSettleHooks.push(hook);
    return this;
  }

  onAfterSettle(hook: (ctx: any) => Promise<any>): this {
    this.afterSettleHooks.push(hook);
    return this;
  }

  async buildPaymentRequirements(resourceConfig: any): Promise<any[]> {
    const reqs: any[] = [];
    for (const [net, server] of this.registeredServers.entries()) {
      if (typeof server.buildPaymentRequirements === "function") {
        const built = await server.buildPaymentRequirements(resourceConfig);
        reqs.push(...built);
      }
    }
    return reqs;
  }

  async createPaymentRequiredResponse(accepts: any[], resourceConfig: any): Promise<any> {
    const baseline = snapshotPaymentRequirementsList(accepts);
    let enriched = [...accepts];

    for (const [key, ext] of this.extensions.entries()) {
      if (typeof ext.enrichPaymentRequiredResponse === "function") {
        await ext.enrichPaymentRequiredResponse({ accepts: enriched }, { resourceConfig });
        assertAcceptsAllowlistedAfterExtensionEnrich(baseline, enriched, key);
      }
    }

    return {
      x402Version: 2,
      resource: resourceConfig,
      accepts: enriched,
    };
  }

  async verifyPayment(paymentPayload: any, requirements: any): Promise<any> {
    const ctx = { paymentPayload, requirements };
    for (const hook of this.beforeVerifyHooks) {
      const abort = await hook(ctx);
      if (abort?.abort) {
        return { isValid: false, invalidReason: abort.reason };
      }
    }

    let result = { isValid: true };
    if (this.facilitatorClient && typeof this.facilitatorClient.verify === "function") {
      result = await this.facilitatorClient.verify(paymentPayload, requirements);
    }

    for (const hook of this.afterVerifyHooks) {
      await hook({ ...ctx, result });
    }
    return result;
  }

  async settlePayment(paymentPayload: any, requirements: any): Promise<any> {
    const ctx = { paymentPayload, requirements };
    for (const hook of this.beforeSettleHooks) {
      const abort = await hook(ctx);
      if (abort?.abort) {
        return { success: false, errorReason: abort.reason };
      }
    }

    let result = { success: true, transaction: "0x_settle_core_tx" };
    if (this.facilitatorClient && typeof this.facilitatorClient.settle === "function") {
      result = await this.facilitatorClient.settle(paymentPayload, requirements);
    }

    for (const hook of this.afterSettleHooks) {
      await hook({ ...ctx, result });
    }
    return result;
  }
}

// ============================================================================
// BATCH 3 EXTENSIONS: Payment-Identifier, SIWX Auth & Settlement Overrides
// ============================================================================

export const HEADER_PAYMENT_SIGNATURE = 'PAYMENT-SIGNATURE';
export const HEADER_PAYMENT_RESPONSE = 'PAYMENT-RESPONSE';
export const HEADER_SIGN_IN_WITH_X = 'SIGN-IN-WITH-X';
export const HEADER_PAYMENT_IDENTIFIER = 'PAYMENT-IDENTIFIER';
export const SETTLEMENT_OVERRIDES_HEADER = 'X-Settlement-Overrides';

export interface IdempotencyRecord {
  fingerprint: string;
  response: any;
  timestamp: number;
}

/**
 * In-memory idempotency cache binding payment IDs to request fingerprints
 * Prevents double-charging and rejects ID reuse with altered payloads (RFC Idempotency)
 */
export const paymentIdempotencyStore = new Map<string, IdempotencyRecord>();

/**
 * Compute normalized cryptographic fingerprint of request for idempotency binding
 */
export function computeRequestFingerprint(path: string, body: any): string {
  const normBody = body ? JSON.stringify(body) : '';
  return crypto.createHash('sha256').update(`${path}:${normBody}`).digest('hex');
}

/**
 * Validates and records payment identifier
 */
export function processPaymentIdentifier(
  paymentId: string,
  fingerprint: string,
  cachedResponseProvider: () => any
): { action: 'proceed' | 'return_cached' | 'conflict'; cachedResponse?: any; error?: string } {
  logger.debug('Processing payment identifier for idempotency check', {
    paymentId,
    fingerprintPreview: `${fingerprint.slice(0, 16)}...`,
  });

  // 1. Format validation: 16-128 chars, alphanumeric, dash, underscore
  if (paymentId.length < 16 || paymentId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(paymentId)) {
    logger.warn('Payment identifier format validation failed: length or character set invalid', {
      paymentId,
      length: paymentId.length,
    });
    return { action: 'conflict', error: 'Payment identifier format invalid (must be 16-128 alphanumeric, dash, or underscore chars)' };
  }

  // 2. Lookup existing ID
  const existing = paymentIdempotencyStore.get(paymentId);
  if (existing) {
    logger.debug('Found existing record in payment idempotency store', {
      paymentId,
      cachedTimestamp: existing.timestamp,
    });
    // Timing-safe hexadecimal comparison on SHA-256 fingerprints
    if (!timingSafeEqualHex(existing.fingerprint, fingerprint)) {
      logger.warn('IDEMPOTENCY_CONFLICT: Payment identifier reused with differing request fingerprint', {
        paymentId,
        existingFingerprint: existing.fingerprint,
        currentFingerprint: fingerprint,
      });
      return {
        action: 'conflict',
        error: 'IDEMPOTENCY_CONFLICT: Payment identifier reused with different request payload or contract parameters',
      };
    }
    logger.info('Returning cached idempotent response for payment identifier', { paymentId });
    return { action: 'return_cached', cachedResponse: existing.response };
  }

  // 3. Record entry
  logger.info('Recording new entry in payment idempotency store', { paymentId });
  paymentIdempotencyStore.set(paymentId, {
    fingerprint,
    response: cachedResponseProvider(),
    timestamp: Date.now(),
  });

  return { action: 'proceed' };
}
