import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { validateJsonTemplate } from './tools/jsonValidator.js';
import { validateXml } from './tools/xmlValidator.js';
import { validateCsv } from './tools/csvValidator.js';
import { validateXlsx } from './tools/xlsxValidator.js';
import { validateText } from './tools/textValidator.js';

export function registerTools(server: McpServer) {
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