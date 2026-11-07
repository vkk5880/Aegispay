import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { defaultSyntheticIntentEngine } from '../services/synthetic-intent.js';
import { defaultCounterBidEngine } from '../services/counter-bid-engine.js';
import { SpendMandateSchema } from '@aegispay/shared-types';

const BroadcastVoucherSchema = z.object({
  mandate_id: z.string().max(32),
  buyer_id: z.string().optional(),
  channel3_product_id: z.string(),
  merchant_domain: z.string(),
  retail_offer_cents: z.number().int().positive(),
  buyer_budget_cap_cents: z.number().int().positive(),
  buyer_bid_cents: z.number().int().positive().optional(),
  commission_rebate_rate: z.number().min(0).max(1).optional(),
});

const CounterOfferSchema = z.object({
  mandate: SpendMandateSchema,
  voucher_id: z.string(),
  channel3_product_id: z.string(),
  merchant_domain: z.string(),
  retail_offer_cents: z.number().int().positive(),
  merchant_min_floor_cents: z.number().int().positive(),
  buyer_bid_cents: z.number().int().positive(),
  turn: z.number().int().min(1).max(2).optional(),
  auto_accept_buffer_cents: z.number().int().nonnegative().optional(),
});

export const intentVoucherRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/intent-vouchers/broadcast
   * Broadcasts a Synthetic Intent Voucher proposal with budget overage check and Vault token setup
   */
  fastify.post('/api/intent-vouchers/broadcast', async (request, reply) => {
    const parseResult = BroadcastVoucherSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    try {
      const evaluation = await defaultSyntheticIntentEngine.evaluateAndIssueVoucher(parseResult.data);
      return reply.status(200).send(evaluation);
    } catch (err: any) {
      return reply.status(500).send({ error: 'VOUCHER_BROADCAST_FAILED', message: err.message });
    }
  });

  /**
   * POST /api/intent-vouchers/counter
   * Evaluates a 2-turn counter-bid negotiation between buyer agent and seller
   */
  fastify.post('/api/intent-vouchers/counter', async (request, reply) => {
    const parseResult = CounterOfferSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    try {
      const result = await defaultCounterBidEngine.evaluateCounterBid(parseResult.data as any);
      return reply.status(200).send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: 'COUNTER_BID_FAILED', message: err.message });
    }
  });

  /**
   * GET /api/intent-vouchers/:id
   * Queries status and negotiation state of a synthetic intent voucher
   */
  fastify.get('/api/intent-vouchers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.status(200).send({
      voucher_id: id,
      status: 'ACTIVE_PRICE_LOCK',
      ttl_seconds: 72 * 3600,
      protocol: 'SYNTHETIC_INTENT_VOUCHER_V1',
      timestamp: new Date().toISOString(),
    });
  });
};
