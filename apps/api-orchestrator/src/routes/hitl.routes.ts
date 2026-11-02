import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { defaultHitlApprovalRegistry, HitlApprovalRequest } from '../services/hitl-approval.js';

const HitlDecisionSchema = z.object({
  id: z.string(),
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().optional(),
  action_token: z.string().optional(),
});

const HitlCreateSchema = z.object({
  type: z.enum(['MERCHANT_COUNTER_OFFER', 'CAP_OVERAGE_EXCEPTION', 'DISPUTE_ARBITRATION', 'CUSTOM_ACTION']).optional(),
  mandate_id: z.string().optional(),
  title: z.string().optional(),
  message: z.string(),
  original_amount_cents: z.number().int().optional(),
  requested_amount_cents: z.number().int().optional(),
  delta_cents: z.number().int().optional(),
  currency: z.string().optional(),
  timeout_seconds: z.number().int().positive().max(300).optional(),
  metadata: z.record(z.any()).optional(),
});

export const hitlRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/hitl/pending
   * Returns all current unexpired pending HITL approvals
   */
  fastify.get('/api/hitl/pending', async (_request, reply) => {
    return reply.send({
      pending: defaultHitlApprovalRegistry.getPendingRequests(),
      all: defaultHitlApprovalRegistry.getAllRequests(),
    });
  });

  /**
   * GET /api/hitl/events
   * Server-Sent Events (SSE) streaming channel broadcasting approval requests in real time
   */
  fastify.get('/api/hitl/events', async (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial snapshot
    const initialPending = defaultHitlApprovalRegistry.getPendingRequests();
    reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(initialPending)}\n\n`);

    // Subscribe to new events
    const unsubscribe = defaultHitlApprovalRegistry.subscribe((event) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
    });

    // Send keepalive pings every 15 seconds
    const keepaliveTimer = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 15000);

    request.raw.on('close', () => {
      clearInterval(keepaliveTimer);
      unsubscribe();
    });
  });

  /**
   * POST /api/hitl/requests
   * Programmatically dispatch an approval request
   */
  fastify.post('/api/hitl/requests', async (request, reply) => {
    const parseResult = HitlCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    // Register async approval request
    // We start the approval process and return the registered request object
    const opts = parseResult.data;
    const reqPromise = defaultHitlApprovalRegistry.requestApproval(opts);

    // Retrieve the newly created request item from pending
    const pending = defaultHitlApprovalRegistry.getPendingRequests();
    const created = pending[pending.length - 1];

    // If caller requests waiting for resolution synchronously, wait
    if ((request.query as any)?.wait === 'true') {
      const resolved = await reqPromise;
      return reply.send({ status: 'RESOLVED', request: resolved });
    }

    return reply.status(201).send({
      status: 'QUEUED',
      request: created,
    });
  });

  /**
   * POST /api/hitl/respond
   * Submits human decision for a pending approval
   */
  fastify.post('/api/hitl/respond', async (request, reply) => {
    const parseResult = HitlDecisionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const { id, decision, reason, action_token } = parseResult.data;
    try {
      const result = defaultHitlApprovalRegistry.resolveDecision(id, decision === 'APPROVE', {
        reason,
        action_token,
      });
      return reply.send({
        status: 'SUCCESS',
        result,
      });
    } catch (err: any) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: err.message });
    }
  });
};
