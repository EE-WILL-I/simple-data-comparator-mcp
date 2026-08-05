#!/usr/bin/env node
import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { logInfo, logError } from './utils/logger.js';
import { registerTools } from './toolRegistry.js';

function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: 'simple-data-comparator-mcp',
    version: '0.0.1',
  });
  registerTools(server);
  return server;
}

async function main(): Promise<void> {
  const server = buildMcpServer();
  const transport = new StdioServerTransport();

  transport.onclose = () => {
    logInfo('MCP stdio transport closed');
  };

  await server.connect(transport);
  logInfo('MCP server running on stdio');
}

main().catch((err: unknown) => {
  logError('Fatal error starting MCP server', err);
  process.exit(1);
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logInfo(`Shutting down MCP server (${signal})...`);
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
