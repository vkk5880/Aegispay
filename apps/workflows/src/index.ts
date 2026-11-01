import { startTaskServer } from '@renderinc/sdk/workflows';

// Import tasks so they register themselves
import './tasks/priceDropWatcher.js';
import './tasks/syntheticBidMatcher.js';
import './tasks/disputeForensicsTask.js';

async function main() {
  console.log('Starting AegisPay Render Workflows...');
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
