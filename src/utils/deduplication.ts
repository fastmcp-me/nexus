/**
 * Request deduplication for concurrent searches
 * Prevents duplicate requests from being sent to the API when identical requests are made simultaneously
 */

export interface PendingRequest<T> {
  /** The promise that will resolve when the request completes */
  promise: Promise<T>;
  /** Timestamp when the request was initiated */
  timestamp: number;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Cleanup function to remove the request from tracking */
  cleanup: () => void;
  /** Number of callers waiting for this request */
  waitingCallers: number;
}

export interface DeduplicationOptions {
  /** Default timeout for requests in milliseconds (default: 30 seconds) */
  defaultTimeout?: number;
  /** Maximum number of concurrent requests to track (default: 1000) */
  maxConcurrentRequests?: number;
  /** Cleanup interval for stuck requests in milliseconds (default: 5 minutes) */
  cleanupInterval?: number;
}

export interface DeduplicationStats {
  /** Number of requests currently in flight */
  pendingRequests: number;
  /** Total number of deduplicated requests (requests that were merged) */
  deduplicatedRequests: number;
  /** Total number of unique requests processed */
  uniqueRequests: number;
  /** Maximum number of concurrent requests tracked */
  maxConcurrentRequests: number;
  /** Deduplication ratio (deduplicated / total) */
  deduplicationRatio: number;
}

/**
 * Request deduplication manager using in-flight request tracking
 */
export class RequestDeduplicator<T> {
  private pendingRequests = new Map<string, PendingRequest<T>>();
  private stats = {
    deduplicatedRequests: 0,
    uniqueRequests: 0,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cleanupTimer: any = null;

  private readonly defaultTimeout: number;
  private readonly maxConcurrentRequests: number;
  private readonly cleanupInterval: number;

  constructor(options: DeduplicationOptions = {}) {
    this.defaultTimeout = options.defaultTimeout || 30000; // 30 seconds
    this.maxConcurrentRequests = options.maxConcurrentRequests || 1000;
    this.cleanupInterval = options.cleanupInterval || 5 * 60 * 1000; // 5 minutes

    // Start periodic cleanup of stuck requests
    this.startCleanup();
  }

  /**
   * Execute a request with deduplication
   * If an identical request is already in flight, returns the existing promise
   * Otherwise, executes the request function and tracks it
   */
  async execute<R extends T>(
    key: string,
    requestFn: () => Promise<R>,
    timeout?: number
  ): Promise<R> {
    // Check if this request is already in flight
    const existingRequest = this.pendingRequests.get(key);
    if (existingRequest) {
      // Increment waiting callers count
      existingRequest.waitingCallers++;
      this.stats.deduplicatedRequests++;

      try {
        // Wait for the existing request to complete
        const result = await existingRequest.promise;
        return result as R;
      } finally {
        // Decrement waiting callers count
        existingRequest.waitingCallers--;
      }
    }

    // Enforce max concurrent requests limit
    if (this.pendingRequests.size >= this.maxConcurrentRequests) {
      throw new Error(
        `Too many concurrent requests (max: ${this.maxConcurrentRequests})`
      );
    }

    // Create new request tracking
    const actualTimeout = timeout || this.defaultTimeout;
    const timestamp = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let timeoutHandle: any = null;
    let isCompleted = false;

    // Create cleanup function
    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      this.pendingRequests.delete(key);
    };

    // Create the request promise with timeout handling
    const requestPromise = new Promise<R>((resolve, reject) => {
      // Set up timeout
      timeoutHandle = setTimeout(() => {
        if (!isCompleted) {
          isCompleted = true;
          cleanup();
          reject(new Error(`Request timed out after ${actualTimeout}ms`));
        }
      }, actualTimeout);

      // Execute the actual request
      requestFn()
        .then(result => {
          if (!isCompleted) {
            isCompleted = true;
            cleanup();
            resolve(result);
          }
        })
        .catch(error => {
          if (!isCompleted) {
            isCompleted = true;
            cleanup();
            reject(error);
          }
        });
    });

    // Track the pending request
    const pendingRequest: PendingRequest<T> = {
      promise: requestPromise,
      timestamp,
      timeout: actualTimeout,
      cleanup,
      waitingCallers: 1, // Initial caller
    };

    this.pendingRequests.set(key, pendingRequest);
    this.stats.uniqueRequests++;

    try {
      const result = await requestPromise;
      return result;
    } catch (error) {
      // Ensure cleanup happens even on error
      cleanup();
      throw error;
    }
  }

  /**
   * Check if a request is currently in flight
   */
  isPending(key: string): boolean {
    return this.pendingRequests.has(key);
  }

  /**
   * Get the number of callers waiting for a specific request
   */
  getWaitingCallers(key: string): number {
    const request = this.pendingRequests.get(key);
    return request ? request.waitingCallers : 0;
  }

  /**
   * Cancel a pending request
   * This will cause all waiting callers to receive a cancellation error
   */
  cancel(key: string): boolean {
    const request = this.pendingRequests.get(key);
    if (!request) {
      return false;
    }

    request.cleanup();
    return true;
  }

  /**
   * Cancel all pending requests
   */
  cancelAll(): number {
    const cancelledCount = this.pendingRequests.size;

    for (const request of this.pendingRequests.values()) {
      request.cleanup();
    }

    return cancelledCount;
  }

  /**
   * Get current deduplication statistics
   */
  getStats(): DeduplicationStats {
    const totalRequests =
      this.stats.uniqueRequests + this.stats.deduplicatedRequests;

    return {
      pendingRequests: this.pendingRequests.size,
      deduplicatedRequests: this.stats.deduplicatedRequests,
      uniqueRequests: this.stats.uniqueRequests,
      maxConcurrentRequests: this.maxConcurrentRequests,
      deduplicationRatio:
        totalRequests > 0 ? this.stats.deduplicatedRequests / totalRequests : 0,
    };
  }

  /**
   * Get all pending request keys
   */
  getPendingKeys(): string[] {
    return Array.from(this.pendingRequests.keys());
  }

  /**
   * Clear statistics
   */
  clearStats(): void {
    this.stats.deduplicatedRequests = 0;
    this.stats.uniqueRequests = 0;
  }

  /**
   * Clean up stuck requests that have exceeded their timeout
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [, request] of this.pendingRequests.entries()) {
      const elapsedTime = now - request.timestamp;

      // Clean up requests that are stuck (exceeded timeout + grace period)
      if (elapsedTime > request.timeout + 5000) {
        // 5 second grace period
        request.cleanup();
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Destroy the deduplicator and clean up all resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.cancelAll();
    this.clearStats();
  }

  /**
   * Start periodic cleanup of stuck requests
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);

    // Prevent the timer from keeping the process alive
    if (this.cleanupTimer && typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }
}

/**
 * Create a request key from parameters for deduplication
 * This should generate the same key for identical requests
 */
export function createRequestKey(params: Record<string, unknown>): string {
  // Sort keys for consistent request keys
  const sortedKeys = Object.keys(params).sort();
  const keyParts = sortedKeys.map(
    key => `${key}:${JSON.stringify(params[key])}`
  );
  return `req:${keyParts.join('|')}`;
}

/**
 * Global request deduplicator instance for search requests
 */
export const searchDeduplicator = new RequestDeduplicator({
  defaultTimeout: 30000, // 30 seconds
  maxConcurrentRequests: 100, // 100 concurrent searches
  cleanupInterval: 2 * 60 * 1000, // Cleanup every 2 minutes
});
