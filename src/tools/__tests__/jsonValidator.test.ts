import {
  validateJsonTemplate,
  validateJsonTemplateSimple,
  JsonValidationOptions
} from '../jsonValidator';

// Mock logger to avoid actual logging during tests
jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}));

describe('JsonValidatorEnhanced', () => {
  describe('validateJsonTemplate', () => {
    describe('Basic Validation', () => {
      it('should pass validation when JSON matches template exactly', () => {
        const json = { name: 'John', age: 30 };
        const template = { name: 'John', age: 30 };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
        expect(result.differences).toBeUndefined();
      });

      it('should fail validation when JSON does not match template', () => {
        const json = { name: 'John', age: 25 };
        const template = { name: 'John', age: 30 };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(false);
        expect(result.differences).toBeDefined();
        expect(result.differences!.length).toBeGreaterThan(0);
      });

      it('should handle missing properties', () => {
        const json = { name: 'John' };
        const template = { name: 'John', age: 30 };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(false);
        expect(result.differences).toBeDefined();
        expect(result.differences!.some(d => d.includes('[missing]'))).toBe(true);
      });

      it('should handle extra properties without ignoreExtraProps', () => {
        const json = { name: 'John', age: 30, city: 'NYC' };
        const template = { name: 'John', age: 30 };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(false);
        expect(result.differences).toBeDefined();
        expect(result.differences!.some(d => d.includes('[extra]'))).toBe(true);
      });
    });

    describe('Options - ignoreExtraProps', () => {
      it('should ignore extra properties when ignoreExtraProps is true', () => {
        const json = { name: 'John', age: 30, city: 'NYC' };
        const template = { name: 'John', age: 30 };
        const options: JsonValidationOptions = { ignoreExtraProps: true };
        
        const result = validateJsonTemplate(json, template, options);
        
        expect(result.isValid).toBe(true);
      });

      it('should not ignore extra properties when ignoreExtraProps is false', () => {
        const json = { name: 'John', age: 30, city: 'NYC' };
        const template = { name: 'John', age: 30 };
        const options: JsonValidationOptions = { ignoreExtraProps: false };
        
        const result = validateJsonTemplate(json, template, options);
        
        expect(result.isValid).toBe(false);
      });
    });

    describe('Options - ignoreArrayOrder', () => {
      it('should pass when array elements match but order differs', () => {
        const json = { tags: ['b', 'a', 'c'] };
        const template = { tags: ['a', 'b', 'c'] };
        const options: JsonValidationOptions = { ignoreArrayOrder: true };

        const result = validateJsonTemplate(json, template, options);
        expect(result.isValid).toBe(true);
      });

      it('should fail on order mismatch when ignoreArrayOrder is false', () => {
        const json = { tags: ['b', 'a'] };
        const template = { tags: ['a', 'b'] };

        const result = validateJsonTemplate(json, template);
        expect(result.isValid).toBe(false);
      });
    });

    describe('Options - ignoreSimilar', () => {
      it('should pass when values differ but types match', () => {
        const json = { name: 'Alice', age: 25, active: false };
        const template = { name: 'Bob', age: 99, active: true };
        const options: JsonValidationOptions = { ignoreSimilar: true };

        const result = validateJsonTemplate(json, template, options);
        expect(result.isValid).toBe(true);
      });

      it('should fail when a field is missing', () => {
        const json = { name: 'Alice' };
        const template = { name: 'Bob', age: 30 };
        const options: JsonValidationOptions = { ignoreSimilar: true };

        const result = validateJsonTemplate(json, template, options);
        expect(result.isValid).toBe(false);
        expect(result.differences?.some(d => d.includes('[missing]') && d.includes('age'))).toBe(true);
      });

      it('should fail when there is an extra field', () => {
        const json = { name: 'Alice', extra: 'oops' };
        const template = { name: 'Bob' };
        const options: JsonValidationOptions = { ignoreSimilar: true };

        const result = validateJsonTemplate(json, template, options);
        expect(result.isValid).toBe(false);
        expect(result.differences?.some(d => d.includes('[extra]'))).toBe(true);
      });

      it('should fail on type mismatch (string vs number)', () => {
        const json = { age: 'twenty' };
        const template = { age: 30 };
        const options: JsonValidationOptions = { ignoreSimilar: true };

        const result = validateJsonTemplate(json, template, options);
        expect(result.isValid).toBe(false);
      });

      it('should fail on type mismatch (object vs string)', () => {
        const json = { data: 'text' };
        const template = { data: { nested: true } };
        const options: JsonValidationOptions = { ignoreSimilar: true };

        const result = validateJsonTemplate(json, template, options);
        expect(result.isValid).toBe(false);
      });

      it('should fail on type mismatch (array vs object)', () => {
        const json = { items: { a: 1 } };
        const template = { items: [1, 2] };
        const options: JsonValidationOptions = { ignoreSimilar: true };

        const result = validateJsonTemplate(json, template, options);
        expect(result.isValid).toBe(false);
      });

      it('should pass with nested objects when structure matches', () => {
        const json = { user: { name: 'Alice', score: 100 } };
        const template = { user: { name: 'Bob', score: 0 } };
        const options: JsonValidationOptions = { ignoreSimilar: true };

        const result = validateJsonTemplate(json, template, options);
        expect(result.isValid).toBe(true);
      });

      it('should work together with ignoreExtraProps', () => {
        const json = { name: 'Alice', age: 25, extra: 'ok' };
        const template = { name: 'Bob', age: 99 };
        const options: JsonValidationOptions = { ignoreSimilar: true, ignoreExtraProps: true };

        const result = validateJsonTemplate(json, template, options);
        expect(result.isValid).toBe(true);
      });

      it('should handle null template value vs non-null actual', () => {
        const json = { val: 'hello' };
        const template = { val: null };
        const options: JsonValidationOptions = { ignoreSimilar: true };

        const result = validateJsonTemplate(json, template, options);
        expect(result.isValid).toBe(false);
      });
    });

    describe('Options - ignoreProps', () => {
      it('should ignore specified properties', () => {
        const json = { name: 'John', age: 30, timestamp: '2025-01-01' };
        const template = { name: 'John', age: 30, timestamp: '2025-01-02' };
        const options: JsonValidationOptions = { ignoreProps: ['timestamp'] };
        
        const result = validateJsonTemplate(json, template, options);
        
        expect(result.isValid).toBe(true);
      });

      it('should handle multiple ignored properties', () => {
        const json = { name: 'John', age: 30, timestamp: '2025-01-01', id: '123' };
        const template = { name: 'John', age: 30, timestamp: '2025-01-02', id: '456' };
        const options: JsonValidationOptions = { ignoreProps: ['timestamp', 'id'] };
        
        const result = validateJsonTemplate(json, template, options);
        
        expect(result.isValid).toBe(true);
      });
    });

    describe('Duplicate Keys Detection', () => {
      it('should detect duplicate keys in JSON string', () => {
        const jsonString = '{"name": "John", "age": 30, "name": "Jane"}';
        const template = { name: 'John', age: 30 };
        
        const result = validateJsonTemplate(jsonString, template);
        
        expect(result.isValid).toBe(false);
        expect(result.duplicateKeys).toBeDefined();
        expect(result.duplicateKeys).toContain('name');
      });

      it('should detect multiple duplicate keys', () => {
        const jsonString = '{"name": "John", "age": 30, "name": "Jane", "age": 25}';
        const template = { name: 'John', age: 30 };
        
        const result = validateJsonTemplate(jsonString, template);
        
        expect(result.isValid).toBe(false);
        expect(result.duplicateKeys).toBeDefined();
        expect(result.duplicateKeys).toContain('name');
        expect(result.duplicateKeys).toContain('age');
      });

      it('should fail validation even with ignoreExtraProps when duplicates exist', () => {
        const jsonString = '{"name": "John", "age": 30, "name": "Jane"}';
        const template = { name: 'John', age: 30 };
        const options: JsonValidationOptions = { ignoreExtraProps: true };
        
        const result = validateJsonTemplate(jsonString, template, options);
        
        expect(result.isValid).toBe(false);
        expect(result.duplicateKeys).toContain('name');
      });
    });

    describe('Regex Pattern Matching', () => {
      it('should match regex patterns in template', () => {
        const json = { email: 'test@example.com', phone: '123-456-7890' };
        const template = { email: '/.*@.*\\.com/', phone: '/\\d{3}-\\d{3}-\\d{4}/' };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
      });

      it('should fail when regex pattern does not match', () => {
        const json = { email: 'invalid-email', phone: '123-456-7890' };
        const template = { email: '/.*@.*\\.com/', phone: '/\\d{3}-\\d{3}-\\d{4}/' };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(false);
        expect(result.differences!.some(d => d.includes('email'))).toBe(true);
      });

      it('should handle various regex patterns', () => {
        const json = {
          uuid: '123e4567-e89b-12d3-a456-426614174000',
          date: '2025-01-01',
          number: '12345'
        };
        const template = {
          uuid: '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/',
          date: '/\\d{4}-\\d{2}-\\d{2}/',
          number: '/\\d+/'
        };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
      });
    });

    describe('Nested Objects', () => {
      it('should validate nested objects', () => {
        const json = {
          user: {
            name: 'John',
            address: {
              city: 'NYC',
              zip: '10001'
            }
          }
        };
        const template = {
          user: {
            name: 'John',
            address: {
              city: 'NYC',
              zip: '10001'
            }
          }
        };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
      });

      it('should detect differences in nested objects', () => {
        const json = {
          user: {
            name: 'John',
            address: {
              city: 'LA',
              zip: '90001'
            }
          }
        };
        const template = {
          user: {
            name: 'John',
            address: {
              city: 'NYC',
              zip: '10001'
            }
          }
        };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(false);
        expect(result.differences!.some(d => d.includes('user.address.city'))).toBe(true);
        expect(result.differences!.some(d => d.includes('user.address.zip'))).toBe(true);
      });
    });

    describe('Arrays', () => {
      it('should validate arrays with matching elements', () => {
        const json = { numbers: [1, 2, 3], names: ['a', 'b', 'c'] };
        const template = { numbers: [1, 2, 3], names: ['a', 'b', 'c'] };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
      });

      it('should detect array element differences', () => {
        const json = { numbers: [1, 2, 4] };
        const template = { numbers: [1, 2, 3] };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(false);
        expect(result.differences!.some(d => d.includes('numbers[2]'))).toBe(true);
      });

      it('should detect array length differences', () => {
        const json = { numbers: [1, 2] };
        const template = { numbers: [1, 2, 3] };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(false);
        expect(result.differences!.length).toBeGreaterThan(0);
      });

      it('should validate arrays of objects', () => {
        const json = {
          users: [
            { name: 'John', age: 30 },
            { name: 'Jane', age: 25 }
          ]
        };
        const template = {
          users: [
            { name: 'John', age: 30 },
            { name: 'Jane', age: 25 }
          ]
        };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
      });
    });

    describe('JSON Schema Validation', () => {
      it('should validate against JSON Schema when useJsonSchema is true', () => {
        const json = { name: 'John', age: 30, email: 'john@example.com' };
        const schema = {
          type: 'object',
          required: ['name', 'age'],
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
            email: { type: 'string', format: 'email' }
          }
        };
        const options: JsonValidationOptions = { useJsonSchema: true };
        
        const result = validateJsonTemplate(json, schema, options);
        
        expect(result.isValid).toBe(true);
        expect(result.isSchemaValidation).toBe(true);
      });

      it('should fail validation when required property is missing', () => {
        const json = { name: 'John' };
        const schema = {
          type: 'object',
          required: ['name', 'age'],
          properties: {
            name: { type: 'string' },
            age: { type: 'number' }
          }
        };
        const options: JsonValidationOptions = { useJsonSchema: true };
        
        const result = validateJsonTemplate(json, schema, options);
        
        expect(result.isValid).toBe(false);
        expect(result.schemaErrors).toBeDefined();
        expect(result.schemaErrors!.some(e => e.includes('age'))).toBe(true);
      });

      it('should fail validation when type is wrong', () => {
        const json = { name: 'John', age: '30' }; // age should be number
        const schema = {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' }
          }
        };
        const options: JsonValidationOptions = { useJsonSchema: true };
        
        const result = validateJsonTemplate(json, schema, options);
        
        expect(result.isValid).toBe(false);
        expect(result.schemaErrors).toBeDefined();
        expect(result.schemaErrors!.some(e => e.includes('number'))).toBe(true);
      });

      it('should validate email format', () => {
        const json = { email: 'invalid-email' };
        const schema = {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' }
          }
        };
        const options: JsonValidationOptions = { useJsonSchema: true };
        
        const result = validateJsonTemplate(json, schema, options);
        
        expect(result.isValid).toBe(false);
        expect(result.schemaErrors!.some(e => e.includes('email'))).toBe(true);
      });

      it('should validate pattern constraint', () => {
        const json = { phone: '12345' };
        const schema = {
          type: 'object',
          properties: {
            phone: { type: 'string', pattern: '^\\d{3}-\\d{3}-\\d{4}$' }
          }
        };
        const options: JsonValidationOptions = { useJsonSchema: true };
        
        const result = validateJsonTemplate(json, schema, options);
        
        expect(result.isValid).toBe(false);
        expect(result.schemaErrors!.some(e => e.includes('pattern'))).toBe(true);
      });

      it('should validate minimum/maximum constraints', () => {
        const json = { age: 150 };
        const schema = {
          type: 'object',
          properties: {
            age: { type: 'number', minimum: 0, maximum: 120 }
          }
        };
        const options: JsonValidationOptions = { useJsonSchema: true };
        
        const result = validateJsonTemplate(json, schema, options);
        
        expect(result.isValid).toBe(false);
        expect(result.schemaErrors!.some(e => e.includes('maximum'))).toBe(true);
      });
    });

    describe('Edge Cases', () => {
      it('should handle null values', () => {
        const json = { name: 'John', age: null };
        const template = { name: 'John', age: null };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
      });

      it('should handle undefined values', () => {
        const json = { name: 'John' };
        const template = { name: 'John', age: undefined };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
      });

      it('should handle empty objects', () => {
        const json = {};
        const template = {};
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
      });

      it('should handle empty arrays', () => {
        const json = { items: [] };
        const template = { items: [] };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
      });

      it('should handle boolean values', () => {
        const json = { active: true, deleted: false };
        const template = { active: true, deleted: false };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
      });

      it('should handle mixed types', () => {
        const json = {
          string: 'text',
          number: 123,
          boolean: true,
          null: null,
          array: [1, 2, 3],
          object: { nested: 'value' }
        };
        const template = {
          string: 'text',
          number: 123,
          boolean: true,
          null: null,
          array: [1, 2, 3],
          object: { nested: 'value' }
        };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.isValid).toBe(true);
      });

      it('should handle invalid JSON string', () => {
        const jsonString = '{invalid json}';
        const template = { name: 'John' };
        
        const result = validateJsonTemplate(jsonString, template);
        
        // Should treat as string and fail validation
        expect(result.isValid).toBe(false);
      });
    });

    describe('Result Structure', () => {
      it('should return complete result structure', () => {
        const json = { name: 'John', age: 30 };
        const template = { name: 'Jane', age: 25 };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result).toHaveProperty('isValid');
        expect(result).toHaveProperty('expected');
        expect(result).toHaveProperty('actual');
        expect(result).toHaveProperty('differences');
        expect(result.isValid).toBe(false);
      });

      it('should include delta for non-schema validation', () => {
        const json = { name: 'John', age: 30 };
        const template = { name: 'Jane', age: 25 };
        
        const result = validateJsonTemplate(json, template);
        
        expect(result.delta).toBeDefined();
      });
    });
  });

  describe('validateJsonTemplateSimple', () => {
    it('should return true for matching JSON', () => {
      const json = { name: 'John', age: 30 };
      const template = { name: 'John', age: 30 };
      
      const result = validateJsonTemplateSimple(json, template);
      
      expect(result).toBe(true);
    });

    it('should return false for non-matching JSON', () => {
      const json = { name: 'John', age: 25 };
      const template = { name: 'John', age: 30 };
      
      const result = validateJsonTemplateSimple(json, template);
      
      expect(result).toBe(false);
    });

    it('should respect options', () => {
      const json = { name: 'John', age: 30, city: 'NYC' };
      const template = { name: 'John', age: 30 };
      const options: JsonValidationOptions = { ignoreExtraProps: true };
      
      const result = validateJsonTemplateSimple(json, template, options);
      
      expect(result).toBe(true);
    });
  });
});

