import { FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';
import { defaultPayPalClient } from '../services/paypal-apimatic.js';

// Idempotency cache tracking processed webhook event IDs to prevent duplicate transaction execution
// Uses Map to implement a true LRU cache (access moves entry to end; oldest evicted when capacity reached)
export const MAX_PROCESSED_EVENTS = 5000;
const processedWebhookEvents = new Map<string, { eventType: string; processedAt: number }>();

// Distributed Redis Idempotency client with graceful offline fallback
let redisClient: Redis | null = null;
if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    redisClient.on('error', () => {
      // Gracefully fall back to local LRU
    });
  } catch {
    redisClient = null;
  }
}

/**
 * Atomic idempotency lock: Uses Redis SET ... EX 259200 NX (72 hours)
 * Falls back to in-memory LRU if Redis is absent or unreachable.
 */
export async function acquireWebhookIdempotency(eventId: string, eventType = 'UNKNOWN'): Promise<boolean> {
  if (!eventId) return false;

  if (redisClient) {
    try {
      const res = await redisClient.set(
        `paypal:webhook:${eventId}`,
        JSON.stringify({ eventType, processedAt: Date.now() }),
        'EX',
        259200,
        'NX'
      );
      if (res === 'OK') {
        recordWebhookEventProcessed(eventId, eventType);
        return true;
      }
      return false;
    } catch {
      // Fallback to in-memory check
    }
  }

  if (isWebhookEventProcessed(eventId)) {
    return false;
  }
  recordWebhookEventProcessed(eventId, eventType);
  return true;
}

/**
 * Checks whether a given webhook event ID has already been recorded and processed.
 * If present, refreshes LRU position.
 */
export function isWebhookEventProcessed(eventId: string): boolean {
  if (!eventId) return false;
  const entry = processedWebhookEvents.get(eventId);
  if (entry) {
    // Refresh LRU ordering by deleting and re-inserting
    processedWebhookEvents.delete(eventId);
    processedWebhookEvents.set(eventId, entry);
    return true;
  }
  return false;
}

/**
 * Records a webhook event ID into the LRU idempotency cache.
 * Evicts oldest entry/entries when capacity reaches MAX_PROCESSED_EVENTS.
 */
export function recordWebhookEventProcessed(eventId: string, eventType = 'UNKNOWN'): void {
  if (!eventId) return;

  if (processedWebhookEvents.has(eventId)) {
    processedWebhookEvents.delete(eventId);
  } else if (processedWebhookEvents.size >= MAX_PROCESSED_EVENTS) {
    // Evict oldest entry in O(1)
    const oldestKey = processedWebhookEvents.keys().next().value;
    if (oldestKey !== undefined) {
      processedWebhookEvents.delete(oldestKey);
    }
  }

  processedWebhookEvents.set(eventId, {
    eventType,
    processedAt: Date.now(),
  });
}

/**
 * Returns the current size of the webhook event LRU idempotency cache.
 */
export function getWebhookEventCacheSize(): number {
  return processedWebhookEvents.size;
}

/**
 * Clears the webhook event LRU idempotency cache (useful for testing and sandbox isolation).
 */
export function clearWebhookEventCache(): void {
  processedWebhookEvents.clear();
}

/**
 * Validates that the certificate URL strictly belongs to PayPal's official domain and uses HTTPS,
 * preventing SSRF or DNS spoofing attacks via arbitrary certificate URL spoofing.
 */
export function isValidPayPalCertUrl(certUrl: string): boolean {
  if (!certUrl || typeof certUrl !== 'string') return false;
  try {
    const parsed = new URL(certUrl);
    if (parsed.protocol !== 'https:') return false;

    // Must be hosted on official PayPal domains
    const hostname = parsed.hostname.toLowerCase();
    const isPayPalHost =
      hostname === 'api.paypal.com' ||
      hostname === 'api.sandbox.paypal.com' ||
      hostname === 'api-m.paypal.com' ||
      hostname === 'api-m.sandbox.paypal.com' ||
      hostname.endsWith('.paypal.com');

    if (!isPayPalHost) return false;

    // Must end with a certificate extension or standard cert path
    if (!parsed.pathname.endsWith('.crt') && !parsed.pathname.endsWith('.pem')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export const paypalWebhooksRoutes: FastifyPluginAsync = async (fastify) => {
  // Fastify startup hook for automated webhook registration
  fastify.addHook('onReady', async () => {
    const webhookUrl =
      process.env.PAYPAL_WEBHOOK_URL ||
      (process.env.API_BASE_URL ? `${process.env.API_BASE_URL}/api/webhooks/paypal` : undefined);
    if (webhookUrl && defaultPayPalClient) {
      try {
        fastify.log.info(`Verifying/subscribing PayPal webhook subscription for ${webhookUrl}`);
        await defaultPayPalClient.ensureWebhookSubscription(webhookUrl);
        fastify.log.info('PayPal webhook subscription active.');
      } catch (err: any) {
        fastify.log.warn(`Auto webhook subscription registration skipped: ${err?.message || err}`);
      }
    }
  });

  fastify.post('/api/webhooks/paypal', async (request, reply) => {
    try {
      const headers = request.headers;
      const body = request.body;

      const authAlgo = (headers['paypal-auth-algo'] as string) || '';
      const certUrl = (headers['paypal-cert-url'] as string) || '';
      const transmissionId = (headers['paypal-transmission-id'] as string) || '';
      const transmissionSig = (headers['paypal-transmission-sig'] as string) || '';
      const transmissionTime = (headers['paypal-transmission-time'] as string) || '';

      const isProduction = process.env.NODE_ENV === 'production';

      // 1. Strict signature verification & certificate URL validation
      if (isProduction) {
        if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
          fastify.log.warn('PayPal Webhook verification failed: Missing required signature headers.');
          return reply.status(401).send({ error: 'INVALID_WEBHOOK_SIGNATURE' });
        }

        if (!isValidPayPalCertUrl(certUrl)) {
          fastify.log.warn(`PayPal Webhook verification failed: Invalid certificate URL domain: ${certUrl}`);
          return reply.status(401).send({ error: 'INVALID_WEBHOOK_SIGNATURE' });
        }
      }

      // Verify webhook signature cryptographically via PayPal SDK / REST verify endpoint
      const isValid = await defaultPayPalClient.verifyWebhookSignature({
        authAlgo,
        certUrl,
        transmissionId,
        transmissionSig,
        transmissionTime,
        webhookEvent: body,
      });

      if (!isValid && isProduction) {
        fastify.log.warn('PayPal Webhook verification failed: Cryptographic signature mismatch.');
        return reply.status(401).send({ error: 'INVALID_WEBHOOK_SIGNATURE' });
      }

      const event = body as { event_type?: string; resource?: any; id?: string };
      const eventId = event?.id || `evt_${Date.now()}`;
      const eventType = event?.event_type || 'UNKNOWN';

      // 2. Distributed Redis Lua atomic check-and-set idempotency check
      const acquired = await acquireWebhookIdempotency(eventId, eventType);
      if (!acquired) {
        fastify.log.info(`Duplicate PayPal webhook event ignored for idempotency: ${eventId} (${eventType})`);
        return reply.status(200).send({
          status: 'IDEMPOTENT_IGNORED',
          event_id: eventId,
          event_type: eventType,
          message: 'Event was previously processed.',
        });
      }

      fastify.log.info(`Received PayPal webhook event: ${eventType} (ID: ${eventId})`);

      // 3. Dispatch supported payment, subscription, and dispute lifecycle events
      switch (eventType) {
        // Payment Capture Lifecycle Events
        case 'PAYMENT.CAPTURE.COMPLETED':
          fastify.log.info(
            `Payment capture completed for capture ${event?.resource?.id}, amount: ${event?.resource?.amount?.value} ${event?.resource?.amount?.currency_code}`
          );
          break;
        case 'PAYMENT.CAPTURE.DENIED':
          fastify.log.warn(`Payment capture denied for capture ${event?.resource?.id}`);
          break;
        case 'PAYMENT.CAPTURE.REFUNDED':
          fastify.log.info(`Capture refund event received for capture ${event?.resource?.id}`);
          break;

        // Payment Authorization Lifecycle Events
        case 'PAYMENT.AUTHORIZATION.CREATED':
          fastify.log.info(`Authorization event received for hold ${event?.resource?.id}`);
          break;
        case 'PAYMENT.AUTHORIZATION.VOIDED':
          fastify.log.info(`Authorization hold voided for ${event?.resource?.id}`);
          break;

        // Dispute & Arbitration Lifecycle Events
        case 'CUSTOMER.DISPUTE.CREATED':
        case 'CUSTOMER.DISPUTE.UPDATED':
          fastify.log.info(
            `Dispute event received for dispute ${event?.resource?.dispute_id || event?.resource?.id}, stage: ${event?.resource?.dispute_life_cycle_stage}`
          );
          break;
        case 'CUSTOMER.DISPUTE.RESOLVED':
          fastify.log.info(
            `Dispute resolved for dispute ${event?.resource?.dispute_id || event?.resource?.id}, outcome: ${event?.resource?.dispute_outcome?.outcome_code}`
          );
          break;

        // Subscription & Recurring Billing Lifecycle Events
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
          fastify.log.info(`Subscription activated for ${event?.resource?.id}, plan: ${event?.resource?.plan_id}`);
          break;
        case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
          fastify.log.warn(`Subscription renewal failed for ${event?.resource?.id}`);
          break;
        case 'BILLING.SUBSCRIPTION.CANCELLED':
        case 'BILLING.SUBSCRIPTION.SUSPENDED':
          fastify.log.info(`Subscription status updated: ${eventType} for ${event?.resource?.id}`);
          break;
        case 'PAYMENT.SALE.COMPLETED':
          fastify.log.info(`Subscription recurring renewal sale completed for ${event?.resource?.id}`);
          break;

        default:
          fastify.log.info(`Handled informational webhook event: ${eventType}`);
          break;
      }

      // Always return HTTP 200 immediately to prevent PayPal webhook delivery retries
      return reply.status(200).send({
        status: 'PROCESSED',
        event_id: eventId,
        event_type: eventType,
        verified: isValid,
      });
    } catch (err: any) {
      fastify.log.error(`PayPal Webhook processing error: ${err?.message || err}`);
      // Return HTTP 200 to acknowledge receipt and avoid unbounded PayPal delivery retries on non-transient internal exceptions
      return reply.status(200).send({
        status: 'ERROR_ACKNOWLEDGED',
        error: err?.message || 'INTERNAL_ERROR',
      });
    }
  });
};
