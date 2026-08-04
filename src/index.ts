import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { logInfo, logError } from './utils/logger.js';
import { registerTools } from './toolRegistry.js';

const MCP_PORT = parseInt(process.env.MCP_PORT ?? '3000', 10);
const MCP_HOST = process.env.MCP_HOST ?? 'localhost';

// Per-session transport map (stateful mode)
const transports = new Map<string, StreamableHTTPServerTransport>();

function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: 'simple-validator-mcp',
    version: '0.0.1',
  });
  registerTools(server);
  return server;
}

// ── Express app with MCP defaults (body parsing, Host validation) ───────────
const app = createMcpExpressApp();

const mcpPostHandler = async (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => {
  const sessionId = (req.headers['mcp-session-id'] as string | undefined);

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          logInfo('MCP session initialized', { session_id: sid });
          transports.set(sid, transport);
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          logInfo('MCP session closed', { session_id: sid });
          transports.delete(sid);
        }
      };

      await buildMcpServer().connect(transport);
      await transport.handleRequest(req as any, res as any, req.body);
      return;
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: missing or invalid session' }, id: null }));
      logError('Bad Request: missing or invalid session');
      return;
    }

    await transport.handleRequest(req as any, res as any, req.body);
  } catch (err: any) {
    logError('Error handling MCP POST', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
    }
  }
};

const mcpGetHandler = async (req: IncomingMessage, res: ServerResponse) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.writeHead(400);
    res.end('Invalid or missing session ID');
    return;
  }
  await transports.get(sessionId)!.handleRequest(req as any, res as any);
};

const mcpDeleteHandler = async (req: IncomingMessage, res: ServerResponse) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports.has(sessionId)) {
    res.writeHead(400);
    res.end('Invalid or missing session ID');
    return;
  }
  try {
    await transports.get(sessionId)!.handleRequest(req as any, res as any);
  } catch (err: any) {
    logError('Error handling session termination', err);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Error processing session termination');
    }
  }
};

app.post('/mcp', mcpPostHandler as any);
app.get('/mcp', mcpGetHandler as any);
app.delete('/mcp', mcpDeleteHandler as any);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', sessions: transports.size });
});

const httpServer = createServer(app as any);

httpServer.listen(MCP_PORT, () => {
  logInfo(`MCP server listening on http://${MCP_HOST}:${MCP_PORT}/mcp`);
});

httpServer.on('error', (err: Error) => {
  logError('HTTP server error', err);
  process.exit(1);
});

// ── Graceful shutdown ──────────────────────────────────────────────────────
process.on('SIGINT', async () => {
  logInfo('Shutting down MCP server...');
  for (const [sid, t] of transports) {
    try { await t.close(); } catch { /* ignore */ }
    transports.delete(sid);
  }
  httpServer.close(() => process.exit(0));
});
