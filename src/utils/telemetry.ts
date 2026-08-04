import { NodeSDK } from '@opentelemetry/sdk-node';
import { detectResources, resourceFromAttributes } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { 
  trace, 
  context, 
  SpanStatusCode, 
  Span, 
  propagation,
  TraceFlags,
  ROOT_CONTEXT
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Service information
const SERVICE_NAME = process.env.SERVICE_NAME || 'simple-validator-mcp';
const SERVICE_VERSION = process.env.SERVICE_VERSION || 'local';

// Initialize OpenTelemetry SDK
let sdk: NodeSDK | null = null;
let tracer: ReturnType<typeof trace.getTracer> | null = null;

/**
 * Initialize OpenTelemetry SDK
 */
export function initializeTelemetry(): void {
  if (sdk) {
    console.log('OpenTelemetry SDK already initialized');
    return;
  }

  // Create resource with service metadata
  const resource = resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: SERVICE_NAME,
    [SEMRESATTRS_SERVICE_VERSION]: SERVICE_VERSION,
  });

  sdk = new NodeSDK({
    resource,
    // Note: In production, you would configure exporters here
    // For now, we're just using the SDK for context management
  });

  // Start the SDK
  sdk.start();
  console.log('OpenTelemetry SDK initialized');

  // Get tracer instance
  tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    sdk?.shutdown()
      .then(() => console.log('OpenTelemetry SDK shut down successfully'))
      .catch((error) => console.error('Error shutting down OpenTelemetry SDK', error));
  });
}

/**
 * Get the tracer instance
 */
export function getTracer(): ReturnType<typeof trace.getTracer> {
  if (!tracer) {
    initializeTelemetry();
    tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
  }
  return tracer;
}

/**
 * Get trace ID and span ID from current context
 */
export function getTraceContext(): { traceId: string; spanId: string } {
  const span = trace.getActiveSpan();
  
  if (span) {
    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }
  
  // Return empty strings if no active span
  return {
    traceId: '',
    spanId: '',
  };
}

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Search request headers for one matching `includePattern` while excluding
 * headers that also match `excludePattern`.  Express lowercases all header
 * names, so the patterns are tested against lowercase keys.
 *
 * Skips the W3C `traceparent` / `tracestate` headers so they don't
 * accidentally get picked up as a custom trace-id value.
 */
function findHeaderByPattern(
  req: Request,
  includePattern: RegExp,
  excludePattern?: RegExp,
): string | undefined {
  const skipHeaders = new Set(['traceparent', 'tracestate']);

  for (const [key, value] of Object.entries(req.headers)) {
    if (skipHeaders.has(key)) continue;
    if (!includePattern.test(key)) continue;
    if (excludePattern && excludePattern.test(key)) continue;

    const headerValue = Array.isArray(value) ? value[0] : value;
    if (headerValue) return headerValue;
  }
  return undefined;
}

/**
 * Express middleware to handle trace context propagation
 * Extracts trace-id and span-id from headers or generates new ones
 * Adds them to the response headers
 * Creates proper parent-child span relationships
 */
export function tracingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const tracer = getTracer();
    const propagator = new W3CTraceContextPropagator();
    
    const tenantId = req.headers['x-tenant-id'] || req.headers['tenant-id'] || '-';
    (req as any).tenantId = tenantId;

    let requestId = req.headers['X-Request-ID'] || req.headers['x-request-id'];
    if(!requestId) {
      requestId = generateRequestId();
      res.setHeader('X-Request-ID', requestId);
    }
    (req as any).requestId = requestId;
    (req as any).tenantId = tenantId;

    // Extract trace-id and span-id by searching headers for keywords (case-insensitive).
    // This matches varying conventions: X-B3-TraceId, x-trace-id, traceid, trace-id, etc.
    const customTraceId = findHeaderByPattern(req, /trace/i, /span/i);
    const customSpanId = findHeaderByPattern(req, /span/i);
    
    let parentContext = ROOT_CONTEXT;
    let traceId: string;
    let parentSpanId: string;
    
    // If custom trace headers are provided, use them to construct the trace context
    if (customTraceId || customSpanId) {
      traceId = customTraceId || generateTraceId();
      parentSpanId = customSpanId || generateSpanId();
      
      // Manually set the trace context using custom IDs
      // Create a traceparent header in W3C format: version-traceId-spanId-flags
      const traceparent = `00-${traceId.padEnd(32, '0').substring(0, 32)}-${parentSpanId.padEnd(16, '0').substring(0, 16)}-01`;
      
      // Extract context from the constructed traceparent header
      parentContext = propagator.extract(ROOT_CONTEXT, { traceparent }, {
        get(carrier, key) {
          return carrier[key];
        },
        keys(carrier) {
          return Object.keys(carrier);
        }
      });
    } else {
      // Try to extract from W3C Trace Context headers (traceparent, tracestate)
      parentContext = propagator.extract(ROOT_CONTEXT, req.headers, {
        get(carrier, key) {
          const value = carrier[key.toLowerCase()];
          return Array.isArray(value) ? value[0] : value;
        },
        keys(carrier) {
          return Object.keys(carrier);
        }
      });
      
      // Get trace ID from extracted context or generate new one
      const activeSpan = trace.getSpan(parentContext);
      if (activeSpan) {
        const spanContext = activeSpan.spanContext();
        if(customTraceId) {
          spanContext.traceId = customTraceId;
        }
        traceId = spanContext.traceId;
        parentSpanId = spanContext.spanId;
      } else {
        traceId = customTraceId || generateTraceId();
        parentSpanId = generateSpanId();
      }
    }
    
    // Store trace context in request for easy access throughout the request
    (req as any).traceId = traceId;
    (req as any).parentSpanId = parentSpanId;
    
    // Create a new span for this HTTP request (child of parent context)
    const span = tracer.startSpan(`${req.method} ${req.path}`, {
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
        'http.target': req.path,
        'http.host': req.hostname,
        'http.scheme': req.protocol,
        'http.user_agent': req.headers['user-agent'] || '',
      },
    }, parentContext);
    
    // Get the current span's ID (will be different from parent)
    const currentSpanContext = span.spanContext();
    currentSpanContext.traceId = traceId;
    const currentSpanId = currentSpanContext.spanId;
    
    // Store current span ID on request
    (req as any).spanId = currentSpanId;
    
    // Set trace context in OpenTelemetry context for the duration of this request
    const ctx = trace.setSpan(parentContext, span);

    // Track if span has been ended to prevent double-ending
    let spanEnded = false;
    
    // Helper function to safely end span
    const safeEndSpan = () => {
      if (!spanEnded && span.isRecording()) {
        try {
          span.end();
          spanEnded = true;
        } catch (error) {
          console.error('Error ending span:', error);
        }
      }
    };

    // Run the rest of the request in this context
    context.with(ctx, () => {
      try {
        (req as any).traceId = traceId;
        (req as any).spanId = currentSpanId;
        
        // Add trace IDs to response headers
        res.setHeader('trace-id', traceId);
        res.setHeader('span-id', currentSpanId);

        // Capture response status and end span
        const originalSend = res.send;
        res.send = function (body?: any): Response {
          try {
            span.setAttribute('http.status_code', res.statusCode);
            
            if (res.statusCode >= 400) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: `HTTP ${res.statusCode}`,
              });
            } else {
              span.setStatus({ code: SpanStatusCode.OK });
            }
          } catch (error) {
            console.error('Error setting span attributes:', error);
          } finally {
            safeEndSpan();
          }
          
          return originalSend.call(this, body);
        };

        // Handle errors and ensure span ends
        const originalEnd = res.end;
        res.end = function (...args: any[]): Response {
          safeEndSpan();
          return originalEnd.apply(this, args as any);
        };

        // Handle request errors/aborts
        req.on('error', (error) => {
          try {
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
          } catch (err) {
            console.error('Error recording exception to span:', err);
          } finally {
            safeEndSpan();
          }
        });

        req.on('close', () => {
          // Ensure span is ended if request is closed prematurely
          safeEndSpan();
        });

        next();
      } catch (error) {
        // If any error occurs in middleware setup, record it and end span
        try {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        } catch (err) {
          console.error('Error handling middleware error:', err);
        } finally {
          safeEndSpan();
        }
        throw error;
      }
    });
  };
}

/**
 * Generate a random trace ID (32 hex characters)
 * Compatible with W3C Trace Context format
 */
function generateTraceId(): string {
  // Generate 16 bytes (128 bits) as 32 hex characters
  return Array.from({ length: 16 }, () => 
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join('');
}

/**
 * Generate a random span ID (16 hex characters)
 * Compatible with W3C Trace Context format
 */
export function generateSpanId(): string {
  // Generate 8 bytes (64 bits) as 16 hex characters
  return Array.from({ length: 8 }, () => 
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join('');
}

/**
 * Create a child span for an operation
 */
export function createChildSpan(name: string, attributes?: Record<string, any>): Span {
  const tracer = getTracer();
  return tracer.startSpan(name, {
    attributes: attributes || {},
  });
}

/**
 * Run a function within a span context
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const span = createChildSpan(name, attributes);
  const ctx = trace.setSpan(context.active(), span);
  
  try {
    const result = await context.with(ctx, () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Get trace ID and span ID from request object
 */
export function getTraceContextFromRequest(req: any): { traceId: string; spanId: string } {
  return {
    traceId: req.traceId || '',
    spanId: req.spanId || '',
  };
}

/**
 * Create a child span for a specific operation within the current context
 * This ensures each operation has its own span ID while maintaining the same trace ID
 * 
 * Usage example:
 * ```typescript
 * const validationSpan = createOperationSpan('validate-json', {
 *   'validation.type': 'json-schema',
 *   'validation.file': 'user-schema.json'
 * });
 * 
 * try {
 *   // do validation work
 *   validationSpan.setStatus({ code: SpanStatusCode.OK });
 * } catch (error) {
 *   validationSpan.recordException(error);
 *   validationSpan.setStatus({ code: SpanStatusCode.ERROR });
 * } finally {
 *   validationSpan.end();
 * }
 * ```
 */
export function createOperationSpan(operationName: string, attributes?: Record<string, any>): Span {
  const tracer = getTracer();
  const currentContext = context.active();
  
  return tracer.startSpan(operationName, {
    attributes: attributes || {},
  }, currentContext);
}

