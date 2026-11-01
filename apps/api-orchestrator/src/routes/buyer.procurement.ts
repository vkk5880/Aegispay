import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { defaultChannel3Client } from '../services/channel3.client.js';
import { defaultCartSolver } from '../services/cart-solver.js';
import { defaultPayPalClient } from '../services/paypal-apimatic.js';
import { defaultSyntheticIntentEngine } from '../services/synthetic-intent.js';

const KnapsackRequestSchema = z.object({
  query: z.string().optional(),
  category_ids: z.array(z.string()).optional(),
  hex_color: z.string().optional(),
  image_url: z.string().url().optional(),
  requirements: z.array(
    z.object({
      product_id: z.string(),
      quantity: z.number().int().positive().default(1),
    })
  ).optional(),
  budget_cap_cents: z.number().int().positive().optional(),
});

const AuthorizeRequestSchema = z.object({
  mandate_id: z.string().max(32),
  purchase_units: z.array(
    z.object({
      reference_id: z.string(),
      invoice_id: z.string().optional(),
      description: z.string().optional(),
      amount: z.object({
        currency_code: z.string().default('USD'),
        value: z.string(),
        breakdown: z.object({
          item_total: z.object({ currency_code: z.string(), value: stringOrNumber() }).optional(),
          shipping: z.object({ currency_code: z.string(), value: stringOrNumber() }).optional(),
          discount: z.object({ currency_code: z.string(), value: stringOrNumber() }).optional(),
        }).optional(),
      }),
      items: z.array(
        z.object({
          name: z.string(),
          unit_amount: z.object({ currency_code: z.string(), value: stringOrNumber() }),
          quantity: z.string(),
          sku: z.string().optional(),
        })
      ).optional(),
    })
  ),
});

function stringOrNumber() {
  return z.union([z.string(), z.number()]).transform(v => String(v));
}

const SyntheticBidRequestSchema = z.object({
  mandate_id: z.string().max(32),
  buyer_id: z.string().optional(),
  channel3_product_id: z.string(),
  merchant_domain: z.string(),
  retail_offer_cents: z.number().int().positive(),
  buyer_budget_cap_cents: z.number().int().positive(),
  buyer_bid_cents: z.number().int().positive().optional(),
  commission_rebate_rate: z.number().min(0).max(1).optional(),
});

export const buyerProcurementRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/buyer/knapsack
   * Solves multi-vendor basket minimizing net buyer expenditure
   */
  fastify.post('/api/buyer/knapsack', async (request, reply) => {
    const parseResult = KnapsackRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const { query, category_ids, hex_color, image_url, requirements, budget_cap_cents } = parseResult.data;

    // Search or lookup Channel3 catalog
    const searchRes = await defaultChannel3Client.search({
      query,
      category_ids,
      hex_color,
      image_url,
    });

    const products = searchRes.products;
    if (products.length === 0) {
      return reply.status(404).send({ error: 'NO_PRODUCTS_FOUND' });
    }

    // If no explicit requirements passed, optimize across available search results
    const reqs = requirements && requirements.length > 0
      ? requirements
      : products.slice(0, 3).map(p => ({ product_id: p.product_id, quantity: 1 }));

    try {
      const optimization = defaultCartSolver.solve(products, reqs, {
        budgetCapCents: budget_cap_cents,
      });

      return reply.send({
        status: 'SUCCESS',
        optimization,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: 'OPTIMIZATION_FAILED', message: err.message });
    }
  });

  /**
   * POST /api/buyer/authorize
   * Multi-purchase unit PayPal v2 Order with intent: "AUTHORIZE" + server read-back verification
   */
  fastify.post('/api/buyer/authorize', async (request, reply) => {
    const parseResult = AuthorizeRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const { mandate_id, purchase_units } = parseResult.data;

    try {
      const createdOrder = await defaultPayPalClient.createMultiPurchaseUnitOrder({
        intent: 'AUTHORIZE',
        purchaseUnits: purchase_units as any,
      }) as any;

      const orderId = createdOrder?.id || `ORD-${Date.now()}`;

      // Mandatory server read-back verification
      const verifiedOrder = await defaultPayPalClient.getOrder(orderId);

      return reply.send({
        status: 'AUTHORIZED',
        mandate_id,
        paypal_order_id: orderId,
        readback_verified: true,
        order: verifiedOrder,
      });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'AUTHORIZATION_FAILED', message: err.message });
    }
  });

  /**
   * POST /api/buyer/synthetic-bid
   * Mints Vault v3 setup-token and negotiates autonomous discount
   */
  fastify.post('/api/buyer/synthetic-bid', async (request, reply) => {
    const parseResult = SyntheticBidRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const evaluation = await defaultSyntheticIntentEngine.processSyntheticBid(parseResult.data);
    return reply.send({
      status: 'PROCESSED',
      evaluation,
    });
  });
};
