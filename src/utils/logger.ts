export enum LogLevel {
  DEBUG = 5,
  INFO = 4,
  WARN = 3,
  ERROR = 2,
  FATAL = 1,
  NONE = 0,
}

const LOG_LEVEL = logLevelFromString(process.env.LOG_LEVEL || 'INFO');

function logLevelFromString(level: string): LogLevel {
  switch (level.toUpperCase()) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    case 'FATAL':
      return LogLevel.FATAL;
    case 'NONE':
      return LogLevel.NONE;
    default:
      return LogLevel.INFO;
  }
}

function levelToString(level: LogLevel): string {
  switch (level) {
    case LogLevel.DEBUG:
      return 'DEBUG';
    case LogLevel.INFO:
      return 'INFO';
    case LogLevel.WARN:
      return 'WARN';
    case LogLevel.ERROR:
      return 'ERROR';
    case LogLevel.FATAL:
      return 'FATAL';
    default:
      return 'INFO';
  }
}

function formatTimestamp(date: Date): string {
  const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
  const pad3 = (n: number) => (n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n));

  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('-') + 'T' + [
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join(':') + '.' + pad3(date.getMilliseconds());
}

function formatFields(fields?: Record<string, unknown>): string {
  if (!fields || Object.keys(fields).length === 0) {
    return '';
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    normalized[key.startsWith('_') ? key.slice(1) : key] = value;
  }

  if (Object.keys(normalized).length === 0) {
    return '';
  }

  return ` ${JSON.stringify(normalized)}`;
}

function writeLog(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  if (level > LOG_LEVEL) {
    return;
  }

  const line = `[${formatTimestamp(new Date())}] [${levelToString(level)}] ${message}${formatFields(fields)}`;
  // Stdio MCP uses stdout for protocol messages; logs must go to stderr.
  console.error(line);
}

export function logInfo(message: string, additionalFields?: Record<string, unknown>): void {
  writeLog(LogLevel.INFO, message, additionalFields);
}

export function logError(
  message: string,
  error?: unknown,
  additionalFields?: Record<string, unknown>
): void {
  const fields: Record<string, unknown> = { ...additionalFields };

  if (error) {
    if (error instanceof Error) {
      fields.error_message = error.message;
      if (error.stack) {
        fields.error_stack = error.stack;
      }
    } else {
      fields.error_message = String(error);
    }
  }

  writeLog(LogLevel.ERROR, message, fields);
}

export function logWarning(message: string, additionalFields?: Record<string, unknown>): void {
  writeLog(LogLevel.WARN, message, additionalFields);
}

export function logDebug(message: string, additionalFields?: Record<string, unknown>): void {
  writeLog(LogLevel.DEBUG, message, additionalFields);
}

export function logFatal(message: string, additionalFields?: Record<string, unknown>): void {
  writeLog(LogLevel.FATAL, message, additionalFields);
}
