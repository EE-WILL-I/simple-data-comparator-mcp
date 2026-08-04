import { validateCsv, validateCsvSimple, CsvValidationResult } from '../csvValidator';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}));

describe('CsvValidator', () => {
  describe('Result Object Structure', () => {
    it('should return CsvValidationResult with all required fields on success', () => {
      const csv = 'name,age\nJohn,30';
      const template = 'name,age\nJohn,30';

      const result = validateCsv(csv, template);

      expect(result).toHaveProperty('isValid', true);
      expect(result).toHaveProperty('expected');
      expect(result).toHaveProperty('actual');
      expect(result.expected).toBe(template);
      expect(result.actual).toBe(csv);
    });

    it('should return CsvValidationResult with differences on failure', () => {
      const csv = 'name,age\nJohn,30\nJane,26';
      const template = 'name,age\nJohn,30\nJane,25';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
      expect(Array.isArray(result.differences)).toBe(true);
      expect(result.differences!.length).toBeGreaterThan(0);
      expect(result.expected).toBe(template);
      expect(result.actual).toBe(csv);
    });

    it('should surface a parse error when CSV is malformed', () => {
      const csv = 'name,age\n"unterminated';
      const template = 'name,age\nJohn,30';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
      expect(result.parseError).toBeDefined();
      expect(result.differences).toBeDefined();
      expect(result.differences![0]).toMatch(/^\[parse_error\]/);
    });
  });

  describe('Difference shape (mirrors JSON/XML validators)', () => {
    it('should emit [mismatch] lines for changed cell values', () => {
      const csv = 'sku,product_name,price\nSKU001,Laptop,999.99\nSKU002,Mouse,34.99';
      const template = 'sku,product_name,price\nSKU001,Laptop,999.99\nSKU002,Mouse,29.99';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
      const priceDiff = result.differences!.find(d => d.startsWith('[mismatch]'));
      expect(priceDiff).toBeDefined();
      expect(priceDiff!).toContain('price');
      expect(priceDiff!).toContain('expected="29.99"');
      expect(priceDiff!).toContain('actual="34.99"');
    });

    it('should emit [extra_row] when actual has an additional row', () => {
      const csv = 'name,age\nJohn,30\nBob,35';
      const template = 'name,age\nJohn,30';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
      const extra = result.differences!.find(d => d.startsWith('[extra_row]'));
      expect(extra).toBeDefined();
      expect(extra!).toContain('Bob');
    });

    it('should emit [missing_row] when actual is missing a row', () => {
      const csv = 'name,age\nJohn,30';
      const template = 'name,age\nJohn,30\nJane,25';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
      const missing = result.differences!.find(d => d.startsWith('[missing_row]'));
      expect(missing).toBeDefined();
      expect(missing!).toContain('Jane');
    });
  });

  describe('Basic CSV Validation', () => {
    it('should pass validation when CSV matches template exactly', () => {
      const csv = 'name,age\nJohn,30\nJane,25';
      const template = 'name,age\nJohn,30\nJane,25';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should fail validation when CSV does not match template', () => {
      const csv = 'name,age\nJohn,30\nJane,26';
      const template = 'name,age\nJohn,30\nJane,25';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });

    it('should handle missing rows', () => {
      const csv = 'name,age\nJohn,30';
      const template = 'name,age\nJohn,30\nJane,25';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });

    it('should handle extra rows', () => {
      const csv = 'name,age\nJohn,30\nJane,25\nBob,35';
      const template = 'name,age\nJohn,30\nJane,25';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });
  });

  describe('Headers', () => {
    it('should validate CSV headers', () => {
      const csv = 'name,age,city\nJohn,30,NYC';
      const template = 'name,age,city\nJohn,30,NYC';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should detect header differences', () => {
      const csv = 'fullname,age\nJohn,30';
      const template = 'name,age\nJohn,30';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });

    it('should detect missing columns in header', () => {
      const csv = 'name\nJohn';
      const template = 'name,age\nJohn,30';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });

    it('should detect extra columns in header', () => {
      const csv = 'name,age,city\nJohn,30,NYC';
      const template = 'name,age\nJohn,30';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });
  });

  describe('Column Values', () => {
    it('should detect value differences in specific columns', () => {
      const csv = 'name,age,city\nJohn,30,LA';
      const template = 'name,age,city\nJohn,30,NYC';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });

    it('should validate numeric values', () => {
      const csv = 'product,price,quantity\nApple,1.5,10\nBanana,0.75,20';
      const template = 'product,price,quantity\nApple,1.5,10\nBanana,0.75,20';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should detect numeric value differences', () => {
      const csv = 'product,price\nApple,1.5\nBanana,0.80';
      const template = 'product,price\nApple,1.5\nBanana,0.75';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });
  });

  describe('Multiple Rows', () => {
    it('should validate CSV with multiple rows', () => {
      const csv = `name,age,city
John,30,NYC
Jane,25,LA
Bob,35,Chicago
Alice,28,Boston`;
      const template = `name,age,city
John,30,NYC
Jane,25,LA
Bob,35,Chicago
Alice,28,Boston`;

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should detect row order differences', () => {
      const csv = `name,age
Jane,25
John,30`;
      const template = `name,age
John,30
Jane,25`;

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });

    it('should detect differences in middle rows', () => {
      const csv = `name,age,city
John,30,NYC
Jane,26,LA
Bob,35,Chicago`;
      const template = `name,age,city
John,30,NYC
Jane,25,LA
Bob,35,Chicago`;

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });
  });

  describe('Special Characters', () => {
    it('should handle CSV with quoted fields', () => {
      const csv = 'name,description\n"John Smith","A developer"\n"Jane Doe","A designer"';
      const template = 'name,description\n"John Smith","A developer"\n"Jane Doe","A designer"';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should handle CSV with commas in quoted fields', () => {
      const csv = 'name,address\n"John","123 Main St, NYC"\n"Jane","456 Oak Ave, LA"';
      const template = 'name,address\n"John","123 Main St, NYC"\n"Jane","456 Oak Ave, LA"';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should handle CSV with newlines in quoted fields', () => {
      const csv = 'name,bio\n"John","Line1\nLine2"\n"Jane","Line3\nLine4"';
      const template = 'name,bio\n"John","Line1\nLine2"\n"Jane","Line3\nLine4"';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should handle special characters', () => {
      const csv = 'symbol,description\n@,"At sign"\n#,"Hash"\n$,"Dollar"';
      const template = 'symbol,description\n@,"At sign"\n#,"Hash"\n$,"Dollar"';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Empty Values', () => {
    it('should handle empty CSV fields', () => {
      const csv = 'name,age,city\nJohn,30,\nJane,,LA';
      const template = 'name,age,city\nJohn,30,\nJane,,LA';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should detect differences in empty fields', () => {
      const csv = 'name,age,city\nJohn,30,NYC\nJane,,LA';
      const template = 'name,age,city\nJohn,30,\nJane,,LA';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });

    it('should handle completely empty rows', () => {
      const csv = 'name,age\n,\n,';
      const template = 'name,age\n,\n,';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single row CSV (header only)', () => {
      const csv = 'name,age,city';
      const template = 'name,age,city';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should handle single column CSV', () => {
      const csv = 'name\nJohn\nJane\nBob';
      const template = 'name\nJohn\nJane\nBob';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should handle CSV with only data (no header)', () => {
      const csv = 'John,30\nJane,25';
      const template = 'John,30\nJane,25';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should handle empty CSV strings', () => {
      const csv = '';
      const template = '';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should handle CSV with trailing newline', () => {
      const csv = 'name,age\nJohn,30\n';
      const template = 'name,age\nJohn,30\n';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should handle CSV with Windows line endings', () => {
      const csv = 'name,age\r\nJohn,30\r\nJane,25';
      const template = 'name,age\r\nJohn,30\r\nJane,25';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Options', () => {
    it('should accept requestId, traceId, and spanId in options', () => {
      const csv = 'name,age\nJohn,30';
      const template = 'name,age\nJohn,30';
      const options = {
        requestId: 'req-123',
        traceId: 'trace-456',
        spanId: 'span-789'
      };

      const result = validateCsv(csv, template, options);

      expect(result.isValid).toBe(true);
    });

    it('should work without options', () => {
      const csv = 'name,age\nJohn,30';
      const template = 'name,age\nJohn,30';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed CSV', () => {
      const csv = 'name,age\nJohn,30\nJane,25,Extra';
      const template = 'name,age\nJohn,30\nJane,25';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });

    it('should handle null values', () => {
      const csv = null as any;
      const template = 'name,age\nJohn,30';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });

    it('should handle undefined values', () => {
      const csv = undefined as any;
      const template = 'name,age\nJohn,30';

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });
  });

  describe('Large CSV Files', () => {
    it('should handle CSV with many rows', () => {
      const rows = ['name,age,city'];
      for (let i = 0; i < 1000; i++) {
        rows.push(`Person${i},${20 + (i % 50)},City${i % 10}`);
      }
      const csv = rows.join('\n');
      const template = rows.join('\n');

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should handle CSV with many columns', () => {
      const headers = Array.from({ length: 50 }, (_, i) => `col${i}`);
      const values = Array.from({ length: 50 }, (_, i) => `val${i}`);
      const csv = `${headers.join(',')}\n${values.join(',')}`;
      const template = `${headers.join(',')}\n${values.join(',')}`;

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should validate transaction CSV', () => {
      const csv = `transaction_id,date,amount,status
T001,2025-01-01,100.50,completed
T002,2025-01-02,250.75,pending
T003,2025-01-03,75.00,completed`;
      const template = `transaction_id,date,amount,status
T001,2025-01-01,100.50,completed
T002,2025-01-02,250.75,pending
T003,2025-01-03,75.00,completed`;

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should validate product inventory CSV', () => {
      const csv = `sku,product_name,quantity,price,category
SKU001,"Laptop",50,999.99,Electronics
SKU002,"Mouse",200,29.99,Accessories
SKU003,"Keyboard",150,79.99,Accessories`;
      const template = `sku,product_name,quantity,price,category
SKU001,"Laptop",50,999.99,Electronics
SKU002,"Mouse",200,29.99,Accessories
SKU003,"Keyboard",150,79.99,Accessories`;

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(true);
    });

    it('should detect price discrepancy in product CSV', () => {
      const csv = `sku,product_name,price
SKU001,"Laptop",999.99
SKU002,"Mouse",34.99
SKU003,"Keyboard",79.99`;
      const template = `sku,product_name,price
SKU001,"Laptop",999.99
SKU002,"Mouse",29.99
SKU003,"Keyboard",79.99`;

      const result = validateCsv(csv, template);

      expect(result.isValid).toBe(false);
    });
  });

  describe('Boolean wrapper (validateCsvSimple)', () => {
    it('returns true for matching CSV', () => {
      expect(validateCsvSimple('a,b\n1,2', 'a,b\n1,2')).toBe(true);
    });

    it('returns false for mismatching CSV', () => {
      expect(validateCsvSimple('a,b\n1,3', 'a,b\n1,2')).toBe(false);
    });
  });

  describe('Type-only assertion', () => {
    it('result shape satisfies CsvValidationResult', () => {
      const r: CsvValidationResult = validateCsv('a\n1', 'a\n1');
      expect(r.isValid).toBe(true);
    });
  });

  describe('includeColumns option', () => {
    it('passes when only the included columns match', () => {
      const csv = 'name,age,city\nJohn,30,LA';
      const template = 'name,age,city\nJohn,30,NYC';

      const result = validateCsv(csv, template, { includeColumns: ['name', 'age'] });

      expect(result.isValid).toBe(true);
    });

    it('fails when an included column has a mismatch', () => {
      const csv = 'name,age,city\nJohn,31,LA';
      const template = 'name,age,city\nJohn,30,NYC';

      const result = validateCsv(csv, template, { includeColumns: ['name', 'age'] });

      expect(result.isValid).toBe(false);
      const ageDiff = result.differences!.find(d => d.includes('"age"'));
      expect(ageDiff).toBeDefined();
    });

    it('ignores unknown column names in includeColumns', () => {
      const csv = 'name,age\nJohn,30';
      const template = 'name,age\nJohn,30';

      const result = validateCsv(csv, template, { includeColumns: ['name', 'age', 'does-not-exist'] });

      expect(result.isValid).toBe(true);
    });
  });

  describe('excludeColumns option', () => {
    it('passes when the differing column is excluded', () => {
      const csv = 'name,age,city\nJohn,30,LA';
      const template = 'name,age,city\nJohn,30,NYC';

      const result = validateCsv(csv, template, { excludeColumns: ['city'] });

      expect(result.isValid).toBe(true);
    });

    it('still fails for mismatches in non-excluded columns', () => {
      const csv = 'name,age,city\nJohn,31,LA';
      const template = 'name,age,city\nJohn,30,NYC';

      const result = validateCsv(csv, template, { excludeColumns: ['city'] });

      expect(result.isValid).toBe(false);
      const ageDiff = result.differences!.find(d => d.includes('"age"'));
      expect(ageDiff).toBeDefined();
      const cityDiff = result.differences!.find(d => d.includes('"city"'));
      expect(cityDiff).toBeUndefined();
    });

    it('applies excludeColumns after includeColumns when both are set', () => {
      const csv = 'name,age,city\nJohn,30,LA';
      const template = 'name,age,city\nJohn,30,NYC';

      const result = validateCsv(csv, template, {
        includeColumns: ['name', 'age', 'city'],
        excludeColumns: ['city']
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('Column matching robustness', () => {
    it('matches headers that have a leading UTF-8 BOM', () => {
      const csv = '\uFEFFFrom Task Name,To Task Name,Note\nA,B,keep\nC,D,drop';
      const template = '\uFEFFFrom Task Name,To Task Name,Note\nA,B,other\nC,D,again';

      const result = validateCsv(csv, template, {
        includeColumns: ['From Task Name', 'To Task Name']
      });

      expect(result.isValid).toBe(true);
    });

    it('trims surrounding whitespace when matching include/exclude names', () => {
      const csv = 'From Task Name , To Task Name ,Note\nA,B,x';
      const template = 'From Task Name , To Task Name ,Note\nA,B,y';

      const result = validateCsv(csv, template, {
        includeColumns: ['From Task Name', 'To Task Name']
      });

      expect(result.isValid).toBe(true);
    });

    it('returns a clear diagnostic when no columns match the filter', () => {
      const csv = 'col_a,col_b\n1,2';
      const template = 'col_a,col_b\n1,2';

      const result = validateCsv(csv, template, {
        includeColumns: ['From Task Name', 'To Task Name']
      });

      expect(result.isValid).toBe(false);
      expect(result.differences!.some(d => d.startsWith('[column_filter]'))).toBe(true);
      const firstLine = result.differences![0];
      expect(firstLine).toContain('no columns matched');
      // Includes what was requested and what was actually present
      expect(result.differences!.join('\n')).toContain('From Task Name');
      expect(result.differences!.join('\n')).toContain('col_a');
    });

    it('supports a custom delimiter via opts.delimiter', () => {
      const csv = 'From Task Name;To Task Name;Note\nA;B;x';
      const template = 'From Task Name;To Task Name;Note\nA;B;y';

      const result = validateCsv(csv, template, {
        delimiter: ';',
        includeColumns: ['From Task Name', 'To Task Name']
      });

      expect(result.isValid).toBe(true);
    });

    it('auto-detects a semicolon delimiter in both files', () => {
      const csv = 'From Task Name;To Task Name;Note\nA;B;x';
      const template = 'From Task Name;To Task Name;Note\nA;B;y';

      const result = validateCsv(csv, template, {
        includeColumns: ['From Task Name', 'To Task Name']
      });

      expect(result.isValid).toBe(true);
    });

    it('auto-detects a tab delimiter in both files', () => {
      const csv = 'From Task Name\tTo Task Name\tNote\nA\tB\tx';
      const template = 'From Task Name\tTo Task Name\tNote\nA\tB\ty';

      const result = validateCsv(csv, template, {
        includeColumns: ['From Task Name', 'To Task Name']
      });

      expect(result.isValid).toBe(true);
    });

    it('handles different delimiters on each side (template ; vs actual tab)', () => {
      const template = 'From Task Id;From Task Name;To Task Id;To Task Name\n1;A;2;B\n3;C;4;D';
      const csv = 'From Task Id\tFrom Task Name\tTo Task Id\tTo Task Name\n1\tA\t2\tB\n3\tC\t4\tD';

      const result = validateCsv(csv, template, {
        includeColumns: ['From Task Name', 'To Task Name']
      });

      expect(result.isValid).toBe(true);
    });

    it('respects expectedDelimiter and actualDelimiter overrides', () => {
      const template = 'a|b\n1|2';
      const csv = 'a:b\n1:2';

      const result = validateCsv(csv, template, {
        expectedDelimiter: '|',
        actualDelimiter: ':'
      });

      expect(result.isValid).toBe(true);
    });
  });

  describe('rowKey option (primary-key based alignment)', () => {
    it('reports a single inserted row as one [extra_row] when rowKey is set', () => {
      // Template has 5 rows keyed by id; actual is identical plus one extra row
      // inserted near the top. Without rowKey, daff's content-based alignment
      // cascades into many false diffs.
      const template =
        'id,from,to\n' +
        '1,A,B\n' +
        '2,B,C\n' +
        '3,C,D\n' +
        '4,D,E\n' +
        '5,E,F';
      const csv =
        'id,from,to\n' +
        '1,A,B\n' +
        '99,X,Y\n' +
        '2,B,C\n' +
        '3,C,D\n' +
        '4,D,E\n' +
        '5,E,F';

      const result = validateCsv(csv, template, { rowKey: 'id' });

      expect(result.isValid).toBe(false);
      const extraRows = (result.differences || []).filter(d => d.startsWith('[extra_row]'));
      const missingRows = (result.differences || []).filter(d => d.startsWith('[missing_row]'));
      const mismatches = (result.differences || []).filter(d => d.startsWith('[mismatch]'));
      expect(extraRows).toHaveLength(1);
      expect(missingRows).toHaveLength(0);
      expect(mismatches).toHaveLength(0);
      expect(extraRows[0]).toContain('id="99"');
    });

    it('auto-preserves rowKey columns even when includeColumns is set', () => {
      const template =
        'id,from,to\n' +
        '1,A,B\n' +
        '2,B,C\n' +
        '3,C,D\n' +
        '4,D,E\n' +
        '5,E,F';
      const csv =
        'id,from,to\n' +
        '1,A,B\n' +
        '99,X,Y\n' +
        '2,B,C\n' +
        '3,C,D\n' +
        '4,D,E\n' +
        '5,E,F';

      const result = validateCsv(csv, template, {
        includeColumns: ['from', 'to'], // notice: 'id' intentionally omitted
        rowKey: 'id'
      });

      expect(result.isValid).toBe(false);
      const extraRows = (result.differences || []).filter(d => d.startsWith('[extra_row]'));
      const missingRows = (result.differences || []).filter(d => d.startsWith('[missing_row]'));
      expect(extraRows).toHaveLength(1);
      expect(missingRows).toHaveLength(0);
    });

    it('rowKey ignores the user trying to exclude the key column', () => {
      const template =
        'id,from,to\n' +
        '1,A,B\n' +
        '2,B,C';
      const csv =
        'id,from,to\n' +
        '1,A,B\n' +
        '2,B,X'; // one mismatch at id=2 in "to"

      const result = validateCsv(csv, template, {
        excludeColumns: ['id'],
        rowKey: 'id'
      });

      expect(result.isValid).toBe(false);
      const mismatches = (result.differences || []).filter(d => d.startsWith('[mismatch]'));
      expect(mismatches.some(m => m.includes('col "to"'))).toBe(true);
    });

    it('supports a composite key (array of column names)', () => {
      const template =
        'region,id,value\n' +
        'eu,1,10\n' +
        'us,1,20\n' +
        'eu,2,30';
      const csv =
        'region,id,value\n' +
        'eu,1,10\n' +
        'us,1,99\n' + // mismatch only at (us,1)
        'eu,2,30';

      const result = validateCsv(csv, template, { rowKey: ['region', 'id'] });

      expect(result.isValid).toBe(false);
      const extraRows = (result.differences || []).filter(d => d.startsWith('[extra_row]'));
      const missingRows = (result.differences || []).filter(d => d.startsWith('[missing_row]'));
      const mismatches = (result.differences || []).filter(d => d.startsWith('[mismatch]'));
      expect(extraRows).toHaveLength(0);
      expect(missingRows).toHaveLength(0);
      expect(mismatches).toHaveLength(1);
      expect(mismatches[0]).toContain('col "value"');
      expect(mismatches[0]).toContain('expected="20"');
      expect(mismatches[0]).toContain('actual="99"');
    });
  });

  describe('ignoreRowOrder option', () => {
    it('passes when same rows appear in different order', () => {
      const csv = 'name,age\nJane,25\nJohn,30';
      const template = 'name,age\nJohn,30\nJane,25';

      const result = validateCsv(csv, template, { ignoreRowOrder: true });

      expect(result.isValid).toBe(true);
    });

    it('still fails when a row is actually missing', () => {
      const csv = 'name,age\nJane,25';
      const template = 'name,age\nJohn,30\nJane,25';

      const result = validateCsv(csv, template, { ignoreRowOrder: true });

      expect(result.isValid).toBe(false);
    });

    it('still fails when a row has a different value', () => {
      const csv = 'name,age\nJane,26\nJohn,30';
      const template = 'name,age\nJohn,30\nJane,25';

      const result = validateCsv(csv, template, { ignoreRowOrder: true });

      expect(result.isValid).toBe(false);
    });

    it('combines with excludeColumns', () => {
      const csv = 'name,age,city\nJane,25,LA\nJohn,30,NYC';
      const template = 'name,age,city\nJohn,30,Boston\nJane,25,Paris';

      const result = validateCsv(csv, template, {
        ignoreRowOrder: true,
        excludeColumns: ['city']
      });

      expect(result.isValid).toBe(true);
    });
  });
});
