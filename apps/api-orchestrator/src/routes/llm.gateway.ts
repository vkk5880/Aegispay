import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { defaultShoppingAssistant } from '../services/shopping-assistant.js';
import { authenticateUser } from '../middleware/auth.js';

export const logger = createLogger('API:Routes:LLMGateway');

const OpenAIChatCompletionSchema = z.object({
  model: z.string().default('aegispay-commerce-agent'),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'function', 'tool']),
      content: z.string().default(''),
      name: z.string().optional(),
    })
  ).min(1, 'Messages array cannot be empty'),
  stream: z.boolean().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().optional(),
  budget_cap_cents: z.number().int().positive().optional(),
});

export const llmGatewayRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /v1/models
   * Standard OpenAI models catalog endpoint.
   */
  fastify.get('/v1/models', async () => {
    logger.debug('OpenAI /v1/models invoked');
    const now = Math.floor(Date.now() / 1000);
    return {
      object: 'list',
      data: [
        {
          id: 'aegispay-commerce-agent',
          object: 'model',
          created: now,
          owned_by: 'aegispay',
          permission: [],
          root: 'aegispay-commerce-agent',
          parent: null,
        },
        {
          id: 'google/gemini-2.5-flash',
          object: 'model',
          created: now,
          owned_by: 'google',
          permission: [],
          root: 'google/gemini-2.5-flash',
          parent: null,
        },
        {
          id: 'google/gemini-2.5-pro',
          object: 'model',
          created: now,
          owned_by: 'google',
          permission: [],
          root: 'google/gemini-2.5-pro',
          parent: null,
        },
        {
          id: 'openai/gpt-4o',
          object: 'model',
          created: now,
          owned_by: 'openai',
          permission: [],
          root: 'openai/gpt-4o',
          parent: null,
        },
        {
          id: 'anthropic/claude-3-5-sonnet',
          object: 'model',
          created: now,
          owned_by: 'anthropic',
          permission: [],
          root: 'anthropic/claude-3-5-sonnet',
          parent: null,
        },
      ],
    };
  });

  /**
   * POST /v1/chat/completions
   * Standard OpenAI Chat Completion REST interface.
   * Enables LangChain, AutoGen, CrewAI, LlamaIndex, Cursor, and any OpenAI SDK client to connect.
   */
  fastify.post('/v1/chat/completions', { preHandler: [authenticateUser] }, async (request, reply) => {
    const parseResult = OpenAIChatCompletionSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      logger.warn('OpenAI Chat Completion request validation failed', {
        errors: parseResult.error.format(),
      });
      return reply.status(400).send({
        error: {
          message: 'Invalid request payload',
          type: 'invalid_request_error',
          param: parseResult.error.issues[0]?.path?.join('.'),
          code: 'invalid_parameter',
        },
      });
    }

    const { model, messages, stream, budget_cap_cents } = parseResult.data;
    const reqId = `chatcmpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const created = Math.floor(Date.now() / 1000);

    // Extract user prompt from last user message
    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];
    const userPrompt = lastUserMessage?.content || 'Hello';

    // Map conversation history
    const history = messages.slice(0, -1).map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));

    logger.info(`Processing OpenAI Chat Completion via model '${model}'`, {
      reqId,
      userPrompt: userPrompt.slice(0, 80),
      stream,
      user: request.user?.id,
    });

    try {
      const response = await defaultShoppingAssistant.processMessage({
        message: userPrompt,
        history,
        budget_cap_cents: budget_cap_cents || 50000,
        model: model !== 'aegispay-commerce-agent' ? model : undefined,
      });

      const markdownContent = response.markdown || 'No response generated.';

      if (stream) {
        reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
        reply.raw.setHeader('Connection', 'keep-alive');
        reply.raw.setHeader('X-Accel-Buffering', 'no');

        // Initial chunk with role
        const initChunk = {
          id: reqId,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null,
            },
          ],
        };
        reply.raw.write(`data: ${JSON.stringify(initChunk)}\n\n`);

        // Content chunk (split into manageable tokens)
        const words = markdownContent.split(' ');
        for (let i = 0; i < words.length; i += 3) {
          const slice = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '');
          const chunk = {
            id: reqId,
            object: 'chat.completion.chunk',
            created,
            model,
            choices: [
              {
                index: 0,
                delta: { content: slice },
                finish_reason: null,
              },
            ],
          };
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        // Final finish chunk
        const finishChunk = {
          id: reqId,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
            },
          ],
        };
        reply.raw.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
        return;
      }

      // Non-streaming standard response
      const approxTokens = Math.ceil(markdownContent.length / 4);
      return reply.send({
        id: reqId,
        object: 'chat.completion',
        created,
        model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: markdownContent,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: Math.ceil(userPrompt.length / 4),
          completion_tokens: approxTokens,
          total_tokens: Math.ceil(userPrompt.length / 4) + approxTokens,
        },
        aegispay: {
          action: response.action,
          products_count: response.products?.length || 0,
          cart_total_cents: response.cart?.net_buyer_expenditure_cents,
        },
      });
    } catch (err: any) {
      logger.error('Failed processing OpenAI Chat Completion', {
        reqId,
        error: err?.message,
        stack: err?.stack,
      });

      return reply.status(500).send({
        error: {
          message: err?.message || 'Internal commerce assistant error',
          type: 'api_error',
          code: 'internal_error',
        },
      });
    }
  });
};
