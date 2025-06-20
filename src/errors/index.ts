/**
 * Custom error types and error classification system for the MCP server
 */

/**
 * Base error interface with standard properties
 */
export interface BaseErrorDetails {
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, unknown>;
  timestamp: string;
  correlationId?: string;
}

/**
 * Base error class that all custom errors extend
 */
export abstract class BaseError extends Error {
  public readonly code: string;
  public readonly severity: BaseErrorDetails['severity'];
  public readonly context: Record<string, unknown>;
  public readonly timestamp: string;
  public readonly correlationId?: string;

  constructor(message: string, details: Partial<BaseErrorDetails> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = details.code || this.getDefaultCode();
    this.severity = details.severity || this.getDefaultSeverity();
    this.context = details.context || {};
    this.timestamp = details.timestamp || new Date().toISOString();
    this.correlationId = details.correlationId;

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  protected abstract getDefaultCode(): string;
  protected abstract getDefaultSeverity(): BaseErrorDetails['severity'];

  /**
   * Serialize error for logging and transmission
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      stack: this.stack,
    };
  }
}

/**
 * API-related errors (external service failures)
 */
export class APIError extends BaseError {
  public readonly statusCode?: number;
  public readonly response?: unknown;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      response?: unknown;
    } & Partial<BaseErrorDetails> = {}
  ) {
    super(message, options);
    this.statusCode = options.statusCode;
    this.response = options.response;
  }

  protected getDefaultCode(): string {
    return 'API_ERROR';
  }

  protected getDefaultSeverity(): BaseErrorDetails['severity'] {
    return 'medium';
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends BaseError {
  public readonly configPath?: string;
  public readonly expectedType?: string;

  constructor(
    message: string,
    options: {
      configPath?: string;
      expectedType?: string;
    } & Partial<BaseErrorDetails> = {}
  ) {
    super(message, options);
    this.configPath = options.configPath;
    this.expectedType = options.expectedType;
  }

  protected getDefaultCode(): string {
    return 'CONFIG_ERROR';
  }

  protected getDefaultSeverity(): BaseErrorDetails['severity'] {
    return 'high';
  }
}

/**
 * Validation errors for input/output data
 */
export class ValidationError extends BaseError {
  public readonly field?: string;
  public readonly value?: unknown;
  public readonly constraints?: string[];

  constructor(
    message: string,
    options: {
      field?: string;
      value?: unknown;
      constraints?: string[];
    } & Partial<BaseErrorDetails> = {}
  ) {
    super(message, options);
    this.field = options.field;
    this.value = options.value;
    this.constraints = options.constraints;
  }

  protected getDefaultCode(): string {
    return 'VALIDATION_ERROR';
  }

  protected getDefaultSeverity(): BaseErrorDetails['severity'] {
    return 'medium';
  }
}

/**
 * MCP protocol-specific errors
 */
export class MCPProtocolError extends BaseError {
  public readonly method?: string;
  public readonly protocolVersion?: string;

  constructor(
    message: string,
    options: {
      method?: string;
      protocolVersion?: string;
    } & Partial<BaseErrorDetails> = {}
  ) {
    super(message, options);
    this.method = options.method;
    this.protocolVersion = options.protocolVersion;
  }

  protected getDefaultCode(): string {
    return 'MCP_PROTOCOL_ERROR';
  }

  protected getDefaultSeverity(): BaseErrorDetails['severity'] {
    return 'high';
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends BaseError {
  public readonly url?: string;
  public readonly timeout?: number;
  public readonly retryAttempt?: number;

  constructor(
    message: string,
    options: {
      url?: string;
      timeout?: number;
      retryAttempt?: number;
    } & Partial<BaseErrorDetails> = {}
  ) {
    super(message, options);
    this.url = options.url;
    this.timeout = options.timeout;
    this.retryAttempt = options.retryAttempt;
  }

  protected getDefaultCode(): string {
    return 'NETWORK_ERROR';
  }

  protected getDefaultSeverity(): BaseErrorDetails['severity'] {
    return 'medium';
  }
}

/**
 * Error classification utility
 */
export class ErrorClassifier {
  /**
   * Classify an error and determine handling strategy
   */
  static classify(error: unknown): {
    type: string;
    isRetryable: boolean;
    shouldLog: boolean;
    severity: BaseErrorDetails['severity'];
    suggestedAction: string;
  } {
    if (error instanceof BaseError) {
      return {
        type: error.constructor.name,
        isRetryable: this.isRetryable(error),
        shouldLog: true,
        severity: error.severity,
        suggestedAction: this.getSuggestedAction(error),
      };
    }

    // Handle standard JavaScript errors
    if (error instanceof Error) {
      return {
        type: error.constructor.name,
        isRetryable: false,
        shouldLog: true,
        severity: 'medium',
        suggestedAction: 'Check application logs for details',
      };
    }

    // Handle non-Error objects
    return {
      type: 'UnknownError',
      isRetryable: false,
      shouldLog: true,
      severity: 'medium',
      suggestedAction: 'Contact support with error details',
    };
  }

  private static isRetryable(error: BaseError): boolean {
    if (error instanceof NetworkError) {
      return true;
    }
    if (error instanceof APIError) {
      // Retry on 5xx errors and rate limits
      return (
        !error.statusCode || error.statusCode >= 500 || error.statusCode === 429
      );
    }
    return false;
  }

  private static getSuggestedAction(error: BaseError): string {
    if (error instanceof ConfigurationError) {
      return `Check configuration at ${error.configPath || 'application settings'}`;
    }
    if (error instanceof ValidationError) {
      return `Verify input for field: ${error.field || 'unknown field'}`;
    }
    if (error instanceof APIError) {
      return 'Check API service status and credentials';
    }
    if (error instanceof NetworkError) {
      return 'Check network connectivity and try again';
    }
    if (error instanceof MCPProtocolError) {
      return 'Check MCP client compatibility and protocol version';
    }
    return 'Review error details and contact support if needed';
  }
}

/**
 * Error code constants
 */
export const ERROR_CODES = {
  // API Errors
  API_TIMEOUT: 'API_TIMEOUT',
  API_RATE_LIMIT: 'API_RATE_LIMIT',
  API_AUTHENTICATION: 'API_AUTHENTICATION',
  API_SERVER_ERROR: 'API_SERVER_ERROR',

  // Configuration Errors
  CONFIG_MISSING: 'CONFIG_MISSING',
  CONFIG_INVALID: 'CONFIG_INVALID',
  CONFIG_TYPE_MISMATCH: 'CONFIG_TYPE_MISMATCH',

  // Validation Errors
  VALIDATION_REQUIRED: 'VALIDATION_REQUIRED',
  VALIDATION_FORMAT: 'VALIDATION_FORMAT',
  VALIDATION_RANGE: 'VALIDATION_RANGE',

  // Network Errors
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_CONNECTION: 'NETWORK_CONNECTION',
  NETWORK_DNS: 'NETWORK_DNS',

  // MCP Protocol Errors
  MCP_INVALID_REQUEST: 'MCP_INVALID_REQUEST',
  MCP_METHOD_NOT_FOUND: 'MCP_METHOD_NOT_FOUND',
  MCP_PROTOCOL_VERSION: 'MCP_PROTOCOL_VERSION',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
