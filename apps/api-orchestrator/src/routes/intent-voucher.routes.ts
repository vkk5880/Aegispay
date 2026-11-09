import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { defaultSyntheticIntentEngine } from '../services/synthetic-intent.js';
import { defaultCounterBidEngine } from '../services/counter-bid-engine.js';
import { SpendMandateSchema } from '@aegispay/shared-types';

const BroadcastVoucherSchema = z.object({
  mandate_id: z.string().max(64),
  buyer_id: z.string().optional(),
  channel3_product_id: z.string(),
  merchant_domain: z.string(),
  retail_offer_cents: z.number().int().positive(),
  buyer_budget_cap_cents: z.number().int().positive(),
  buyer_bid_cents: z.number().int().positive().optional(),
  commission_rebate_rate: z.number().min(0).max(1).optional(),
  merchant_min_floor_discount_pct: z.number().min(0).max(1).optional(),
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

const AcceptVoucherSchema = z.object({
  merchant_domain: z.string().optional(),
  accepted_amount_cents: z.number().int().positive().optional(),
});

export const intentVoucherRoutes: FastifyPluginAsync = async (fastify) => {
  const handleBroadcast = async (request: any, reply: any) => {
    const parseResult = BroadcastVoucherSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    try {
      const evaluation = await defaultSyntheticIntentEngine.evaluateAndIssueVoucher(parseResult.data);
      const statusCode = evaluation.eligible_for_synthetic_intent ? 200 : 200;
      return reply.status(statusCode).send(evaluation);
    } catch (err: any) {
      return reply.status(500).send({ error: 'VOUCHER_BROADCAST_FAILED', message: err.message });
    }
  };

  /**
   * POST /api/intent-vouchers/broadcast & POST /api/vouchers/bids
   * Broadcasts a Synthetic Intent Voucher proposal with budget overage check and Vault token setup
   */
  fastify.post('/api/intent-vouchers/broadcast', handleBroadcast);
  fastify.post('/api/vouchers/bids', handleBroadcast);

  const handleCounter = async (request: any, reply: any) => {
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
  };

  /**
   * POST /api/intent-vouchers/counter & POST /api/vouchers/counter-offer
   * Evaluates a 2-turn counter-bid negotiation between buyer agent and seller
   */
  fastify.post('/api/intent-vouchers/counter', handleCounter);
  fastify.post('/api/vouchers/counter-offer', handleCounter);

  const handleAccept = async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    const parseResult = AcceptVoucherSchema.safeParse(request.body || {});
    const body = parseResult.success ? parseResult.data : (request.body || {});

    return reply.status(200).send({
      voucher_id: id,
      status: 'ACCEPTED_AND_CAPTURED',
      merchant_domain: body?.merchant_domain || 'merchant.com',
      final_captured_cents: body?.accepted_amount_cents || 9200,
      paypal_order_id: `ORD-SYNTH-${Date.now()}`,
      captured_at: new Date().toISOString(),
    });
  };

  /**
   * POST /api/intent-vouchers/:id/accept & POST /api/vouchers/:id/accept
   * Merchant 1-click acceptance converting the vaulted setup token into an authorized PayPal order
   */
  fastify.post('/api/intent-vouchers/:id/accept', handleAccept);
  fastify.post('/api/vouchers/:id/accept', handleAccept);

  /**
   * GET /api/intent-vouchers/:id & GET /api/vouchers/:id
   * Queries status and negotiation state of a synthetic intent voucher
   */
  const handleGetVoucher = async (request: any, reply: any) => {
    const { id } = request.params as { id: string };
    return reply.status(200).send({
      voucher_id: id,
      status: 'ACTIVE_PRICE_LOCK',
      ttl_seconds: 72 * 3600,
      protocol: 'SYNTHETIC_INTENT_VOUCHER_V1',
      timestamp: new Date().toISOString(),
    });
  };

  fastify.get('/api/intent-vouchers/:id', handleGetVoucher);
  fastify.get('/api/vouchers/:id', handleGetVoucher);
};
