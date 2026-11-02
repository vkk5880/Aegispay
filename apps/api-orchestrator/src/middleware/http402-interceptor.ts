import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'node:crypto';

export interface Http402InterceptorOptions {
  protectedPrefixes?: string[];
  vaultSetupUrl?: string;
}

const DEFAULT_PROTECTED_PREFIXES = [
  '/api/buyer/authorize',
  '/api/procurement/checkout',
  '/api/checkout',
];

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

  // Check for required authorization headers
  const spendMandateId = request.headers['x-spend-mandate-id'] as string | undefined;
  const syntheticVoucherId = request.headers['x-synthetic-voucher-id'] as string | undefined;

  if (spendMandateId || syntheticVoucherId) {
    // Authorized agent call
    return;
  }

  // Intercept and return HTTP 402 Payment Required
  const contractId = `ct_402_${crypto.randomBytes(16).toString('hex')}`;
  const vaultUrl = options?.vaultSetupUrl ||
    process.env.PAYPAL_VAULT_SETUP_URL ||
    'https://www.sandbox.paypal.com/v3/vault/setup-tokens';

  const spendPolicy = JSON.stringify({
    currency: 'USD',
    required_credentials: ['X-Spend-Mandate-Id', 'X-Synthetic-Voucher-Id'],
    mandate_protocol: 'Ed25519-SessionMandate-v1',
    atomic_settlement: 'REDIS_LUA_PRE_RESERVED',
  });

  reply.status(402);
  reply.header('X-Payment-Contract-Id', contractId);
  reply.header('X-PayPal-Vault-Setup-Url', vaultUrl);
  reply.header('X-Aegis-Spend-Policy', spendPolicy);

  return reply.send({
    error: 'PAYMENT_REQUIRED',
    status: 402,
    message: 'Payment Required: Autonomous agent procurement requires an active Ed25519 Spend Mandate or PayPal Vault Synthetic Voucher.',
    challenge: {
      type: 'https://aegispay.dev/protocols/http402',
      title: 'AegisPay Autonomous Payment Challenge',
      payment_contract_id: contractId,
      vault_setup_url: vaultUrl,
      accepted_headers: [
        'X-Spend-Mandate-Id',
        'X-Synthetic-Voucher-Id',
      ],
      spend_policy: {
        currency: 'USD',
        mandate_protocol: 'Ed25519-SessionMandate-v1',
        atomic_settlement: 'REDIS_LUA_PRE_RESERVED',
      },
    },
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
