import { startTaskServer } from '@renderinc/sdk/workflows';

// Import tasks so they register themselves
import './tasks/priceDropWatcher.js';
import './tasks/syntheticBidMatcher.js';
import './tasks/disputeForensicsTask.js';
import './tasks/reverseShippingLabelTask.js';
import './tasks/fulfillmentWatcherTask.js';

async function main() {
  console.log('Starting AegisPay Render Workflows...');
  
  if (!process.env.RENDER_SDK_SOCKET_PATH) {
    console.log('[Workflows] Standalone simulation mode: RENDER_SDK_SOCKET_PATH not present in free container. Tasks available via API orchestrator.');
    return;
  }

  try {
    await startTaskServer();
    console.log('Task server started successfully.');
  } catch (error) {
    console.error('Failed to start task server:', error);
    process.exit(1);
  }
}

if (process.argv[1] && (process.argv[1].endsWith('dist/index.js') || process.argv[1].endsWith('src/index.ts'))) {
  main();
}
