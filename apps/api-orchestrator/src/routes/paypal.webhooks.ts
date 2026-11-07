import { FastifyPluginAsync } from 'fastify';
import { defaultPayPalClient } from '../services/paypal-apimatic.js';

// Idempotency cache tracking processed webhook event IDs to prevent duplicate transaction execution
const processedWebhookEventIds = new Set<string>();
const MAX_PROCESSED_EVENTS = 5000;

export function isWebhookEventProcessed(eventId: string): boolean {
  return processedWebhookEventIds.has(eventId);
}

export function recordWebhookEventProcessed(eventId: string): void {
  if (processedWebhookEventIds.size >= MAX_PROCESSED_EVENTS) {
    // Evict oldest entries
    const iterator = processedWebhookEventIds.values();
    for (let i = 0; i < 500; i++) {
      const next = iterator.next();
      if (!next.done) {
        processedWebhookEventIds.delete(next.value);
      }
    }
  }
  processedWebhookEventIds.add(eventId);
}

export const paypalWebhooksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/webhooks/paypal', async (request, reply) => {
    const headers = request.headers;
    const body = request.body;

    const authAlgo = (headers['paypal-auth-algo'] as string) || '';
    const certUrl = (headers['paypal-cert-url'] as string) || '';
    const transmissionId = (headers['paypal-transmission-id'] as string) || '';
    const transmissionSig = (headers['paypal-transmission-sig'] as string) || '';
    const transmissionTime = (headers['paypal-transmission-time'] as string) || '';

    // Verify webhook signature cryptographically
    const isValid = await defaultPayPalClient.verifyWebhookSignature({
      authAlgo,
      certUrl,
      transmissionId,
      transmissionSig,
      transmissionTime,
      webhookEvent: body,
    });

    if (!isValid && process.env.NODE_ENV === 'production') {
      fastify.log.warn('PayPal Webhook verification failed.');
      return reply.status(401).send({ error: 'INVALID_WEBHOOK_SIGNATURE' });
    }

    const event = body as { event_type?: string; resource?: any; id?: string };
    const eventId = event?.id || `evt_${Date.now()}`;
    const eventType = event?.event_type || 'UNKNOWN';

    // Idempotency check per PayPal Webhooks specification
    if (isWebhookEventProcessed(eventId)) {
      fastify.log.info(`Duplicate PayPal webhook event ignored for idempotency: ${eventId} (${eventType})`);
      return reply.status(200).send({
        status: 'IDEMPOTENT_IGNORED',
        event_id: eventId,
        event_type: eventType,
        message: 'Event was previously processed.',
      });
    }

    recordWebhookEventProcessed(eventId);
    fastify.log.info(`Received PayPal webhook event: ${eventType} (ID: ${eventId})`);

    // Dispatch supported payment, subscription, and dispute lifecycle events
    switch (eventType) {
      // Payment Capture Events
      case 'PAYMENT.CAPTURE.COMPLETED':
        fastify.log.info(`Payment capture completed for capture ${event?.resource?.id}, amount: ${event?.resource?.amount?.value} ${event?.resource?.amount?.currency_code}`);
        break;
      case 'PAYMENT.CAPTURE.DENIED':
        fastify.log.warn(`Payment capture denied for capture ${event?.resource?.id}`);
        break;
      case 'PAYMENT.CAPTURE.REFUNDED':
        fastify.log.info(`Capture refund event received for capture ${event?.resource?.id}`);
        break;

      // Payment Authorization Events
      case 'PAYMENT.AUTHORIZATION.CREATED':
        fastify.log.info(`Authorization event received for hold ${event?.resource?.id}`);
        break;
      case 'PAYMENT.AUTHORIZATION.VOIDED':
        fastify.log.info(`Authorization hold voided for ${event?.resource?.id}`);
        break;

      // Dispute & Arbitration Events
      case 'CUSTOMER.DISPUTE.CREATED':
      case 'CUSTOMER.DISPUTE.UPDATED':
        fastify.log.info(`Dispute event received for dispute ${event?.resource?.dispute_id || event?.resource?.id}, stage: ${event?.resource?.dispute_life_cycle_stage}`);
        break;
      case 'CUSTOMER.DISPUTE.RESOLVED':
        fastify.log.info(`Dispute resolved for dispute ${event?.resource?.dispute_id || event?.resource?.id}, outcome: ${event?.resource?.dispute_outcome?.outcome_code}`);
        break;

      // Subscription & Recurring Billing Events
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
  });
};
