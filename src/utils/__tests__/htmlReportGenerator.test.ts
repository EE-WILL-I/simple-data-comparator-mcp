import { generateValidationHtml, saveValidationReport, ValidationResult } from '../htmlReportGenerator';
import fs from 'fs';
import path from 'path';

describe('HtmlReportGenerator', () => {
  const mockValidationResult: ValidationResult = {
    type: 'json',
    passed: false,
    timestamp: '2025-01-01T10:00:00.000Z',
    traceId: 'trace-123',
    spanId: 'span-456',
    requestId: 'req-789',
    differences: [
      '[mismatch] name expected="John" actual="Jane"',
      '[missing] age expected=30 actual=undefined'
    ],
    expected: JSON.stringify({ name: 'John', age: 30 }, null, 2),
    actual: JSON.stringify({ name: 'Jane' }, null, 2),
    method: 'POST',
    path: '/api/users'
  };

  describe('generateValidationHtml', () => {
    describe('Basic Report Generation', () => {
      it('should generate HTML report for failed validation', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html lang="en">');
        expect(html).toContain('Validation Report');
        expect(html).toContain('FAILED');
        expect(html).toContain('❌');
      });

      it('should generate HTML report for passed validation', () => {
        const passedResult: ValidationResult = {
          type: 'json',
          passed: true,
          timestamp: '2025-01-01T10:00:00.000Z',
          traceId: 'trace-123',
          spanId: 'span-456'
        };
        
        const html = generateValidationHtml(passedResult);
        
        expect(html).toContain('PASSED');
        expect(html).toContain('✅');
        expect(html).toContain('Validation Successful');
      });

      it('should include validation type in report', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('JSON');
      });

      it('should include timestamp in report', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('2025-01-01T10:00:00.000Z');
      });
    });

    describe('Meta Information', () => {
      it('should include trace ID', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('Trace ID');
        expect(html).toContain('trace-123');
      });

      it('should include span ID', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('Span ID');
        expect(html).toContain('span-456');
      });

      it('should include request ID if provided', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('Request ID');
        expect(html).toContain('req-789');
      });

      it('should include method and path if provided', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('Endpoint');
        expect(html).toContain('POST');
        expect(html).toContain('/api/users');
      });

      it('should handle missing optional fields', () => {
        const minimalResult: ValidationResult = {
          type: 'json',
          passed: true,
          timestamp: '2025-01-01T10:00:00.000Z',
          traceId: 'trace-123',
          spanId: 'span-456'
        };
        
        const html = generateValidationHtml(minimalResult);
        
        expect(html).not.toContain('Request ID');
        expect(html).not.toContain('Endpoint');
      });
    });

    describe('Differences Section', () => {
      it('should display differences when present', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('Differences Detected');
        expect(html).toContain('[mismatch] name expected=&quot;John&quot; actual=&quot;Jane&quot;');
        expect(html).toContain('[missing] age expected=30 actual=undefined');
      });

      it('should style mismatch differences', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toMatch(/<div class="diff-line mismatch">/);
      });

      it('should style missing differences', () => {
        const result: ValidationResult = {
          type: 'json',
          passed: false,
          timestamp: '2025-01-01T10:00:00.000Z',
          traceId: 'trace-123',
          spanId: 'span-456',
          differences: ['[missing] field expected=value actual=undefined']
        };
        
        const html = generateValidationHtml(result);
        
        expect(html).toMatch(/<div class="diff-line missing">/);
      });

      it('should style extra differences', () => {
        const result: ValidationResult = {
          type: 'json',
          passed: false,
          timestamp: '2025-01-01T10:00:00.000Z',
          traceId: 'trace-123',
          spanId: 'span-456',
          differences: ['[extra] field actual=value expected=undefined']
        };
        
        const html = generateValidationHtml(result);
        
        expect(html).toMatch(/<div class="diff-line extra">/);
      });

      it('should not show differences section for passed validation', () => {
        const passedResult: ValidationResult = {
          type: 'json',
          passed: true,
          timestamp: '2025-01-01T10:00:00.000Z',
          traceId: 'trace-123',
          spanId: 'span-456'
        };
        
        const html = generateValidationHtml(passedResult);
        
        expect(html).not.toContain('Differences Detected');
      });
    });

    describe('Duplicate Keys Section', () => {
      it('should display duplicate keys when present', () => {
        const result: ValidationResult = {
          type: 'json',
          passed: false,
          timestamp: '2025-01-01T10:00:00.000Z',
          traceId: 'trace-123',
          spanId: 'span-456',
          duplicateKeys: ['name', 'email']
        };
        
        const html = generateValidationHtml(result);
        
        expect(html).toContain('Duplicate Keys');
        expect(html).toContain('name');
        expect(html).toContain('email');
      });

      it('should not show duplicate keys section when none present', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).not.toContain('Duplicate Keys');
      });
    });

    describe('Comparison Section', () => {
      it('should include diff2html comparison', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('Expected vs Actual (Diff View)');
        expect(html).toContain('diff2html-wrapper');
      });

      it('should not show comparison for passed validation without expected/actual', () => {
        const passedResult: ValidationResult = {
          type: 'json',
          passed: true,
          timestamp: '2025-01-01T10:00:00.000Z',
          traceId: 'trace-123',
          spanId: 'span-456'
        };
        
        const html = generateValidationHtml(passedResult);
        
        expect(html).not.toContain('Expected vs Actual');
      });

      it('should show schema note for schema validation', () => {
        const schemaResult: ValidationResult = {
          type: 'json',
          passed: false,
          timestamp: '2025-01-01T10:00:00.000Z',
          traceId: 'trace-123',
          spanId: 'span-456',
          isSchemaValidation: true,
          expected: JSON.stringify({ name: 'string', age: 'number' }, null, 2),
          actual: JSON.stringify({ name: 'John' }, null, 2)
        };
        
        const html = generateValidationHtml(schemaResult);
        
        expect(html).toContain('Expected" column shows an example JSON generated from the schema');
      });
    });

    describe('Delta Section', () => {
      it('should include raw delta when present', () => {
        const result: ValidationResult = {
          type: 'json',
          passed: false,
          timestamp: '2025-01-01T10:00:00.000Z',
          traceId: 'trace-123',
          spanId: 'span-456',
          delta: { name: ['John', 'Jane'], age: ['30', 0, 0] }
        };
        
        const html = generateValidationHtml(result);
        
        expect(html).toContain('Raw Delta');
        expect(html).toContain('collapsible');
      });

      it('should handle missing delta', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).not.toContain('Raw Delta');
      });
    });

    describe('Validation Types', () => {
      it('should handle JSON validation type', () => {
        const result: ValidationResult = {
          ...mockValidationResult,
          type: 'json'
        };
        
        const html = generateValidationHtml(result);
        
        expect(html).toContain('JSON');
      });

      it('should handle XML validation type', () => {
        const result: ValidationResult = {
          ...mockValidationResult,
          type: 'xml'
        };
        
        const html = generateValidationHtml(result);
        
        expect(html).toContain('XML');
      });

      it('should handle CSV validation type', () => {
        const result: ValidationResult = {
          ...mockValidationResult,
          type: 'csv'
        };
        
        const html = generateValidationHtml(result);
        
        expect(html).toContain('CSV');
      });

      it('should handle text validation type', () => {
        const result: ValidationResult = {
          ...mockValidationResult,
          type: 'text'
        };
        
        const html = generateValidationHtml(result);
        
        expect(html).toContain('TEXT');
      });
    });

    describe('HTML Escaping', () => {
      it('should escape HTML in differences', () => {
        const result: ValidationResult = {
          type: 'json',
          passed: false,
          timestamp: '2025-01-01T10:00:00.000Z',
          traceId: 'trace-123',
          spanId: 'span-456',
          differences: ['[mismatch] html expected="<script>alert(1)</script>" actual="safe"']
        };
        
        const html = generateValidationHtml(result);
        
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>alert(1)</script>');
      });

      it('should escape HTML in duplicate keys', () => {
        const result: ValidationResult = {
          type: 'json',
          passed: false,
          timestamp: '2025-01-01T10:00:00.000Z',
          traceId: 'trace-123',
          spanId: 'span-456',
          duplicateKeys: ['<img src=x>']
        };
        
        const html = generateValidationHtml(result);
        
        expect(html).toContain('&lt;img src=x&gt;');
        expect(html).not.toContain('<img src=x>');
      });
    });

    describe('Styling and Layout', () => {
      it('should include CSS styling', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('<style>');
        expect(html).toContain('.container');
        expect(html).toContain('.status-badge');
      });

      it('should include JavaScript for collapsible sections', () => {
        const result: ValidationResult = {
          ...mockValidationResult,
          delta: { name: ['John', 'Jane'] }
        };
        
        const html = generateValidationHtml(result);
        
        expect(html).toContain('<script>');
        expect(html).toContain('toggleSection');
      });

      it('should include diff2html CSS', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('diff2html.min.css');
      });

      it('should have responsive meta tag', () => {
        const html = generateValidationHtml(mockValidationResult);
        
        expect(html).toContain('viewport');
        expect(html).toContain('width=device-width');
      });
    });
  });

  describe('saveValidationReport', () => {
    const reportsDir = path.join(__dirname, '..', '..', '..', 'reports');

    afterEach(() => {
      // Cleanup: remove test reports
      if (fs.existsSync(reportsDir)) {
        const files = fs.readdirSync(reportsDir);
        files.forEach(file => {
          if (file.startsWith('test-') || file.includes('span-456')) {
            fs.unlinkSync(path.join(reportsDir, file));
          }
        });
      }
    });

    it('should create reports directory if it does not exist', () => {
      // Remove directory if it exists
      if (fs.existsSync(reportsDir)) {
        fs.rmSync(reportsDir, { recursive: true });
      }
      
      saveValidationReport(mockValidationResult);
      
      expect(fs.existsSync(reportsDir)).toBe(true);
    });

    it('should save report with auto-generated filename', () => {
      const reportPath = saveValidationReport(mockValidationResult);
      
      expect(fs.existsSync(reportPath)).toBe(true);
      expect(reportPath).toContain('validation-json');
      expect(reportPath).toContain('span-456');
      expect(reportPath).toContain('trace-123');
      expect(reportPath).toMatch(/\.html$/);
    });

    it('should save report with custom filename', () => {
      const customFilename = 'test-custom-report.html';
      const reportPath = saveValidationReport(mockValidationResult, customFilename);
      
      expect(fs.existsSync(reportPath)).toBe(true);
      expect(reportPath).toContain('test-custom-report.html');
    });

    it('should return absolute path to saved report', () => {
      const reportPath = saveValidationReport(mockValidationResult);
      
      expect(path.isAbsolute(reportPath)).toBe(true);
      expect(reportPath).toContain('reports');
    });

    it('should save valid HTML content', () => {
      const reportPath = saveValidationReport(mockValidationResult);
      const content = fs.readFileSync(reportPath, 'utf-8');
      
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('<html lang="en">');
      expect(content).toContain('</html>');
    });

    it('should include all validation data in saved report', () => {
      const reportPath = saveValidationReport(mockValidationResult);
      const content = fs.readFileSync(reportPath, 'utf-8');
      
      expect(content).toContain('trace-123');
      expect(content).toContain('span-456');
      expect(content).toContain('req-789');
      expect(content).toContain('[mismatch]');
      expect(content).toContain('[missing]');
    });

    it('should overwrite existing file with same name', () => {
      const filename = 'test-overwrite-report.html';
      
      // Save first report
      const firstPath = saveValidationReport(mockValidationResult, filename);
      const firstMtime = fs.statSync(firstPath).mtime;
      
      // Wait a bit to ensure different timestamps
      const waitPromise = new Promise(resolve => setTimeout(resolve, 100));
      
      return waitPromise.then(() => {
        // Save second report with same filename
        const secondPath = saveValidationReport(mockValidationResult, filename);
        const secondMtime = fs.statSync(secondPath).mtime;
        
        expect(firstPath).toBe(secondPath);
        expect(secondMtime.getTime()).toBeGreaterThan(firstMtime.getTime());
      });
    });

    it('should handle special characters in filename', () => {
      const filename = 'test-report-with-spaces and-special!chars.html';
      const reportPath = saveValidationReport(mockValidationResult, filename);
      
      expect(fs.existsSync(reportPath)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle validation result with all optional fields empty', () => {
      const minimalResult: ValidationResult = {
        type: 'json',
        passed: true,
        timestamp: '2025-01-01T10:00:00.000Z',
        traceId: 'trace-123',
        spanId: 'span-456'
      };
      
      const html = generateValidationHtml(minimalResult);
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('PASSED');
    });

    it('should handle very long differences array', () => {
      const manyDifferences = Array.from({ length: 1000 }, (_, i) => 
        `[mismatch] field${i} expected=value${i} actual=other${i}`
      );
      
      const result: ValidationResult = {
        type: 'json',
        passed: false,
        timestamp: '2025-01-01T10:00:00.000Z',
        traceId: 'trace-123',
        spanId: 'span-456',
        differences: manyDifferences
      };
      
      const html = generateValidationHtml(result);
      
      expect(html).toContain('Differences Detected');
      expect(html.match(/diff-line/g)?.length).toBeGreaterThanOrEqual(1000);
    });

    it('should handle very long expected and actual strings', () => {
      const longString = JSON.stringify({ data: 'x'.repeat(100000) }, null, 2);
      
      const result: ValidationResult = {
        type: 'json',
        passed: false,
        timestamp: '2025-01-01T10:00:00.000Z',
        traceId: 'trace-123',
        spanId: 'span-456',
        expected: longString,
        actual: longString.replace('x', 'y')
      };
      
      const html = generateValidationHtml(result);
      
      expect(html.length).toBeGreaterThan(longString.length);
    });

    it('should handle unicode characters correctly', () => {
      const result: ValidationResult = {
        type: 'json',
        passed: false,
        timestamp: '2025-01-01T10:00:00.000Z',
        traceId: 'trace-123',
        spanId: 'span-456',
        differences: ['[mismatch] emoji expected="😀" actual="😃"']
      };
      
      const html = generateValidationHtml(result);
      
      expect(html).toContain('😀');
      expect(html).toContain('😃');
    });
  });
});

