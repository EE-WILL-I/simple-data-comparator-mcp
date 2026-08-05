import fs from 'node:fs';
import path from 'node:path';
import type { XlsxInput } from '../tools/xlsxValidator.js';

/**
 * Resolve MCP tool input to something validateXlsx accepts: a filesystem path
 * string or a Buffer of raw XLSX bytes.
 *
 * Accepts either:
 * - A workspace-relative or absolute path to an .xlsx file
 * - A base64-encoded XLSX string
 */
export function resolveXlsxInput(value: string, label: string): XlsxInput {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is empty`);
  }

  const looksLikePath =
    /\.xlsx?$/i.test(trimmed) ||
    trimmed.includes('/') ||
    trimmed.includes('\\');

  if (looksLikePath) {
    const resolved = path.isAbsolute(trimmed) ? trimmed : path.resolve(trimmed);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    throw new Error(`${label} file not found: ${resolved}`);
  }

  const buf = Buffer.from(trimmed, 'base64');
  if (buf.length === 0) {
    throw new Error(`${label} is not a valid file path or base64 XLSX payload`);
  }
  return buf;
}
