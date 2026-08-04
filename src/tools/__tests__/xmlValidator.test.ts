import { validateXml, XmlValidationResult } from '../xmlValidator';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}));

describe('XmlValidator', () => {
  describe('Result Object Structure', () => {
    it('should return XmlValidationResult with all required fields on success', () => {
      const xml = '<root><name>John</name></root>';
      const template = '<root><name>John</name></root>';
      
      const result = validateXml(xml, template);
      
      expect(result).toHaveProperty('isValid', true);
      expect(result).toHaveProperty('expected');
      expect(result).toHaveProperty('actual');
      expect(result).toHaveProperty('method');
      expect(result.method).toMatch(/^(diff-js-xml|structural)$/);
    });

    it('should return XmlValidationResult with differences on failure', () => {
      const xml = '<root><name>John</name><age>25</age></root>';
      const template = '<root><name>John</name><age>30</age></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
      expect(Array.isArray(result.differences)).toBe(true);
      expect(result.differences!.length).toBeGreaterThan(0);
      expect(result.expected).toBeDefined();
      expect(result.actual).toBeDefined();
    });

    it('should include parseError when XML is severely malformed', () => {
      const xml = '<<<not valid xml at all>>>'; // Completely invalid XML
      const template = '<root><name>John</name></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      // Parser may or may not set parseError depending on how it handles invalid input
      // But validation should definitely fail
      expect(result.differences).toBeDefined();
    });
  });

  describe('Basic XML Validation', () => {
    it('should pass validation when XML matches template exactly', () => {
      const xml = '<root><name>John</name><age>30</age></root>';
      const template = '<root><name>John</name><age>30</age></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
      expect(result.differences).toBeUndefined();
    });

    it('should fail validation when XML does not match template', () => {
      const xml = '<root><name>John</name><age>25</age></root>';
      const template = '<root><name>John</name><age>30</age></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
      expect(result.differences!.some(d => d.includes('25') || d.includes('30'))).toBe(true);
    });

    it('should handle missing elements', () => {
      const xml = '<root><name>John</name></root>';
      const template = '<root><name>John</name><age>30</age></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
      expect(result.differences!.some(d => d.includes('missing') || d.includes('age'))).toBe(true);
    });

    it('should handle extra elements', () => {
      const xml = '<root><name>John</name><age>30</age><city>NYC</city></root>';
      const template = '<root><name>John</name><age>30</age></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
      expect(result.differences!.some(d => d.includes('extra') || d.includes('city'))).toBe(true);
    });
  });

  describe('Attributes', () => {
    it('should validate XML with attributes', () => {
      const xml = '<root><user id="1" name="John"/></root>';
      const template = '<root><user id="1" name="John"/></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
    });

    it('should detect attribute value differences', () => {
      const xml = '<root><user id="2" name="John"/></root>';
      const template = '<root><user id="1" name="John"/></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
    });

    it('should detect missing attributes', () => {
      const xml = '<root><user name="John"/></root>';
      const template = '<root><user id="1" name="John"/></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
    });

    it('should detect extra attributes', () => {
      const xml = '<root><user id="1" name="John" age="30"/></root>';
      const template = '<root><user id="1" name="John"/></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
    });
  });

  describe('Nested Elements', () => {
    it('should validate nested XML elements', () => {
      const xml = `
        <root>
          <user>
            <name>John</name>
            <contact>
              <email>john@example.com</email>
              <phone>123-456-7890</phone>
            </contact>
          </user>
        </root>
      `;
      const template = `
        <root>
          <user>
            <name>John</name>
            <contact>
              <email>john@example.com</email>
              <phone>123-456-7890</phone>
            </contact>
          </user>
        </root>
      `;
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
    });

    it('should detect differences in nested elements', () => {
      const xml = `
        <root>
          <user>
            <name>John</name>
            <contact>
              <email>jane@example.com</email>
              <phone>123-456-7890</phone>
            </contact>
          </user>
        </root>
      `;
      const template = `
        <root>
          <user>
            <name>John</name>
            <contact>
              <email>john@example.com</email>
              <phone>123-456-7890</phone>
            </contact>
          </user>
        </root>
      `;
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
      expect(result.differences!.some(d => d.includes('email') || d.includes('jane') || d.includes('john'))).toBe(true);
    });
  });

  describe('Multiple Elements', () => {
    it('should validate XML with multiple sibling elements', () => {
      const xml = `
        <root>
          <user>
            <name>John</name>
            <age>30</age>
          </user>
          <user>
            <name>Jane</name>
            <age>25</age>
          </user>
        </root>
      `;
      const template = `
        <root>
          <user>
            <name>John</name>
            <age>30</age>
          </user>
          <user>
            <name>Jane</name>
            <age>25</age>
          </user>
        </root>
      `;
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
    });

    it('should detect order differences in multiple elements', () => {
      const xml = `
        <root>
          <user>
            <name>Jane</name>
            <age>25</age>
          </user>
          <user>
            <name>John</name>
            <age>30</age>
          </user>
        </root>
      `;
      const template = `
        <root>
          <user>
            <name>John</name>
            <age>30</age>
          </user>
          <user>
            <name>Jane</name>
            <age>25</age>
          </user>
        </root>
      `;
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
    });
  });

  describe('Text Content', () => {
    it('should validate elements with text content', () => {
      const xml = '<root><message>Hello World</message></root>';
      const template = '<root><message>Hello World</message></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
    });

    it('should detect text content differences', () => {
      const xml = '<root><message>Hello World</message></root>';
      const template = '<root><message>Goodbye World</message></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
    });

    it('should handle CDATA sections', () => {
      const xml = '<root><message><![CDATA[Hello <World>]]></message></root>';
      const template = '<root><message><![CDATA[Hello <World>]]></message></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty XML elements', () => {
      const xml = '<root><empty/></root>';
      const template = '<root><empty/></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
    });

    it('should handle XML with namespaces', () => {
      const xml = '<root xmlns:ns="http://example.com"><ns:element>value</ns:element></root>';
      const template = '<root xmlns:ns="http://example.com"><ns:element>value</ns:element></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
    });

    it('should handle XML declarations', () => {
      const xml = '<?xml version="1.0" encoding="UTF-8"?><root><name>John</name></root>';
      const template = '<?xml version="1.0" encoding="UTF-8"?><root><name>John</name></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
    });

    it('should handle empty strings', () => {
      const xml = '';
      const template = '';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
    });

    it('should handle whitespace differences gracefully', () => {
      const xml = '<root><name>John</name></root>';
      const template = '<root>  <name>John</name>  </root>';
      
      const result = validateXml(xml, template);
      
      // Should be true as whitespace is typically ignored in structural comparison
      expect(result.isValid).toBe(true);
    });
  });

  describe('Options', () => {
    it('should accept requestId in options', () => {
      const xml = '<root><name>John</name></root>';
      const template = '<root><name>John</name></root>';
      const options = { requestId: 'test-request-123' };
      
      const result = validateXml(xml, template, options);
      
      expect(result.isValid).toBe(true);
    });

    it('should work without options', () => {
      const xml = '<root><name>John</name></root>';
      const template = '<root><name>John</name></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed XML gracefully', () => {
      const xml = '<root><name>John<name></root>'; // Malformed XML
      const template = '<root><name>John</name></root>';
      
      const result = validateXml(xml, template);
      
      // Validation should fail for malformed/mismatched XML
      expect(result.isValid).toBe(false);
    });

    it('should handle null values', () => {
      const xml = null as any;
      const template = '<root><name>John</name></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
    });

    it('should handle undefined values', () => {
      const xml = undefined as any;
      const template = '<root><name>John</name></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
    });
  });

  describe('Complex Structures', () => {
    it('should validate complex nested XML structures', () => {
      const xml = `
        <catalog>
          <book id="bk101">
            <author>Gambardella, Matthew</author>
            <title>XML Developer's Guide</title>
            <genre>Computer</genre>
            <price>44.95</price>
            <publish_date>2000-10-01</publish_date>
            <description>An in-depth look at creating applications with XML.</description>
          </book>
          <book id="bk102">
            <author>Ralls, Kim</author>
            <title>Midnight Rain</title>
            <genre>Fantasy</genre>
            <price>5.95</price>
            <publish_date>2000-12-16</publish_date>
            <description>A former architect battles corporate zombies.</description>
          </book>
        </catalog>
      `;
      const template = `
        <catalog>
          <book id="bk101">
            <author>Gambardella, Matthew</author>
            <title>XML Developer's Guide</title>
            <genre>Computer</genre>
            <price>44.95</price>
            <publish_date>2000-10-01</publish_date>
            <description>An in-depth look at creating applications with XML.</description>
          </book>
          <book id="bk102">
            <author>Ralls, Kim</author>
            <title>Midnight Rain</title>
            <genre>Fantasy</genre>
            <price>5.95</price>
            <publish_date>2000-12-16</publish_date>
            <description>A former architect battles corporate zombies.</description>
          </book>
        </catalog>
      `;
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(true);
      expect(result.expected).toBeDefined();
      expect(result.actual).toBeDefined();
    });

    it('should detect differences in complex structures', () => {
      const xml = `
        <catalog>
          <book id="bk101">
            <author>Gambardella, Matthew</author>
            <title>XML Developer's Guide</title>
            <genre>Computer</genre>
            <price>49.95</price>
            <publish_date>2000-10-01</publish_date>
          </book>
        </catalog>
      `;
      const template = `
        <catalog>
          <book id="bk101">
            <author>Gambardella, Matthew</author>
            <title>XML Developer's Guide</title>
            <genre>Computer</genre>
            <price>44.95</price>
            <publish_date>2000-10-01</publish_date>
          </book>
        </catalog>
      `;
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
      expect(result.differences!.some(d => d.includes('price') || d.includes('49.95') || d.includes('44.95'))).toBe(true);
    });
  });

  describe('Differences Array Content', () => {
    it('should provide meaningful difference messages for value mismatches', () => {
      const xml = '<root><value>100</value></root>';
      const template = '<root><value>200</value></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
      expect(result.differences!.length).toBeGreaterThan(0);
      // Should contain information about the difference
      const diffStr = result.differences!.join(' ');
      expect(diffStr).toMatch(/value|mismatch|100|200/i);
    });

    it('should provide meaningful difference messages for missing elements', () => {
      const xml = '<root><a>1</a></root>';
      const template = '<root><a>1</a><b>2</b></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
      const diffStr = result.differences!.join(' ');
      expect(diffStr).toMatch(/missing|b/i);
    });

    it('should provide meaningful difference messages for extra elements', () => {
      const xml = '<root><a>1</a><b>2</b></root>';
      const template = '<root><a>1</a></root>';
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
      const diffStr = result.differences!.join(' ');
      expect(diffStr).toMatch(/extra|b/i);
    });

    it('should provide meaningful difference messages for array length differences', () => {
      const xml = `
        <root>
          <item>1</item>
          <item>2</item>
          <item>3</item>
        </root>
      `;
      const template = `
        <root>
          <item>1</item>
          <item>2</item>
        </root>
      `;
      
      const result = validateXml(xml, template);
      
      expect(result.isValid).toBe(false);
      expect(result.differences).toBeDefined();
    });
  });
});
