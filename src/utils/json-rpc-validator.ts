import { logger } from './logger.js';

/**
 * JSON-RPC 2.0 specification types
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown[] | Record<string, unknown>;
  id?: string | number | null;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: JsonRpcError;
  id: string | number | null;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcResponse
  | JsonRpcNotification;

/**
 * Validation result for JSON-RPC messages
 */
export interface JsonRpcValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  messageType?: 'request' | 'response' | 'notification';
  method?: string;
  id?: string | number | null;
}

/**
 * Standard JSON-RPC error codes
 */
export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Reserved for implementation-defined server-errors
  SERVER_ERROR_MIN: -32099,
  SERVER_ERROR_MAX: -32000,
} as const;

/**
 * JSON-RPC 2.0 compliance validator
 */
export class JsonRpcValidator {
  /**
   * Validate a JSON-RPC message according to the 2.0 specification
   */
  static validateMessage(message: unknown): JsonRpcValidationResult {
    const result: JsonRpcValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    if (!message || typeof message !== 'object') {
      result.valid = false;
      result.errors.push('Message must be an object');
      return result;
    }

    const msg = message as Record<string, unknown>;

    // Check jsonrpc version
    if (msg.jsonrpc !== '2.0') {
      result.valid = false;
      result.errors.push('Missing or invalid jsonrpc version (must be "2.0")');
    }

    // Determine message type and validate accordingly
    if ('method' in msg) {
      if ('id' in msg) {
        // Request
        result.messageType = 'request';
        result.method = msg.method as string;
        result.id = msg.id as string | number | null;
        this.validateRequest(msg, result);
      } else {
        // Notification
        result.messageType = 'notification';
        result.method = msg.method as string;
        this.validateNotification(msg, result);
      }
    } else if ('result' in msg || 'error' in msg) {
      // Response
      result.messageType = 'response';
      result.id = msg.id as string | number | null;
      this.validateResponse(msg, result);
    } else {
      result.valid = false;
      result.errors.push(
        'Message must contain either "method" (request/notification) or "result"/"error" (response)'
      );
    }

    // Log validation result
    logger.responseValidation(
      'schema_validation',
      result.valid ? 'passed' : 'failed',
      {
        method: result.method,
        requestId: result.id?.toString(),
        validationErrors: result.errors,
      }
    );

    return result;
  }

  /**
   * Validate JSON-RPC request
   */
  private static validateRequest(
    msg: Record<string, unknown>,
    result: JsonRpcValidationResult
  ): void {
    // Method validation
    if (typeof msg.method !== 'string') {
      result.valid = false;
      result.errors.push('Method must be a string');
    } else if (msg.method.startsWith('rpc.') && msg.method !== 'rpc.discover') {
      result.warnings.push('Method names beginning with "rpc." are reserved');
    }

    // ID validation
    if ('id' in msg) {
      const id = msg.id;
      if (id !== null && typeof id !== 'string' && typeof id !== 'number') {
        result.valid = false;
        result.errors.push('ID must be a string, number, or null');
      }
    }

    // Params validation
    if ('params' in msg) {
      const params = msg.params;
      if (
        params !== undefined &&
        !Array.isArray(params) &&
        (typeof params !== 'object' || params === null)
      ) {
        result.valid = false;
        result.errors.push('Params must be an array, object, or undefined');
      }
    }
  }

  /**
   * Validate JSON-RPC response
   */
  private static validateResponse(
    msg: Record<string, unknown>,
    result: JsonRpcValidationResult
  ): void {
    // ID validation (required for responses)
    if (!('id' in msg)) {
      result.valid = false;
      result.errors.push('Response must contain an ID');
    } else {
      const id = msg.id;
      if (id !== null && typeof id !== 'string' && typeof id !== 'number') {
        result.valid = false;
        result.errors.push('ID must be a string, number, or null');
      }
    }

    // Result/Error validation
    const hasResult = 'result' in msg;
    const hasError = 'error' in msg;

    if (hasResult && hasError) {
      result.valid = false;
      result.errors.push('Response cannot contain both "result" and "error"');
    } else if (!hasResult && !hasError) {
      result.valid = false;
      result.errors.push('Response must contain either "result" or "error"');
    }

    // Error object validation
    if (hasError) {
      this.validateError(msg.error, result);
    }
  }

  /**
   * Validate JSON-RPC notification
   */
  private static validateNotification(
    msg: Record<string, unknown>,
    result: JsonRpcValidationResult
  ): void {
    // Method validation
    if (typeof msg.method !== 'string') {
      result.valid = false;
      result.errors.push('Method must be a string');
    } else if (msg.method.startsWith('rpc.')) {
      result.warnings.push('Method names beginning with "rpc." are reserved');
    }

    // ID validation (notifications must not have ID)
    if ('id' in msg) {
      result.valid = false;
      result.errors.push('Notifications must not contain an ID');
    }

    // Params validation
    if ('params' in msg) {
      const params = msg.params;
      if (
        params !== undefined &&
        !Array.isArray(params) &&
        (typeof params !== 'object' || params === null)
      ) {
        result.valid = false;
        result.errors.push('Params must be an array, object, or undefined');
      }
    }
  }

  /**
   * Validate JSON-RPC error object
   */
  private static validateError(
    error: unknown,
    result: JsonRpcValidationResult
  ): void {
    if (!error || typeof error !== 'object') {
      result.valid = false;
      result.errors.push('Error must be an object');
      return;
    }

    const err = error as Record<string, unknown>;

    // Code validation
    if (typeof err.code !== 'number') {
      result.valid = false;
      result.errors.push('Error code must be a number');
    } else if (!Number.isInteger(err.code)) {
      result.valid = false;
      result.errors.push('Error code must be an integer');
    }

    // Message validation
    if (typeof err.message !== 'string') {
      result.valid = false;
      result.errors.push('Error message must be a string');
    }

    // Data validation (optional)
    // Data can be any type, so no validation needed
  }

  /**
   * Create a compliant JSON-RPC error response
   */
  static createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): JsonRpcResponse {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      error: {
        code,
        message,
        ...(data !== undefined && { data }),
      },
      id,
    };

    logger.jsonRpc('error', undefined, {
      id: id ?? undefined,
      error: response.error,
    });

    return response;
  }

  /**
   * Create a compliant JSON-RPC success response
   */
  static createSuccessResponse(
    id: string | number | null,
    result: unknown
  ): JsonRpcResponse {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      result,
      id,
    };

    logger.jsonRpc('response', undefined, {
      id: id ?? undefined,
      responseSize: JSON.stringify(result).length,
    });

    return response;
  }

  /**
   * Validate and sanitize a JSON-RPC response before transmission
   */
  static validateAndSanitizeResponse(response: unknown): JsonRpcResponse {
    const startTime = Date.now();

    try {
      // First validate the response structure
      const validation = this.validateMessage(response);

      if (!validation.valid) {
        logger.responseValidation('compliance_check', 'failed', {
          validationErrors: validation.errors,
          duration: Date.now() - startTime,
        });

        // Return a compliant error response
        return this.createErrorResponse(
          validation.id || null,
          JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
          'Invalid response format',
          { validationErrors: validation.errors }
        );
      }

      if (validation.warnings.length > 0) {
        logger.responseValidation('compliance_check', 'warning', {
          validationErrors: validation.warnings,
          duration: Date.now() - startTime,
        });
      }

      logger.responseValidation('compliance_check', 'passed', {
        method: validation.method,
        requestId: validation.id?.toString(),
        duration: Date.now() - startTime,
      });

      return response as JsonRpcResponse;
    } catch (error) {
      logger.responseValidation('compliance_check', 'failed', {
        validationErrors: [
          error instanceof Error ? error.message : String(error),
        ],
        duration: Date.now() - startTime,
      });

      // Return a fallback error response
      return this.createErrorResponse(
        null,
        JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        'Response validation failed'
      );
    }
  }

  /**
   * Validate MCP-specific JSON-RPC extensions
   */
  static validateMcpExtensions(
    message: JsonRpcMessage
  ): JsonRpcValidationResult {
    const result: JsonRpcValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // MCP uses specific method patterns
    if ('method' in message) {
      const method = message.method;

      // Check for MCP method patterns
      const mcpMethods = [
        'initialize',
        'initialized',
        'ping',
        'shutdown',
        'tools/list',
        'tools/call',
        'resources/list',
        'resources/read',
        'resources/subscribe',
        'resources/unsubscribe',
        'prompts/list',
        'prompts/get',
        'completion/complete',
        'roots/list',
        'sampling/createMessage',
      ];

      const isKnownMcpMethod = mcpMethods.some(
        mcpMethod => method === mcpMethod || method.startsWith(mcpMethod + '/')
      );

      if (!isKnownMcpMethod && !method.startsWith('notifications/')) {
        result.warnings.push(`Unknown MCP method: ${method}`);
      }
    }

    return result;
  }
}

/**
 * Pre-transmission validation with round-trip testing
 */
export function validatePreTransmission(response: unknown): {
  valid: boolean;
  sanitizedResponse?: JsonRpcResponse;
  errors: string[];
} {
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    // Step 1: Basic structure validation
    const structureValidation = JsonRpcValidator.validateMessage(response);
    if (!structureValidation.valid) {
      errors.push(...structureValidation.errors);
    }

    // Step 2: Sanitize and validate the response
    const sanitizedResponse =
      JsonRpcValidator.validateAndSanitizeResponse(response);

    // Step 3: Round-trip testing - serialize and deserialize
    const serialized = JSON.stringify(sanitizedResponse);
    let deserialized: unknown;

    try {
      deserialized = JSON.parse(serialized);
    } catch (parseError) {
      errors.push(
        `Round-trip test failed: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
      logger.responseValidation('pre_serialization', 'failed', {
        validationErrors: errors,
        duration: Date.now() - startTime,
      });
      return { valid: false, errors };
    }

    // Step 4: Validate the deserialized response matches structure
    const roundTripValidation = JsonRpcValidator.validateMessage(deserialized);
    if (!roundTripValidation.valid) {
      errors.push(
        `Round-trip validation failed: ${roundTripValidation.errors.join(', ')}`
      );
    }

    // Step 5: Deep equality check (basic)
    try {
      const reserializedAfterRoundTrip = JSON.stringify(deserialized);
      if (serialized !== reserializedAfterRoundTrip) {
        errors.push(
          'Round-trip test failed: serialized data does not match after deserialization'
        );
      }
    } catch (error) {
      errors.push(
        `Round-trip comparison failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const valid = errors.length === 0;

    logger.responseValidation(
      'pre_serialization',
      valid ? 'passed' : 'failed',
      {
        validationErrors: valid ? undefined : errors,
        duration: Date.now() - startTime,
        responseSize: serialized.length,
      }
    );

    return {
      valid,
      sanitizedResponse: valid ? sanitizedResponse : undefined,
      errors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Pre-transmission validation error: ${errorMessage}`);

    logger.responseValidation('pre_serialization', 'failed', {
      validationErrors: errors,
      duration: Date.now() - startTime,
    });

    return { valid: false, errors };
  }
}

/**
 * Response validation middleware for MCP servers
 */
export function createResponseValidationMiddleware() {
  return (response: unknown): JsonRpcResponse => {
    const startTime = Date.now();

    // Perform pre-transmission validation with round-trip testing
    const validation = validatePreTransmission(response);

    if (!validation.valid) {
      logger.responseValidation('pre_serialization', 'failed', {
        validationErrors: validation.errors,
        duration: Date.now() - startTime,
      });

      // Return a compliant error response
      return JsonRpcValidator.createErrorResponse(
        null,
        JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        'Pre-transmission validation failed',
        { validationErrors: validation.errors }
      );
    }

    logger.responseValidation('pre_serialization', 'passed', {
      duration: Date.now() - startTime,
      responseSize: JSON.stringify(validation.sanitizedResponse).length,
    });

    return validation.sanitizedResponse!;
  };
}
