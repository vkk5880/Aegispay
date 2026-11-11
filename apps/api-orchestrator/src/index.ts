import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import dotenv from 'dotenv';
import { createLogger, sanitizeForLogging } from '@aegispay/shared-types';
import { paypalWebhooksRoutes } from './routes/paypal.webhooks.js';
import { buyerProcurementRoutes } from './routes/buyer.procurement.js';
import { merchantArbitrationRoutes } from './routes/merchant.arbitration.js';
import { disputeRoutes } from './routes/dispute.routes.js';
import { intentVoucherRoutes } from './routes/intent-voucher.routes.js';
import { integrationsVerifyRoutes } from './routes/integrations.verify.js';
import { acpRoutes } from './routes/acp.routes.js';
import { hitlRoutes } from './routes/hitl.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { reconciliationRoutes } from './routes/reconciliation.routes.js';
import { invoicingRoutes } from './routes/invoicing.routes.js';
import { merchantCatalogRoutes } from './routes/merchant.catalog.js';
import { http402Plugin } from './middleware/http402-interceptor.js';

dotenv.config();

export const orchestratorLogger = createLogger('API:Orchestrator');

export async function buildApp() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDebug = process.env.DEBUG === 'true' || process.env.DEBUG === '1' || !isProduction;
  const logLevel = process.env.LOG_LEVEL || (isDebug ? 'debug' : 'info');

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : process.env.CORS_ORIGIN
    ? [process.env.CORS_ORIGIN.trim()]
    : null;

  orchestratorLogger.info(`Configuring Fastify API Orchestrator (logLevel: ${logLevel}, debug: ${isDebug}, env: ${process.env.NODE_ENV || 'development'})`);

  const fastify = Fastify({
    logger: {
      level: logLevel,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.token',
        '*.secret',
        '*.spt',
        '*.vault_token',
        '*.email',
        '*.phone',
        'payment_data.instrument.credential.token',
        'affiliate_attribution.token',
        'payload.payment_method.token',
        'req.body.payment_source',
        'req.body.payment_method.card',
      ],
    },
  });

  // Request & Lifecycle Observability Hooks (Logs every point across requests)
  fastify.addHook('onRequest', async (request) => {
    orchestratorLogger.debug(`Incoming Request -> [${request.method}] ${request.url}`, {
      ip: request.ip,
      userAgent: request.headers['user-agent'] || 'unknown',
      query: request.query,
    });
  });

  fastify.addHook('preHandler', async (request) => {
    if (request.body && isDebug) {
      orchestratorLogger.debug(`Request Body -> [${request.method}] ${request.url}:`, sanitizeForLogging(request.body));
    }
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const status = reply.statusCode;
    const duration = reply.elapsedTime.toFixed(2);
    if (status >= 500) {
      orchestratorLogger.error(`Response <- [${request.method}] ${request.url} ${status} (${duration}ms)`);
    } else if (status >= 400) {
      orchestratorLogger.warn(`Response <- [${request.method}] ${request.url} ${status} (${duration}ms)`);
    } else {
      orchestratorLogger.debug(`Response <- [${request.method}] ${request.url} ${status} (${duration}ms)`);
    }
  });

  fastify.addHook('onError', async (request, reply, error) => {
    orchestratorLogger.error(`Route Error occurred on [${request.method}] ${request.url}: ${error.message}`, {
      statusCode: reply.statusCode,
      errorName: error.name,
      stack: error.stack,
      params: request.params,
      query: request.query,
    });
  });

  // Global Error Handler with detailed diagnostics
  fastify.setErrorHandler((error, request, reply) => {
    orchestratorLogger.error(`Unhandled Fastify Exception [${request.method}] ${request.url}:`, {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name || 'Internal Server Error',
      message: error.message,
      ...(isDebug ? { stack: error.stack } : {}),
    });
  });

  // Global 404 Route Not Found Handler
  fastify.setNotFoundHandler((request, reply) => {
    orchestratorLogger.warn(`Route Not Found: 404 [${request.method}] ${request.url}`);
    reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
    });
  });

  // Plugins
  await fastify.register(cors, {
    origin: (origin, cb) => {
      // In development or when no restrictive origins configured, permit requests
      if (!origin || !isProduction || !allowedOrigins) {
        return cb(null, true);
      }
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return cb(null, true);
      }
      return cb(new Error('CORS origin forbidden by security policy'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(sensible);
  await fastify.register(http402Plugin);

  // Register routes
  await fastify.register(paypalWebhooksRoutes);
  await fastify.register(buyerProcurementRoutes);
  await fastify.register(merchantArbitrationRoutes);
  await fastify.register(disputeRoutes);
  await fastify.register(intentVoucherRoutes);
  await fastify.register(integrationsVerifyRoutes);
  await fastify.register(acpRoutes);
  await fastify.register(hitlRoutes);
  await fastify.register(chatRoutes);
  await fastify.register(reconciliationRoutes);
  await fastify.register(invoicingRoutes);
  await fastify.register(merchantCatalogRoutes);

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

  // Process-level uncaught exception & rejection diagnostics
  process.on('uncaughtException', (err) => {
    orchestratorLogger.error('CRITICAL: Process Uncaught Exception:', err);
  });
  process.on('unhandledRejection', (reason) => {
    orchestratorLogger.error('CRITICAL: Process Unhandled Rejection:', reason);
  });

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
export * from './services/vault-onboarding.js';
export * from './services/channel3.client.js';
export * from './services/cart-solver.js';
export * from './services/synthetic-intent.js';
export * from './services/dispute-matrix.js';
export * from './services/dispute-forensics.js';
export * from './services/counter-bid-engine.js';
export * from './services/hitl-approval.js';
export * from './services/shopping-assistant.js';
export * from './routes/chat.routes.js';
export * from './routes/dispute.routes.js';
export * from './routes/invoicing.routes.js';
export * from './routes/intent-voucher.routes.js';
export * from './middleware/http402-interceptor.js';
export * from './middleware/auth.js';
