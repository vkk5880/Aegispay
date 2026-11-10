import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { defaultHitlApprovalRegistry, HitlApprovalRequest } from '../services/hitl-approval.js';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

export const logger = createLogger('API:Routes:HITL');

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
    logger.debug('Fetching pending and complete HITL requests');
    const pending = defaultHitlApprovalRegistry.getPendingRequests();
    const all = defaultHitlApprovalRegistry.getAllRequests();
    logger.info(`HITL queue summary: ${pending.length} pending, ${all.length} total`, {
      pendingCount: pending.length,
      allCount: all.length,
      pendingIds: pending.map((r) => r.id),
    });
    return reply.send({
      pending,
      all,
    });
  });

  /**
   * GET /api/hitl/events
   * Server-Sent Events (SSE) streaming channel broadcasting approval requests in real time
   */
  fastify.get('/api/hitl/events', async (request, reply) => {
    logger.info('New client connected to HITL SSE stream', {
      ip: request.ip,
      userAgent: request.headers['user-agent'] || 'unknown',
    });

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial snapshot
    const initialPending = defaultHitlApprovalRegistry.getPendingRequests();
    logger.debug(`Sending initial snapshot of ${initialPending.length} pending requests to SSE client`);
    reply.raw.write(`event: snapshot\ndata: ${JSON.stringify(initialPending)}\n\n`);

    // Subscribe to new events
    const unsubscribe = defaultHitlApprovalRegistry.subscribe((event) => {
      logger.debug(`Broadcasting SSE event: ${event.type}`, { eventType: event.type, payload: event.payload });
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
    });

    // Send keepalive pings every 15 seconds
    const keepaliveTimer = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 15000);

    request.raw.on('close', () => {
      logger.info('Client disconnected from HITL SSE stream, cleaning up subscription and keepalive timer');
      clearInterval(keepaliveTimer);
      unsubscribe();
    });
  });

  /**
   * POST /api/hitl/requests
   * Programmatically dispatch an approval request
   */
  fastify.post('/api/hitl/requests', async (request, reply) => {
    logger.info('Received request to create HITL approval request', {
      body: sanitizeForLogging(request.body),
      query: request.query,
    });

    const parseResult = HitlCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      logger.warn('HitlCreateSchema validation failed', { errors: parseResult.error.format() });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    // Register async approval request
    // We start the approval process and return the registered request object
    const opts = parseResult.data;
    logger.debug('Registering approval request in defaultHitlApprovalRegistry', {
      type: opts.type,
      mandate_id: opts.mandate_id,
      delta_cents: opts.delta_cents,
      timeout_seconds: opts.timeout_seconds,
    });
    const reqPromise = defaultHitlApprovalRegistry.requestApproval(opts);

    // Retrieve the newly created request item from pending
    const pending = defaultHitlApprovalRegistry.getPendingRequests();
    const created = pending[pending.length - 1];

    logger.info(`Created HITL approval request ${created?.id} (type: ${created?.type})`, {
      id: created?.id,
      timeoutSeconds: created?.timeout_seconds,
      originalAmount: created?.original_amount_cents,
      requestedAmount: created?.requested_amount_cents,
    });

    // If caller requests waiting for resolution synchronously, wait
    if ((request.query as any)?.wait === 'true') {
      logger.info(`Synchronous wait requested for HITL request ${created?.id}`);
      const resolved = await reqPromise;
      logger.info(`Synchronous HITL request ${created?.id} resolved with status: ${resolved.status}`);
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
    logger.info('Received operator decision for HITL approval', {
      body: sanitizeForLogging(request.body),
    });

    const parseResult = HitlDecisionSchema.safeParse(request.body);
    if (!parseResult.success) {
      logger.warn('HitlDecisionSchema validation failed', { errors: parseResult.error.format() });
      return reply.status(400).send({ error: 'INVALID_REQUEST', details: parseResult.error.format() });
    }

    const { id, decision, reason, action_token } = parseResult.data;
    logger.info(`Processing operator decision for ${id}: ${decision}`, {
      id,
      decision,
      reason,
      hasActionToken: Boolean(action_token),
    });

    try {
      const result = defaultHitlApprovalRegistry.resolveDecision(id, decision === 'APPROVE', {
        reason,
        action_token,
      });
      logger.info(`Successfully resolved HITL decision for ${id}`, {
        id,
        decision,
        status: result.status,
      });
      return reply.send({
        status: 'SUCCESS',
        result,
      });
    } catch (err: any) {
      logger.error(`Failed to resolve HITL decision for ${id}: ${err.message}`, {
        route: '/api/hitl/respond',
        id,
        decision,
        code: 'NOT_FOUND',
        stack: err.stack,
      });
      return reply.status(404).send({ error: 'NOT_FOUND', message: err.message });
    }
  });
};
