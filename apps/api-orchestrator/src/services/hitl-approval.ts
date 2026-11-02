import { EventEmitter } from 'node:events';

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

export class HitlApprovalRegistry {
  private requests = new Map<string, HitlApprovalRequest>();
  private executions = new Map<string, PendingExecution>();
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  /**
   * Registers a 60-second HITL approval request, broadcasts via SSE/EventEmitter,
   * and returns a Promise that settles when human approves, rejects, or the 60s timer expires.
   */
  async requestApproval(opts: CreateApprovalOptions): Promise<HitlApprovalRequest> {
    const timeoutSeconds = opts.timeout_seconds ?? 60;
    const now = Date.now();
    const expiresAtMs = now + timeoutSeconds * 1000;
    const id = opts.id || `hitl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    const req: HitlApprovalRequest = {
      id,
      type: opts.type || 'MERCHANT_COUNTER_OFFER',
      mandate_id: opts.mandate_id,
      title: opts.title || (opts.type === 'CAP_OVERAGE_EXCEPTION' ? 'Cap Overage Exception' : 'Merchant Counter-Offer'),
      message: opts.message,
      original_amount_cents: opts.original_amount_cents,
      requested_amount_cents: opts.requested_amount_cents,
      delta_cents:
        opts.delta_cents ??
        (opts.requested_amount_cents && opts.original_amount_cents
          ? opts.requested_amount_cents - opts.original_amount_cents
          : undefined),
      currency: opts.currency || 'USD',
      timeout_seconds: timeoutSeconds,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      status: 'PENDING',
      metadata: opts.metadata,
    };

    this.requests.set(id, req);

    return new Promise<HitlApprovalRequest>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.expireRequest(id);
      }, timeoutSeconds * 1000);

      this.executions.set(id, { request: req, timer, resolve, reject });

      // Broadcast to all active SSE/WebSocket listeners
      this.broadcast('request:created', req);
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
    const existing = this.requests.get(id);
    if (!existing) {
      throw new Error(`Approval request with ID ${id} not found`);
    }

    if (existing.status !== 'PENDING') {
      return existing;
    }

    const exec = this.executions.get(id);
    if (exec) {
      clearTimeout(exec.timer);
      this.executions.delete(id);
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
    const existing = this.requests.get(id);
    if (!existing || existing.status !== 'PENDING') {
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
    this.broadcast('request:expired', updated);

    if (exec) {
      exec.resolve(updated);
    }
  }

  getRequest(id: string): HitlApprovalRequest | undefined {
    return this.requests.get(id);
  }

  getPendingRequests(): HitlApprovalRequest[] {
    const now = Date.now();
    return Array.from(this.requests.values()).filter(
      (r) => r.status === 'PENDING' && new Date(r.expires_at).getTime() > now
    );
  }

  getAllRequests(): HitlApprovalRequest[] {
    return Array.from(this.requests.values());
  }

  subscribe(listener: (event: { type: string; payload: HitlApprovalRequest }) => void): () => void {
    const onEvent = (event: { type: string; payload: HitlApprovalRequest }) => {
      listener(event);
    };
    this.emitter.on('event', onEvent);
    return () => {
      this.emitter.off('event', onEvent);
    };
  }

  private broadcast(eventType: string, payload: HitlApprovalRequest): void {
    this.emitter.emit('event', { type: eventType, payload });
  }

  clear(): void {
    for (const exec of this.executions.values()) {
      clearTimeout(exec.timer);
    }
    this.executions.clear();
    this.requests.clear();
  }
}

export const defaultHitlApprovalRegistry = new HitlApprovalRegistry();
