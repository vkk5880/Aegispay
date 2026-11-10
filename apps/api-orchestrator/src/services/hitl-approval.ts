import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import {
  createLogger,
  sanitizeForLogging,
} from '@aegispay/shared-types';

export type HitlApprovalType =
  | 'MERCHANT_COUNTER_OFFER'
  | 'CAP_OVERAGE_EXCEPTION'
  | 'DISPUTE_ARBITRATION'
  | 'CUSTOM_ACTION';

export type HitlApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export interface HitlApprovalRequest {
  id: string;
  type: HitlApprovalType;
  mandate_id?: string;
  title: string;
  message: string;
  original_amount_cents?: number;
  requested_amount_cents?: number;
  delta_cents?: number;
  currency?: string;
  timeout_seconds: number;
  created_at: string;
  expires_at: string;
  status: HitlApprovalStatus;
  metadata?: Record<string, any>;
  decision_payload?: {
    approved: boolean;
    reason?: string;
    resolved_at?: string;
    action_token?: string;
  };
}

export interface CreateApprovalOptions {
  id?: string;
  type?: HitlApprovalType;
  mandate_id?: string;
  title?: string;
  message: string;
  original_amount_cents?: number;
  requested_amount_cents?: number;
  delta_cents?: number;
  currency?: string;
  timeout_seconds?: number;
  metadata?: Record<string, any>;
}

interface PendingExecution {
  request: HitlApprovalRequest;
  timer: NodeJS.Timeout;
  resolve: (value: HitlApprovalRequest) => void;
  reject: (reason?: any) => void;
}

const logger = createLogger('API:Services:AIWorkflows').child('HitlApproval');

export class HitlApprovalRegistry {
  private requests = new Map<string, HitlApprovalRequest>();
  private executions = new Map<string, PendingExecution>();
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
    logger.info('[HitlApprovalRegistry:init] Initialized HITL Approval Registry with maxListeners=100');
  }

  /**
   * Registers a 60-second HITL approval request, broadcasts via SSE/EventEmitter,
   * and returns a Promise that settles when human approves, rejects, or the 60s timer expires.
   */
  async requestApproval(opts: CreateApprovalOptions): Promise<HitlApprovalRequest> {
    const endTimer = logger.time('HitlApproval:requestApproval');
    const timeoutSeconds = opts.timeout_seconds ?? 60;
    const now = Date.now();
    const expiresAtMs = now + timeoutSeconds * 1000;
    const id = opts.id || `hitl_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

    const type = opts.type || 'MERCHANT_COUNTER_OFFER';
    const title = opts.title || (type === 'CAP_OVERAGE_EXCEPTION' ? 'Cap Overage Exception' : 'Merchant Counter-Offer');
    const deltaCents = opts.delta_cents ?? (
      opts.requested_amount_cents && opts.original_amount_cents
        ? opts.requested_amount_cents - opts.original_amount_cents
        : undefined
    );

    logger.info(`[HitlApproval:requestApproval] Entering human review queue: ${id}`, {
      id,
      type,
      title,
      mandateId: opts.mandate_id,
      timeoutSeconds,
      originalAmountCents: opts.original_amount_cents,
      requestedAmountCents: opts.requested_amount_cents,
      deltaCents,
      expiresAt: new Date(expiresAtMs).toISOString(),
    });

    const req: HitlApprovalRequest = {
      id,
      type,
      mandate_id: opts.mandate_id,
      title,
      message: opts.message,
      original_amount_cents: opts.original_amount_cents,
      requested_amount_cents: opts.requested_amount_cents,
      delta_cents: deltaCents,
      currency: opts.currency || 'USD',
      timeout_seconds: timeoutSeconds,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      status: 'PENDING',
      metadata: opts.metadata,
    };

    this.requests.set(id, req);
    logger.debug(`[HitlApproval:requestApproval] Stored pending request in registry (${this.requests.size} total)`);

    return new Promise<HitlApprovalRequest>((resolve, reject) => {
      logger.debug(`[HitlApproval:requestApproval] Starting ${timeoutSeconds}s countdown timer for ${id}`);
      const timer = setTimeout(() => {
        logger.warn(`[HitlApproval:countdown_expired] 60s countdown timer reached 0 for request: ${id}`);
        this.expireRequest(id);
      }, timeoutSeconds * 1000);

      this.executions.set(id, { request: req, timer, resolve, reject });

      // Broadcast to all active SSE/WebSocket listeners
      logger.info(`[HitlApproval:broadcast] Broadcasting 'request:created' for request ${id}`);
      this.broadcast('request:created', req);
      endTimer(`requestId=${id}, type=${type}`);
    });
  }

  /**
   * Resolves an approval request with user decision (APPROVE or REJECT).
   */
  resolveDecision(
    id: string,
    approved: boolean,
    details?: { reason?: string; action_token?: string }
  ): HitlApprovalRequest {
    logger.info(`[HitlApproval:resolveDecision] Operator decision received for request ${id}`, {
      id,
      approved,
      hasReason: Boolean(details?.reason),
      hasActionToken: Boolean(details?.action_token),
    });

    const existing = this.requests.get(id);
    if (!existing) {
      logger.error(`[HitlApproval:resolveDecision] Approval request with ID ${id} not found`);
      throw new Error(`Approval request with ID ${id} not found`);
    }

    if (existing.status !== 'PENDING') {
      logger.warn(`[HitlApproval:resolveDecision] Request ${id} is already in terminal state: ${existing.status}`);
      return existing;
    }

    const exec = this.executions.get(id);
    if (exec) {
      logger.debug(`[HitlApproval:resolveDecision] Clearing countdown timer for request ${id}`);
      clearTimeout(exec.timer);
      this.executions.delete(id);
    } else {
      logger.warn(`[HitlApproval:resolveDecision] No active pending execution found for request ${id}`);
    }

    const updated: HitlApprovalRequest = {
      ...existing,
      status: approved ? 'APPROVED' : 'REJECTED',
      decision_payload: {
        approved,
        reason: details?.reason,
        action_token: details?.action_token,
        resolved_at: new Date().toISOString(),
      },
    };

    this.requests.set(id, updated);
    logger.info(`[HitlApproval:resolveDecision] Updated request ${id} status to ${updated.status}`, {
      id,
      status: updated.status,
      decisionPayload: updated.decision_payload,
    });

    logger.debug(`[HitlApproval:broadcast] Broadcasting 'request:resolved' for ${id}`);
    this.broadcast('request:resolved', updated);

    if (exec) {
      exec.resolve(updated);
    }

    return updated;
  }

  /**
   * Automatically expires a request after timeout reaches 0.
   */
  private expireRequest(id: string): void {
    logger.info(`[HitlApproval:expireRequest] Processing automatic expiration for request ${id}`);
    const existing = this.requests.get(id);
    if (!existing) {
      logger.warn(`[HitlApproval:expireRequest] Request ${id} not found on expiration trigger`);
      return;
    }
    if (existing.status !== 'PENDING') {
      logger.debug(`[HitlApproval:expireRequest] Request ${id} already transitioned to ${existing.status}, skipping expiration`);
      return;
    }

    const exec = this.executions.get(id);
    if (exec) {
      clearTimeout(exec.timer);
      this.executions.delete(id);
    }

    const updated: HitlApprovalRequest = {
      ...existing,
      status: 'EXPIRED',
      decision_payload: {
        approved: false,
        reason: 'Approval timed out after 60 seconds without human response.',
        resolved_at: new Date().toISOString(),
      },
    };

    this.requests.set(id, updated);
    logger.warn(`[HitlApproval:expireRequest] Request ${id} expired due to operator inaction`, {
      id,
      status: 'EXPIRED',
    });

    logger.debug(`[HitlApproval:broadcast] Broadcasting 'request:expired' for ${id}`);
    this.broadcast('request:expired', updated);

    if (exec) {
      exec.resolve(updated);
    }
  }

  getRequest(id: string): HitlApprovalRequest | undefined {
    const req = this.requests.get(id);
    logger.debug(`[HitlApproval:getRequest] Lookup for request ${id}: ${req ? req.status : 'NOT_FOUND'}`);
    return req;
  }

  getPendingRequests(): HitlApprovalRequest[] {
    const now = Date.now();
    const pending = Array.from(this.requests.values()).filter(
      (r) => r.status === 'PENDING' && new Date(r.expires_at).getTime() > now
    );
    logger.debug(`[HitlApproval:getPendingRequests] Returning ${pending.length} pending requests`);
    return pending;
  }

  getAllRequests(): HitlApprovalRequest[] {
    const all = Array.from(this.requests.values());
    logger.debug(`[HitlApproval:getAllRequests] Returning ${all.length} total requests`);
    return all;
  }

  subscribe(listener: (event: { type: string; payload: HitlApprovalRequest }) => void): () => void {
    logger.debug('[HitlApproval:subscribe] New subscriber connected to HITL events');
    const onEvent = (event: { type: string; payload: HitlApprovalRequest }) => {
      listener(event);
    };
    this.emitter.on('event', onEvent);
    return () => {
      logger.debug('[HitlApproval:subscribe] Subscriber disconnected from HITL events');
      this.emitter.off('event', onEvent);
    };
  }

  private broadcast(eventType: string, payload: HitlApprovalRequest): void {
    try {
      this.emitter.emit('event', { type: eventType, payload });
    } catch (err: any) {
      logger.error('[HitlApproval:broadcast] Error emitting HITL event', {
        eventType,
        error: sanitizeForLogging(err),
        stack: err?.stack,
      });
    }
  }

  clear(): void {
    logger.info(`[HitlApproval:clear] Clearing all ${this.executions.size} active executions and ${this.requests.size} requests`);
    for (const exec of this.executions.values()) {
      clearTimeout(exec.timer);
    }
    this.executions.clear();
    this.requests.clear();
  }
}

export const defaultHitlApprovalRegistry = new HitlApprovalRegistry();
