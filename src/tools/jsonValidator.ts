import * as jsondiffpatch from 'jsondiffpatch';
import { logError, logInfo } from '../utils/logger.js';
import { Ajv } from 'ajv';
import { Ajv2019 } from 'ajv/dist/2019.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

const addFormats = addFormatsModule as unknown as (ajv: Ajv | Ajv2019 | Ajv2020) => void;

export type JsonValidationOptions = {
  ignoreExtraProps?: boolean;
  ignoreProps?: string[];
  ignoreSimilar?: boolean; // If true, ignore value differences – only fail on missing, extra, or type mismatch
  useJsonSchema?: boolean; // If true, treat validationJson as JSON Schema
  ignoreArrayOrder?: boolean; // If true, sort arrays lexicographically before comparing
};

export type JsonValidationResult = {
  isValid: boolean;
  expected?: any;
  actual?: any;
  differences?: string[];
  duplicateKeys?: string[];
  schemaErrors?: string[]; // Schema validation errors
  delta?: any;
  htmlReport?: string;
  reportPath?: string;
  isSchemaValidation?: boolean; // Flag to indicate schema-based validation
  s3Url?: string; // S3 URL of the report
  localReportPath?: string; // Local path when S3 is disabled or upload fails
};

/**
 * Enhanced JSON validator using jsondiffpatch with detailed diff output
 * Returns detailed validation result object
 */
export const validateJsonTemplate = (json: any, validationJson: any, options?: JsonValidationOptions): JsonValidationResult => {
  const opts: JsonValidationOptions = options || {};
  const result: JsonValidationResult = { isValid: true };

  // Check for duplicate keys in raw JSON string
  // Duplicate keys ALWAYS cause validation to fail, regardless of ignoreExtraProps
  if (typeof json === 'string') {
    const dupKeys = findDuplicateKeysInJsonText(json);
    if (dupKeys.length > 0) {
      result.duplicateKeys = dupKeys;
      result.isValid = false;
      logError('JSON validation failed: Duplicate object keys detected', null, {
        _validation_type: 'json',
        _duplicate_keys: dupKeys.join(', '),
        _error_type: 'duplicate_key'
      });
      // Return early - duplicate keys are a critical error
      result.expected = validationJson;
      result.actual = json;
      result.differences = dupKeys.map(key => `[duplicate_key] "${key}" appears multiple times in the JSON`);
      return result;
    }
  }

  // If an Express middleware attached __rawBody, prefer it for duplicate detection
  if (json && typeof json === 'object' && (json as any).__rawBody && typeof (json as any).__rawBody === 'string') {
    const dupKeys = findDuplicateKeysInJsonText((json as any).__rawBody);
    if (dupKeys.length > 0) {
      result.duplicateKeys = dupKeys;
      result.isValid = false;
      logError('JSON validation failed: Duplicate object keys detected', null, {
        _validation_type: 'json',
        _duplicate_keys: dupKeys.join(', '),
        _error_type: 'duplicate_key'
      });
      // Return early - duplicate keys are a critical error
      result.expected = validationJson;
      result.actual = json;
      result.differences = dupKeys.map(key => `[duplicate_key] "${key}" appears multiple times in the JSON`);
      return result;
    }
  }

  const actualRaw = typeof json === 'string' ? safeParse(json) : json;
  const templateRaw = validationJson;

  // JSON Schema validation (if enabled)
  if (opts.useJsonSchema) {
    const schemaResult = validateJsonSchema(actualRaw, validationJson);
    
    // Generate example JSON from schema for better comparison in the report
    const generatedExample = generateExampleFromSchema(validationJson);
    
    // Mark this as schema validation for the report
    result.isSchemaValidation = true;
    
    if (!schemaResult.isValid) {
      result.isValid = false;
      result.schemaErrors = schemaResult.errors;
      // Use generated example JSON as "expected" for better side-by-side comparison
      result.expected = JSON.stringify(generatedExample, null, 2);
      result.actual = JSON.stringify(actualRaw, null, 2);
      result.differences = schemaResult.errors;
      
      logError('JSON validation failed: Schema validation errors', null, {
        _validation_type: 'json_schema',
        _schema_errors: schemaResult.errors.join('\n'),
        _error_type: 'schema_validation'
      });
      
      return result;
    }
    
    // Schema validation passed - still provide example for documentation
    result.expected = JSON.stringify(generatedExample, null, 2);
    result.actual = JSON.stringify(actualRaw, null, 2);
    
    logInfo('JSON schema validation passed', {
      _validation_type: 'json_schema',
      _status: 'success'
    });
    
    return result;
  }

  // Continue with standard template-based validation
  const ignoreSet = new Set((opts.ignoreProps || []).filter(Boolean));
  const actual = ignoreSet.size ? stripIgnoredProps(actualRaw, ignoreSet) : actualRaw;
  const template = ignoreSet.size ? stripIgnoredProps(templateRaw, ignoreSet) : templateRaw;

  const actualCompare = opts.ignoreArrayOrder ? sortArraysRecursively(actual) : actual;
  const templateCompare = opts.ignoreArrayOrder ? sortArraysRecursively(template) : template;

  const expected = buildExpectedFromTemplate(templateCompare, actualCompare, opts);

  // Create jsondiffpatch instance with detailed options
  const jdp = jsondiffpatch.create({
    objectHash: (obj: any) => obj?.id || obj?._id || JSON.stringify(obj),
    arrays: {
      detectMove: !opts.ignoreArrayOrder,
      includeValueOnMove: false
    },
    propertyFilter: (name: string) => !ignoreSet.has(name),
    cloneDiffValues: false
  });

  const delta = jdp.diff(expected, actualCompare);

  if (delta) {
    result.isValid = false;
    result.delta = delta;
    
    // Format detailed differences
    const lines = formatDetailedDelta(delta, expected, actualCompare);
    result.differences = lines;

    logError('JSON validation failed: Differences detected', null, {
      _validation_type: 'json',
      _differences: lines.join('\t'),
      //_delta: JSON.stringify(delta),
      _report_path: result.reportPath
    });
  } else {
    logInfo('JSON validation passed', {
      _validation_type: 'json',
      _status: 'success',
      _report_path: result.reportPath
    });
  }

  result.expected = expected;
  result.actual = actualCompare;

  return result;
};

/** Sort arrays recursively so order-insensitive comparison can use a plain diff. */
function sortArraysRecursively(value: any): any {
  if (Array.isArray(value)) {
    const sorted = value.map((v) => sortArraysRecursively(v));
    sorted.sort((a, b) => {
      const aKey = JSON.stringify(a);
      const bKey = JSON.stringify(b);
      if (aKey < bKey) return -1;
      if (aKey > bKey) return 1;
      return 0;
    });
    return sorted;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      out[key] = sortArraysRecursively(value[key]);
    }
    return out;
  }
  return value;
}

/**
 * Enhanced validator that returns boolean (backward compatible)
 */
export const validateJsonTemplateSimple = (json: any, validationJson: any, options?: JsonValidationOptions): boolean => {
  const result = validateJsonTemplate(json, validationJson, options);
  return result.isValid;
};

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function tryParseRegex(value: any): { isRegex: boolean, regex?: RegExp } {
  if (typeof value !== 'string') return { isRegex: false };

  if (value.length >= 2 && value.startsWith('/') && value.lastIndexOf('/') > 0) {
    const lastSlash = value.lastIndexOf('/');
    const pattern = value.slice(1, lastSlash);
    const flags = value.slice(lastSlash + 1);
    try {
      return { isRegex: true, regex: new RegExp(pattern, flags) };
    } catch {
      return { isRegex: false };
    }
  }

  const looksLikeRegex = value.includes('.*') || value.includes('\\d') || value.includes('\\w') || value.includes('^') || value.includes('$') || value.includes('[') || value.includes('(') || value.includes('?');
  if (looksLikeRegex) {
    try {
      const anchored = value.startsWith('^') || value.endsWith('$') ? value : `^(?:${value})$`;
      return { isRegex: true, regex: new RegExp(anchored) };
    } catch {
      return { isRegex: false };
    }
  }

  return { isRegex: false };
}

function buildExpectedFromTemplate(template: any, actual: any, opts: JsonValidationOptions): any {
  if (template === null) {
    return null;
  }

  if (Array.isArray(template)) {
    if (Array.isArray(actual)) {
      const result: any[] = [];
      const length = template.length;
      for (let i = 0; i < length; i++) {
        result[i] = buildExpectedFromTemplate(template[i], actual[i], opts);
      }
      return result;
    }
    return template;
  }

  if (template && typeof template === 'object') {
    const result: Record<string, any> = {};
    const templateKeys = Object.keys(template || {});
    for (const key of templateKeys) {
      result[key] = buildExpectedFromTemplate(template[key], actual ? actual[key] : undefined, opts);
    }
    if (opts && opts.ignoreExtraProps && actual && typeof actual === 'object') {
      for (const key of Object.keys(actual)) {
        if (!(key in result)) {
          result[key] = (actual as any)[key];
        }
      }
    }
    return result;
  }

  if (typeof template === 'string') {
    const parsed = tryParseRegex(template);
    if (parsed.isRegex && parsed.regex) {
      const actualStr = actual === null || actual === undefined ? '' : String(actual);
      return parsed.regex.test(actualStr) ? actual : template;
    }
  }

  // ignoreSimilar: accept any actual value whose JS type matches the template's type
  if (opts && opts.ignoreSimilar && actual !== undefined) {
    if (jsTypeTag(template) === jsTypeTag(actual)) return actual;
  }

  return template;
}

function stripIgnoredProps(value: any, ignoreSet: Set<string>): any {
  if (Array.isArray(value)) {
    return value.map(v => stripIgnoredProps(v, ignoreSet));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      if (ignoreSet.has(key)) continue;
      out[key] = stripIgnoredProps(value[key], ignoreSet);
    }
    return out;
  }
  return value;
}

/** Classify a value into a broad type tag for ignoreSimilar comparison. */
function jsTypeTag(v: any): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v; // 'string' | 'number' | 'boolean' | 'object'
}

function findDuplicateKeysInJsonText(text: string): string[] {
  const duplicates: string[] = [];
  const stack: any[] = [];
  let inString = false;
  let escape = false;
  let strStart = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        const token = text.slice(strStart, i);
        inString = false;
        const top = stack.length > 0 ? stack[stack.length - 1] : null;
        if (top && top.type === 'object' && top.expectingKey) {
          let j = i + 1;
          while (j < text.length && /\s/.test(text[j])) j++;
          if (j < text.length && text[j] === ':') {
            let key: string = token;
            try { key = JSON.parse('"' + token + '"'); } catch {}
            if (top.keys.has(key)) {
              duplicates.push(key);
            } else {
              top.keys.add(key);
            }
            top.expectingKey = false;
          }
        }
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      escape = false;
      strStart = i + 1;
      continue;
    }

    if (/\s/.test(ch)) continue;

    if (ch === '{') {
      stack.push({ type: 'object', keys: new Set<string>(), expectingKey: true });
      continue;
    }
    if (ch === '}') {
      stack.pop();
      continue;
    }
    if (ch === '[') {
      stack.push({ type: 'array' });
      continue;
    }
    if (ch === ']') {
      stack.pop();
      continue;
    }
    if (ch === ',') {
      const top = stack.length > 0 ? stack[stack.length - 1] : null;
      if (top && top.type === 'object') {
        top.expectingKey = true;
      }
      continue;
    }
  }
  return Array.from(new Set(duplicates));
}

function formatDetailedDelta(delta: any, expected: any, actual: any): string[] {
  const out: string[] = [];
  collectDelta(delta, expected, actual, [], out);
  return out;
}

function collectDelta(delta: any, expected: any, actual: any, pathSegs: Array<string | number>, out: string[]): void {
  if (Array.isArray(delta)) {
    const type = classifyChange(delta);
    const pathStr = formatPath(pathSegs);
    const [left, right] = delta as any[];
    switch (type) {
      case 'missing':
        out.push(`[missing] ${pathStr} expected=${stringifySafe(left)} actual=undefined`);
        break;
      case 'extra':
        out.push(`[extra] ${pathStr} actual=${stringifySafe(right ?? actual)} expected=undefined`);
        break;
      case 'moved':
        out.push(`[moved] ${pathStr} from=${left} to=${right}`);
        break;
      default:
        const expVal = left ?? getAt(expected, pathSegs);
        const actVal = right ?? getAt(actual, pathSegs);
        if (expVal === null && actVal !== null) {
          out.push(`[mismatch] ${pathStr} expected=null actual=${stringifySafe(actVal)}`);
        } else {
          out.push(`[mismatch] ${pathStr} expected=${stringifySafe(expVal)} actual=${stringifySafe(actVal)}`);
        }
        break;
    }
    return;
  }

  if (delta && typeof delta === 'object') {
    if ((delta as any)._t === 'a') {
      for (const key of Object.keys(delta)) {
        if (key === '_t') continue;
        const change = (delta as any)[key];
        if (key.startsWith('_')) {
          const idx = parseInt(key.slice(1), 10);
          const segs = pathSegs.concat(idx);
          if (Array.isArray(change)) {
            const chType = classifyChange(change);
            if (chType === 'moved') {
              out.push(`[moved] ${formatPath(segs)} from=${change[0]} to=${change[1]}`);
            } else {
              out.push(`[missing] ${formatPath(segs)} expected=${stringifySafe(getAt(expected, segs))} actual=undefined`);
            }
          } else if (change && typeof change === 'object') {
            collectDelta(change, getAt(expected, segs), undefined, segs, out);
          }
        } else {
          const idx = parseInt(key, 10);
          const segs = pathSegs.concat(idx);
          if (Array.isArray(change)) {
            const chType = classifyChange(change);
            if (chType === 'extra') {
              out.push(`[extra] ${formatPath(segs)} actual=${stringifySafe(getAt(actual, segs))} expected=undefined`);
            } else if (chType === 'moved') {
              out.push(`[moved] ${formatPath(segs)} from=${change[0]} to=${change[1]}`);
            } else if (chType === 'mismatch') {
              if (change[0] === null && change[1] !== null) {
                out.push(`[mismatch] ${formatPath(segs)} expected=null actual=${stringifySafe(change[1])}`);
              } else {
                out.push(`[mismatch] ${formatPath(segs)} expected=${stringifySafe(change[0])} actual=${stringifySafe(change[1])}`);
              }
            } else if (chType === 'missing') {
              out.push(`[missing] ${formatPath(segs)} expected=${stringifySafe(change[0])} actual=undefined`);
            }
          } else if (change && typeof change === 'object') {
            collectDelta(change, getAt(expected, segs), getAt(actual, segs), segs, out);
          }
        }
      }
      return;
    }

    for (const key of Object.keys(delta)) {
      if (key === '_t') continue;
      const change = (delta as any)[key];
      const segs = pathSegs.concat(key);
      if (Array.isArray(change)) {
        const chType = classifyChange(change);
        if (chType === 'extra') {
          out.push(`[extra] ${formatPath(segs)} actual=${stringifySafe(getAt(actual, segs))} expected=undefined`);
        } else if (chType === 'missing') {
          out.push(`[missing] ${formatPath(segs)} expected=${stringifySafe(change[0])} actual=undefined`);
        } else if (chType === 'moved') {
          out.push(`[moved] ${formatPath(segs)} from=${change[0]} to=${change[1]}`);
        } else {
          if (change[0] === null && change[1] !== null) {
            out.push(`[mismatch] ${formatPath(segs)} expected=null actual=${stringifySafe(change[1])}`);
          } else {
            out.push(`[mismatch] ${formatPath(segs)} expected=${stringifySafe(change[0])} actual=${stringifySafe(change[1])}`);
          }
        }
      } else if (change && typeof change === 'object') {
        collectDelta(change, getAt(expected, segs), getAt(actual, segs), segs, out);
      }
    }
  }
}

function classifyChange(arr: any[]): 'mismatch' | 'missing' | 'extra' | 'moved' {
  if (!Array.isArray(arr)) return 'mismatch';
  if (arr.length === 3 && arr[2] === 0 && arr[1] === 0) return 'missing';
  if (arr.length === 3 && arr[2] === 3) return 'moved';
  if (arr.length === 1) return 'extra';
  return 'mismatch';
}

function formatPath(segs: Array<string | number>): string {
  let out = '';
  for (const s of segs) {
    if (typeof s === 'number') out += `[${s}]`;
    else out += out ? `.${s}` : s;
  }
  return out || '(root)';
}

function getAt(obj: any, segs: Array<string | number>): any {
  let cur = obj;
  for (const s of segs) {
    if (cur == null) return undefined;
    cur = cur[s as any];
  }
  return cur;
}

function stringifySafe(v: any): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

/**
 * Generate example JSON from JSON Schema
 * This creates a sample JSON object that conforms to the schema
 */
function generateExampleFromSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return {};
  }

  // Handle $ref (simplified - doesn't resolve external refs)
  if (schema.$ref) {
    return `<ref: ${schema.$ref}>`;
  }

  // Handle const
  if ('const' in schema) {
    return schema.const;
  }

  // Handle enum - pick first value
  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  // Handle default
  if ('default' in schema) {
    return schema.default;
  }

  // Handle examples
  if (schema.examples && Array.isArray(schema.examples) && schema.examples.length > 0) {
    return schema.examples[0];
  }

  // Handle type
  const type = schema.type;
  
  if (type === 'null' || schema.type === null) {
    return null;
  }

  if (type === 'string') {
    // Check for pattern to give a hint
    if (schema.pattern) {
      return `<string matching ${schema.pattern}>`;
    }
    if (schema.format) {
      switch (schema.format) {
        case 'date-time': return new Date().toISOString();
        case 'date': return new Date().toISOString().split('T')[0];
        case 'time': return new Date().toISOString().split('T')[1];
        case 'email': return 'example@email.com';
        case 'uri': return 'https://example.com';
        case 'uuid': return '00000000-0000-0000-0000-000000000000';
        default: return `<${schema.format}>`;
      }
    }
    return schema.minLength ? 'a'.repeat(schema.minLength) : 'string';
  }

  if (type === 'number' || type === 'integer') {
    if (schema.minimum !== undefined) return schema.minimum;
    if (schema.exclusiveMinimum !== undefined) return schema.exclusiveMinimum + 1;
    return type === 'integer' ? 0 : 0.0;
  }

  if (type === 'boolean') {
    return false;
  }

  if (type === 'array') {
    if (schema.items) {
      // Generate one example item
      const exampleItem = generateExampleFromSchema(schema.items);
      const minItems = schema.minItems || 1;
      return Array(minItems).fill(null).map(() => exampleItem);
    }
    return [];
  }

  if (type === 'object' || schema.properties) {
    const result: any = {};
    
    if (schema.properties) {
      const required = new Set(schema.required || []);
      
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        // Generate all required properties and some optional ones for completeness
        if (required.has(key) || Math.random() > 0.3) {
          result[key] = generateExampleFromSchema(propSchema);
        }
      }
    }
    
    return result;
  }

  // Handle anyOf/oneOf/allOf
  if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return generateExampleFromSchema(schema.anyOf[0]);
  }
  if (schema.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return generateExampleFromSchema(schema.oneOf[0]);
  }
  if (schema.allOf && Array.isArray(schema.allOf)) {
    // Merge all schemas
    const merged: any = { type: 'object', properties: {} };
    for (const subSchema of schema.allOf) {
      const example = generateExampleFromSchema(subSchema);
      if (typeof example === 'object' && !Array.isArray(example)) {
        Object.assign(merged.properties, example);
      }
    }
    return merged.properties;
  }

  // If type is an array of types, pick the first non-null
  if (Array.isArray(type)) {
    const nonNullType = type.find(t => t !== 'null');
    if (nonNullType) {
      return generateExampleFromSchema({ ...schema, type: nonNullType });
    }
    return null;
  }

  // Default fallback
  return null;
}

/**
 * Validate JSON against a JSON Schema using Ajv
 */
function validateJsonSchema(data: any, schema: any): { isValid: boolean; errors: string[] } {
  try {
    // Choose Ajv version based on $schema
    const schemaUri: string | undefined = schema && typeof schema === 'object' ? schema.$schema : undefined;
    let ajv: Ajv | Ajv2019 | Ajv2020;
    if (schemaUri && /2020-12/.test(schemaUri)) {
      ajv = new Ajv2020({ allErrors: true, verbose: true, strict: false });
    } else if (schemaUri && /2019-09/.test(schemaUri)) {
      ajv = new Ajv2019({ allErrors: true, verbose: true, strict: false });
    } else {
      // Default to draft-07 Ajv
      ajv = new Ajv({ allErrors: true, verbose: true, strict: false });
    }
    
    // Add format validation (email, date-time, uri, etc.)
    addFormats(ajv);
    
    // Compile and validate
    const validate = (ajv as any).compile(schema);
    const isValid = validate(data);
    
    if (isValid) {
      return { isValid: true, errors: [] };
    }
    
    // Format errors
    const errors = (validate.errors || []).map((err: any) => {
      const path = err.instancePath || '/';
      const keyword = err.keyword;
      const message = err.message || 'validation failed';
      const params = err.params ? JSON.stringify(err.params) : '';
      
      switch (keyword) {
        case 'required':
          return `[schema_error] ${path} is missing required property: ${(err.params as any).missingProperty}`;
        case 'type':
          return `[schema_error] ${path} should be ${(err.params as any).type}, got ${typeof err.data}`;
        case 'enum':
          return `[schema_error] ${path} should be one of: ${(err.params as any).allowedValues?.join(', ')}`;
        case 'minLength':
          return `[schema_error] ${path} should have minimum length of ${(err.params as any).limit}`;
        case 'maxLength':
          return `[schema_error] ${path} should have maximum length of ${(err.params as any).limit}`;
        case 'pattern':
          return `[schema_error] ${path} should match pattern: ${(err.params as any).pattern}`;
        case 'format':
          return `[schema_error] ${path} should match format: ${(err.params as any).format}`;
        case 'minimum':
          return `[schema_error] ${path} should be >= ${(err.params as any).limit} (minimum constraint)`;
        case 'maximum':
          return `[schema_error] ${path} should be <= ${(err.params as any).limit} (maximum constraint)`;
        case 'additionalProperties':
          return `[schema_error] ${path} should NOT have additional property: ${(err.params as any).additionalProperty}`;
        default:
          return `[schema_error] ${path} ${message} ${params ? `(${params})` : ''}`.trim();
      }
    });
    
    return { isValid: false, errors };
  } catch (error) {
    // Schema compilation error
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      isValid: false,
      errors: [`[schema_error] Invalid JSON Schema: ${errorMsg}`]
    };
  }
}
