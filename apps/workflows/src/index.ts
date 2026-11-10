import http from 'http';
import { startTaskServer } from '@renderinc/sdk/workflows';
import { createLogger } from '@aegispay/shared-types';

export const workflowLogger = createLogger('Render:Workflows');

// Import flows & tasks so they register themselves with Render Workflows runtime
import './tasks/priceDropWatcher.js';
import './tasks/syntheticBidMatcher.js';
import './tasks/disputeForensicsTask.js';
import './tasks/reverseShippingLabelTask.js';
import './tasks/fulfillmentWatcherTask.js';

export const REGISTERED_FLOWS = [
  'priceDropWatcherFlow',
  'disputeForensicsFlow',
  'syntheticBidMatcherFlow',
  'fulfillmentWatcherFlow',
  'reverseShippingLabelFlow',
] as const;

async function main() {
  workflowLogger.info('Initializing AegisPay Render Workflows Engine (@renderinc/sdk v1.8.0)...', {
    registeredFlows: REGISTERED_FLOWS,
  });

  process.on('uncaughtException', (err) => {
    workflowLogger.error('CRITICAL: Render Workflows uncaughtException:', err);
  });
  process.on('unhandledRejection', (reason) => {
    workflowLogger.error('CRITICAL: Render Workflows unhandledRejection:', reason);
  });

  if (process.env.RENDER_SDK_SOCKET_PATH) {
    try {
      await startTaskServer();
      workflowLogger.info('Render Workflows Task Server started successfully on socket:', process.env.RENDER_SDK_SOCKET_PATH);
    } catch (error) {
      workflowLogger.error('Failed to start Render Task Server:', error);
      process.exit(1);
    }
  } else {
    // Local / container simulation: run lightweight HTTP listener to keep process active and provide health probes
    const port = parseInt(process.env.PORT || '4001', 10);
    const server = http.createServer((req, res) => {
      workflowLogger.debug(`Simulation server request: ${req.method} ${req.url}`);
      if (req.url === '/health' || req.url === '/' || req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          service: 'aegispay-workflows',
          status: 'SIMULATION_ACTIVE',
          engine: 'Render Workflows SDK v1.8.0',
          execution_model: 'Durable Checkpointing (flow & ctx.step)',
          registered_flows: REGISTERED_FLOWS,
          uptime_seconds: process.uptime(),
          timestamp: new Date().toISOString(),
        }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    });

    server.listen(port, '0.0.0.0', () => {
      workflowLogger.info(`Local simulation server listening on http://0.0.0.0:${port}`);
    });

    // Graceful shutdown
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        workflowLogger.info(`Received ${signal}, closing simulation server...`);
        server.close(() => {
          workflowLogger.info('Simulation server closed cleanly.');
          process.exit(0);
        });
      });
    }
  }
}

if (process.argv[1] && (process.argv[1].endsWith('dist/index.js') || process.argv[1].endsWith('src/index.ts'))) {
  main();
}
