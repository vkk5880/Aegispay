import crypto from 'node:crypto';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';

const logger = createLogger('MCP:Enforcer:AuditChain', { stream: 'stderr' });

/**
 * Genesis hash for the initial block in the immutable hash chain.
 * Matching Custodian canonical.py: 64 zeros hex string.
 */
export const GENESIS_HASH = '0'.repeat(64);

export enum LedgerEventType {
  INTENT_RECEIVED = 'INTENT_RECEIVED',
  SNAPSHOT_TAKEN = 'SNAPSHOT_TAKEN',
  SEMANTIC_VERDICT = 'SEMANTIC_VERDICT',
  DECISION_MADE = 'DECISION_MADE',
  RECONFIRM_REQUESTED = 'RECONFIRM_REQUESTED',
  RECONFIRM_GRANTED = 'RECONFIRM_GRANTED',
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_SETTLED = 'PAYMENT_SETTLED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

export class CanonicalisationError extends TypeError {}

export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

export class LedgerError extends RuntimeError {}

/**
 * Validates that a node contains only deterministic canonical types.
 * Strictly rejects floating-point numbers to prevent platform-dependent float repr drift.
 */
export function validateCanonicalNode(node: unknown, path = '$'): void {
  if (node === null || typeof node === 'boolean' || typeof node === 'string') {
    return;
  }

  if (typeof node === 'number') {
    if (!Number.isFinite(node)) {
      logger.error('Canonical validation error: non-finite number detected', { path, value: node });
      throw new CanonicalisationError(`Non-finite number at ${path}: ${node}`);
    }
    if (!Number.isInteger(node)) {
      logger.error('Canonical validation error: floating-point number detected in financial hash chain', {
        path,
        value: node,
      });
      throw new CanonicalisationError(
        `float at ${path}: ${node}. Floats have no canonical form and must never enter the hash chain — use integer cents (custodian.money) or integer basis points (custodian.bp).`
      );
    }
    return;
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      validateCanonicalNode(node[i], `${path}[${i}]`);
    }
    return;
  }

  if (typeof node === 'object') {
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      if (typeof key !== 'string') {
        logger.error('Canonical validation error: non-string key in object', { path, key: String(key) });
        throw new CanonicalisationError(`non-string key at ${path}: ${String(key)}`);
      }
      validateCanonicalNode(val, `${path}.${key}`);
    }
    return;
  }

  logger.error('Canonical validation error: unserialisable type', { path, type: typeof node });
  throw new CanonicalisationError(`unserialisable type at ${path}: ${typeof node}`);
}

/**
 * Serializes value into canonical JSON string (RFC 8785 spirit):
 * Sorted keys, no extra whitespace separators, UTF-8.
 */
export function canonicalJson(value: unknown): string {
  validateCanonicalNode(value);

  function sortAndStringify(v: unknown): string {
    if (v === null || typeof v === 'boolean' || typeof v === 'number') {
      return JSON.stringify(v);
    }
    if (typeof v === 'string') {
      return JSON.stringify(v);
    }
    if (Array.isArray(v)) {
      return '[' + v.map(sortAndStringify).join(',') + ']';
    }
    if (typeof v === 'object') {
      const keys = Object.keys(v as Record<string, unknown>).sort();
      const parts = keys.map(
        (k) => JSON.stringify(k) + ':' + sortAndStringify((v as Record<string, unknown>)[k])
      );
      return '{' + parts.join(',') + '}';
    }
    return '';
  }

  return sortAndStringify(value);
}

/**
 * Generates lowercase SHA-256 hex string from canonical bytes.
 */
export function canonicalHash(value: unknown): string {
  const jsonStr = canonicalJson(value);
  const hash = crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
  logger.debug('Calculated canonical SHA-256 hash', {
    hashPrefix: hash.slice(0, 16),
    byteLength: Buffer.byteLength(jsonStr, 'utf8'),
  });
  return hash;
}

/**
 * One immutable link in the audit chain.
 */
export interface LedgerEvent {
  readonly seq: number;
  readonly event_id: string;
  readonly request_id: string;
  readonly ts: string;
  readonly event_type: string;
  readonly payload: {
    readonly observed: Record<string, unknown>;
    readonly inferred: Record<string, unknown>;
  };
  readonly prev_hash: string;
  readonly hash: string;
}

/**
 * Computes composite SHA-256 hash across a chain link structure.
 */
export function computeChainHash(params: {
  prev_hash: string;
  event_id: string;
  request_id: string;
  ts: string;
  event_type: string;
  payload: {
    observed: Record<string, unknown>;
    inferred: Record<string, unknown>;
  };
}): string {
  logger.debug('Computing chain hash for audit link', {
    prevHashPrefix: params.prev_hash.slice(0, 16),
    eventId: params.event_id,
    requestId: params.request_id,
    eventType: params.event_type,
  });

  const hash = canonicalHash({
    prev_hash: params.prev_hash,
    event_id: params.event_id,
    request_id: params.request_id,
    ts: params.ts,
    event_type: params.event_type,
    payload: params.payload,
  });

  logger.debug('Computed chain hash for audit link successfully', {
    eventId: params.event_id,
    hashPrefix: hash.slice(0, 16),
  });
  return hash;
}

/**
 * Append-only, hash-chained evidence ledger ported from Custodian chain.py.
 * Guarantees tamper-evidence across decisions, mandates, and payments.
 */
export class AuditChain {
  private events: LedgerEvent[] = [];

  getHead(): LedgerEvent | null {
    return this.events.length > 0 ? this.events[this.events.length - 1] : null;
  }

  append(params: {
    request_id: string;
    event_type: LedgerEventType | string;
    observed: Record<string, unknown>;
    inferred?: Record<string, unknown>;
    event_id?: string;
    ts?: string;
  }): LedgerEvent {
    logger.info('Appending event link to MCP immutable audit chain', {
      requestId: params.request_id,
      eventType: String(params.event_type),
      currentChainLength: this.events.length,
      hasExplicitEventId: Boolean(params.event_id),
    });

    if (!params.observed || typeof params.observed !== 'object') {
      logger.error('Audit chain append failed: observed is not a record/object', {
        requestId: params.request_id,
        type: typeof params.observed,
      });
      throw new LedgerError('observed must be a record/object');
    }
    const inferred = params.inferred ?? {};
    if (typeof inferred !== 'object') {
      logger.error('Audit chain append failed: inferred is not a record/object', {
        requestId: params.request_id,
        type: typeof inferred,
      });
      throw new LedgerError('inferred must be a record/object');
    }

    const prev = this.getHead();
    const prev_hash = prev ? prev.hash : GENESIS_HASH;
    const seq = this.events.length + 1;
    const event_id = params.event_id || `evt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const ts = params.ts || new Date().toISOString();
    const payload = {
      observed: params.observed,
      inferred,
    };

    logger.debug('Calculating SHA-256 hash for audit chain event', {
      seq,
      eventId: event_id,
      prevHashPrefix: prev_hash.slice(0, 16),
      isGenesis: prev_hash === GENESIS_HASH,
    });

    const hash = computeChainHash({
      prev_hash,
      event_id,
      request_id: params.request_id,
      ts,
      event_type: params.event_type,
      payload,
    });

    const event: LedgerEvent = {
      seq,
      event_id,
      request_id: params.request_id,
      ts,
      event_type: String(params.event_type),
      payload,
      prev_hash,
      hash,
    };

    this.events.push(Object.freeze(event));
    logger.info('Successfully appended and sealed event in MCP audit chain', {
      seq,
      eventId: event_id,
      hashPrefix: hash.slice(0, 16),
      totalEvents: this.events.length,
    });
    return event;
  }

  verifyChain(): boolean {
    logger.info('Verifying MCP audit chain integrity', { totalEvents: this.events.length });

    for (let i = 0; i < this.events.length; i++) {
      const current = this.events[i];
      const expectedPrevHash = i === 0 ? GENESIS_HASH : this.events[i - 1].hash;

      if (current.prev_hash !== expectedPrevHash) {
        logger.error('MCP audit chain integrity violation: previous hash mismatch', {
          seq: current.seq,
          eventId: current.event_id,
          recordedPrevHashPrefix: current.prev_hash.slice(0, 16),
          expectedPrevHashPrefix: expectedPrevHash.slice(0, 16),
        });
        return false;
      }

      const calculatedHash = computeChainHash({
        prev_hash: current.prev_hash,
        event_id: current.event_id,
        request_id: current.request_id,
        ts: current.ts,
        event_type: current.event_type,
        payload: current.payload,
      });

      if (current.hash !== calculatedHash) {
        logger.error('MCP audit chain integrity violation: hash recalculation mismatch', {
          seq: current.seq,
          eventId: current.event_id,
          recordedHashPrefix: current.hash.slice(0, 16),
          calculatedHashPrefix: calculatedHash.slice(0, 16),
        });
        return false;
      }
    }

    logger.info('MCP audit chain integrity successfully verified', { totalEvents: this.events.length });
    return true;
  }

  getEvents(): readonly LedgerEvent[] {
    return [...this.events];
  }

  getEventsByRequestId(requestId: string): LedgerEvent[] {
    const matches = this.events.filter((e) => e.request_id === requestId);
    logger.debug('Queried MCP audit chain events by requestId', {
      requestId,
      matchedCount: matches.length,
    });
    return matches;
  }

  clear(): void {
    const priorCount = this.events.length;
    this.events = [];
    logger.info('Cleared MCP audit chain', { clearedEventsCount: priorCount });
  }
}

export const defaultAuditChain = new AuditChain();

// Aliases matching Custodian reference repository audit specifications
export { AuditChain as ImmutableAuditChain };

export function appendVerdict(
  chain: AuditChain,
  requestId: string,
  verdict: Record<string, unknown>
): LedgerEvent {
  logger.info('Appending decision verdict to MCP audit chain', { requestId });
  return chain.append({
    request_id: requestId,
    event_type: LedgerEventType.DECISION_MADE,
    observed: verdict,
  });
}

export function verifyChainIntegrity(chain: AuditChain): boolean {
  logger.debug('Invoking verifyChainIntegrity helper');
  return chain.verifyChain();
}

