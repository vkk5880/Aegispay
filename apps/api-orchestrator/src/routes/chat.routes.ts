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
};
