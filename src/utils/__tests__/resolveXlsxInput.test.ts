import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveXlsxInput } from '../resolveXlsxInput.js';

describe('resolveXlsxInput', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-resolve-'));
  const xlsxPath = path.join(tmpDir, 'sample.xlsx');
  const xlsxBytes = Buffer.from('UEsDBBQAAAAI', 'base64'); // minimal zip header bytes

  beforeAll(() => {
    fs.writeFileSync(xlsxPath, xlsxBytes);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolves an absolute file path', () => {
    expect(resolveXlsxInput(xlsxPath, 'actual')).toBe(xlsxPath);
  });

  it('resolves a relative file path from cwd', () => {
    const relative = path.relative(process.cwd(), xlsxPath);
    expect(resolveXlsxInput(relative, 'actual')).toBe(path.resolve(relative));
  });

  it('resolves base64 payload when not a path', () => {
    const b64 = xlsxBytes.toString('base64');
    const result = resolveXlsxInput(b64, 'actual');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect((result as Buffer).equals(xlsxBytes)).toBe(true);
  });

  it('throws when path does not exist', () => {
    expect(() => resolveXlsxInput(path.join(tmpDir, 'missing.xlsx'), 'actual')).toThrow(/not found/);
  });
});
