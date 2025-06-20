/**
 * Error recovery and retry mechanisms with exponential backoff and circuit breaker patterns
 */

import { NetworkError, APIError } from '../errors/index.js';

import { logger } from './logger.js';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Jitter factor (0-1) to randomize delays */
  jitter: number;
  /** Custom condition to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback for retry events */
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: 0.1,
  isRetryable: error => isDefaultRetryable(error),
};

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in milliseconds to wait before transitioning to half-open */
  resetTimeout: number;
  /** Number of successful calls in half-open state before closing */
  successThreshold: number;
  /** Time window in milliseconds for failure counting */
  monitoringWindow: number;
  /** Callback for state changes */
  onStateChange?: (state: CircuitBreakerState, error?: unknown) => void;
}

/**
 * Default circuit breaker options
 */
const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeout: 60000,
  successThreshold: 3,
  monitoringWindow: 60000,
};

/**
 * Circuit breaker metrics
 */
interface CircuitBreakerMetrics {
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  stateChanges: Array<{ state: CircuitBreakerState; timestamp: number }>;
}

/**
 * Timeout configuration
 */
export interface TimeoutOptions {
  /** Timeout in milliseconds */
  timeout: number;
  /** Custom abort signal */
  abortSignal?: globalThis.AbortSignal;
  /** Callback when timeout occurs */
  onTimeout?: () => void;
}

/**
 * Default timeout options
 */
const DEFAULT_TIMEOUT_OPTIONS: TimeoutOptions = {
  timeout: 30000,
};

/**
 * Fallback configuration
 */
export interface FallbackOptions<T> {
  /** Fallback value or function */
  fallback: T | (() => T | Promise<T>);
  /** Condition to trigger fallback */
  shouldFallback?: (error: unknown) => boolean;
  /** Callback when fallback is used */
  onFallback?: (error: unknown) => void;
}

/**
 * Check if error is retryable by default
 */
function isDefaultRetryable(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }

  if (error instanceof APIError) {
    // Retry on 5xx errors and rate limits
    if (!error.statusCode) return true;
    return error.statusCode >= 500 || error.statusCode === 429;
  }

  // Retry on timeout errors
  if (error instanceof Error && error.message.includes('timeout')) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay =
    options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);
  const clampedDelay = Math.min(exponentialDelay, options.maxDelay);

  // Add jitter to prevent thundering herd
  const jitterAmount = clampedDelay * options.jitter;
  const jitter = (Math.random() - 0.5) * 2 * jitterAmount;

  return Math.max(0, clampedDelay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry decorator function
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      const result = await operation();

      // Log successful retry if not first attempt
      if (attempt > 1) {
        logger.info('Operation succeeded after retry', {
          attempt,
          totalAttempts: config.maxAttempts,
        });
      }

      return result;
    } catch (error) {
      lastError = error;

      logger.warn('Operation failed, checking retry eligibility', {
        attempt,
        totalAttempts: config.maxAttempts,
        error: error instanceof Error ? error.message : String(error),
      });

      // Check if we should retry
      if (attempt === config.maxAttempts || !config.isRetryable!(error)) {
        break;
      }

      // Call retry callback
      config.onRetry?.(attempt, error);

      // Calculate and wait for delay
      const delay = calculateDelay(attempt, config);

      logger.info('Retrying operation after delay', {
        attempt,
        delay,
        nextAttempt: attempt + 1,
      });

      await sleep(delay);
    }
  }

  logger.error('Operation failed after all retry attempts', {
    totalAttempts: config.maxAttempts,
    lastError:
      lastError instanceof Error ? lastError.message : String(lastError),
  });

  throw lastError;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state = CircuitBreakerState.CLOSED;
  private options: CircuitBreakerOptions;
  private metrics: CircuitBreakerMetrics = {
    failures: 0,
    successes: 0,
    lastFailureTime: 0,
    lastSuccessTime: 0,
    stateChanges: [],
  };

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitBreakerState.HALF_OPEN);
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.metrics.successes++;
    this.metrics.lastSuccessTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.metrics.successes >= this.options.successThreshold) {
        this.transitionTo(CircuitBreakerState.CLOSED);
        this.resetMetrics();
      }
    }

    logger.debug('Circuit breaker success', {
      state: this.state,
      successes: this.metrics.successes,
      failures: this.metrics.failures,
    });
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: unknown): void {
    this.metrics.failures++;
    this.metrics.lastFailureTime = Date.now();

    if (
      this.state === CircuitBreakerState.CLOSED ||
      this.state === CircuitBreakerState.HALF_OPEN
    ) {
      if (this.metrics.failures >= this.options.failureThreshold) {
        this.transitionTo(CircuitBreakerState.OPEN, error);
      }
    }

    logger.warn('Circuit breaker failure', {
      state: this.state,
      failures: this.metrics.failures,
      threshold: this.options.failureThreshold,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * Check if circuit breaker should attempt reset
   */
  private shouldAttemptReset(): boolean {
    const timeSinceLastFailure = Date.now() - this.metrics.lastFailureTime;
    return timeSinceLastFailure >= this.options.resetTimeout;
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitBreakerState, error?: unknown): void {
    const oldState = this.state;
    this.state = newState;

    this.metrics.stateChanges.push({
      state: newState,
      timestamp: Date.now(),
    });

    logger.info('Circuit breaker state change', {
      oldState,
      newState,
      failures: this.metrics.failures,
      successes: this.metrics.successes,
    });

    this.options.onStateChange?.(newState, error);

    if (newState === CircuitBreakerState.CLOSED) {
      this.metrics.successes = 0;
    }
  }

  /**
   * Reset metrics
   */
  private resetMetrics(): void {
    this.metrics.failures = 0;
    this.metrics.successes = 0;
    this.metrics.lastFailureTime = 0;
    this.metrics.lastSuccessTime = 0;
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get current metrics
   */
  getMetrics(): Readonly<CircuitBreakerMetrics> {
    return { ...this.metrics };
  }

  /**
   * Force reset circuit breaker
   */
  reset(): void {
    this.transitionTo(CircuitBreakerState.CLOSED);
    this.resetMetrics();
  }
}

/**
 * Add timeout to async operation
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  options: Partial<TimeoutOptions> = {}
): Promise<T> {
  const config = { ...DEFAULT_TIMEOUT_OPTIONS, ...options };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    config.onTimeout?.();
    controller.abort();
  }, config.timeout);

  try {
    // Use external abort signal if provided, otherwise use timeout signal
    if (config.abortSignal) {
      config.abortSignal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
    }

    const result = await operation();
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    if (controller.signal.aborted) {
      throw new NetworkError('Operation timed out', {
        timeout: config.timeout,
        code: 'NETWORK_TIMEOUT',
      });
    }

    throw error;
  }
}

/**
 * Add fallback to operation
 */
export async function withFallback<T>(
  operation: () => Promise<T>,
  options: FallbackOptions<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!options.shouldFallback || options.shouldFallback(error)) {
      options.onFallback?.(error);

      logger.info('Using fallback due to error', {
        error: error instanceof Error ? error.message : String(error),
      });

      if (typeof options.fallback === 'function') {
        return await (options.fallback as () => T | Promise<T>)();
      } else {
        return options.fallback;
      }
    }

    throw error;
  }
}

/**
 * Combine multiple abort signals
 */
function _combineAbortSignals(
  ...signals: globalThis.AbortSignal[]
): globalThis.AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }

    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return controller.signal;
}

/**
 * Create a resilient operation with retry, circuit breaker, timeout, and fallback
 */
export function createResilientOperation<T>(config: {
  retry?: Partial<RetryOptions>;
  circuitBreaker?: Partial<CircuitBreakerOptions>;
  timeout?: Partial<TimeoutOptions>;
  fallback?: FallbackOptions<T>;
}) {
  const circuitBreaker = config.circuitBreaker
    ? new CircuitBreaker(config.circuitBreaker)
    : null;

  return async (operation: () => Promise<T>): Promise<T> => {
    const wrappedOperation = async () => {
      let finalOperation = operation;

      // Wrap with timeout if configured
      if (config.timeout) {
        finalOperation = () => withTimeout(operation, config.timeout);
      }

      // Wrap with circuit breaker if configured
      if (circuitBreaker) {
        finalOperation = () => circuitBreaker.execute(finalOperation);
      }

      return finalOperation();
    };

    // Wrap with retry if configured
    const resilientOperation = config.retry
      ? () => withRetry(wrappedOperation, config.retry)
      : wrappedOperation;

    // Wrap with fallback if configured
    if (config.fallback) {
      return withFallback(resilientOperation, config.fallback);
    }

    return resilientOperation();
  };
}
