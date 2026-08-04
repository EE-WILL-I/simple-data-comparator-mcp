import * as XLSX from 'xlsx';
import {
  validateXlsx,
  validateXlsxSimple,
  loadXlsxWorkbook,
  resolveSheet,
  sheetToCsv,
  XlsxValidationResult
} from '../xlsxValidator';

/**
 * Build an XLSX Buffer from a map of sheetName -> rows (2D array, first row is
 * treated as the header). Keeps test setup concise and avoids fixture files.
 */
function buildWorkbook(sheets: Record<string, any[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('xlsxValidator', () => {
  describe('Basic validation', () => {
    it('passes for two workbooks whose first sheet is identical', () => {
      const rows = [
        ['id', 'name'],
        [1, 'alice'],
        [2, 'bob']
      ];
      const a = buildWorkbook({ Data: rows });
      const b = buildWorkbook({ Data: rows });

      const result = validateXlsx(a, b);

      expect(result.isValid).toBe(true);
      expect(result.sheet).toEqual({ actual: 'Data', expected: 'Data' });
      expect(result.availableSheets).toEqual({ actual: ['Data'], expected: ['Data'] });
    });

    it('fails when a value differs between the two sheets', () => {
      const a = buildWorkbook({
        Data: [
          ['id', 'name'],
          [1, 'alice'],
          [2, 'bob']
        ]
      });
      const b = buildWorkbook({
        Data: [
          ['id', 'name'],
          [1, 'alice'],
          [2, 'carol']
        ]
      });

      const result = validateXlsx(a, b);

      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
      expect(result.differences!.some(d => d.startsWith('[mismatch]'))).toBe(true);
    });

    it('accepts ArrayBuffer / Uint8Array inputs too', () => {
      const rows = [['a', 'b'], [1, 2]];
      const buf = buildWorkbook({ S: rows });
      const u8 = new Uint8Array(buf);
      const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

      expect(validateXlsxSimple(u8, buf)).toBe(true);
      expect(validateXlsxSimple(ab, buf)).toBe(true);
    });
  });

  describe('Sheet selection', () => {
    it('defaults to the first sheet on both sides when sheet is not set', () => {
      const a = buildWorkbook({
        First: [['a'], [1]],
        Second: [['x'], [9]]
      });
      const b = buildWorkbook({
        First: [['a'], [1]],
        Second: [['x'], [999]] // intentionally different but ignored
      });

      const result = validateXlsx(a, b);

      expect(result.isValid).toBe(true);
      expect(result.sheet).toEqual({ actual: 'First', expected: 'First' });
    });

    it('selects a sheet by name on both sides when opts.sheet is a string', () => {
      const a = buildWorkbook({
        First: [['a'], [0]],
        Data: [['id', 'v'], [1, 10]]
      });
      const b = buildWorkbook({
        First: [['a'], [999]],
        Data: [['id', 'v'], [1, 10]]
      });

      const result = validateXlsx(a, b, { sheet: 'Data' });

      expect(result.isValid).toBe(true);
      expect(result.sheet).toEqual({ actual: 'Data', expected: 'Data' });
    });

    it('selects a sheet by 0-based index when opts.sheet is a number', () => {
      const a = buildWorkbook({
        First: [['a'], [0]],
        Data: [['id', 'v'], [1, 10]]
      });
      const b = buildWorkbook({
        First: [['a'], [999]],
        Data: [['id', 'v'], [1, 10]]
      });

      const result = validateXlsx(a, b, { sheet: 1 });

      expect(result.isValid).toBe(true);
      expect(result.sheet).toEqual({ actual: 'Data', expected: 'Data' });
    });

    it('honors actualSheet / expectedSheet overrides independently', () => {
      const a = buildWorkbook({
        ActualTab: [['id', 'v'], [1, 10]]
      });
      const b = buildWorkbook({
        ExpectedTab: [['id', 'v'], [1, 10]]
      });

      const result = validateXlsx(a, b, {
        actualSheet: 'ActualTab',
        expectedSheet: 'ExpectedTab'
      });

      expect(result.isValid).toBe(true);
      expect(result.sheet).toEqual({ actual: 'ActualTab', expected: 'ExpectedTab' });
    });

    it('returns a [missing_sheet] diagnostic when the actual sheet is absent', () => {
      const a = buildWorkbook({ Only: [['a'], [1]] });
      const b = buildWorkbook({ Data: [['a'], [1]] });

      const result = validateXlsx(a, b, { sheet: 'Data' });

      expect(result.isValid).toBe(false);
      expect(result.differences![0]).toMatch(/^\[missing_sheet\] actual/);
      expect(result.differences!.join('\n')).toContain('available sheets: [Only]');
      expect(result.availableSheets).toEqual({ actual: ['Only'], expected: ['Data'] });
    });

    it('returns a [missing_sheet] diagnostic when the expected sheet is absent', () => {
      const a = buildWorkbook({ Data: [['a'], [1]] });
      const b = buildWorkbook({ Only: [['a'], [1]] });

      const result = validateXlsx(a, b, { sheet: 'Data' });

      expect(result.isValid).toBe(false);
      expect(result.differences![0]).toMatch(/^\[missing_sheet\] expected/);
      expect(result.differences!.join('\n')).toContain('available sheets: [Only]');
    });

    it('rejects an out-of-range numeric sheet index', () => {
      const a = buildWorkbook({ Only: [['a'], [1]] });
      const b = buildWorkbook({ Only: [['a'], [1]] });

      const result = validateXlsx(a, b, { sheet: 5 });

      expect(result.isValid).toBe(false);
      expect(result.differences![0]).toMatch(/\[missing_sheet\]/);
    });
  });

  describe('CSV option pass-through', () => {
    it('passes when a differing column is excluded (excludeColumns)', () => {
      const a = buildWorkbook({
        Data: [
          ['id', 'name', 'city'],
          [1, 'alice', 'LA'],
          [2, 'bob', 'NYC']
        ]
      });
      const b = buildWorkbook({
        Data: [
          ['id', 'name', 'city'],
          [1, 'alice', 'DIFFERENT'],
          [2, 'bob', 'ALSO-DIFFERENT']
        ]
      });

      const result = validateXlsx(a, b, { excludeColumns: ['city'] });

      expect(result.isValid).toBe(true);
    });

    it('fails for a non-excluded column mismatch', () => {
      const a = buildWorkbook({
        Data: [
          ['id', 'name'],
          [1, 'alice'],
          [2, 'bob']
        ]
      });
      const b = buildWorkbook({
        Data: [
          ['id', 'name'],
          [1, 'alice'],
          [2, 'carol']
        ]
      });

      const result = validateXlsx(a, b, { includeColumns: ['name'] });

      expect(result.isValid).toBe(false);
    });

    it('reports a single [extra_row] for an inserted row when rowKey is set', () => {
      const expected = buildWorkbook({
        Data: [
          ['id', 'from', 'to'],
          [1, 'A', 'B'],
          [2, 'B', 'C'],
          [3, 'C', 'D'],
          [4, 'D', 'E'],
          [5, 'E', 'F']
        ]
      });
      const actual = buildWorkbook({
        Data: [
          ['id', 'from', 'to'],
          [1, 'A', 'B'],
          [99, 'X', 'Y'], // inserted row
          [2, 'B', 'C'],
          [3, 'C', 'D'],
          [4, 'D', 'E'],
          [5, 'E', 'F']
        ]
      });

      const result = validateXlsx(actual, expected, { rowKey: 'id' });

      expect(result.isValid).toBe(false);
      const extraRows = (result.differences || []).filter(d => d.startsWith('[extra_row]'));
      const missingRows = (result.differences || []).filter(d => d.startsWith('[missing_row]'));
      expect(extraRows).toHaveLength(1);
      expect(missingRows).toHaveLength(0);
      expect(extraRows[0]).toContain('id="99"');
    });

    it('passes when rows are reordered and ignoreRowOrder is true', () => {
      const a = buildWorkbook({
        Data: [
          ['id', 'v'],
          [2, 20],
          [1, 10]
        ]
      });
      const b = buildWorkbook({
        Data: [
          ['id', 'v'],
          [1, 10],
          [2, 20]
        ]
      });

      expect(validateXlsxSimple(a, b)).toBe(false);
      expect(validateXlsxSimple(a, b, { ignoreRowOrder: true })).toBe(true);
    });
  });

  describe('Cell formatting edge cases', () => {
    it('quotes cells containing the chosen delimiter instead of splitting them', () => {
      const a = buildWorkbook({
        Data: [
          ['id', 'note'],
          [1, 'hello, world'],
          [2, 'plain']
        ]
      });
      const b = buildWorkbook({
        Data: [
          ['id', 'note'],
          [1, 'hello, world'],
          [2, 'plain']
        ]
      });

      const result = validateXlsx(a, b);

      expect(result.isValid).toBe(true);
    });

    it('supports an alternate csvDelimiter without breaking parsing', () => {
      const a = buildWorkbook({
        Data: [
          ['id', 'name'],
          [1, 'alice'],
          [2, 'bob']
        ]
      });
      const b = buildWorkbook({
        Data: [
          ['id', 'name'],
          [1, 'alice'],
          [2, 'bob']
        ]
      });

      const result = validateXlsx(a, b, { csvDelimiter: ';' });

      expect(result.isValid).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('returns a [parse_error] diagnostic when an input path does not exist', () => {
      const ok = buildWorkbook({ Data: [['a'], [1]] });

      const result = validateXlsx('/tmp/definitely-not-a-real-file.xlsx', ok);

      expect(result.isValid).toBe(false);
      expect(result.parseError).toBeDefined();
      expect(result.differences![0]).toMatch(/^\[parse_error\]/);
    });

    it('returns a [parse_error] diagnostic for a corrupt ZIP-shaped buffer', () => {
      // Starts with the ZIP local-file-header magic (PK\x03\x04) but is truncated,
      // which forces the xlsx parser to fail rather than lenient-interpreting it.
      const corrupt = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      const ok = buildWorkbook({ Data: [['a'], [1]] });

      const result = validateXlsx(corrupt, ok);

      expect(result.isValid).toBe(false);
      expect(result.parseError).toBeDefined();
      expect(result.differences![0]).toMatch(/^\[parse_error\]/);
    });
  });

  describe('Helpers', () => {
    it('loadXlsxWorkbook reads a buffer', () => {
      const buf = buildWorkbook({ Data: [['a'], [1]] });
      const wb = loadXlsxWorkbook(buf);
      expect(wb.SheetNames).toEqual(['Data']);
    });

    it('resolveSheet returns the worksheet for a valid ref and throws otherwise', () => {
      const buf = buildWorkbook({ First: [['a'], [1]], Second: [['b'], [2]] });
      const wb = loadXlsxWorkbook(buf);

      expect(resolveSheet(wb, 'Second').name).toBe('Second');
      expect(resolveSheet(wb, 1).name).toBe('Second');
      expect(() => resolveSheet(wb, 'Nope')).toThrow(/Sheet "Nope" not found/);
      expect(() => resolveSheet(wb, 9)).toThrow(/Sheet "9" not found/);
    });

    it('sheetToCsv emits a header + row with the chosen field separator', () => {
      const buf = buildWorkbook({ Data: [['a', 'b'], [1, 2]] });
      const wb = loadXlsxWorkbook(buf);
      const csv = sheetToCsv(wb, 'Data', { csvDelimiter: ';' });
      expect(csv.split(/\r?\n/)[0]).toBe('a;b');
      expect(csv).toContain('1;2');
    });
  });

  describe('Type-only assertion', () => {
    it('result shape satisfies XlsxValidationResult', () => {
      const a = buildWorkbook({ S: [['a'], [1]] });
      const r: XlsxValidationResult = validateXlsx(a, a);
      expect(r.isValid).toBe(true);
    });
  });
});
