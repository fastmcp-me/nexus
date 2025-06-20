/**
 * MCP protocol error handling integration
 */

import { McpError } from '@modelcontextprotocol/sdk/types.js';

import { BaseError, ErrorClassifier } from '../errors/index.js';

import {
  createMCPErrorResponse,
  createErrorMessage,
} from './error-messages.js';
import { logger, generateCorrelationId } from './logger.js';

/**
 * MCP Error codes based on JSON-RPC 2.0 specification
 */
export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // Custom application error codes (range -32000 to -32099)
  APPLICATION_ERROR: -32000,
  CONFIGURATION_ERROR: -32001,
  AUTHENTICATION_ERROR: -32002,
  RATE_LIMIT_ERROR: -32003,
  NETWORK_ERROR: -32004,
  VALIDATION_ERROR: -32005,
  TIMEOUT_ERROR: -32006,
  CIRCUIT_BREAKER_OPEN: -32007,
} as const;

export type MCPErrorCode =
  (typeof MCP_ERROR_CODES)[keyof typeof MCP_ERROR_CODES];

/**
 * MCP-compatible error class
 */
export class MCPApplicationError extends Error implements McpError {
  public readonly code: MCPErrorCode;
  public readonly data?: unknown;

  constructor(
    message: string,
    code: MCPErrorCode = MCP_ERROR_CODES.APPLICATION_ERROR,
    data?: unknown
  ) {
    super(message);
    this.name = 'MCPApplicationError';
    this.code = code;
    this.data = data;
  }
}

/**
 * Enhanced error handler for MCP protocol operations
 */
export class MCPErrorHandler {
  /**
   * Handle error and convert to MCP-compatible format
   */
  static handleError(
    error: unknown,
    context: {
      method?: string;
      requestId?: string;
      correlationId?: string;
      userId?: string;
    } = {}
  ): MCPApplicationError {
    const correlationId = context.correlationId || generateCorrelationId();

    // Classify the error
    const _classification = ErrorClassifier.classify(error);

    // Log the error with context
    logger.error('MCP operation failed', {
      error: error instanceof Error ? error.message : String(error),
      errorType: _classification.type,
      severity: _classification.severity,
      method: context.method,
      requestId: context.requestId,
      correlationId,
      userId: context.userId,
      isRetryable: _classification.isRetryable,
      suggestedAction: _classification.suggestedAction,
    });

    // Create user-friendly error message
    const errorMessage = createErrorMessage(error, {}, correlationId);

    // Map to appropriate MCP error code
    const mcpCode = this.mapToMCPErrorCode(error, _classification);

    // Create MCP error response data
    const mcpErrorData = createMCPErrorResponse(error, {}, correlationId);

    return new MCPApplicationError(errorMessage.message, mcpCode, {
      ...mcpErrorData.data,
      classification: {
        type: _classification.type,
        severity: _classification.severity,
        isRetryable: _classification.isRetryable,
        shouldLog: _classification.shouldLog,
      },
      context: {
        method: context.method,
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Map application errors to MCP error codes
   */
  private static mapToMCPErrorCode(
    error: unknown,
    _classification: ReturnType<typeof ErrorClassifier.classify>
  ): MCPErrorCode {
    if (error instanceof BaseError) {
      switch (error.constructor.name) {
        case 'ConfigurationError':
          return MCP_ERROR_CODES.CONFIGURATION_ERROR;
        case 'APIError':
          if (error.code === 'API_AUTHENTICATION') {
            return MCP_ERROR_CODES.AUTHENTICATION_ERROR;
          }
          if (error.code === 'API_RATE_LIMIT') {
            return MCP_ERROR_CODES.RATE_LIMIT_ERROR;
          }
          if (error.code === 'API_TIMEOUT') {
            return MCP_ERROR_CODES.TIMEOUT_ERROR;
          }
          return MCP_ERROR_CODES.APPLICATION_ERROR;
        case 'NetworkError':
          return MCP_ERROR_CODES.NETWORK_ERROR;
        case 'ValidationError':
          return MCP_ERROR_CODES.VALIDATION_ERROR;
        case 'MCPProtocolError':
          return MCP_ERROR_CODES.INVALID_REQUEST;
        default:
          return MCP_ERROR_CODES.APPLICATION_ERROR;
      }
    }

    // Handle standard JavaScript errors
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return MCP_ERROR_CODES.TIMEOUT_ERROR;
      }
      if (
        error.message.includes('network') ||
        error.message.includes('connection')
      ) {
        return MCP_ERROR_CODES.NETWORK_ERROR;
      }
      if (
        error.message.includes('validation') ||
        error.message.includes('invalid')
      ) {
        return MCP_ERROR_CODES.VALIDATION_ERROR;
      }
    }

    return MCP_ERROR_CODES.APPLICATION_ERROR;
  }

  /**
   * Wrap an async operation with MCP error handling
   */
  static async wrapOperation<T>(
    operation: () => Promise<T>,
    context: {
      method?: string;
      requestId?: string;
      correlationId?: string;
      userId?: string;
    } = {}
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.handleError(error, context);
    }
  }

  /**
   * Create a safe response for MCP clients
   */
  static createSafeResponse(
    error: unknown,
    context: {
      method?: string;
      requestId?: string;
      correlationId?: string;
      userId?: string;
    } = {}
  ): {
    content: Array<{ type: 'text'; text: string }>;
    isError: true;
  } {
    const mcpError = this.handleError(error, context);

    return {
      content: [
        {
          type: 'text',
          text: mcpError.message,
        },
      ],
      isError: true,
    };
  }

  /**
   * Log performance metrics for MCP operations
   */
  static logOperationMetrics(
    method: string,
    startTime: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ): void {
    const duration = Date.now() - startTime;

    logger.performance(`MCP operation ${method}`, duration, {
      method,
      success,
      duration,
      ...metadata,
    });
  }
}

/**
 * Decorator for MCP request handlers
 */
export function withMCPErrorHandling<T extends unknown[], R>(
  method: string,
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now();
    const correlationId = generateCorrelationId();

    try {
      logger.info(`MCP ${method} started`, { method, correlationId });

      const result = await MCPErrorHandler.wrapOperation(
        () => handler(...args),
        { method, correlationId }
      );

      MCPErrorHandler.logOperationMetrics(method, startTime, true);

      logger.info(`MCP ${method} completed`, {
        method,
        correlationId,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      MCPErrorHandler.logOperationMetrics(method, startTime, false, {
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-throw MCP errors as-is, they're already properly formatted
      if (error instanceof MCPApplicationError) {
        throw error;
      }

      // Convert other errors to MCP format
      throw MCPErrorHandler.handleError(error, { method, correlationId });
    }
  };
}

/**
 * Create a middleware for request context correlation
 */
export function createMCPContextMiddleware() {
  return <T extends { params?: { name?: string } }>(
    handler: (
      request: T,
      context: { correlationId: string }
    ) => Promise<unknown>
  ) => {
    return async (request: T): Promise<unknown> => {
      const correlationId = generateCorrelationId();
      const method = request.params?.name || 'unknown';

      return MCPErrorHandler.wrapOperation(
        () => handler(request, { correlationId }),
        { method, correlationId }
      );
    };
  };
}

/**
 * Validate MCP request parameters
 */
export function validateMCPRequest(
  request: unknown,
  schema: {
    required?: string[];
    properties?: Record<string, { type: string; required?: boolean }>;
  }
): void {
  if (!request || typeof request !== 'object') {
    throw new MCPApplicationError(
      'Invalid request format',
      MCP_ERROR_CODES.INVALID_REQUEST,
      { expected: 'object', received: typeof request }
    );
  }

  const requestObj = request as Record<string, unknown>;

  // Check required parameters
  if (schema.required) {
    for (const required of schema.required) {
      if (!(required in requestObj)) {
        throw new MCPApplicationError(
          `Missing required parameter: ${required}`,
          MCP_ERROR_CODES.INVALID_PARAMS,
          { missing: required, required: schema.required }
        );
      }
    }
  }

  // Validate parameter types
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in requestObj) {
        const value = requestObj[key];
        const expectedType = propSchema.type;
        const actualType = typeof value;

        if (actualType !== expectedType) {
          throw new MCPApplicationError(
            `Invalid parameter type for ${key}`,
            MCP_ERROR_CODES.INVALID_PARAMS,
            {
              parameter: key,
              expected: expectedType,
              received: actualType,
              value,
            }
          );
        }
      }
    }
  }
}

/**
 * Create error acknowledgment for bidirectional error handling
 */
export function createErrorAcknowledgment(
  originalError: MCPApplicationError,
  recovery?: {
    attempted: boolean;
    successful: boolean;
    strategy: string;
  }
): {
  acknowledged: true;
  originalError: {
    code: MCPErrorCode;
    message: string;
    correlationId?: string;
  };
  recovery?: typeof recovery;
  timestamp: string;
} {
  return {
    acknowledged: true,
    originalError: {
      code: originalError.code,
      message: originalError.message,
      correlationId: (originalError.data as Record<string, unknown>)
        ?.correlationId as string | undefined,
    },
    recovery,
    timestamp: new Date().toISOString(),
  };
}
