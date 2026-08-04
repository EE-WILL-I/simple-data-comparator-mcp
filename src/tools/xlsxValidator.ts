import * as XLSX from 'xlsx';
import { logError, logInfo } from '../utils/logger.js';
import { validateCsv, CsvValidationResult, CsvValidateOptions } from './csvValidator.js';

/**
 * Anything XLSX.read() accepts as bytes, or a file path string.
 */
export type XlsxInput = Buffer | ArrayBuffer | Uint8Array | string;

/**
 * Sheet reference — either a case-sensitive sheet name or a 0-based index
 * into `workbook.SheetNames`.
 */
export type SheetRef = string | number;

/**
 * Result shape for XLSX validation — identical to CSV plus sheet metadata so
 * callers can see which sheet was chosen on each side and what tabs were
 * available (useful for debugging `[missing_sheet]` diagnostics).
 */
export type XlsxValidationResult = CsvValidationResult & {
  sheet?: { actual: string; expected: string };
  availableSheets?: { actual: string[]; expected: string[] };
};

export type XlsxValidateOptions = CsvValidateOptions & {
  /**
   * Which sheet to compare when both sides use the same tab. Accepts a sheet
   * name or a 0-based index. Defaults to 0 (the first sheet).
   */
  sheet?: SheetRef;

  /** Override sheet selection for the actual workbook only. */
  actualSheet?: SheetRef;

  /** Override sheet selection for the expected workbook only. */
  expectedSheet?: SheetRef;

  /**
   * Field separator passed to SheetJS when stringifying the sheet. Defaults to
   * ','. Cells containing the separator are automatically quoted by SheetJS,
   * so this value is only visible when a cell already contains the separator.
   */
  csvDelimiter?: string;

  /**
   * If false (default), fully-empty rows are dropped before comparison.
   */
  blankrows?: boolean;

  /**
   * If true, numbers are emitted in raw form (Excel serials for dates). If
   * false (default), SheetJS formats numbers using the cell's number format,
   * which is usually what you want for human-readable comparisons.
   */
  rawNumbers?: boolean;
};

/**
 * Load an XLSX workbook from either a Buffer / Uint8Array / ArrayBuffer or a
 * filesystem path. Caller handles the surrounding try/catch — this throws
 * through any SheetJS parse errors so `validateXlsx` can convert them into
 * a `[parse_error]` difference.
 */
export function loadXlsxWorkbook(input: XlsxInput): XLSX.WorkBook {
  if (typeof input === 'string') {
    return XLSX.readFile(input);
  }
  return XLSX.read(input, { type: 'buffer' });
}

/**
 * Resolve a sheet by name or 0-based index. Throws with a diagnostic that
 * lists the available sheet names when the reference doesn't exist.
 */
export function resolveSheet(wb: XLSX.WorkBook, ref: SheetRef): { name: string; sheet: XLSX.WorkSheet } {
  const names = wb.SheetNames || [];
  let name: string | undefined;
  if (typeof ref === 'number') {
    if (ref >= 0 && ref < names.length) name = names[ref];
  } else {
    if (names.includes(ref)) name = ref;
  }
  if (!name) {
    throw new Error(`Sheet "${ref}" not found. Available sheets: [${names.join(', ')}]`);
  }
  const sheet = wb.Sheets[name];
  if (!sheet) {
    throw new Error(`Sheet "${name}" is listed in SheetNames but missing from Sheets.`);
  }
  return { name, sheet };
}

/**
 * Convert one sheet of a workbook into CSV text, ready to feed into the
 * existing CSV validator. Merged cells are repeated across the range, formulas
 * are resolved to their cached values, and cells are RFC-4180 quoted when they
 * contain the field/row separator.
 */
export function sheetToCsv(
  wb: XLSX.WorkBook,
  ref: SheetRef,
  opts?: { csvDelimiter?: string; blankrows?: boolean; rawNumbers?: boolean }
): string {
  const { sheet } = resolveSheet(wb, ref);
  return XLSX.utils.sheet_to_csv(sheet, {
    FS: opts?.csvDelimiter ?? ',',
    blankrows: opts?.blankrows ?? false,
    rawNumbers: opts?.rawNumbers ?? false
  });
}

/**
 * Validate one sheet of an XLSX workbook against a template workbook's sheet.
 * Internally converts both sheets to CSV and delegates to `validateCsv`, so
 * the full CSV feature set (includeColumns / excludeColumns / ignoreRowOrder /
 * rowKey / delimiter) is available transparently.
 */
export function validateXlsx(
  actual: XlsxInput,
  expected: XlsxInput,
  opts: XlsxValidateOptions = {}
): XlsxValidationResult {
  const result: XlsxValidationResult = { isValid: true };

  try {
    const actualWb = loadXlsxWorkbook(actual);
    const expectedWb = loadXlsxWorkbook(expected);

    const defaultRef: SheetRef = opts.sheet ?? 0;
    const actualRef: SheetRef = opts.actualSheet ?? defaultRef;
    const expectedRef: SheetRef = opts.expectedSheet ?? defaultRef;

    const availableSheets = {
      actual: (actualWb.SheetNames || []).slice(),
      expected: (expectedWb.SheetNames || []).slice()
    };

    let actualName: string;
    try {
      actualName = resolveSheet(actualWb, actualRef).name;
    } catch (e: any) {
      result.isValid = false;
      result.availableSheets = availableSheets;
      result.differences = [
        `[missing_sheet] actual workbook is missing sheet "${actualRef}"`,
        `  available sheets: [${availableSheets.actual.join(', ')}]`
      ];
      logError('XLSX validation failed: actual sheet missing', e, {
        _validation_type: 'xlsx',
        _side: 'actual',
        _requested_sheet: String(actualRef),
        _available: availableSheets.actual.join(', '),
        request_id: opts.requestId,
        trace_id: opts.traceId,
        span_id: opts.spanId
      });
      return result;
    }

    let expectedName: string;
    try {
      expectedName = resolveSheet(expectedWb, expectedRef).name;
    } catch (e: any) {
      result.isValid = false;
      result.availableSheets = availableSheets;
      result.differences = [
        `[missing_sheet] expected workbook is missing sheet "${expectedRef}"`,
        `  available sheets: [${availableSheets.expected.join(', ')}]`
      ];
      logError('XLSX validation failed: expected sheet missing', e, {
        _validation_type: 'xlsx',
        _side: 'expected',
        _requested_sheet: String(expectedRef),
        _available: availableSheets.expected.join(', '),
        request_id: opts.requestId,
        trace_id: opts.traceId,
        span_id: opts.spanId
      });
      return result;
    }

    const csvDelimiter = opts.csvDelimiter ?? ',';
    const actualCsv = sheetToCsv(actualWb, actualName, {
      csvDelimiter,
      blankrows: opts.blankrows,
      rawNumbers: opts.rawNumbers
    });
    const expectedCsv = sheetToCsv(expectedWb, expectedName, {
      csvDelimiter,
      blankrows: opts.blankrows,
      rawNumbers: opts.rawNumbers
    });

    // We know the exact delimiter used for stringifying, so force it instead of
    // relying on detection — this avoids misfires if a cell's content happens
    // to contain more ';' or tabs than ','.
    const csvOpts: CsvValidateOptions = {
      requestId: opts.requestId,
      traceId: opts.traceId,
      spanId: opts.spanId,
      includeColumns: opts.includeColumns,
      excludeColumns: opts.excludeColumns,
      ignoreRowOrder: opts.ignoreRowOrder,
      rowKey: opts.rowKey,
      delimiter: opts.delimiter ?? csvDelimiter,
      expectedDelimiter: opts.expectedDelimiter,
      actualDelimiter: opts.actualDelimiter
    };

    const csvResult = validateCsv(actualCsv, expectedCsv, csvOpts);

    const merged: XlsxValidationResult = {
      ...csvResult,
      sheet: { actual: actualName, expected: expectedName },
      availableSheets
    };

    if (merged.isValid) {
      logInfo('XLSX validation passed', {
        _validation_type: 'xlsx',
        _sheet_actual: actualName,
        _sheet_expected: expectedName,
        request_id: opts.requestId,
        trace_id: opts.traceId,
        span_id: opts.spanId
      });
    }

    return merged;
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    result.isValid = false;
    result.parseError = msg;
    result.differences = [`[parse_error] ${msg}`];
    logError('XLSX validation error', e, {
      _validation_type: 'xlsx',
      request_id: opts.requestId,
      trace_id: opts.traceId,
      span_id: opts.spanId
    });
    return result;
  }
}

/**
 * Backward-compatible boolean wrapper for callers that only care about pass/fail.
 */
export const validateXlsxSimple = (
  actual: XlsxInput,
  expected: XlsxInput,
  opts?: XlsxValidateOptions
): boolean => validateXlsx(actual, expected, opts).isValid;
