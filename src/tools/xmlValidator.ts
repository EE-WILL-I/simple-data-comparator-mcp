import { XMLParser } from 'fast-xml-parser';
import { logError, logInfo, logWarning } from '../utils/logger.js';

export type XmlValidationResult = {
  isValid: boolean;
  expected?: any;
  actual?: any;
  differences?: string[];
  method?: 'diff-js-xml' | 'structural';
  parseError?: string;
  // Report fields (populated by validateXmlBody)
  htmlReport?: string;
  reportPath?: string;
  s3Url?: string;
  localReportPath?: string; // Local path when S3 is disabled or upload fails
};

// Prefer diff-js-xml if available; fallback to structural JSON comparison
export const validateXml = (xml: string, templateXml: string, opts?: { requestId?: string }): XmlValidationResult => {
  const result: XmlValidationResult = { isValid: true };
  
  const tool = safeRequire('diff-js-xml');
  if (tool && typeof tool.diffAsXml === 'function') {
    try {
      const options = {
        compareElementValues: true,
        xml2jsOptions: {
          compact: true,
          ignoreDoctype: true,
          ignoreDeclaration: true,
          ignoreAttributes: false
        }
      };
      let diffs: any[] | undefined;
      // Many versions of diff-js-xml expect (expectedXml, actualXml, options, callback)
      tool.diffAsXml(templateXml ?? '', xml ?? '', options, (diffResult: any[]) => {
        diffs = diffResult || [];
      });
      
      if (Array.isArray(diffs)) {
        result.method = 'diff-js-xml';
        
        // Parse XML to get actual/expected objects for reporting
        try {
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
          result.actual = parser.parse(xml ?? '');
          result.expected = parser.parse(templateXml ?? '');
        } catch {
          result.actual = xml;
          result.expected = templateXml;
        }
        
        if (diffs.length === 0) {
          result.isValid = true;
          logInfo('XML validation passed', {
            _validation_type: 'xml',
            _status: 'success',
            _method: 'diff-js-xml',
            request_id: opts?.requestId
          });
          return result;
        }
        
        result.isValid = false;
        result.differences = diffs.map(d => {
          const path = d && d.path != null ? String(d.path) : '';
          const type = d && d.type != null ? String(d.type) : 'diff';
          const message = d && d.message != null ? String(d.message) : '';
          return `[${type}] ${path} ${message}`.trim();
        });
        
        logError('XML validation failed: Differences detected', null, {
          _validation_type: 'xml',
          _method: 'diff-js-xml',
          _differences: result.differences.join('\n'),
          request_id: opts?.requestId
        });
        return result;
      }
      // If the library used an async callback style, fall back to JSON compare
    } catch (e) {
      logWarning('diff-js-xml error, falling back to structural compare', {
        _validation_type: 'xml',
        _error: e instanceof Error ? e.message : String(e),
        request_id: opts?.requestId
      });
    }
  }

  // Fallback: parse both to JSON and compare
  result.method = 'structural';
  
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    const actualObj = parser.parse(xml ?? '');
    const expectedObj = parser.parse(templateXml ?? '');
    
    result.actual = actualObj;
    result.expected = expectedObj;
    
    const actualStr = JSON.stringify(actualObj);
    const expectedStr = JSON.stringify(expectedObj);
    
    if (actualStr === expectedStr) {
      result.isValid = true;
      logInfo('XML validation passed (structural)', {
        _validation_type: 'xml',
        _status: 'success',
        _method: 'structural',
        request_id: opts?.requestId
      });
      return result;
    }
    
    result.isValid = false;
    result.differences = computeStructuralDifferences(actualObj, expectedObj);
    
    logError('XML validation failed (structural)', null, {
      _validation_type: 'xml',
      _method: 'structural',
      _expected: expectedStr,
      _actual: actualStr,
      _differences: result.differences?.join('\n'),
      request_id: opts?.requestId
    });
    return result;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    result.isValid = false;
    result.parseError = errorMsg;
    result.differences = [`[parse_error] ${errorMsg}`];
    
    logError('XML validation error', e, {
      _validation_type: 'xml'
    });
    return result;
  }
};

/**
 * Compute structural differences between two parsed XML objects
 */
function computeStructuralDifferences(actual: any, expected: any, path: string = ''): string[] {
  const differences: string[] = [];
  
  if (actual === expected) {
    return differences;
  }
  
  if (typeof actual !== typeof expected) {
    differences.push(`[type_mismatch] ${path || 'root'}: expected ${typeof expected}, got ${typeof actual}`);
    return differences;
  }
  
  if (actual === null || expected === null) {
    if (actual !== expected) {
      differences.push(`[value_mismatch] ${path || 'root'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
    return differences;
  }
  
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      differences.push(`[type_mismatch] ${path || 'root'}: expected array, got ${typeof actual}`);
      return differences;
    }
    
    if (actual.length !== expected.length) {
      differences.push(`[array_length] ${path || 'root'}: expected ${expected.length} items, got ${actual.length}`);
    }
    
    const minLen = Math.min(actual.length, expected.length);
    for (let i = 0; i < minLen; i++) {
      differences.push(...computeStructuralDifferences(actual[i], expected[i], `${path}[${i}]`));
    }
    
    for (let i = minLen; i < expected.length; i++) {
      differences.push(`[missing_item] ${path}[${i}]: expected item is missing`);
    }
    
    for (let i = minLen; i < actual.length; i++) {
      differences.push(`[extra_item] ${path}[${i}]: unexpected extra item`);
    }
    
    return differences;
  }
  
  if (typeof expected === 'object') {
    if (typeof actual !== 'object' || Array.isArray(actual)) {
      differences.push(`[type_mismatch] ${path || 'root'}: expected object, got ${Array.isArray(actual) ? 'array' : typeof actual}`);
      return differences;
    }
    
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);
    
    // Check for missing keys
    for (const key of expectedKeys) {
      if (!(key in actual)) {
        differences.push(`[missing_element] ${path ? path + '.' + key : key}: expected element is missing`);
      }
    }
    
    // Check for extra keys
    for (const key of actualKeys) {
      if (!(key in expected)) {
        differences.push(`[extra_element] ${path ? path + '.' + key : key}: unexpected extra element`);
      }
    }
    
    // Recursively check matching keys
    for (const key of expectedKeys) {
      if (key in actual) {
        differences.push(...computeStructuralDifferences(actual[key], expected[key], path ? path + '.' + key : key));
      }
    }
    
    return differences;
  }
  
  // Primitive comparison
  if (actual !== expected) {
    differences.push(`[value_mismatch] ${path || 'root'}: expected "${expected}", got "${actual}"`);
  }
  
  return differences;
}

function safeRequire(name: string): any | null {
  try { return require(name); } catch { return null; }
}
