/**
 * Response caching with TTL (Time-To-Live) implementation
 * Provides in-memory caching for search responses to improve performance
 */

export interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** Timestamp when the entry was created */
  timestamp: number;
  /** TTL in milliseconds */
  ttl: number;
  /** Expiration timestamp (timestamp + ttl) */
  expiresAt: number;
}

export interface CacheStats {
  /** Total number of cache hits */
  hits: number;
  /** Total number of cache misses */
  misses: number;
  /** Current number of entries in cache */
  size: number;
  /** Maximum allowed cache size */
  maxSize: number;
  /** Cache hit ratio (hits / (hits + misses)) */
  hitRatio: number;
}

export interface CacheOptions {
  /** Default TTL in milliseconds (default: 5 minutes) */
  defaultTtl?: number;
  /** Maximum number of entries (default: 1000) */
  maxSize?: number;
  /** Cleanup interval in milliseconds (default: 1 minute) */
  cleanupInterval?: number;
}

/**
 * Thread-safe in-memory cache with TTL support
 */
export class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private stats = { hits: 0, misses: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cleanupTimer: any = null;

  private readonly defaultTtl: number;
  private readonly maxSize: number;
  private readonly cleanupInterval: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.defaultTtl || 5 * 60 * 1000; // 5 minutes
    this.maxSize = options.maxSize || 1000;
    this.cleanupInterval = options.cleanupInterval || 60 * 1000; // 1 minute

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Get a value from the cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if entry has expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache with optional TTL
   */
  set(key: string, value: T, ttl?: number): void {
    const now = Date.now();
    const actualTtl = ttl || this.defaultTtl;

    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      ttl: actualTtl,
      expiresAt: now + actualTtl,
    };

    // Enforce max size by removing oldest entries
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, entry);
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Get current cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRatio: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
    };
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Remove expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Destroy the cache and stop cleanup timer
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }

  /**
   * Start periodic cleanup of expired entries
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

  /**
   * Evict the oldest entry to make space
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

/**
 * Create a cache key from query parameters
 */
export function createCacheKey(params: Record<string, unknown>): string {
  // Sort keys for consistent cache keys
  const sortedKeys = Object.keys(params).sort();
  const keyParts = sortedKeys.map(
    key => `${key}:${JSON.stringify(params[key])}`
  );
  return keyParts.join('|');
}

/**
 * Global cache instance for search responses
 */
export const searchCache = new TTLCache<unknown>({
  defaultTtl: 5 * 60 * 1000, // 5 minutes
  maxSize: 500, // 500 search results
  cleanupInterval: 2 * 60 * 1000, // Cleanup every 2 minutes
});
