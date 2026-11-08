import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
  loadUserPreferences,
  saveUserPreference,
  getPurchaseHistory,
  checkAllWatchlists,
  getWatchlistAlerts,
  getReceipts,
  updatePurchaseStatus,
} from '../services/user-memory.js';
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ShoppingActionTypeSchema,
  ChatResponsePayload,
} from '@aegispay/shared-types';
import {
  defaultShoppingAssistant,
  resolveCommerceModel,
  AVAILABLE_COMMERCE_MODELS,
} from '../services/shopping-assistant.js';
import { authenticateUser } from '../middleware/auth.js';

const ChatMessageSchema = z.object({
  message: z.string().min(1),
  action: ShoppingActionTypeSchema.optional(),
  product_ids: z.array(z.string()).optional(),
  budget_cap_cents: z.number().int().positive().optional(),
  zip_code: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  user_api_key: z.string().max(256).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
});

export const chatRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/buyer/models
   * Dynamically lists supported Mastra AI models, active deploy model, and reasoning profiles.
   */
  fastify.get('/api/buyer/models', async () => {
    return {
      status: 'SUCCESS',
      active_model: resolveCommerceModel(),
      default_model: 'google/gemini-2.5-flash',
      available_models: AVAILABLE_COMMERCE_MODELS,
    };
  });

  /**
   * POST /api/buyer/chat
   * Conversational AI Shopping Concierge & Product Comparison Engine
   * Returns structured ChatResponsePayload with markdown, product cards, comparison matrix, and knapsack cart.
   */
  fastify.post('/api/buyer/chat', async (request, reply) => {
    const parseResult = ChatMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'INVALID_REQUEST',
        details: parseResult.error.format(),
      });
    }

    try {
      const userApiKeyHeader = request.headers['x-user-llm-api-key'] as string | undefined;
      const chatPayload = {
        ...parseResult.data,
        user_api_key: parseResult.data.user_api_key || userApiKeyHeader,
      };
      const response: ChatResponsePayload = await defaultShoppingAssistant.processMessage(chatPayload);
      return reply.send({
        status: 'SUCCESS',
        ...response,
      });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({
        error: 'SHOPPING_CONCIERGE_FAILED',
        message: err.message || 'An error occurred while processing the shopping assistant request.',
        action: parseResult.data.action || 'DISCOVER',
        markdown: '⚠️ I encountered an unexpected error while retrieving product recommendations. Please try searching with a different term.',
        follow_up_suggestions: [
          'Search for wireless headphones',
          'Search for charging stands',
          'Explore top deals',
        ],
      });
    }
  });

  /**
   * POST /api/buyer/clarify
   * Evaluates if query is vague and returns targeted clarifying questions.
   */
  fastify.post('/api/buyer/clarify', async (request, reply) => {
    const body = request.body as { query?: string };
    const query = body?.query || '';
    const needs = defaultShoppingAssistant.needsClarification(query);
    const questions = needs ? await defaultShoppingAssistant.getClarifyingQuestions(query) : [];
    return reply.send({
      status: 'SUCCESS',
      needs_clarification: needs,
      questions,
    });
  });

  /**
   * POST /api/buyer/enrich
   * Combines original query and answers into a refined search query.
   */
  fastify.post('/api/buyer/enrich', async (request, reply) => {
    const body = request.body as { query?: string; answers?: Record<string, any> };
    const enriched = defaultShoppingAssistant.buildEnrichedQuery(body?.query || '', body?.answers || {});
    return reply.send({
      status: 'SUCCESS',
      original_query: body?.query || '',
      enriched_query: enriched,
    });
  });

  /**
   * GET /api/buyer/community-sentiment
   * Fetches community consensus sentiment for a specific product title.
   */
  fastify.get('/api/buyer/community-sentiment', async (request, reply) => {
    const query = request.query as { title?: string };
    const sentiment = await defaultShoppingAssistant.getCommunitySentiment(query?.title || '');
    return reply.send({
      status: 'SUCCESS',
      title: query?.title || '',
      community_sentiment: sentiment,
    });
  });

  /**
   * GET /api/buyer/social-proof
   * Returns community social proof signals, sentiment emoji, highlights, and review links.
   */
  fastify.get('/api/buyer/social-proof', async (request, reply) => {
    const query = request.query as { title?: string };
    const proof = await defaultShoppingAssistant.getSocialProof(query?.title || '');
    return reply.send({
      status: 'SUCCESS',
      title: query?.title || '',
      social_proof: proof,
    });
  });

  /**
   * POST /api/buyer/battle-report
   * Generates a head-to-head Tale of the Tape referee comparison report.
   */
  fastify.post('/api/buyer/battle-report', async (request, reply) => {
    const body = request.body as { contender_a: any; contender_b: any };
    if (!body?.contender_a || !body?.contender_b) {
      return reply.status(400).send({ error: 'MISSING_CONTENDERS', message: 'Both contender_a and contender_b are required.' });
    }
    const report = await defaultShoppingAssistant.generateBattleReport(body.contender_a, body.contender_b);
    return reply.send({
      status: 'SUCCESS',
      battle_report: report,
    });
  });

  /**
   * POST /api/buyer/watchlist
   * Adds or replaces an item in the user's price-drop watchlist.
   */
  fastify.post('/api/buyer/watchlist', { preHandler: [authenticateUser] }, async (request, reply) => {
    const body = request.body as {
      user_id?: string;
      title: string;
      current_price_cents: number;
      target_price_cents: number;
      source: string;
      link?: string;
      query?: string;
    };
    if (!body?.title || !body?.target_price_cents) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'title and target_price_cents are required.' });
    }
    const userId = request.user?.id || body.user_id || 'demo';
    const item = addToWatchlist(userId, body);
    return reply.send({ status: 'SUCCESS', watchlist_item: item });
  });

  /**
   * GET /api/buyer/watchlist
   * Fetches the user's price-drop watchlist.
   */
  fastify.get('/api/buyer/watchlist', { preHandler: [authenticateUser] }, async (request, reply) => {
    const userId = request.user?.id || 'demo';
    const items = getWatchlist(userId);
    return reply.send({ status: 'SUCCESS', watchlist: items });
  });

  /**
   * DELETE /api/buyer/watchlist
   * Removes an item from the user's price-drop watchlist.
   */
  fastify.delete('/api/buyer/watchlist', { preHandler: [authenticateUser] }, async (request, reply) => {
    const body = request.body as { user_id?: string; title?: string; item_id?: string };
    const id = body?.item_id || body?.title || '';
    const userId = request.user?.id || body?.user_id || 'demo';
    const removed = removeFromWatchlist(userId, id);
    return reply.send({ status: 'SUCCESS', removed });
  });

  /**
   * GET /api/buyer/prefs
   * Fetches user preferences.
   */
  fastify.get('/api/buyer/prefs', { preHandler: [authenticateUser] }, async (request, reply) => {
    const userId = request.user?.id || 'demo';
    const prefs = loadUserPreferences(userId);
    return reply.send({ status: 'SUCCESS', preferences: prefs });
  });

  /**
   * POST /api/buyer/prefs
   * Updates a user preference key.
   */
  fastify.post('/api/buyer/prefs', { preHandler: [authenticateUser] }, async (request, reply) => {
    const body = request.body as { user_id?: string; key: any; value: any };
    if (!body?.key) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'key is required' });
    }
    const userId = request.user?.id || body?.user_id || 'demo';
    const updated = saveUserPreference(userId, body.key, body.value);
    return reply.send({ status: 'SUCCESS', preferences: updated });
  });

  /**
   * GET /api/buyer/history
   * Returns purchase transaction history.
   */
  fastify.get('/api/buyer/history', { preHandler: [authenticateUser] }, async (request, reply) => {
    const query = request.query as { user_id?: string; limit?: string };
    const limit = query?.limit ? parseInt(query.limit, 10) : 50;
    const userId = request.user?.id || 'demo';
    const history = getPurchaseHistory(userId, limit);
    return reply.send({ status: 'SUCCESS', history });
  });

  /**
   * POST /api/buyer/watchlist/check
   * Scans all user watchlists and checks for price drop alerts.
   */
  fastify.post('/api/buyer/watchlist/check', async (request, reply) => {
    const report = await checkAllWatchlists();
    return reply.send({ status: 'SUCCESS', report });
  });

  /**
   * GET /api/buyer/watchlist/alerts
   * Returns price-drop alerts triggered by the watchlist job.
   */
  fastify.get('/api/buyer/watchlist/alerts', { preHandler: [authenticateUser] }, async (request, reply) => {
    const userId = request.user?.id;
    const alerts = getWatchlistAlerts(userId);
    return reply.send({ status: 'SUCCESS', alerts });
  });

  /**
   * GET /api/buyer/receipts
   * Returns user receipts and cryptographic certificates.
   */
  fastify.get('/api/buyer/receipts', { preHandler: [authenticateUser] }, async (request, reply) => {
    const userId = request.user?.id || 'demo';
    const receipts = getReceipts(userId);
    return reply.send({ status: 'SUCCESS', receipts });
  });

  /**
   * POST /api/buyer/escrow/confirm
   * Confirms order delivery, updating escrow hold status to CAPTURED.
   */
  fastify.post('/api/buyer/escrow/confirm', { preHandler: [authenticateUser] }, async (request, reply) => {
    const body = request.body as { user_id?: string; order_id?: string };
    const orderId = body?.order_id || 'demo_order';
    const userId = request.user?.id || body?.user_id || 'demo';
    const updated = updatePurchaseStatus(userId, orderId, 'CAPTURED');
    return reply.send({ status: 'SUCCESS', order_id: orderId, escrow_status: 'CAPTURED', updated });
  });

  /**
   * POST /api/buyer/escrow/refund
   * Refunds order hold, updating escrow status to REFUNDED.
   */
  fastify.post('/api/buyer/escrow/refund', { preHandler: [authenticateUser] }, async (request, reply) => {
    const body = request.body as { user_id?: string; order_id?: string };
    const orderId = body?.order_id || 'demo_order';
    const userId = request.user?.id || body?.user_id || 'demo';
    const updated = updatePurchaseStatus(userId, orderId, 'REFUNDED');
    return reply.send({ status: 'SUCCESS', order_id: orderId, escrow_status: 'REFUNDED', updated });
  });
};
