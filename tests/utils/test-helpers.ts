import { expect, vi } from 'vitest';

/**
 * Common test utilities and helpers
 */

export const testHelpers = {
  /**
   * Wait for a specified amount of time
   */
  wait: (ms: number) =>
    new Promise(resolve => globalThis.setTimeout(resolve, ms)),

  /**
   * Create a mock function that can be used in tests
   */
  createMockFunction: <T extends (...args: unknown[]) => unknown>(
    implementation?: T
  ) => {
    const fn = vi.fn(implementation);
    return fn;
  },

  /**
   * Assert that an async function throws an error
   */
  expectToThrow: async (fn: () => Promise<unknown>, expectedError?: string) => {
    try {
      await fn();
      expect.fail('Expected function to throw');
    } catch (error) {
      if (expectedError) {
        expect((error as Error).message).toContain(expectedError);
      }
    }
  },

  /**
   * Setup MSW server for API mocking
   */
  setupMockServer: () => {
    // This will be implemented when MSW is properly configured
    return {
      listen: vi.fn(),
      close: vi.fn(),
      resetHandlers: vi.fn(),
    };
  },
};
