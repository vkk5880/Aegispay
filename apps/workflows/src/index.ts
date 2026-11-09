import http from 'http';
import { startTaskServer } from '@renderinc/sdk/workflows';

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
  console.log('[Workflows] Initializing AegisPay Render Workflows Engine (@renderinc/sdk v1.8.0)...');

  if (process.env.RENDER_SDK_SOCKET_PATH) {
    try {
      await startTaskServer();
      console.log('[Workflows] Render Workflows Task Server started successfully on socket:', process.env.RENDER_SDK_SOCKET_PATH);
    } catch (error) {
      console.error('[Workflows] Failed to start Render Task Server:', error);
      process.exit(1);
    }
  } else {
    // Local / container simulation: run lightweight HTTP listener to keep process active and provide health probes
    const port = parseInt(process.env.PORT || '4001', 10);
    const server = http.createServer((req, res) => {
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
      console.log(`[Workflows] Local simulation server listening on http://0.0.0.0:${port}`);
    });

    // Graceful shutdown
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        console.log(`[Workflows] Received ${signal}, closing simulation server...`);
        server.close(() => {
          console.log('[Workflows] Simulation server closed cleanly.');
          process.exit(0);
        });
      });
    }
  }
}

if (process.argv[1] && (process.argv[1].endsWith('dist/index.js') || process.argv[1].endsWith('src/index.ts'))) {
  main();
}
