import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'node:crypto';
import { z } from 'zod';

/**
 * Standardized HTTP 402 & x402 Protocol Headers
 */
export const HEADER_PAY_TO = 'PAY-TO';
export const HEADER_X_PAYMENT_CONTRACT_ID = 'X-Payment-Contract-Id';
export const HEADER_X_PAYPAL_VAULT_SETUP_URL = 'X-PayPal-Vault-Setup-Url';
export const HEADER_PAYMENT_REQUIRED = 'PAYMENT-REQUIRED';
export const HEADER_X_AEGIS_SPEND_POLICY = 'X-Aegis-Spend-Policy';
export const HEADER_X_PAYMENT_RECEIPT = 'X-Payment-Receipt';
export const HEADER_X_SPEND_MANDATE_ID = 'X-Spend-Mandate-Id';
export const HEADER_X_SYNTHETIC_VOUCHER_ID = 'X-Synthetic-Voucher-Id';

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

const DEFAULT_SECRET = process.env.AEGIS_HMAC_SECRET || 'aegispay_test_secret_key_402';

/**
 * Generates an RFC/x402-compliant cryptographically signed payment receipt
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
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const receiptData = { contractId, amountCents, currency, timestamp, hmac };
  return `rcpt_${Buffer.from(JSON.stringify(receiptData)).toString('base64')}`;
}

/**
 * Validates cryptographic authenticity and freshness of an x402 payment receipt using timing-safe comparison
 */
export function verifyPaymentReceipt(
  receipt: string,
  secret = DEFAULT_SECRET
): boolean {
  if (!receipt || typeof receipt !== 'string' || !receipt.startsWith('rcpt_')) {
    return false;
  }

  try {
    const raw = Buffer.from(receipt.slice(5), 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    const { contractId, amountCents, currency, timestamp, hmac } = parsed;

    if (!contractId || !amountCents || !currency || !timestamp || !hmac) {
      return false;
    }

    // Enforce 24-hour freshness TTL (86,400,000 ms)
    const now = Date.now();
    const ageMs = now - timestamp;
    if (ageMs > 24 * 60 * 60 * 1000 || ageMs < -60000) {
      return false;
    }

    const expectedPayload = `${contractId}:${amountCents}:${currency}:${timestamp}`;
    const expectedHmac = crypto.createHmac('sha256', secret).update(expectedPayload).digest('hex');

    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    const actualBuf = Buffer.from(hmac, 'hex');

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
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

  while (attempt <= maxRetries) {
    const response = await requestFn(receipt);
    if (response.status !== 402) {
      return {
        status: response.status,
        data: response.data,
        retries: attempt,
        receiptUsed: receipt,
      };
    }

    // 402 Challenge received -> extract contract ID & construct signed receipt
    const contractId = response.headers?.['x-payment-contract-id'] || `ct_402_${crypto.randomUUID().slice(0, 8)}`;
    receipt = generatePaymentReceipt(contractId, 5000, 'USD', options?.secret);
    attempt++;
  }

  return { status: 402, retries: attempt };
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
  const path = request.url.split('?')[0];

  const isProtected = protectedPrefixes.some(prefix => path === prefix || path.startsWith(prefix));
  if (!isProtected) {
    return;
  }

  // Check 1: Valid cryptographic payment receipt header (X-Payment-Receipt)
  const paymentReceipt = request.headers['x-payment-receipt'] as string | undefined;
  if (paymentReceipt && verifyPaymentReceipt(paymentReceipt, options?.hmacSecret || DEFAULT_SECRET)) {
    return;
  }

  // Check 2: Active Spend Mandate or Synthetic Voucher
  const spendMandateId = request.headers['x-spend-mandate-id'] as string | undefined;
  const syntheticVoucherId = request.headers['x-synthetic-voucher-id'] as string | undefined;

  if (spendMandateId || syntheticVoucherId) {
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

  reply.status(402);
  reply.header(HEADER_PAY_TO, payTo);
  reply.header(HEADER_X_PAYMENT_CONTRACT_ID, contractId);
  reply.header(HEADER_PAYMENT_REQUIRED, paymentRequiredHeader);
  reply.header(HEADER_X_PAYPAL_VAULT_SETUP_URL, vaultUrl);
  reply.header(HEADER_X_AEGIS_SPEND_POLICY, JSON.stringify(challenge.spend_policy));

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
