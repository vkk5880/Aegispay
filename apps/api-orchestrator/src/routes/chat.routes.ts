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
  logPurchase,
} from '../services/user-memory.js';
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ShoppingActionTypeSchema,
  ChatResponsePayload,
  createLogger,
  sanitizeForLogging,
} from '@aegispay/shared-types';
import {
  defaultShoppingAssistant,
  resolveCommerceModel,
  AVAILABLE_COMMERCE_MODELS,
} from '../services/shopping-assistant.js';
import { authenticateUser, createOrderTrackingToken } from '../middleware/auth.js';

export const logger = createLogger('API:Routes:Chat');

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
    logger.debug('Retrieving available commerce AI models');
    const activeModel = resolveCommerceModel();
    const defaultModel = 'google/gemini-2.5-flash';
    logger.info(`Active commerce AI model: ${activeModel}, available models count: ${AVAILABLE_COMMERCE_MODELS.length}`, {
      activeModel,
      defaultModel,
      availableModelsCount: AVAILABLE_COMMERCE_MODELS.length,
    });
    return {
      status: 'SUCCESS',
      active_model: activeModel,
      default_model: defaultModel,
      available_models: AVAILABLE_COMMERCE_MODELS,
    };
  });

  /**
   * POST /api/buyer/chat
   * Conversational AI Shopping Concierge & Product Comparison Engine
   * Returns structured ChatResponsePayload with markdown, product cards, comparison matrix, and knapsack cart.
   */
  fastify.post('/api/buyer/chat', { preHandler: [authenticateUser] }, async (request, reply) => {
    const parseResult = ChatMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      logger.warn('ChatMessageSchema validation failed', { errors: parseResult.error.format() });
      return reply.status(400).send({
        error: 'INVALID_REQUEST',
        details: parseResult.error.format(),
      });
    }

    const timer = logger.time('Shopping Assistant Message Processing');
    try {
      const userApiKeyHeader = request.headers['x-user-llm-api-key'] as string | undefined;
      const chatPayload = {
        ...parseResult.data,
        user_api_key: parseResult.data.user_api_key || userApiKeyHeader,
      };

      const parsedIntent = chatPayload.action || 'DISCOVER';
      const selectedModel = chatPayload.model || resolveCommerceModel();

      logger.info(`Processing shopping assistant chat message: intent '${parsedIntent}', model '${selectedModel}'`, {
        intent: parsedIntent,
        model: selectedModel,
        budgetCapCents: chatPayload.budget_cap_cents,
        productIds: chatPayload.product_ids,
        zipCode: chatPayload.zip_code,
        historyCount: chatPayload.history?.length || 0,
      });

      const response: ChatResponsePayload = await defaultShoppingAssistant.processMessage(chatPayload);
      const elapsed = timer(`Completed intent ${response.action || parsedIntent}`);

      // Process 1-Prompt Autonomous Purchase or Security Scoping for BUY intent
      if (response.action === 'BUY') {
        const user = request.user;
        const cartTotal = response.cart?.net_buyer_expenditure_cents || 0;
        const budgetCap = chatPayload.budget_cap_cents || 50000;

        if (user?.scope === 'order_tracking') {
          // Read-Only Security Boundary
          logger.warn('Blocking purchase attempt in read-only order_tracking session', {
            userId: user.id,
            orderId: user.orderId,
          });
          response.markdown = `⚠️ **Read-Only Session Active**\n\nYou are viewing Order **#${user.orderId || ''}** via a secure tracking link. For your security, placing new orders is disabled in read-only mode.\n\nPlease connect with PayPal to authorize a new shopping session.`;
          (response as any).read_only_tracking = true;
          (response as any).requires_paypal_auth = true;
        } else if (user?.scope === 'identity_only' || (!user?.hasMandate && user?.role !== 'guest')) {
          // Identity Verified ($0 Sign-in), but needs Spend Allowance Authorization
          logger.info('User authenticated via $0 identity; requires spend mandate for autonomous procurement', {
            userId: user?.id,
          });
          response.markdown = `✅ **Identity Verified with PayPal ($0 Sign-In)**\n\nTo allow your agent to execute purchases autonomously, please authorize a spend allowance. Alternatively, click below to review and approve this specific order.`;
          (response as any).requires_spend_mandate = true;
          (response as any).hitl_approval_required = true;
        } else if (user?.scope === 'autonomous_buyer' || user?.hasMandate) {
          // Pre-authorized autonomous buyer!
          if (cartTotal > 0 && cartTotal <= budgetCap) {
            const generatedOrderId = `ord_pp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const trackingNumber = `7890${Math.floor(10000000 + Math.random() * 90000000)}`;
            const trackingToken = createOrderTrackingToken(generatedOrderId, user?.id || 'buyer');
            const trackingUrl = `/history?order_id=${encodeURIComponent(generatedOrderId)}&token=${encodeURIComponent(trackingToken)}`;
            const productTitle = response.products?.[0]?.title || 'Product Order';

            logPurchase({
              order_id: generatedOrderId,
              user_id: user?.id || 'demo',
              title: productTitle,
              price_cents: cartTotal,
              merchant_domain: response.products?.[0]?.merchant_domain || 'bestbuy.com',
              cleaned_url: response.products?.[0]?.cleaned_url,
              score: (response.products?.[0] as any)?.composite_score || 9.4,
              tx_id: `PAYID-${generatedOrderId.toUpperCase()}`,
              reservation_id: (response as any).stock_reservation?.reservation_id || `vch_${Date.now()}`,
              escrow_status: 'HELD',
            });

            logger.info('Executed 1-prompt autonomous purchase successfully', {
              orderId: generatedOrderId,
              userId: user?.id,
              cartTotal,
              trackingNumber,
            });

            response.markdown = `⚡ **1-Prompt Autonomous Purchase Complete!**\n\nYour order for **${productTitle}** has been autonomously negotiated and authorized with PayPal Vault v3.\n\n- **Order ID:** \`${generatedOrderId}\`\n- **Authorized Total:** $${(cartTotal / 100).toFixed(2)}\n- **Escrow Hold Status:** \`HELD\` (72-Hour Price-Drop Escrow Active)\n- **Carrier:** FedEx Priority\n- **Tracking #:** \`${trackingNumber}\`\n- [Track Shipment](${trackingUrl})`;
            (response as any).autonomous_buy_executed = true;
            (response as any).order_id = generatedOrderId;
            (response as any).tracking_number = trackingNumber;
            (response as any).tracking_url = trackingUrl;
          } else {
            response.markdown = `⚠️ **Budget Limit Exceeded**\n\nThe optimal cart requires **$${(cartTotal / 100).toFixed(2)}**, which exceeds your pre-authorized budget cap of **$${(budgetCap / 100).toFixed(2)}**.\n\nPlease approve the difference below to proceed.`;
            (response as any).hitl_approval_required = true;
          }
        }
      }

      logger.info(`Shopping assistant response generated in ${elapsed}ms`, {
        intent: response.action || parsedIntent,
        productCount: response.products?.length || 0,
        hasComparison: Boolean(response.comparison),
        hasCart: Boolean(response.cart),
        followUpCount: response.follow_up_suggestions?.length || 0,
      });

      return reply.send({
        status: 'SUCCESS',
        ...response,
      });
    } catch (err: any) {
      timer(`Failed with error: ${err.message}`);
      logger.error(`Shopping assistant execution failed: ${err.message}`, {
        route: '/api/buyer/chat',
        code: 'SHOPPING_CONCIERGE_FAILED',
        action: parseResult.data.action || 'DISCOVER',
        stack: err.stack,
      });
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
    logger.debug(`Evaluating clarification need for query: '${query}'`);
    const needs = defaultShoppingAssistant.needsClarification(query);
    const questions = needs ? await defaultShoppingAssistant.getClarifyingQuestions(query) : [];
    logger.info(`Clarification evaluation for '${query}': needs=${needs}, questionsCount=${questions.length}`, {
      query,
      needs,
      questionsCount: questions.length,
    });
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
    logger.debug(`Enriching query '${body?.query}' with user answers`, { answers: body?.answers });
    const enriched = defaultShoppingAssistant.buildEnrichedQuery(body?.query || '', body?.answers || {});
    logger.info(`Enriched query result: '${enriched}' (original: '${body?.query}')`);
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
    const title = query?.title || '';
    logger.debug(`Fetching community sentiment for product: '${title}'`);
    const sentiment = await defaultShoppingAssistant.getCommunitySentiment(title);
    logger.info(`Retrieved community sentiment for '${title}'`, { title, sentiment });
    return reply.send({
      status: 'SUCCESS',
      title,
      community_sentiment: sentiment,
    });
  });

  /**
   * GET /api/buyer/social-proof
   * Returns community social proof signals, sentiment emoji, highlights, and review links.
   */
  fastify.get('/api/buyer/social-proof', async (request, reply) => {
    const query = request.query as { title?: string };
    const title = query?.title || '';
    logger.debug(`Fetching social proof signals for product: '${title}'`);
    const proof = await defaultShoppingAssistant.getSocialProof(title);
    logger.info(`Retrieved social proof for '${title}'`, { title, proof });
    return reply.send({
      status: 'SUCCESS',
      title,
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
      logger.warn('Battle report requested without both contenders', { hasA: Boolean(body?.contender_a), hasB: Boolean(body?.contender_b) });
      return reply.status(400).send({ error: 'MISSING_CONTENDERS', message: 'Both contender_a and contender_b are required.' });
    }
    logger.info('Generating head-to-head Tale of the Tape battle report', {
      contenderA: body.contender_a?.title || body.contender_a?.id,
      contenderB: body.contender_b?.title || body.contender_b?.id,
    });
    const report = await defaultShoppingAssistant.generateBattleReport(body.contender_a, body.contender_b);
    logger.info('Successfully generated battle report');
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
      logger.warn('Watchlist add rejected: title or target_price_cents missing', { body });
      return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'title and target_price_cents are required.' });
    }
    const userId = request.user?.id || body.user_id || 'demo';
    logger.info(`Adding product to price-drop watchlist for user '${userId}': '${body.title}'`, {
      userId,
      title: body.title,
      targetPriceCents: body.target_price_cents,
      currentPriceCents: body.current_price_cents,
    });
    const item = addToWatchlist(userId, body);
    return reply.send({ status: 'SUCCESS', watchlist_item: item });
  });

  /**
   * GET /api/buyer/watchlist
   * Fetches the user's price-drop watchlist.
   */
  fastify.get('/api/buyer/watchlist', { preHandler: [authenticateUser] }, async (request, reply) => {
    const userId = request.user?.id || 'demo';
    logger.debug(`Retrieving price-drop watchlist for user '${userId}'`);
    const items = getWatchlist(userId);
    logger.info(`Retrieved ${items.length} watchlist items for user '${userId}'`);
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
    logger.info(`Removing watchlist item '${id}' for user '${userId}'`);
    const removed = removeFromWatchlist(userId, id);
    return reply.send({ status: 'SUCCESS', removed });
  });

  /**
   * GET /api/buyer/prefs
   * Fetches user preferences.
   */
  fastify.get('/api/buyer/prefs', { preHandler: [authenticateUser] }, async (request, reply) => {
    const userId = request.user?.id || 'demo';
    logger.debug(`Fetching user preferences for '${userId}'`);
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
      logger.warn('User preference update rejected: key is required');
      return reply.status(400).send({ error: 'INVALID_REQUEST', message: 'key is required' });
    }
    const userId = request.user?.id || body?.user_id || 'demo';
    logger.info(`Updating user preference for '${userId}': ${body.key} = ${JSON.stringify(body.value)}`);
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
    logger.debug(`Retrieving purchase transaction history for '${userId}', limit: ${limit}`);
    const history = getPurchaseHistory(userId, limit);
    logger.info(`Retrieved ${history.length} transaction history records for user '${userId}'`);
    return reply.send({ status: 'SUCCESS', history });
  });

  /**
   * POST /api/buyer/watchlist/check
   * Scans all user watchlists and checks for price drop alerts.
   */
  fastify.post('/api/buyer/watchlist/check', async (request, reply) => {
    logger.info('Executing scheduled/manual price drop check across all user watchlists');
    const report = await checkAllWatchlists();
    logger.info('Watchlist scan completed successfully', { reportSummary: report });
    return reply.send({ status: 'SUCCESS', report });
  });

  /**
   * GET /api/buyer/watchlist/alerts
   * Returns price-drop alerts triggered by the watchlist job.
   */
  fastify.get('/api/buyer/watchlist/alerts', { preHandler: [authenticateUser] }, async (request, reply) => {
    const userId = request.user?.id;
    logger.debug(`Retrieving price-drop alerts for user '${userId || 'all'}'`);
    const alerts = getWatchlistAlerts(userId);
    logger.info(`Retrieved ${alerts.length} price-drop alerts`);
    return reply.send({ status: 'SUCCESS', alerts });
  });

  /**
   * GET /api/buyer/receipts
   * Returns user receipts and cryptographic certificates.
   */
  fastify.get('/api/buyer/receipts', { preHandler: [authenticateUser] }, async (request, reply) => {
    const userId = request.user?.id || 'demo';
    logger.debug(`Retrieving receipts and cryptographic certificates for '${userId}'`);
    const receipts = getReceipts(userId);
    logger.info(`Retrieved ${receipts.length} receipts for user '${userId}'`);
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
    logger.info(`Confirming order delivery and capturing escrow hold for order '${orderId}', user '${userId}'`);
    const updated = updatePurchaseStatus(userId, orderId, 'CAPTURED');
    logger.info(`Escrow status updated to CAPTURED for order '${orderId}'`);
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
    logger.info(`Refunding order hold and updating escrow status to REFUNDED for order '${orderId}', user '${userId}'`);
    const updated = updatePurchaseStatus(userId, orderId, 'REFUNDED');
    logger.info(`Escrow status updated to REFUNDED for order '${orderId}'`);
    return reply.send({ status: 'SUCCESS', order_id: orderId, escrow_status: 'REFUNDED', updated });
  });
};
