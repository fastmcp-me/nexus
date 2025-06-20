import { logger } from './logger.js';

export interface JSONValidationResult {
  success: boolean;
  data?: string;
  error?: string;
  sanitized?: boolean;
}

export interface SafeSerializationOptions {
  fallback?: boolean;
  sanitize?: boolean;
  maxDepth?: number;
  replacer?: (key: string, value: unknown) => unknown;
}

export class JSONValidator {
  private static readonly MAX_SAFE_DEPTH = 20;
  // eslint-disable-next-line no-control-regex
  private static readonly UNSAFE_CHARS_REGEX = /[\u0000-\u001F\u007F-\u009F]/g;
  private static readonly TRAILING_COMMA_REGEX = /,(\s*[}\]])/g;
  private static readonly UNESCAPED_QUOTES_REGEX = /(?<!\\)"/g;

  /**
   * Safely serialize an object to JSON with comprehensive error handling
   */
  static safeStringify(
    value: unknown,
    options: SafeSerializationOptions = {}
  ): JSONValidationResult {
    const { fallback = true, sanitize = true } = options;

    try {
      // Check if we need fallback serialization by detecting problematic types
      const needsFallback = this.needsFallbackSerialization(value, 0);

      if (needsFallback && fallback) {
        logger.debug('Using fallback serialization for problematic data types');
        return this.fallbackSerialization(value);
      }

      // First attempt: Standard JSON.stringify with circular reference detection
      const seen = new WeakSet();
      const circularReplacer = (key: string, val: unknown): unknown => {
        if (options.replacer) {
          val = options.replacer(key, val);
        }

        if (val === null || typeof val !== 'object') {
          return val;
        }

        if (seen.has(val)) {
          logger.warn('Circular reference detected in JSON serialization', {
            key,
          });
          if (fallback) {
            return '[Circular Reference]';
          } else {
            throw new Error('Circular reference detected');
          }
        }

        seen.add(val);
        return val;
      };

      let jsonString = JSON.stringify(value, circularReplacer, 2);

      if (sanitize && jsonString) {
        const originalLength = jsonString.length;
        jsonString = this.sanitizeJSON(jsonString);

        if (jsonString.length !== originalLength) {
          logger.debug('JSON sanitization applied', {
            originalLength,
            sanitizedLength: jsonString.length,
          });
        }
      }

      // Validate the result with round-trip test
      const validationResult = this.validateJSON(jsonString);
      if (!validationResult.success) {
        if (fallback) {
          logger.warn('JSON validation failed, using fallback serialization', {
            error: validationResult.error,
          });
          return this.fallbackSerialization(value);
        }
        return validationResult;
      }

      return {
        success: true,
        data: jsonString,
        sanitized: sanitize,
      };
    } catch (error) {
      logger.error('JSON serialization failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (fallback) {
        return this.fallbackSerialization(value);
      }

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown serialization error',
      };
    }
  }

  /**
   * Check if a value needs fallback serialization
   */
  private static needsFallbackSerialization(
    value: unknown,
    depth: number
  ): boolean {
    if (depth > this.MAX_SAFE_DEPTH) {
      return true;
    }

    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value === 'function') {
      return true;
    }

    if (typeof value === 'symbol') {
      return true;
    }

    if (value instanceof Error) {
      return true;
    }

    if (Array.isArray(value)) {
      return value.some(item =>
        this.needsFallbackSerialization(item, depth + 1)
      );
    }

    if (typeof value === 'object') {
      // Check for circular references using a simple depth approach
      try {
        const seen = new WeakSet();
        const checkCircular = (obj: unknown, currentDepth: number): boolean => {
          if (currentDepth > this.MAX_SAFE_DEPTH) {
            return true;
          }

          if (obj === null || typeof obj !== 'object') {
            return false;
          }

          if (seen.has(obj)) {
            return true;
          }

          seen.add(obj);

          for (const [_key, val] of Object.entries(
            obj as Record<string, unknown>
          )) {
            if (this.needsFallbackSerialization(val, depth + 1)) {
              return true;
            }
            if (
              typeof val === 'object' &&
              val !== null &&
              checkCircular(val, currentDepth + 1)
            ) {
              return true;
            }
          }

          return false;
        };

        return checkCircular(value, depth);
      } catch {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate JSON string with round-trip testing
   */
  static validateJSON(jsonString: string): JSONValidationResult {
    if (!jsonString || typeof jsonString !== 'string') {
      return {
        success: false,
        error: 'Invalid input: not a string',
      };
    }

    try {
      // Round-trip test: parse and re-stringify
      const parsed = JSON.parse(jsonString);

      return {
        success: true,
        data: parsed,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'JSON parsing failed',
      };
    }
  }

  /**
   * Sanitize JSON string to remove problematic characters and patterns
   */
  private static sanitizeJSON(jsonString: string): string {
    let sanitized = jsonString;

    // Remove unsafe control characters
    sanitized = sanitized.replace(this.UNSAFE_CHARS_REGEX, '');

    // Fix trailing commas
    sanitized = sanitized.replace(this.TRAILING_COMMA_REGEX, '$1');

    // Ensure proper Unicode handling
    try {
      // Test if string is valid UTF-8
      const buffer = Buffer.from(sanitized, 'utf8');
      sanitized = buffer.toString('utf8');
    } catch (error) {
      logger.warn('Unicode sanitization failed', { error });
    }

    return sanitized;
  }

  /**
   * Fallback serialization for problematic objects
   */
  private static fallbackSerialization(value: unknown): JSONValidationResult {
    try {
      // Create a safe representation of the object
      const safeObject = this.createSafeObject(value, 0);
      const jsonString = JSON.stringify(safeObject, null, 2);

      return {
        success: true,
        data: jsonString,
        sanitized: true,
      };
    } catch (error) {
      logger.error('Fallback serialization failed', { error });

      // Last resort: return error object as JSON
      const errorJson = JSON.stringify({
        error: 'Serialization failed',
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        data: errorJson,
        sanitized: true,
      };
    }
  }

  /**
   * Create a safe representation of an object for serialization
   */
  private static createSafeObject(obj: unknown, depth = 0): unknown {
    if (depth > this.MAX_SAFE_DEPTH) {
      return '[Max Depth Exceeded]';
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'function') {
      return '[Function]';
    }

    if (typeof obj === 'symbol') {
      return obj.toString();
    }

    if (typeof obj === 'bigint') {
      return obj.toString();
    }

    if (obj instanceof Date) {
      return obj.toISOString();
    }

    if (obj instanceof Error) {
      return {
        name: obj.name,
        message: obj.message,
        stack: obj.stack,
      };
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.createSafeObject(item, depth + 1));
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(
        obj as Record<string, unknown>
      )) {
        try {
          result[key] = this.createSafeObject(value, depth + 1);
        } catch {
          result[key] = '[Serialization Error]';
        }
      }
      return result;
    }

    return obj;
  }

  /**
   * Middleware function to wrap MCP responses with JSON validation
   */
  static wrapMCPResponse<T>(response: T): T {
    try {
      // Validate that the response can be serialized
      const validation = this.safeStringify(response, { fallback: false });

      if (!validation.success) {
        logger.error('MCP response validation failed', {
          error: validation.error,
          response: typeof response,
        });

        // Return a safe error response instead
        return {
          error: {
            code: -32603,
            message: 'Internal server error: Response serialization failed',
            data: validation.error,
          },
        } as T;
      }

      return response;
    } catch (error) {
      logger.error('MCP response wrapping failed', { error });

      return {
        error: {
          code: -32603,
          message: 'Internal server error: Response processing failed',
        },
      } as T;
    }
  }
}

/**
 * Utility function for safe JSON stringification
 */
export function safeStringify(
  value: unknown,
  options?: SafeSerializationOptions
): string {
  const result = JSONValidator.safeStringify(value, options);
  return result.success && result.data !== undefined
    ? result.data
    : '{"error": "Serialization failed"}';
}

/**
 * Utility function for JSON validation
 */
export function validateJSON(jsonString: string): JSONValidationResult {
  return JSONValidator.validateJSON(jsonString);
}
