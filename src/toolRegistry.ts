import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { validateJsonTemplate } from './tools/jsonValidator.js';
import { validateXml } from './tools/xmlValidator.js';
import { validateCsv } from './tools/csvValidator.js';
import { validateXlsx, XlsxValidateOptions } from './tools/xlsxValidator.js';
import { validateText } from './tools/textValidator.js';
import { resolveXlsxInput } from './utils/resolveXlsxInput.js';

const sheetRef = z.union([z.string(), z.number()]);
const rowKeySchema = z.union([z.string(), z.array(z.string())]);

const xlsxInputSchema = {
  actual: z.string().describe(
    'First workbook: workspace file path (e.g. Templates/test/1.xlsx) or base64-encoded XLSX bytes',
  ),
  template: z.string().describe(
    'Second workbook to compare against: file path or base64-encoded XLSX bytes',
  ),
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
};

type XlsxToolArgs = {
  actual: string;
  template: string;
  sheet?: string | number;
  actualSheet?: string | number;
  expectedSheet?: string | number;
  includeColumns?: string[];
  excludeColumns?: string[];
  ignoreRowOrder?: boolean;
  rowKey?: string | string[];
  csvDelimiter?: string;
  blankrows?: boolean;
  rawNumbers?: boolean;
  delimiter?: string;
  expectedDelimiter?: string;
  actualDelimiter?: string;
};

const XLSX_TOOL_DESCRIPTION =
  'Compare two Excel (.xlsx) workbooks and return cell/row/column differences. ' +
  'Use this whenever the user asks to compare, diff, or validate XLSX/Excel files. ' +
  'Pass workspace file paths directly (e.g. Templates/test/1.xlsx) — base64 is optional.';

async function runXlsxComparison(args: XlsxToolArgs) {
  let actualInput;
  let templateInput;
  try {
    actualInput = resolveXlsxInput(args.actual, 'actual');
    templateInput = resolveXlsxInput(args.template, 'template');
  } catch (err: any) {
    return {
      content: [{ type: 'text' as const, text: `XLSX input error: ${err.message}` }],
      isError: true,
    };
  }

  const opts: XlsxValidateOptions = {
    sheet: args.sheet,
    actualSheet: args.actualSheet,
    expectedSheet: args.expectedSheet,
    includeColumns: args.includeColumns,
    excludeColumns: args.excludeColumns,
    ignoreRowOrder: args.ignoreRowOrder ?? false,
    rowKey: args.rowKey,
    csvDelimiter: args.csvDelimiter,
    blankrows: args.blankrows,
    rawNumbers: args.rawNumbers,
    delimiter: args.delimiter,
    expectedDelimiter: args.expectedDelimiter,
    actualDelimiter: args.actualDelimiter,
  };

  const result = validateXlsx(actualInput, templateInput, opts);
  const lines = result.isValid
    ? ['Validation passed.']
    : ['Validation failed.', 'Differences:', ...(result.differences ?? [])];

  if (result.sheet) {
    lines.push('', `Compared sheets: actual="${result.sheet.actual}", template="${result.sheet.expected}"`);
  }

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
    isError: !result.isValid,
  };
}

export function registerTools(server: McpServer) {
  // ── compare-json ──────────────────────────────────────────────────────────
  server.registerTool(
    'compare-json',
    {
      title: 'Compare JSON',
      description:
        'Compare two JSON values (actual vs expected template) and return field-level differences. ' +
        'Use when the user asks to compare, diff, or validate JSON data or API responses.',
      inputSchema: {
        actual: z.string().describe('JSON string to compare'),
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

  // ── compare-xml ───────────────────────────────────────────────────────────
  server.registerTool(
    'compare-xml',
    {
      title: 'Compare XML',
      description:
        'Compare two XML documents and return element/attribute differences. ' +
        'Use when the user asks to compare, diff, or validate XML files or payloads.',
      inputSchema: {
        actual: z.string().describe('XML string to compare'),
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

  // ── compare-csv ───────────────────────────────────────────────────────────
  server.registerTool(
    'compare-csv',
    {
      title: 'Compare CSV',
      description:
        'Compare two CSV tables and return row/column/cell differences. ' +
        'Use when the user asks to compare, diff, or validate CSV files or tabular exports.',
      inputSchema: {
        actual: z.string().describe('CSV string to compare'),
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

  // ── compare-xlsx / compare-xlsx ───────────────────────────────────────────
  const xlsxHandler = (args: XlsxToolArgs) => runXlsxComparison(args);

  server.registerTool(
    'compare-xlsx',
    {
      title: 'Compare XLSX files',
      description: XLSX_TOOL_DESCRIPTION,
      inputSchema: xlsxInputSchema,
    },
    xlsxHandler,
  );

  server.registerTool(
    'compare-xlsx',
    {
      title: 'Compare XLSX files (alias)',
      description: XLSX_TOOL_DESCRIPTION + ' Alias of compare-xlsx.',
      inputSchema: xlsxInputSchema,
    },
    xlsxHandler,
  );

  // ── compare-text ──────────────────────────────────────────────────────────
  server.registerTool(
    'compare-text',
    {
      title: 'Compare text',
      description:
        'Compare two plain-text strings line-by-line. ' +
        'Use when the user asks to compare or validate logs, stdout, or text file contents.',
      inputSchema: {
        actual: z.string().describe('Text to compare'),
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
