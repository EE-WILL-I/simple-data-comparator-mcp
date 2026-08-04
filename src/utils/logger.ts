import fs from 'fs';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { getTraceContext } from './telemetry.js';
import { createStream } from 'rotating-file-stream';

export enum LogLevel {
  DEBUG = 5,
  INFO = 4,
  WARN = 3,
  ERROR = 2,
  FATAL = 1,
  NONE = 0
}

export type GraylogMessage = {
  version: string;
  host: string;
  short_message: string;
  full_message?: string;
  timestamp: number;
  level: LogLevel;
  facility?: string;
  [key: string]: any; // Additional fields prefixed with _
};

type LogFormat = 'gelf' | 'text';

const HOST = process.env.MCP_HOST || 'simple-validator-mcp';
// Resolve logs dir relative to the process working directory (project root at runtime and in tests)
const LOG_DIR = path.resolve(process.env.LOG_DIR_OVERRIDE ?? process.cwd(), 'logs');
const LOG_LEVEL = LogLevelFromString(process.env.LOG_LEVEL || 'INFO');
const LOG_FORMAT: LogFormat = (process.env.LOG_FORMAT || 'text').toLowerCase() === 'gelf' ? 'gelf' : 'text';

type RequestContext = {
  request_id?: string;
  tenant_id?: string;
  trace_id?: string;
  span_id?: string;
  traceId?: string;
  spanId?: string;
  thread?: string;
  class?: string;
};

const requestContextStore = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContextStore.run(ctx, fn);
}

export function setRequestContext(ctx: Partial<RequestContext>): void {
  const store = requestContextStore.getStore();
  if (store) Object.assign(store, ctx);
}

function getRequestContext(): RequestContext {
  return requestContextStore.getStore() || {};
}


// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Create rotating log stream
const logStream = createStream('requests.log', {
  size: '100M',        // Rotate every 100MB
  interval: '1d',      // Rotate daily
  compress: 'gzip',    // Compress old logs
  maxFiles: 10,        // Keep max 10 files
  path: LOG_DIR
});

function LogLevelFromString(level: string): LogLevel {
  switch(level) {
    case 'DEBUG': return LogLevel.DEBUG;
    case 'INFO': return LogLevel.INFO;
    case 'WARN': return LogLevel.WARN;
    case 'ERROR': return LogLevel.ERROR;
    case 'FATAL': return LogLevel.FATAL;
    default: return LogLevel.INFO;
  }
}

function buildMergedFields(additionalFields?: Record<string, any>): Record<string, any> {
  const ctx = getRequestContext();
  const traceContext = getTraceContext();

  return {
    ...(ctx as any),
    trace_id: ctx.trace_id || ctx.traceId || traceContext.traceId,
    span_id: ctx.span_id || ctx.spanId || traceContext.spanId,
    ...(additionalFields || {}),
  };
}

function writeLogLine(logLine: string): void {
  console.log(logLine);

  try {
    logStream.write(logLine + '\n');
  } catch (err) {
    console.error('Failed to write log to file:', err);
  }
}

function logLevelToSyslog(level: LogLevel): number {
  switch (level) {
    case LogLevel.FATAL: return 2;
    case LogLevel.ERROR: return 3;
    case LogLevel.WARN: return 4;
    case LogLevel.INFO: return 6;
    case LogLevel.DEBUG: return 7;
    default: return 6;
  }
}

function serializeGelfFieldValue(value: unknown): string | number | boolean {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}

function writeGelfLog(level: LogLevel, shortMessage: string, mergedFields: Record<string, any>): void {
  const gelf: Record<string, string | number | boolean> = {
    version: '1.1',
    host: HOST,
    short_message: shortMessage,
    timestamp: Date.now() / 1000,
    level: logLevelToSyslog(level),
  };

  for (const [key, value] of Object.entries(mergedFields)) {
    if (value === undefined || value === null || value === '') continue;
    const fieldKey = key.startsWith('_') ? key : `_${key}`;
    gelf[fieldKey] = serializeGelfFieldValue(value);
  }

  writeLogLine(JSON.stringify(gelf));
}

function writeTextLog(level: LogLevel, shortMessage: string, mergedFields: Record<string, any>): void {
  const normalized = normalizeFields(mergedFields);

  const timePart = `[${formatTimestamp(new Date())}]`;
  const levelPart = `[${levelToString(level)}]`;

  const requestIdPart = `[request_id=${valueOrDash(normalized.request_id)}]`;
  const tenantIdPart = `[tenant_id=${valueOrDash(normalized.tenant_id)}]`;
  const traceIdPart = `[trace_id=${valueOrDash(normalized.trace_id)}]`;
  const spanIdPart = `[span_id=${valueOrDash(normalized.span_id)}]`;
  const threadPart = `[thread=${valueOrDash(normalized.thread)}]`;
  const classPart = `[class=${valueOrDash(normalized.class)}]`;

  const orderedParts = [timePart, levelPart, requestIdPart, tenantIdPart, traceIdPart, spanIdPart, threadPart, classPart];

  const optionalPairs: Array<string> = [];
  addOptional(optionalPairs, 'host', HOST || 'simple-validator-mcp');
  addOptional(optionalPairs, 'method', normalized.method);
  addOptional(optionalPairs, 'version', normalized.version);
  addOptional(optionalPairs, 'error_code', normalized.error_code);
  addOptional(optionalPairs, 'originating_bi_id', normalized.originating_bi_id);
  addOptional(optionalPairs, 'business_identifiers', normalized.business_identifiers);
  addOptional(optionalPairs, 'traceId', normalized.traceId);
  addOptional(optionalPairs, 'spanId', normalized.spanId);

  if (normalized.custom) {
    for (const [key, value] of Object.entries(normalized.custom)) {
      if (value === undefined || value === null || value === '') continue;
      const safe = String(value).replace(/\r?\n/g, ' | ').replace(/\r/g, ' | ');
      optionalPairs.push(`[${key}=${safe}]`);
    }
  }

  const prefix = orderedParts.concat(optionalPairs).join(' ');
  writeLogLine(`${prefix} ${shortMessage}`);
}

/**
 * Log a message using the format selected by LOG_FORMAT (gelf or text).
 * @param level Log level
 * @param shortMessage Brief summary
 * @param additionalFields Extra fields (prefixed with _ for Graylog in gelf mode)
 */
export function logGelf(level: LogLevel, shortMessage: string, additionalFields?: Record<string, any>): void {
  if (level > LOG_LEVEL) {
    return;
  }

  const mergedFields = buildMergedFields(additionalFields);

  if (LOG_FORMAT === 'gelf') {
    writeGelfLog(level, shortMessage, mergedFields);
  } else {
    writeTextLog(level, shortMessage, mergedFields);
  }
}

/**
 * Sanitize sensitive data from objects for logging
 */
function sanitizeForLogging(data: any, depth: number = 0): any {
  if (depth > 10) return '[max depth exceeded]'; // Prevent infinite recursion
  
  if (data === null || data === undefined) return data;
  
  // Sensitive field patterns
  const sensitivePatterns = [
    /password/i,
    /passwd/i,
    /pwd/i,
    /secret/i,
    /token/i,
    /apikey/i,
    /api[_-]?key/i,
    /authorization/i,
    /auth/i,
    /credit[_-]?card/i,
    /card[_-]?number/i,
    /ssn/i,
    /social[_-]?security/i,
    /pin/i,
    /private[_-]?key/i,
    /access[_-]?key/i,
    /session/i
  ];
  
  const isSensitive = (key: string): boolean => {
    return sensitivePatterns.some(pattern => pattern.test(key));
  };
  
  if (typeof data === 'string') {
    // Check if this is a string that looks like sensitive data
    if (data.length > 20 && /^[A-Za-z0-9+/=_-]{20,}$/.test(data)) {
      return '[REDACTED:token-like-string]';
    }
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForLogging(item, depth + 1));
  }
  
  if (typeof data === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (isSensitive(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeForLogging(value, depth + 1);
      }
    }
    return sanitized;
  }
  
  return data;
}

function showSensitiveLogging(): boolean {
  const value = process.env.LOGGING_SHOW_SENSITIVE;
  if (value === undefined || value === '') {
    return false;
  }
  const normalized = value.toLowerCase();
  return value === '1' || normalized === 'true' || normalized === 'yes';
}

const CLIENT_SENSITIVE_KEYS = /^(password|passwd|pwd|secret|client_secret|access_token|refresh_token|id_token|token)$/i;

function sanitizeClientHeaders(headers: any): any {
  if (!headers || showSensitiveLogging()) {
    return headers;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    sanitized[key] = /^authorization$/i.test(key) ? '[REDACTED]' : value;
  }
  return sanitized;
}

function sanitizeClientJsonValue(data: any, depth: number = 0): any {
  if (depth > 10) return '[max depth exceeded]';
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeClientJsonValue(item, depth + 1));
  }
  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = CLIENT_SENSITIVE_KEYS.test(key) ? '[REDACTED]' : sanitizeClientJsonValue(value, depth + 1);
    }
    return sanitized;
  }
  return data;
}

function sanitizeClientBody(body: any): any {
  if (body === undefined || body === null || showSensitiveLogging()) {
    return body;
  }

  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed) {
      return body;
    }

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(sanitizeClientJsonValue(JSON.parse(trimmed)));
      } catch {
        return body;
      }
    }

    if (trimmed.includes('=') && /(?:^|&)(password|passwd|pwd|secret|client_secret|token)=/i.test(trimmed)) {
      try {
        const params = new URLSearchParams(trimmed);
        for (const key of [...params.keys()]) {
          if (CLIENT_SENSITIVE_KEYS.test(key)) {
            params.set(key, '[REDACTED]');
          }
        }
        return params.toString();
      } catch {
        return body;
      }
    }

    return body;
  }

  return sanitizeClientJsonValue(body);
}

function bodyToLogString(body: any): string {
  if (body === undefined || body === null) {
    return '';
  }
  return typeof body === 'string' ? body : JSON.stringify(body);
}

/**
 * Log outbound HTTP request (stub → external system). Uses ALS for trace_id/request_id.
 */
export function logClientRequest(
  method: string,
  url: string,
  headers: any,
  body: any,
  httpClientId: string
): void {
  let httpPath = url;
  try {
    const parsed = new URL(url);
    httpPath = `${parsed.pathname}${parsed.search}`;
  } catch {
    // keep full url as path fallback
  }

  const safeHeaders = sanitizeClientHeaders(headers);
  const safeBody = sanitizeClientBody(body);

  logGelf(LogLevel.INFO, `Outbound request: ${method} ${url}`, {
    http_client_id: httpClientId,
    http_method: method,
    http_url: url,
    http_path: httpPath,
    http_headers: JSON.stringify(safeHeaders ?? {}),
    event_type: 'http_client_request',
  });

  const bodyStr = bodyToLogString(safeBody);
  if (bodyStr) {
    logGelf(LogLevel.INFO, ``, {
      http_client_id: httpClientId,
      http_body: bodyStr,
    });
  }
}

/**
 * Log outbound HTTP response (or transport error after request was sent).
 */
export function logClientResponse(
  method: string,
  url: string,
  statusCode: number,
  body: any,
  httpClientId: string,
  durationMs?: number,
  errorMessage?: string
): void {
  let httpPath = url;
  try {
    const parsed = new URL(url);
    httpPath = `${parsed.pathname}${parsed.search}`;
  } catch {
    // keep full url as path fallback
  }

  const safeBody = sanitizeClientBody(body);
  const fields: Record<string, any> = {
    http_client_id: httpClientId,
    http_method: method,
    http_url: url,
    http_path: httpPath,
    http_status: statusCode,
    duration_ms: durationMs,
    event_type: 'http_client_response',
  };
  if (errorMessage) {
    fields.error_message = errorMessage;
  }

  logGelf(LogLevel.INFO, `Outbound response: ${method} ${url} - ${statusCode}`, fields);

  const bodyStr = bodyToLogString(safeBody);
  if (bodyStr || errorMessage) {
    logGelf(LogLevel.INFO, ``, {
      http_client_id: httpClientId,
      http_body: bodyStr || errorMessage || '',
    });
  }
}

/**
 * Log incoming HTTP request
 */
export function logRequest(method: string, path: string, headers: any, body: any, traceId: string, spanId: string, requestId?: string): void {
  //const rid = requestId || getHeader(headers, 'x-request-id') || generateRequestId();
  const tenantId = getHeader(headers, 'x-tenant-id') || getHeader(headers, 'tenant-id') || '-';

  // Note: Sanitization disabled - logging raw data
  // Admin endpoints are handled separately in handler.js

  logGelf(LogLevel.INFO, `Incoming request: ${method} ${path}`, {
    request_id: requestId, 
    tenant_id: tenantId,
    trace_id: traceId,
    span_id: spanId,
    http_method: method,
    http_path: path,
    http_headers: JSON.stringify(headers),
    event_type: 'http_request'
  });

  logGelf(LogLevel.INFO, ``, {
    request_id: requestId,
    tenant_id: tenantId,
    trace_id: traceId,
    span_id: spanId,
    http_body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

/**
 * Log outgoing HTTP response
 */
export function logResponse(method: string, path: string, statusCode: number, body: any, traceId: string, spanId: string, requestId?: string, durationMs?: number): void {
  // Note: Sanitization disabled - logging raw data
  // Admin endpoints are handled separately in handler.js

  logGelf(LogLevel.INFO, `Outgoing response: ${method} ${path} - ${statusCode}`, {
    request_id: requestId,
    trace_id: traceId,
    span_id: spanId,
    http_method: method,
    http_path: path,
    http_status: statusCode,
    duration_ms: durationMs,
    event_type: 'http_response'
  });

  logGelf(LogLevel.INFO, ``, {
    request_id: requestId,
    trace_id: traceId,
    span_id: spanId,
    http_body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

/**
 * Log general info message
 */
export function logInfo(message: string, additionalFields?: Record<string, any>): void {
  logGelf(LogLevel.INFO, message, additionalFields);
}

/**
 * Log error message
 */
export function logError(message: string, error?: any, additionalFields?: Record<string, any>): void {
  const fields = { ...additionalFields } as Record<string, any>;
  if (error) {
    fields.error_message = error.message || String(error);
    fields.error_stack = error.stack || '';
  }
  logGelf(LogLevel.ERROR, "❌ " + message, fields);
}

/**
 * Log warning message
 */
export function logWarning(message: string, additionalFields?: Record<string, any>): void {
  logGelf(LogLevel.WARN, "⚠️ " + message, additionalFields);
}

/**
 * Log debug message
 */
export function logDebug(message: string, additionalFields?: Record<string, any>): void {
  logGelf(LogLevel.DEBUG, message, additionalFields);
}

/**
 * Log fatal message
 */
export function logFatal(message: string, additionalFields?: Record<string, any>): void {
  logGelf(LogLevel.FATAL, '❌ ' + message, additionalFields);
}

function levelToString(level: LogLevel): string {
  switch (level) {
    case LogLevel.DEBUG: return 'DEBUG';
    case LogLevel.INFO: return 'INFO';
    case LogLevel.WARN: return 'WARN';
    case LogLevel.ERROR: return 'ERROR';
    case LogLevel.FATAL: return 'FATAL';
    default: return 'INFO';
  }
}

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }
function pad3(n: number): string { return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n); }
function formatTimestamp(date: Date): string {
  // yyyy-MM-ddTHH:mm:ss.SSS without timezone
  const yyyy = date.getFullYear();
  const MM = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const HH = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  const SSS = pad3(date.getMilliseconds());
  return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}.${SSS}`;
}

function valueOrDash(value: any): string {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

function addOptional(parts: Array<string>, key: string, value: any): void {
  if (value === undefined || value === null || value === '') return;
  parts.push(`[${key}=${String(value)}]`);
}

function getHeader(headers: any, name: string): string | undefined {
  if (!headers) return undefined;
  const low = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === low) return headers[k];
  }
  return undefined;
}

function normalizeFields(fields?: Record<string, any>): {
  request_id?: string;
  tenant_id?: string;
  thread?: string;
  class?: string;
  method?: string;
  version?: string;
  error_code?: string;
  originating_bi_id?: string;
  business_identifiers?: string;
  trace_id?: string;
  span_id?: string;
  traceId?: string;
  spanId?: string;
  custom?: Record<string, any>;
} {
  const result: any = {};
  const custom: Record<string, any> = {};
  if (fields) {
    const mapKeys: Array<[string, string]> = [
      ['_request_id', 'request_id'],
      ['request_id', 'request_id'],
      ['_tenant_id', 'tenant_id'],
      ['tenant_id', 'tenant_id'],
      ['_thread', 'thread'],
      ['thread', 'thread'],
      ['_class', 'class'],
      ['class', 'class'],
      ['_method', 'method'],
      ['method', 'method'],
      ['_version', 'version'],
      ['version', 'version'],
      ['_error_code', 'error_code'],
      ['error_code', 'error_code'],
      ['_originating_bi_id', 'originating_bi_id'],
      ['originating_bi_id', 'originating_bi_id'],
      ['_business_identifiers', 'business_identifiers'],
      ['business_identifiers', 'business_identifiers'],
      ['_trace_id', 'trace_id'],
      ['trace_id', 'trace_id'],
      ['_span_id', 'span_id'],
      ['span_id', 'span_id'],
      ['_traceId', 'trace_id'],
      ['traceId', 'trace_id'],
      ['_spanId', 'span_id'],
      ['spanId', 'span_id']
    ];
    for (const [from, to] of mapKeys) {
      if (fields[from] !== undefined) {
        result[to] = fields[from];
      }
    }
    for (const [k, v] of Object.entries(fields)) {
      if (!mapKeys.some(([from]) => from === k)) {
        custom[k.startsWith('_') ? k.slice(1) : k] = v;
      }
    }
  }
  result.custom = custom;
  return result;
}
