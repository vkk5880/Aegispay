import { createLogger } from '@aegispay/shared-types';

const logger = createLogger('MCP:Enforcer:Package', { stream: 'stderr' });
logger.info('Initializing @aegispay/mcp-enforcer package modules and exports');

export * from './redis-lua-enforcer.js';
export * from './ed25519-verifier.js';
export * from './merchant-anomaly-gate.js';
export * from './custom-tools.js';
export * from './acp-manifest.js';
export * from './audit-chain.js';
export * from './server.js';
export * from './category-smuggling-detector.js';
export * from './monotonic-risk-evaluator.js';
export * from './paypal-toolkit-bridge.js';

// Modular Tool Clean Exports (handlers, Zod schemas, validators, and types)
export * from './tools/catalog-search.js';
export * from './tools/order-authorize.js';
export * from './tools/price-lock.js';
export * from './tools/vault-token.js';
export * from './tools/dispute-evidence.js';
export * from './tools/intent-publish.js';
export * from './tools/spend-check.js';

logger.debug('MCP Enforcer modular tools and sub-systems registered and export-ready', {
  modules: [
    'redis-lua-enforcer',
    'ed25519-verifier',
    'merchant-anomaly-gate',
    'custom-tools',
    'acp-manifest',
    'audit-chain',
    'server',
    'category-smuggling-detector',
    'monotonic-risk-evaluator',
    'paypal-toolkit-bridge',
    'tools/catalog-search',
    'tools/order-authorize',
    'tools/price-lock',
    'tools/vault-token',
    'tools/dispute-evidence',
    'tools/intent-publish',
    'tools/spend-check',
  ],
});
