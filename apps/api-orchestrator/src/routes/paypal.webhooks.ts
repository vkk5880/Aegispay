import { FastifyPluginAsync } from 'fastify';
import { defaultPayPalClient } from '../services/paypal-apimatic.js';

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
    const eventType = event?.event_type || 'UNKNOWN';

    fastify.log.info(`Received PayPal webhook event: ${eventType} (ID: ${event?.id})`);

    // Dispatch supported dispute and payment lifecycle events
    switch (eventType) {
      case 'CUSTOMER.DISPUTE.CREATED':
      case 'CUSTOMER.DISPUTE.UPDATED':
        fastify.log.info(`Dispute event received for dispute ${event?.resource?.dispute_id}`);
        break;
      case 'PAYMENT.CAPTURE.REFUNDED':
        fastify.log.info(`Capture refund event received for capture ${event?.resource?.id}`);
        break;
      case 'PAYMENT.AUTHORIZATION.CREATED':
        fastify.log.info(`Authorization event received for hold ${event?.resource?.id}`);
        break;
      default:
        fastify.log.info(`Unhandled event type ${eventType}`);
        break;
    }

    return reply.status(200).send({
      status: 'PROCESSED',
      event_type: eventType,
      verified: isValid,
    });
  });
};
