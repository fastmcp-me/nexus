/**
 * Secure logging utilities that prevent sensitive data exposure using data-masking package
 */

import { masking } from 'data-masking';
import winston from 'winston';

/**
 * Options for data sanitization
 */
export interface SanitizeOptions {
  /** Character to use for masking (default: '*') */
  maskChar?: string;
  /** Number of characters to show at the start (default: 4) */
  showStart?: number;
  /** Number of characters to show at the end (default: 4) */
  showEnd?: number;
  /** Minimum length before masking is applied (default: 8) */
  minLength?: number;
  /** Additional field names to consider sensitive */
  additionalSensitiveFields?: string[];
}

/**
 * Default sanitization options
 */
const DEFAULT_SANITIZE_OPTIONS: Required<SanitizeOptions> = {
  maskChar: '*',
  showStart: 4,
  showEnd: 4,
  minLength: 8,
  additionalSensitiveFields: [],
};

/**
 * Masks a sensitive string value using data-masking package
 */
export function maskSensitiveValue(
  value: string,
  options: SanitizeOptions = {}
): string {
  const opts = { ...DEFAULT_SANITIZE_OPTIONS, ...options };

  if (value.length <= opts.minLength) {
    return opts.maskChar.repeat(value.length);
  }

  return masking(
    value,
    opts.showStart,
    value.length - opts.showEnd,
    opts.maskChar
  );
}

/**
 * Field names that should be considered sensitive
 */
const SENSITIVE_FIELD_NAMES = new Set([
  'password',
  'apikey',
  'api_key',
  'apiKey',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'secret',
  'privateKey',
  'private_key',
  'openRouterApiKey',
  'authorization',
  'auth',
  'credentials',
  'credential',
  'key',
]);

/**
 * Checks if a field name should be considered sensitive
 */
function isSensitiveFieldName(
  fieldName: string,
  additionalFields: string[] = []
): boolean {
  const normalizedFieldName = fieldName.toLowerCase().replace(/[_-]/g, '');

  // Check additional fields first (exact match)
  for (const additional of additionalFields) {
    const normalizedAdditional = additional.toLowerCase().replace(/[_-]/g, '');
    if (
      normalizedFieldName === normalizedAdditional ||
      normalizedFieldName.includes(normalizedAdditional)
    ) {
      return true;
    }
  }

  // Check built-in sensitive field names
  for (const sensitive of SENSITIVE_FIELD_NAMES) {
    if (
      normalizedFieldName.includes(sensitive.toLowerCase().replace(/[_-]/g, ''))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Sanitizes an object by masking sensitive field values
 */
export function sanitizeObject(
  obj: unknown,
  options: SanitizeOptions = {},
  visited = new WeakSet()
): unknown {
  const opts = { ...DEFAULT_SANITIZE_OPTIONS, ...options };

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Only mask strings that look like sensitive data
    if (obj.length > 20 && /^[a-zA-Z0-9_-]+$/.test(obj)) {
      return masking(obj, 4, obj.length - 4, '*');
    }
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // Handle circular references
  if (visited.has(obj as object)) {
    return '[Circular]';
  }
  visited.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, options, visited));
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveFieldName(key, opts.additionalSensitiveFields)) {
      if (typeof value === 'string') {
        // Check if this is an additional sensitive field (use [REDACTED])
        const isAdditionalField = opts.additionalSensitiveFields.some(field => {
          const normalizedFieldName = key.toLowerCase().replace(/[_-]/g, '');
          const normalizedAdditional = field.toLowerCase().replace(/[_-]/g, '');
          return (
            normalizedFieldName === normalizedAdditional ||
            normalizedFieldName.includes(normalizedAdditional)
          );
        });

        if (isAdditionalField) {
          sanitized[key] = '[REDACTED]';
        } else if (value.length <= 10) {
          // For short sensitive strings, use [REDACTED] instead of pattern masking
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = maskSensitiveValue(value, opts);
        }
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else {
      sanitized[key] = sanitizeObject(value, options, visited);
    }
  }

  return sanitized;
}

/**
 * Sanitizes a string by masking sensitive patterns using data-masking
 */
export function sanitizeString(
  text: string,
  options: SanitizeOptions = {}
): string {
  const opts = { ...DEFAULT_SANITIZE_OPTIONS, ...options };

  // Simple pattern matching for common sensitive patterns
  return text
    .replace(/sk-[a-zA-Z0-9_-]+/g, match =>
      masking(match, opts.showStart, match.length - opts.showEnd, opts.maskChar)
    )
    .replace(
      /Bearer\s+[a-zA-Z0-9_-]+/gi,
      match => masking(match, 7, match.length - opts.showEnd, opts.maskChar) // Show "Bearer "
    )
    .replace(
      /https?:\/\/[^:]+:[^@]+@[^/\s]+/g,
      match => masking(match, 8, match.length - 8, opts.maskChar) // Show protocol
    )
    .replace(/\b[a-zA-Z0-9_-]{25,}\b/g, match =>
      masking(match, opts.showStart, match.length - opts.showEnd, opts.maskChar)
    );
}

/**
 * Creates a safe version of an error for logging
 */
export function sanitizeError(
  error: Error,
  options: SanitizeOptions = {}
): {
  name: string;
  message: string;
  stack?: string;
  [key: string]: unknown;
} {
  const sanitized: {
    name: string;
    message: string;
    stack?: string;
    [key: string]: unknown;
  } = {
    name: error.name,
    message: sanitizeString(error.message, options),
  };

  if (error.stack) {
    sanitized.stack = sanitizeString(error.stack, options);
  }

  // Include other enumerable properties
  for (const [key, value] of Object.entries(error)) {
    if (key !== 'name' && key !== 'message' && key !== 'stack') {
      sanitized[key] = sanitizeObject(value, options);
    }
  }

  return sanitized;
}

/**
 * Logger wrapper that automatically sanitizes sensitive data
 */
export class SecureLogger {
  private options: SanitizeOptions;
  private logger: winston.Logger;

  constructor(
    options: SanitizeOptions = {},
    logger: winston.Logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [new winston.transports.Console()],
    })
  ) {
    this.options = options;
    this.logger = logger;
  }

  /**
   * Sanitizes any arguments before logging
   */
  private sanitizeArgs(args: unknown[]): unknown[] {
    return args.map(arg => {
      if (arg instanceof Error) {
        return sanitizeError(arg, this.options);
      }
      return sanitizeObject(arg, this.options);
    });
  }

  /**
   * Log an error with sanitization
   */
  error(...args: unknown[]): void {
    const sanitized = this.sanitizeArgs(args);
    // Call logger with first argument as message, rest as meta
    this.logger.error(String(sanitized[0] || ''), ...sanitized.slice(1));
  }

  /**
   * Log a warning with sanitization
   */
  warn(...args: unknown[]): void {
    const sanitized = this.sanitizeArgs(args);
    this.logger.warn(String(sanitized[0] || ''), ...sanitized.slice(1));
  }

  /**
   * Log info with sanitization
   */
  info(...args: unknown[]): void {
    const sanitized = this.sanitizeArgs(args);
    this.logger.info(String(sanitized[0] || ''), ...sanitized.slice(1));
  }

  /**
   * Log debug information with sanitization
   */
  debug(...args: unknown[]): void {
    const sanitized = this.sanitizeArgs(args);
    this.logger.debug(String(sanitized[0] || ''), ...sanitized.slice(1));
  }

  /**
   * Log verbose information with sanitization
   */
  verbose(...args: unknown[]): void {
    const sanitized = this.sanitizeArgs(args);
    this.logger.verbose(String(sanitized[0] || ''), ...sanitized.slice(1));
  }
}

/**
 * Default secure logger instance
 */
export const secureLogger = new SecureLogger();

/**
 * Create a secure logger with custom options
 */
export function createSecureLogger(
  options: SanitizeOptions,
  logger?: winston.Logger
): SecureLogger {
  return new SecureLogger(options, logger);
}
