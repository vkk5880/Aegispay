import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import dotenv from 'dotenv';
import { paypalWebhooksRoutes } from './routes/paypal.webhooks.js';
import { buyerProcurementRoutes } from './routes/buyer.procurement.js';
import { merchantArbitrationRoutes } from './routes/merchant.arbitration.js';
import { integrationsVerifyRoutes } from './routes/integrations.verify.js';
import { acpRoutes } from './routes/acp.routes.js';
import { http402Plugin } from './middleware/http402-interceptor.js';

dotenv.config();

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Plugins
  await fastify.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(sensible);
  await fastify.register(http402Plugin);

  // Register routes
  await fastify.register(paypalWebhooksRoutes);
  await fastify.register(buyerProcurementRoutes);
  await fastify.register(merchantArbitrationRoutes);
  await fastify.register(integrationsVerifyRoutes);
  await fastify.register(acpRoutes);

  // Root health route
  fastify.get('/', async () => {
    return {
      service: 'AegisPay Autonomous Clearinghouse & Arbitration API',
      status: 'UP',
      time: new Date().toISOString(),
    };
  });

  return fastify;
}

export async function startServer() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT || '4000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    app.log.info(`API Orchestrator running on http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      try {
        await app.close();
        process.exit(0);
      } catch (err) {
        app.log.error(err);
        process.exit(1);
      }
    });
  }
}

// Auto-start if invoked directly as main module
if (process.argv[1] && (process.argv[1].endsWith('dist/index.js') || process.argv[1].endsWith('src/index.ts'))) {
  startServer();
}

export * from './services/paypal-apimatic.js';
export * from './services/channel3.client.js';
export * from './services/cart-solver.js';
export * from './services/synthetic-intent.js';
export * from './services/dispute-matrix.js';
export * from './middleware/http402-interceptor.js';
