import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { validateJsonTemplate } from './tools/jsonValidator.js';
import { validateXml } from './tools/xmlValidator.js';
import { validateCsv } from './tools/csvValidator.js';
import { validateXlsx } from './tools/xlsxValidator.js';
import { validateText } from './tools/textValidator.js';

const sheetRef = z.union([z.string(), z.number()]);
const rowKeySchema = z.union([z.string(), z.array(z.string())]);

export function registerTools(server: McpServer) {
  // ── validate-json ──────────────────────────────────────────────────────────
  server.registerTool(
    'validate-json',
    {
      title: 'JSON Validator',
      description: 'Validate a JSON body against a template or JSON Schema. Returns differences when validation fails.',
      inputSchema: {
        actual: z.string().describe('JSON string to validate'),
        template: z.string().describe('Expected JSON template string, or JSON Schema when useJsonSchema is true'),
        strictMode: z.boolean().optional().describe('Fail on extra fields not in template (default: false)'),
        ignoreArrayOrder: z.boolean().optional().describe('Sort arrays before comparing so order differences are ignored (default: false)'),
        ignoreProps: z.array(z.string()).optional().describe('Property names to strip from both sides before comparing'),
        ignoreSimilar: z.boolean().optional().describe('Pass when values differ but JS types match template types (default: false)'),
        useJsonSchema: z.boolean().optional().describe('Treat template as a JSON Schema instead of a literal template (default: false)'),
      },
    },
    async ({ actual, template, strictMode, ignoreArrayOrder, ignoreProps, ignoreSimilar, useJsonSchema }) => {
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
        ignoreProps,
        ignoreSimilar: ignoreSimilar ?? false,
        useJsonSchema: useJsonSchema ?? false,
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
        ignoreRowOrder: z.boolean().optional().describe('Sort data rows before comparing (default: false)'),
        rowKey: rowKeySchema.optional().describe('Header name(s) that uniquely identify a row for alignment'),
        delimiter: z.string().optional().describe('CSV field delimiter for both sides (overrides auto-detection)'),
        expectedDelimiter: z.string().optional().describe('Delimiter for the template CSV only'),
        actualDelimiter: z.string().optional().describe('Delimiter for the actual CSV only'),
      },
    },
    async ({ actual, template, includeColumns, excludeColumns, ignoreRowOrder, rowKey, delimiter, expectedDelimiter, actualDelimiter }) => {
      const result = validateCsv(actual, template, {
        includeColumns,
        excludeColumns,
        ignoreRowOrder: ignoreRowOrder ?? false,
        rowKey,
        delimiter,
        expectedDelimiter,
        actualDelimiter,
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
        sheet: sheetRef.optional().describe('Sheet name or 0-based index for both workbooks (default: first sheet)'),
        actualSheet: sheetRef.optional().describe('Sheet for the actual workbook only'),
        expectedSheet: sheetRef.optional().describe('Sheet for the template workbook only'),
        includeColumns: z.array(z.string()).optional().describe('Only validate these columns'),
        excludeColumns: z.array(z.string()).optional().describe('Exclude these columns from validation'),
        ignoreRowOrder: z.boolean().optional().describe('Sort data rows before comparing (default: false)'),
        rowKey: rowKeySchema.optional().describe('Header name(s) that uniquely identify a row for alignment'),
        csvDelimiter: z.string().optional().describe('Field separator when converting sheet to CSV (default: comma)'),
        blankrows: z.boolean().optional().describe('Include fully empty rows when converting sheet to CSV (default: false)'),
        rawNumbers: z.boolean().optional().describe('Use raw Excel number serials instead of formatted values (default: false)'),
        delimiter: z.string().optional().describe('CSV delimiter for comparison after sheet conversion'),
        expectedDelimiter: z.string().optional().describe('Delimiter for the template side only'),
        actualDelimiter: z.string().optional().describe('Delimiter for the actual side only'),
      },
    },
    async ({
      actual,
      template,
      sheet,
      actualSheet,
      expectedSheet,
      includeColumns,
      excludeColumns,
      ignoreRowOrder,
      rowKey,
      csvDelimiter,
      blankrows,
      rawNumbers,
      delimiter,
      expectedDelimiter,
      actualDelimiter,
    }) => {
      const actualBuf = Buffer.from(actual, 'base64');
      const templateBuf = Buffer.from(template, 'base64');
      const result = validateXlsx(actualBuf, templateBuf, {
        sheet,
        actualSheet,
        expectedSheet,
        includeColumns,
        excludeColumns,
        ignoreRowOrder: ignoreRowOrder ?? false,
        rowKey,
        csvDelimiter,
        blankrows,
        rawNumbers,
        delimiter,
        expectedDelimiter,
        actualDelimiter,
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
