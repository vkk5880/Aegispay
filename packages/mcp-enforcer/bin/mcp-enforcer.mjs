#!/usr/bin/env node

/**
 * AegisPay MCP Enforcer Standalone Executable
 * Enables direct connection from Claude Desktop, Cursor, Zed, Windsurf, and local MCP clients.
 */
import { runServer } from '../dist/server.js';

runServer().catch((err) => {
  console.error('[MCP:Enforcer:Fatal] Process execution error:', err);
  process.exit(1);
});
