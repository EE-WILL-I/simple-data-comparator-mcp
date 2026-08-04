import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';

import { logInfo, logError } from './utils/logger.js';
import { validateCsv } from './tools/csvValidator.js';
import { validateJsonTemplate } from './tools/jsonValidator.js';
import { validateXml } from './tools/xmlValidator.js';
import { validateXlsx } from './tools/xlsxValidator.js';
import { validateText } from './tools/textValidator.js';

const MCP_PORT = parseInt(process.env.MCP_PORT ?? '3000', 10);
const MCP_HOST = process.env.MCP_HOST ?? 'localhost';

// Per-session transport map (stateful mode)
const transports = new Map<string, StreamableHTTPServerTransport>();

function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: 'simple-validator-mcp',
    version: '0.0.1',
  });

  // ── validate-json ──────────────────────────────────────────────────────────
  server.registerTool(
    'validate-json',
    {
      title: 'JSON Validator',
      description: 'Validate a JSON body against a template. Returns differences when validation fails.',
      inputSchema: {
        actual: z.string().describe('JSON string to validate'),
        template: z.string().describe('Expected JSON template string'),
        strictMode: z.boolean().optional().describe('Fail on extra fields not in template (default: false)'),
        ignoreArrayOrder: z.boolean().optional().describe('Treat arrays as sets when comparing (default: false)'),
      },
    },
    async ({ actual, template, strictMode, ignoreArrayOrder }) => {
      let parsedActual: unknown, parsedTemplate: unknown;
      try {
        parsedActual = JSON.parse(actual);
        parsedTemplate = JSON.parse(template);
      } catch (err: any) {
        return { content: [{ type: 'text', text: `JSON parse error: ${err.message}` }], isError: true };
      }
      const result = validateJsonTemplate(parsedActual, parsedTemplate, {
        ignoreExtraProps: !(strictMode ?? false),
        ignoreArrayOrder: ignoreArrayOrder ?? false,
      } as any);
      return {
        content: [{
          type: 'text',
          text: result.isValid
            ? 'Validation passed.'
            : `Validation failed.\nDifferences:\n${(result.differences ?? []).join('\n')}`,
        }],
        isError: !result.isValid,
      };
    },
  );

  // ── validate-xml ───────────────────────────────────────────────────────────
  server.registerTool(
    'validate-xml',
    {
      title: 'XML Validator',
      description: 'Validate an XML body against a template XML.',
      inputSchema: {
        actual: z.string().describe('XML string to validate'),
        template: z.string().describe('Expected XML template string'),
      },
    },
    async ({ actual, template }) => {
      const result = validateXml(actual, template);
      return {
        content: [{
          type: 'text',
          text: result.isValid
            ? 'Validation passed.'
            : `Validation failed.\nDifferences:\n${(result.differences ?? []).join('\n')}`,
        }],
        isError: !result.isValid,
      };
    },
  );

  // ── validate-csv ───────────────────────────────────────────────────────────
  server.registerTool(
    'validate-csv',
    {
      title: 'CSV Validator',
      description: 'Validate a CSV body against a template CSV.',
      inputSchema: {
        actual: z.string().describe('CSV string to validate'),
        template: z.string().describe('Expected CSV template string'),
        includeColumns: z.array(z.string()).optional().describe('Only validate these columns (by header name)'),
        excludeColumns: z.array(z.string()).optional().describe('Exclude these columns from validation'),
        ignoreRowOrder: z.boolean().optional().describe('Treat rows as a set (default: false)'),
      },
    },
    async ({ actual, template, includeColumns, excludeColumns, ignoreRowOrder }) => {
      const result = validateCsv(actual, template, {
        includeColumns,
        excludeColumns,
        ignoreRowOrder: ignoreRowOrder ?? false,
      });
      return {
        content: [{
          type: 'text',
          text: result.isValid
            ? 'Validation passed.'
            : `Validation failed.\nDifferences:\n${(result.differences ?? []).join('\n')}`,
        }],
        isError: !result.isValid,
      };
    },
  );

  // ── validate-xlsx ──────────────────────────────────────────────────────────
  server.registerTool(
    'validate-xlsx',
    {
      title: 'XLSX Validator',
      description: 'Validate an XLSX file (provided as base64) against a template XLSX (also base64).',
      inputSchema: {
        actual: z.string().describe('Base64-encoded XLSX file to validate'),
        template: z.string().describe('Base64-encoded expected XLSX template'),
        sheet: z.union([z.string(), z.number()]).optional().describe('Sheet name or 0-based index (default: first sheet)'),
        includeColumns: z.array(z.string()).optional().describe('Only validate these columns'),
        excludeColumns: z.array(z.string()).optional().describe('Exclude these columns from validation'),
      },
    },
    async ({ actual, template, sheet, includeColumns, excludeColumns }) => {
      const actualBuf = Buffer.from(actual, 'base64');
      const templateBuf = Buffer.from(template, 'base64');
      const result = validateXlsx(actualBuf, templateBuf, {
        sheet,
        includeColumns,
        excludeColumns,
      });
      return {
        content: [{
          type: 'text',
          text: result.isValid
            ? 'Validation passed.'
            : `Validation failed.\nDifferences:\n${(result.differences ?? []).join('\n')}`,
        }],
        isError: !result.isValid,
      };
    },
  );

  // ── validate-text ──────────────────────────────────────────────────────────
  server.registerTool(
    'validate-text',
    {
      title: 'Text Validator',
      description: 'Validate a plain-text body against a template string (exact match).',
      inputSchema: {
        actual: z.string().describe('Text to validate'),
        template: z.string().describe('Expected text template'),
      },
    },
    async ({ actual, template }) => {
      const isValid = validateText(actual, template);
      return {
        content: [{ type: 'text', text: isValid ? 'Validation passed.' : 'Validation failed: text does not match template.' }],
        isError: !isValid,
      };
    },
  );

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
