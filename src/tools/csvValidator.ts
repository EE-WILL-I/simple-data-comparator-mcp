import { parse } from 'csv-parse/sync';
import { logError, logInfo } from '../utils/logger.js';
const daff = require('daff');

export type CsvValidationResult = {
  isValid: boolean;
  expected?: string;
  actual?: string;
  differences?: string[];
  parseError?: string;
  htmlReport?: string;
  reportPath?: string;
  s3Url?: string;
};

export type CsvValidateOptions = {
  requestId?: string;
  traceId?: string;
  spanId?: string;

  /**
   * Only validate these columns (by header name). Any other column is stripped
   * from both actual and expected before comparison. If a listed column is not
   * present in either side it is silently skipped.
   */
  includeColumns?: string[];

  /**
   * Exclude these columns (by header name) from validation. Applied after
   * `includeColumns` if both are set.
   */
  excludeColumns?: string[];

  /**
   * When true, row order is ignored: rows are sorted before comparison so two
   * CSVs that contain the same rows in different order will be considered equal.
   * The header row is preserved.
   */
  ignoreRowOrder?: boolean;

  /**
   * Override the CSV field delimiter for both sides. If not set, the delimiter
   * is auto-detected per file (from `,`, `;`, `\t`, `|`), which means the
   * template and actual CSV may use different delimiters and still compare
   * correctly. Use this to force a specific delimiter.
   */
  delimiter?: string;

  /**
   * Force the delimiter only for the template (expected) CSV. Overrides
   * auto-detection and `delimiter` for the expected side.
   */
  expectedDelimiter?: string;

  /**
   * Force the delimiter only for the actual CSV. Overrides auto-detection
   * and `delimiter` for the actual side.
   */
  actualDelimiter?: string;

  /**
   * One or more header names that uniquely identify a row (primary key). When
   * set, `daff` aligns rows by these keys instead of by position+content, which
   * avoids the "one insert looks like many changes" problem on ambiguous data.
   *
   * If you also use `includeColumns`, the key columns are automatically kept
   * so they remain available for alignment.
   */
  rowKey?: string | string[];
};

/**
 * Validate CSV content against a template CSV. Returns a detailed result object
 * shaped like the JSON/XML validators so callers can build a rich HTML report.
 */
export const validateCsv = (
  csv: string,
  templateCsv: string,
  opts?: CsvValidateOptions
): CsvValidationResult => {
  const result: CsvValidationResult = {
    isValid: true,
    expected: templateCsv ?? '',
    actual: csv ?? ''
  };

  try {
    const baseParseOptions: Record<string, unknown> = {
      skip_empty_lines: false,
      bom: true // strip UTF-8 BOM so first header matches literally
    };

    const expectedDelimiter = opts?.expectedDelimiter
      ?? opts?.delimiter
      ?? detectDelimiter(templateCsv ?? '');
    const actualDelimiter = opts?.actualDelimiter
      ?? opts?.delimiter
      ?? detectDelimiter(csv ?? '');

    let expected: any[][] = parse(templateCsv ?? '', { ...baseParseOptions, delimiter: expectedDelimiter });
    let actual: any[][] = parse(csv ?? '', { ...baseParseOptions, delimiter: actualDelimiter });

    const rowKeys = normalizeRowKey(opts?.rowKey);

    // If the user provided includeColumns + rowKey, make sure the key columns
    // survive the filter so daff can still use them for alignment.
    const effectiveIncludeColumns = (opts?.includeColumns && opts.includeColumns.length > 0 && rowKeys.length > 0)
      ? Array.from(new Set([...opts.includeColumns, ...rowKeys]))
      : opts?.includeColumns;
    // Never exclude the rowKey columns, even if the user listed them.
    const effectiveExcludeColumns = (opts?.excludeColumns && opts.excludeColumns.length > 0 && rowKeys.length > 0)
      ? opts.excludeColumns.filter(c => !rowKeys.includes(normalizeHeader(c)))
      : opts?.excludeColumns;

    const hasColumnFilter = (effectiveIncludeColumns && effectiveIncludeColumns.length > 0)
      || (effectiveExcludeColumns && effectiveExcludeColumns.length > 0);
    if (hasColumnFilter) {
      const originalExpectedHeader = Array.isArray(expected[0]) ? expected[0].map(h => String(h ?? '')) : [];
      const originalActualHeader = Array.isArray(actual[0]) ? actual[0].map(h => String(h ?? '')) : [];

      expected = applyColumnFilter(expected, effectiveIncludeColumns, effectiveExcludeColumns);
      actual = applyColumnFilter(actual, effectiveIncludeColumns, effectiveExcludeColumns);

      const expectedKept = Array.isArray(expected[0]) ? expected[0].length : 0;
      const actualKept = Array.isArray(actual[0]) ? actual[0].length : 0;
      if (expectedKept === 0 && actualKept === 0) {
        // Filter removed every column — the user's include/exclude names don't
        // match any actual header. Fail fast with a diagnostic instead of
        // returning the confusing empty-row diff daff would produce.
        result.isValid = false;
        const requested = (opts?.includeColumns && opts.includeColumns.length > 0)
          ? opts.includeColumns.join(', ')
          : `(excludeColumns=${(opts?.excludeColumns || []).join(', ')})`;
        result.differences = [
          `[column_filter] no columns matched the include/exclude filter.`,
          `  requested: [${requested}]`,
          `  expected headers: [${originalExpectedHeader.join(', ')}]`,
          `  actual headers:   [${originalActualHeader.join(', ')}]`,
          `  hint: header matching is case-sensitive but tolerant of BOM and surrounding whitespace; check for a different delimiter (use opts.delimiter) or typos.`
        ];
        logError('CSV validation failed: column filter matched no columns', null, {
          _validation_type: 'csv',
          _requested: requested,
          _expected_headers: originalExpectedHeader.join(', '),
          _actual_headers: originalActualHeader.join(', '),
          request_id: opts?.requestId,
          trace_id: opts?.traceId,
          span_id: opts?.spanId
        });
        return result;
      }
    }

    if (opts?.ignoreRowOrder) {
      expected = sortRowsPreservingHeader(expected);
      actual = sortRowsPreservingHeader(actual);
    }

    const flags = new daff.CompareFlags();
    if (rowKeys.length > 0) {
      // daff uses `ids` to align rows by primary key instead of
      // positional/content heuristics — this turns a single inserted row into
      // a single [extra_row] instead of a cascade of shifted-row noise.
      flags.ids = rowKeys.slice();
    }

    const alignment = daff.compareTables(new daff.TableView(expected), new daff.TableView(actual)).align();
    const dataDiff: any[] = [];
    const tableDiff = new daff.TableDiff(alignment, flags);
    tableDiff.hilite(dataDiff);

    // If diff table has only header row (length 1) or is empty, no changes
    const diffHasChanges = dataDiff.length > 1;
    if (!diffHasChanges) {
      logInfo('CSV validation passed', {
        _validation_type: 'csv',
        _status: 'success',
        request_id: opts?.requestId,
        trace_id: opts?.traceId,
        span_id: opts?.spanId
      });
      return result;
    }

    result.isValid = false;
    result.differences = buildCsvDifferences(dataDiff);

    logError('CSV validation failed: Differences detected', null, {
      _validation_type: 'csv',
      _differences: result.differences.join('\n'),
      request_id: opts?.requestId,
      trace_id: opts?.traceId,
      span_id: opts?.spanId
    });
    return result;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    result.isValid = false;
    result.parseError = errorMsg;
    result.differences = [`[parse_error] ${errorMsg}`];

    logError('CSV validation error', e, {
      _validation_type: 'csv',
      request_id: opts?.requestId,
      trace_id: opts?.traceId,
      span_id: opts?.spanId
    });
    return result;
  }
};

/**
 * Backward-compatible boolean wrapper for callers that only care about pass/fail.
 */
export const validateCsvSimple = (
  csv: string,
  templateCsv: string,
  opts?: CsvValidateOptions
): boolean => validateCsv(csv, templateCsv, opts).isValid;

/**
 * Interpret daff's hilite() output into human-readable difference lines using
 * the same shape as the JSON/XML validators (e.g. `[mismatch] ...`, `[missing_row] ...`).
 */
function buildCsvDifferences(dataDiff: any[][]): string[] {
  const out: string[] = [];
  if (!Array.isArray(dataDiff) || dataDiff.length === 0) {
    return out;
  }

  let schemaRow: any[] | null = null;
  let headerRow: any[] | null = null;
  let headerRowIndex = -1;

  for (let i = 0; i < dataDiff.length; i++) {
    const row = dataDiff[i];
    if (!Array.isArray(row)) continue;
    const marker = String(row[0] ?? '');
    if (marker === '!') {
      schemaRow = row;
    } else if (marker === '@@') {
      headerRow = row;
      headerRowIndex = i;
      break;
    }
  }

  const columnNames: string[] = [];
  if (headerRow) {
    for (let c = 1; c < headerRow.length; c++) {
      columnNames.push(String(headerRow[c] ?? `col${c - 1}`));
    }
  }

  if (schemaRow) {
    for (let c = 1; c < schemaRow.length; c++) {
      const cell = String(schemaRow[c] ?? '');
      const fallbackName = columnNames[c - 1] || `col${c - 1}`;
      if (cell === '+++') {
        out.push(`[extra_column] unexpected column "${fallbackName}"`);
      } else if (cell === '---') {
        out.push(`[missing_column] expected column "${fallbackName}" is missing from actual`);
      } else if (/^\(.+\)$/.test(cell)) {
        const oldName = cell.slice(1, -1);
        if (oldName !== fallbackName) {
          out.push(`[column_renamed] expected="${oldName}" actual="${fallbackName}"`);
        }
      }
    }
  }

  let rowIndex = 0;
  const startIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  for (let i = startIndex; i < dataDiff.length; i++) {
    const row = dataDiff[i];
    if (!Array.isArray(row)) continue;
    const marker = String(row[0] ?? '').trim();

    if (marker === '+++' || marker === '+') {
      out.push(`[extra_row] row ${rowIndex}: { ${formatRow(row.slice(1), columnNames)} }`);
    } else if (marker === '---') {
      out.push(`[missing_row] row ${rowIndex}: { ${formatRow(row.slice(1), columnNames)} }`);
    } else if (marker === '->') {
      for (let c = 1; c < row.length; c++) {
        const cell = row[c];
        if (cell == null) continue;
        const str = String(cell);
        const arrowIdx = str.indexOf('->');
        if (arrowIdx >= 0) {
          const before = str.slice(0, arrowIdx);
          const after = str.slice(arrowIdx + 2);
          const colName = columnNames[c - 1] || `col${c - 1}`;
          out.push(`[mismatch] row ${rowIndex}, col "${colName}": expected="${before}" actual="${after}"`);
        }
      }
    }
    rowIndex++;
  }

  return out;
}

function formatRow(cells: any[], columnNames: string[]): string {
  return cells
    .map((v, idx) => {
      const name = columnNames[idx] || `col${idx}`;
      const val = v == null ? '' : String(v);
      return `${name}="${val}"`;
    })
    .join(', ');
}

/**
 * Keep only columns whose header name passes the include/exclude filter.
 * The first row of `rows` is treated as the header. If the header is missing
 * or empty, the input is returned unchanged.
 */
function applyColumnFilter(rows: any[][], include?: string[], exclude?: string[]): any[][] {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const header = rows[0];
  if (!Array.isArray(header) || header.length === 0) return rows;

  const includeSet = include && include.length > 0
    ? new Set(include.map(normalizeHeader))
    : null;
  const excludeSet = exclude && exclude.length > 0
    ? new Set(exclude.map(normalizeHeader))
    : null;

  const keepIdx: number[] = [];
  for (let i = 0; i < header.length; i++) {
    const name = normalizeHeader(header[i]);
    if (includeSet && !includeSet.has(name)) continue;
    if (excludeSet && excludeSet.has(name)) continue;
    keepIdx.push(i);
  }

  return rows.map(row => {
    if (!Array.isArray(row)) return row;
    return keepIdx.map(i => row[i]);
  });
}

/**
 * Normalize a CSV header cell for matching against include/exclude lists:
 * strips a leading BOM and surrounding whitespace, and coerces to string.
 * Matching is otherwise case-sensitive.
 */
function normalizeHeader(value: unknown): string {
  if (value == null) return '';
  let s = String(value);
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s.trim();
}

/**
 * Accept either a single header name or an array and return a deduped list of
 * normalized names. Empty input returns an empty array.
 */
function normalizeRowKey(key?: string | string[]): string[] {
  if (!key) return [];
  const arr = Array.isArray(key) ? key : [key];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of arr) {
    const n = normalizeHeader(k);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * Best-effort delimiter detection from the first non-empty line of a CSV
 * sample. Chooses between `,`, `;`, `\t`, `|` by counting occurrences and
 * defaults to `,` when the sample is empty or no candidate appears.
 */
function detectDelimiter(sample: string): string {
  if (!sample) return ',';
  let text = sample;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  if (!firstLine) return ',';

  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    let count = 0;
    for (let i = 0; i < firstLine.length; i++) {
      if (firstLine[i] === d) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/**
 * Sort data rows lexicographically (by stringified contents) so row-order
 * differences don't trigger a validation failure. The header row is preserved
 * at index 0.
 */
function sortRowsPreservingHeader(rows: any[][]): any[][] {
  if (!Array.isArray(rows) || rows.length <= 1) return rows;
  const header = rows[0];
  const body = rows.slice(1).slice();
  body.sort((a, b) => {
    const aKey = JSON.stringify(a);
    const bKey = JSON.stringify(b);
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    return 0;
  });
  return [header, ...body];
}
