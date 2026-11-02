import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ACP_MANIFEST,
  executeACPAction,
} from '@aegispay/mcp-enforcer';

const ACPActionRequestSchema = z.object({
  action: z.enum(['discover_products', 'request_purchase_quote', 'confirm_payment_hold']),
  parameters: z.record(z.any()),
});

export const acpRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /.well-known/acp.json
   * Public discovery endpoint for OpenAI Agentic Commerce Protocol (ACP)
   */
  fastify.get('/.well-known/acp.json', async (request, reply) => {
    reply.header('Content-Type', 'application/json');
    return reply.send(ACP_MANIFEST);
  });

  /**
   * POST /api/acp/actions
   * Executes standardized ACP commerce actions guarded by AegisPay policies
   */
  fastify.post('/api/acp/actions', async (request, reply) => {
    const parseResult = ACPActionRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'INVALID_ACP_REQUEST',
        details: parseResult.error.format(),
      });
    }

    const { action, parameters } = parseResult.data;

    // For confirm_payment_hold, verify authentication headers or mandate parameters
    if (action === 'confirm_payment_hold') {
      const spendMandateId =
        (request.headers['x-spend-mandate-id'] as string | undefined) ||
        parameters.mandate_id;
      const syntheticVoucherId =
        (request.headers['x-synthetic-voucher-id'] as string | undefined) ||
        parameters.voucher_id;

      if (!spendMandateId && !syntheticVoucherId) {
        reply.status(402);
        reply.header('X-Payment-Contract-Id', `ct_acp_${Date.now()}`);
        reply.header(
          'X-PayPal-Vault-Setup-Url',
          process.env.PAYPAL_VAULT_SETUP_URL || 'https://www.sandbox.paypal.com/v3/vault/setup-tokens'
        );
        return reply.send({
          error: 'PAYMENT_REQUIRED',
          status: 402,
          message: 'Payment Required: Missing active mandate or voucher credentials for confirm_payment_hold.',
        });
      }
    }

    try {
      const result = await executeACPAction(action, parameters);
      return reply.send({
        status: 'SUCCESS',
        protocol: 'OPENAI_ACP_v1',
        ...result,
      });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'ACP_ACTION_EXECUTION_FAILED',
        message: err.message,
      });
    }
  });
};
