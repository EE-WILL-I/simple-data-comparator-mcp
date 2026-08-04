/**
 * Tests for MCP tool handler logic.
 *
 * The MCP tool handlers in src/index.ts are thin wrappers around the validators,
 * so these tests verify each validator produces the correct output that the tool
 * handlers would format and return to clients.
 */

import { validateJsonTemplate, JsonValidationOptions } from '../jsonValidator';
import { validateXml } from '../xmlValidator';
import { validateCsv } from '../csvValidator';
import { validateText } from '../textValidator';

jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers that mirror the index.ts tool handler formatting logic
// ---------------------------------------------------------------------------

function formatJsonResult(
  actual: object | string,
  expected: object | string,
  options?: JsonValidationOptions
): { text: string; isError: boolean } {
  const result = validateJsonTemplate(actual, expected, options);
  if (result.isValid) {
    return { text: 'Validation passed.', isError: false };
  }
  const lines: string[] = ['Validation failed.'];
  if (result.duplicateKeys?.length) {
    lines.push(`Duplicate keys: ${result.duplicateKeys.join(', ')}`);
  }
  if (result.differences?.length) {
    lines.push('Differences:', ...result.differences.map(d => `  ${d}`));
  }
  if (result.schemaErrors?.length) {
    lines.push('Schema errors:', ...result.schemaErrors.map(e => `  ${e}`));
  }
  return { text: lines.join('\n'), isError: true };
}

function formatXmlResult(
  actual: string,
  expected: string
): { text: string; isError: boolean } {
  const result = validateXml(actual, expected);
  if (result.isValid) {
    return { text: 'Validation passed.', isError: false };
  }
  const lines: string[] = ['Validation failed.', 'Differences:'];
  (result.differences ?? []).forEach(d => lines.push(`  ${d}`));
  return { text: lines.join('\n'), isError: true };
}

function formatTextResult(
  actual: string,
  expected: string
): { text: string; isError: boolean } {
  const passed = validateText(actual, expected);
  if (passed) {
    return { text: 'Validation passed.', isError: false };
  }
  return { text: 'Validation failed. Text does not match template.', isError: true };
}

async function formatCsvResult(
  actual: string,
  expected: string
): Promise<{ text: string; isError: boolean }> {
  const result = await validateCsv(actual, expected);
  if (result.isValid) {
    return { text: 'Validation passed.', isError: false };
  }
  const lines: string[] = ['Validation failed.'];
  if (result.differences?.length) {
    lines.push('Differences:', ...result.differences.map(d => `  ${d}`));
  }
  return { text: lines.join('\n'), isError: true };
}

// ---------------------------------------------------------------------------
// validate-json tool
// ---------------------------------------------------------------------------

describe('MCP tool: validate-json', () => {
  describe('exact match mode', () => {
    it('passes when objects are identical', () => {
      const res = formatJsonResult({ foo: 'bar' }, { foo: 'bar' });
      expect(res.isError).toBe(false);
      expect(res.text).toBe('Validation passed.');
    });

    it('fails when a value differs', () => {
      const res = formatJsonResult({ foo: 'bug' }, { foo: 'bar' });
      expect(res.isError).toBe(true);
      expect(res.text).toContain('Validation failed.');
      expect(res.text).toContain('[mismatch]');
      expect(res.text).toContain('foo');
    });

    it('fails when a field is missing', () => {
      const res = formatJsonResult({ name: 'John' }, { name: 'John', age: 30 });
      expect(res.isError).toBe(true);
      expect(res.text).toContain('[missing]');
      expect(res.text).toContain('age');
    });

    it('fails when actual has an extra field', () => {
      const res = formatJsonResult(
        { name: 'John', age: 30, extra: 'x' },
        { name: 'John', age: 30 }
      );
      expect(res.isError).toBe(true);
      expect(res.text).toContain('[extra]');
    });
  });

  describe('ignoreExtraProps option', () => {
    it('passes when actual has extra fields and ignoreExtraProps=true', () => {
      const res = formatJsonResult(
        { name: 'John', age: 30, extra: 'x' },
        { name: 'John', age: 30 },
        { ignoreExtraProps: true }
      );
      expect(res.isError).toBe(false);
    });

    it('still fails on value mismatch with ignoreExtraProps=true', () => {
      const res = formatJsonResult(
        { name: 'Jane', age: 30 },
        { name: 'John', age: 30 },
        { ignoreExtraProps: true }
      );
      expect(res.isError).toBe(true);
      expect(res.text).toContain('[mismatch]');
    });
  });

  describe('ignoreSimilar option', () => {
    it('passes when types match but values differ', () => {
      const res = formatJsonResult(
        { score: 99, active: false },
        { score: 0, active: true },
        { ignoreSimilar: true }
      );
      expect(res.isError).toBe(false);
    });

    it('fails when types differ', () => {
      const res = formatJsonResult(
        { age: 'thirty' },
        { age: 30 },
        { ignoreSimilar: true }
      );
      expect(res.isError).toBe(true);
    });
  });

  describe('ignoreProps option', () => {
    it('passes when ignored props differ', () => {
      const res = formatJsonResult(
        { name: 'John', timestamp: '2026-01-01' },
        { name: 'John', timestamp: '2025-01-01' },
        { ignoreProps: ['timestamp'] }
      );
      expect(res.isError).toBe(false);
    });
  });

  describe('JSON Schema (useJsonSchema=true)', () => {
    it('passes when data matches schema', () => {
      const data = { name: 'Alice', age: 25 };
      const schema = {
        type: 'object',
        required: ['name', 'age'],
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };
      const res = formatJsonResult(data, schema, { useJsonSchema: true });
      expect(res.isError).toBe(false);
    });

    it('fails when required property is missing', () => {
      const data = { name: 'Alice' };
      const schema = {
        type: 'object',
        required: ['name', 'age'],
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };
      const res = formatJsonResult(data, schema, { useJsonSchema: true });
      expect(res.isError).toBe(true);
      expect(res.text).toContain('age');
    });
  });

  describe('duplicate keys', () => {
    it('fails and reports duplicate key', () => {
      const res = formatJsonResult(
        '{"name":"John","age":30,"name":"Jane"}',
        { name: 'John', age: 30 }
      );
      expect(res.isError).toBe(true);
      expect(res.text).toContain('name');
    });
  });
});

// ---------------------------------------------------------------------------
// validate-xml tool
// ---------------------------------------------------------------------------

describe('MCP tool: validate-xml', () => {
  it('passes for identical XML', () => {
    const xml = '<root><value>42</value></root>';
    const res = formatXmlResult(xml, xml);
    expect(res.isError).toBe(false);
    expect(res.text).toBe('Validation passed.');
  });

  it('fails when element values differ', () => {
    const actual = '<root><value>42</value></root>';
    const expected = '<root><value>99</value></root>';
    const res = formatXmlResult(actual, expected);
    expect(res.isError).toBe(true);
    expect(res.text).toContain('Validation failed.');
  });

  it('fails when elements are missing', () => {
    const actual = '<root></root>';
    const expected = '<root><child>x</child></root>';
    const res = formatXmlResult(actual, expected);
    expect(res.isError).toBe(true);
  });

  it('passes for identical complex XML', () => {
    const xml = `<catalog><book id="1"><title>TypeScript Deep Dive</title></book></catalog>`;
    const res = formatXmlResult(xml, xml);
    expect(res.isError).toBe(false);
  });

  it('fails for attribute mismatch', () => {
    const actual = '<item id="1">text</item>';
    const expected = '<item id="2">text</item>';
    const res = formatXmlResult(actual, expected);
    expect(res.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validate-text tool
// ---------------------------------------------------------------------------

describe('MCP tool: validate-text', () => {
  it('passes for identical text', () => {
    const res = formatTextResult('Hello World', 'Hello World');
    expect(res.isError).toBe(false);
    expect(res.text).toBe('Validation passed.');
  });

  it('fails for different text', () => {
    const res = formatTextResult('Hello World', 'Hello Earth');
    expect(res.isError).toBe(true);
    expect(res.text).toContain('Validation failed.');
  });

  it('passes for identical multi-line text', () => {
    const text = 'line1\nline2\nline3';
    const res = formatTextResult(text, text);
    expect(res.isError).toBe(false);
  });

  it('fails when a line is added', () => {
    const actual = 'line1\nline2\nextra line';
    const expected = 'line1\nline2';
    const res = formatTextResult(actual, expected);
    expect(res.isError).toBe(true);
  });

  it('fails when a line is removed', () => {
    const actual = 'line1';
    const expected = 'line1\nline2';
    const res = formatTextResult(actual, expected);
    expect(res.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validate-csv tool
// ---------------------------------------------------------------------------

describe('MCP tool: validate-csv', () => {
  const header = 'name,age,city';
  const row1 = 'Alice,30,NYC';

  it('passes for identical CSV', async () => {
    const csv = `${header}\n${row1}`;
    const res = await formatCsvResult(csv, csv);
    expect(res.isError).toBe(false);
    expect(res.text).toBe('Validation passed.');
  });

  it('fails when a cell value differs', async () => {
    const actual = `${header}\nBob,30,NYC`;
    const expected = `${header}\nAlice,30,NYC`;
    const res = await formatCsvResult(actual, expected);
    expect(res.isError).toBe(true);
    expect(res.text).toContain('Validation failed.');
  });

  it('fails when a row is missing', async () => {
    const actual = `${header}`;
    const expected = `${header}\n${row1}`;
    const res = await formatCsvResult(actual, expected);
    expect(res.isError).toBe(true);
  });

  it('passes for identical multi-row CSV', async () => {
    const csv = `${header}\n${row1}\nBob,25,LA`;
    const res = await formatCsvResult(csv, csv);
    expect(res.isError).toBe(false);
  });

  it('fails when a column header differs', async () => {
    const actual = 'name,years,city\nAlice,30,NYC';
    const expected = `${header}\nAlice,30,NYC`;
    const res = await formatCsvResult(actual, expected);
    expect(res.isError).toBe(true);
  });
});
