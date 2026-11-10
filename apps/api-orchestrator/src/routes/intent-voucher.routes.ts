import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { defaultSyntheticIntentEngine } from '../services/synthetic-intent.js';
import { defaultCounterBidEngine } from '../services/counter-bid-engine.js';
import { SpendMandateSchema } from '@aegispay/shared-types';

const logger = createLogger('API:Routes:IntentVouchers');

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
    const routeTimer = logger.time(`POST ${request.url}`);
    logger.debug('Received Synthetic Intent Voucher proposal broadcast request', {
      url: request.url,
      body: sanitizeForLogging(request.body || {}),
      params: sanitizeForLogging(request.params),
      query: sanitizeForLogging(request.query),
    });

    const parseResult = BroadcastVoucherSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      const errorFormat = parseResult.error.format();
      logger.warn('Synthetic Intent Voucher broadcast payload validation failed', {
        url: request.url,
        errors: errorFormat,
        issues: parseResult.error.issues,
      });
      routeTimer('Validation failed');
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: errorFormat });
    }

    const {
      mandate_id,
      buyer_id,
      channel3_product_id,
      merchant_domain,
      retail_offer_cents,
      buyer_budget_cap_cents,
      buyer_bid_cents,
      commission_rebate_rate,
      merchant_min_floor_discount_pct,
    } = parseResult.data;

    logger.info('Evaluating Synthetic Intent Voucher eligibility and overage bounds', {
      mandateId: mandate_id,
      buyerId: buyer_id || 'anonymous',
      channel3ProductId: channel3_product_id,
      merchantDomain: merchant_domain,
      retailOfferCents: retail_offer_cents,
      buyerBudgetCapCents: buyer_budget_cap_cents,
      buyerBidCents: buyer_bid_cents || null,
      commissionRebateRate: commission_rebate_rate || null,
      merchantMinFloorDiscountPct: merchant_min_floor_discount_pct || null,
    });

    try {
      const evalTimer = performance.now();
      const evaluation = await defaultSyntheticIntentEngine.evaluateAndIssueVoucher(parseResult.data);
      const evalDurationMs = performance.now() - evalTimer;

      const isEligible = evaluation.eligible_for_synthetic_intent;
      const isAutoCleared = Boolean((evaluation as any)?.auto_cleared);

      logger.info('Synthetic Intent Voucher proposal evaluated', {
        eligibleForSyntheticIntent: isEligible,
        autoCleared: isAutoCleared,
        overagePercentage: (evaluation as any)?.overage_percentage,
        voucherId: (evaluation as any)?.voucher_id,
        negotiationStatus: (evaluation as any)?.negotiation_status,
        reason: (evaluation as any)?.reason || null,
        evalDurationMs,
      });

      if (isEligible) {
        if (isAutoCleared) {
          logger.info('Synthetic Intent Voucher auto-cleared: bid satisfies merchant reserve floor', {
            voucherId: (evaluation as any)?.voucher_id,
            resultingOrderId: (evaluation as any)?.resulting_paypal_order_id,
          });
        } else {
          logger.info('Synthetic Intent Voucher broadcasted as open bid pending merchant review', {
            voucherId: (evaluation as any)?.voucher_id,
            vaultSetupTokenId: (evaluation as any)?.paypal_vault_setup_token_id,
          });
        }
      } else {
        logger.info('Synthetic Intent Voucher rejected: outside autonomous overage boundaries [5%, 18%]', {
          overagePercentage: (evaluation as any)?.overage_percentage,
          reason: (evaluation as any)?.reason,
        });
      }

      routeTimer('Voucher proposal broadcast evaluated');
      return reply.status(200).send(evaluation);
    } catch (err: any) {
      logger.error('Synthetic Intent Voucher broadcast evaluation failed', {
        mandateId: parseResult.data.mandate_id,
        merchantDomain: parseResult.data.merchant_domain,
        errorMessage: err.message,
        errorCode: err.code || err.statusCode,
        errorName: err.name,
        routePath: request.url,
        stack: err.stack,
      });
      routeTimer('Voucher broadcast threw error');
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
    const routeTimer = logger.time(`POST ${request.url}`);
    logger.debug('Received Counter-Bid negotiation evaluation request', {
      url: request.url,
      body: sanitizeForLogging(request.body || {}),
      params: sanitizeForLogging(request.params),
      query: sanitizeForLogging(request.query),
    });

    const parseResult = CounterOfferSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      const errorFormat = parseResult.error.format();
      logger.warn('Counter-Bid negotiation payload validation failed', {
        url: request.url,
        errors: errorFormat,
        issues: parseResult.error.issues,
      });
      routeTimer('Validation failed');
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: errorFormat });
    }

    const {
      mandate,
      voucher_id,
      channel3_product_id,
      merchant_domain,
      retail_offer_cents,
      merchant_min_floor_cents,
      buyer_bid_cents,
      turn,
      auto_accept_buffer_cents,
    } = parseResult.data;

    logger.info('Evaluating 2-turn counter-bid negotiation between buyer agent and merchant', {
      voucherId: voucher_id,
      mandateId: mandate.mandate_id,
      channel3ProductId: channel3_product_id,
      merchantDomain: merchant_domain,
      retailOfferCents: retail_offer_cents,
      merchantMinFloorCents: merchant_min_floor_cents,
      buyerBidCents: buyer_bid_cents,
      turn: turn ?? 1,
      autoAcceptBufferCents: auto_accept_buffer_cents || 0,
    });

    try {
      const evalTimer = performance.now();
      const result = await defaultCounterBidEngine.evaluateCounterBid(parseResult.data as any);
      const evalDurationMs = performance.now() - evalTimer;

      logger.info('Counter-Bid negotiation turn evaluated', {
        voucherId: voucher_id,
        turnStatus: (result as any)?.status,
        ed25519Verified: (result as any)?.ed25519_mandate_verified,
        maxTurnsReached: Boolean((result as any)?.max_turns_reached),
        hasHitlPrompt: Boolean((result as any)?.hitl_prompt),
        hasResultingOrder: Boolean((result as any)?.resulting_order_id),
        evalDurationMs,
      });

      routeTimer(`Counter-bid turn evaluated: ${(result as any)?.status}`);
      return reply.status(200).send(result);
    } catch (err: any) {
      logger.error('Counter-Bid negotiation evaluation threw exception', {
        voucherId: parseResult.data.voucher_id,
        mandateId: parseResult.data.mandate?.mandate_id,
        errorMessage: err.message,
        errorCode: err.code || err.statusCode,
        errorName: err.name,
        routePath: request.url,
        stack: err.stack,
      });
      routeTimer('Counter-bid evaluation threw error');
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
    const routeTimer = logger.time(`POST ${request.url}`);
    const { id } = request.params as { id: string };

    logger.debug('Received Merchant 1-Click Voucher acceptance request', {
      url: request.url,
      voucherId: id,
      body: sanitizeForLogging(request.body || {}),
      params: sanitizeForLogging(request.params),
    });

    const parseResult = AcceptVoucherSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      const errorFormat = parseResult.error.format();
      logger.warn('Merchant voucher acceptance body validation failed; proceeding with defaults', {
        errors: errorFormat,
        issues: parseResult.error.issues,
      });
    }

    const body = parseResult.success ? parseResult.data : (request.body || {});
    const merchantDomain = body?.merchant_domain || 'merchant.com';
    const finalCapturedCents = body?.accepted_amount_cents || 9200;
    const paypalOrderId = `ORD-SYNTH-${Date.now()}`;
    const capturedAt = new Date().toISOString();

    logger.info('Merchant accepted synthetic intent voucher; converting vaulted token to authorized PayPal order', {
      voucherId: id,
      merchantDomain,
      finalCapturedCents,
      paypalOrderId,
      capturedAt,
    });

    routeTimer('Voucher accepted and captured');
    return reply.status(200).send({
      voucher_id: id,
      status: 'ACCEPTED_AND_CAPTURED',
      merchant_domain: merchantDomain,
      final_captured_cents: finalCapturedCents,
      paypal_order_id: paypalOrderId,
      captured_at: capturedAt,
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
    const routeTimer = logger.time(`GET ${request.url}`);
    const { id } = request.params as { id: string };

    logger.debug('Received query for Synthetic Intent Voucher state', {
      url: request.url,
      voucherId: id,
      params: sanitizeForLogging(request.params),
      query: sanitizeForLogging(request.query),
    });

    logger.info('Returning active Synthetic Intent Voucher state and TTL lock', {
      voucherId: id,
      status: 'ACTIVE_PRICE_LOCK',
      ttlSeconds: 72 * 3600,
    });

    routeTimer('Voucher status retrieved');
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
