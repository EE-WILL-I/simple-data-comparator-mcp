import { validateText } from '../textValidator';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}));

describe('TextValidator', () => {
  describe('Basic Text Validation', () => {
    it('should pass validation when text matches template exactly', () => {
      const text = 'Hello World';
      const template = 'Hello World';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should fail validation when text does not match template', () => {
      const text = 'Hello World';
      const template = 'Goodbye World';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should detect missing content', () => {
      const text = 'Hello';
      const template = 'Hello World';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should detect extra content', () => {
      const text = 'Hello World Extra';
      const template = 'Hello World';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });
  });

  describe('Multi-line Text', () => {
    it('should validate multi-line text', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const template = 'Line 1\nLine 2\nLine 3';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should detect line differences', () => {
      const text = 'Line 1\nLine 2 Modified\nLine 3';
      const template = 'Line 1\nLine 2\nLine 3';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should detect missing lines', () => {
      const text = 'Line 1\nLine 3';
      const template = 'Line 1\nLine 2\nLine 3';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should detect extra lines', () => {
      const text = 'Line 1\nLine 2\nLine 3\nLine 4';
      const template = 'Line 1\nLine 2\nLine 3';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should detect line order differences', () => {
      const text = 'Line 2\nLine 1\nLine 3';
      const template = 'Line 1\nLine 2\nLine 3';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });
  });

  describe('Whitespace Handling', () => {
    it('should detect trailing whitespace differences', () => {
      const text = 'Hello World ';
      const template = 'Hello World';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should detect leading whitespace differences', () => {
      const text = ' Hello World';
      const template = 'Hello World';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should detect internal whitespace differences', () => {
      const text = 'Hello  World'; // Two spaces
      const template = 'Hello World'; // One space
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should detect tab vs space differences', () => {
      const text = 'Hello\tWorld';
      const template = 'Hello World';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });
  });

  describe('Line Ending Differences', () => {
    it('should handle Unix line endings (\\n)', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const template = 'Line 1\nLine 2\nLine 3';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should handle Windows line endings (\\r\\n)', () => {
      const text = 'Line 1\r\nLine 2\r\nLine 3';
      const template = 'Line 1\r\nLine 2\r\nLine 3';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should detect differences between Unix and Windows line endings', () => {
      const text = 'Line 1\nLine 2';
      const template = 'Line 1\r\nLine 2';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should handle Mac line endings (\\r)', () => {
      const text = 'Line 1\rLine 2';
      const template = 'Line 1\rLine 2';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });
  });

  describe('Special Characters', () => {
    it('should handle text with special characters', () => {
      const text = 'Special chars: !@#$%^&*()_+-=[]{}|;:",.<>?/`~';
      const template = 'Special chars: !@#$%^&*()_+-=[]{}|;:",.<>?/`~';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should handle text with unicode characters', () => {
      const text = 'Unicode: émojis 😀🎉✨ and symbols: ℃ ™ © ® ¼ ½';
      const template = 'Unicode: émojis 😀🎉✨ and symbols: ℃ ™ © ® ¼ ½';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should detect unicode character differences', () => {
      const text = 'Hello 😀';
      const template = 'Hello 😃';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should handle escape sequences', () => {
      const text = 'Text with\\nescaped\\tnewline\\rand\\ttab';
      const template = 'Text with\\nescaped\\tnewline\\rand\\ttab';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const text = '';
      const template = '';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should handle very long text', () => {
      const longText = 'a'.repeat(10000);
      const template = 'a'.repeat(10000);
      
      const result = validateText(longText, template);
      
      expect(result).toBe(true);
    });

    it('should handle text with only whitespace', () => {
      const text = '   \n\t\r\n   ';
      const template = '   \n\t\r\n   ';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should handle text vs empty string', () => {
      const text = 'Some text';
      const template = '';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should handle empty string vs text', () => {
      const text = '';
      const template = 'Some text';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should handle single character', () => {
      const text = 'a';
      const template = 'a';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should detect single character difference', () => {
      const text = 'a';
      const template = 'b';
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });
  });

  describe('Options', () => {
    it('should accept requestId in options', () => {
      const text = 'Hello World';
      const template = 'Hello World';
      const options = { requestId: 'test-request-123' };
      
      const result = validateText(text, template, options);
      
      expect(result).toBe(true);
    });

    it('should work without options', () => {
      const text = 'Hello World';
      const template = 'Hello World';
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle null values', () => {
      const text = null as any;
      const template = 'Hello World';
      
      const result = validateText(text, template);
      
      // Should treat null as empty string
      expect(result).toBe(false);
    });

    it('should handle undefined values', () => {
      const text = undefined as any;
      const template = 'Hello World';
      
      const result = validateText(text, template);
      
      // Should treat undefined as empty string
      expect(result).toBe(false);
    });

    it('should handle both null values', () => {
      const text = null as any;
      const template = null as any;
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should handle both undefined values', () => {
      const text = undefined as any;
      const template = undefined as any;
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should validate log file content', () => {
      const text = `[2025-01-01 10:00:00] INFO: Application started
[2025-01-01 10:00:01] INFO: Connected to database
[2025-01-01 10:00:02] INFO: Server listening on port 3000`;
      const template = `[2025-01-01 10:00:00] INFO: Application started
[2025-01-01 10:00:01] INFO: Connected to database
[2025-01-01 10:00:02] INFO: Server listening on port 3000`;
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should validate configuration file content', () => {
      const text = `# Configuration
server:
  port: 3000
  host: localhost
database:
  url: postgresql://localhost:5432/mydb
  max_connections: 10`;
      const template = `# Configuration
server:
  port: 3000
  host: localhost
database:
  url: postgresql://localhost:5432/mydb
  max_connections: 10`;
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should detect configuration differences', () => {
      const text = `# Configuration
server:
  port: 3001
  host: localhost`;
      const template = `# Configuration
server:
  port: 3000
  host: localhost`;
      
      const result = validateText(text, template);
      
      expect(result).toBe(false);
    });

    it('should validate email template', () => {
      const text = `Dear Customer,

Thank you for your purchase.

Order ID: #12345
Total: $99.99

Best regards,
Company Name`;
      const template = `Dear Customer,

Thank you for your purchase.

Order ID: #12345
Total: $99.99

Best regards,
Company Name`;
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });

    it('should validate SQL query', () => {
      const text = `SELECT users.id, users.name, orders.total
FROM users
JOIN orders ON users.id = orders.user_id
WHERE orders.status = 'completed'
ORDER BY orders.created_at DESC
LIMIT 10`;
      const template = `SELECT users.id, users.name, orders.total
FROM users
JOIN orders ON users.id = orders.user_id
WHERE orders.status = 'completed'
ORDER BY orders.created_at DESC
LIMIT 10`;
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle large text files efficiently', () => {
      const lines = Array.from({ length: 10000 }, (_, i) => `Line ${i + 1}: Some content here`);
      const text = lines.join('\n');
      const template = lines.join('\n');
      
      const startTime = Date.now();
      const result = validateText(text, template);
      const duration = Date.now() - startTime;
      
      expect(result).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });

    it('should handle files with long lines', () => {
      const longLine = 'a'.repeat(100000);
      const text = `${longLine}\nSecond line\nThird line`;
      const template = `${longLine}\nSecond line\nThird line`;
      
      const result = validateText(text, template);
      
      expect(result).toBe(true);
    });
  });
});

