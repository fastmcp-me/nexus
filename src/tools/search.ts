import winston from 'winston';

import {
  OpenRouterClient,
  OpenRouterApiError,
  AuthenticationError,
  RateLimitError,
  ServerError,
} from '../clients/openrouter';
import { validateSearchInput, type SearchToolInput } from '../schemas/search';
import type { ChatCompletionRequest } from '../types/openrouter';
import {
  formatSearchResponse,
  createErrorResponse,
  type SearchResponse,
} from '../types/search';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

/**
 * Core search tool implementation
 * Orchestrates input validation, API calls, and response formatting
 */
export class SearchTool {
  private client: OpenRouterClient;

  constructor(apiKey: string) {
    this.client = new OpenRouterClient({
      apiKey,
      userAgent: 'openrouter-search-mcp/1.0.0',
      timeout: 30000,
      maxRetries: 3,
    });
  }

  /**
   * Perform a search using the OpenRouter API
   * @param input - Raw input to validate and process
   * @returns Promise<SearchResponse> - Formatted search results
   */
  async search(input: unknown): Promise<SearchResponse> {
    const startTime = Date.now();
    let validatedInput: SearchToolInput;

    try {
      // Step 1: Validate input using Zod schemas
      validatedInput = validateSearchInput(input);
      logger.debug('Input validation successful', {
        query: validatedInput.query,
        model: validatedInput.model,
        maxTokens: validatedInput.maxTokens,
        temperature: validatedInput.temperature,
      });
    } catch (error) {
      logger.warn('Input validation failed', { error });
      return createErrorResponse(
        error instanceof Error ? error.message : 'Invalid input format',
        'validation'
      );
    }

    try {
      // Step 2: Prepare chat completion request
      const chatRequest: ChatCompletionRequest = {
        model: validatedInput.model,
        messages: [
          {
            role: 'user',
            content: validatedInput.query,
          },
        ],
        temperature: validatedInput.temperature,
        max_tokens: validatedInput.maxTokens,
        stream: false,
      };

      logger.info('Sending search request to OpenRouter', {
        model: validatedInput.model,
        query: validatedInput.query,
        temperature: validatedInput.temperature,
        maxTokens: validatedInput.maxTokens,
      });

      // Step 3: Call OpenRouter API
      const apiResponse = await this.client.chatCompletions(chatRequest);

      logger.info('Search request completed successfully', {
        requestId: apiResponse.id,
        model: apiResponse.model,
        tokensUsed: apiResponse.usage?.total_tokens,
        responseTime: Date.now() - startTime,
      });

      // Step 4: Format and return response
      return formatSearchResponse(
        apiResponse,
        validatedInput.query,
        startTime,
        validatedInput.temperature,
        validatedInput.maxTokens
      );
    } catch (error) {
      logger.error('Search request failed', {
        error,
        query: validatedInput.query,
      });

      // Step 5: Handle different error types
      if (error instanceof AuthenticationError) {
        return createErrorResponse(
          'Authentication failed: Invalid API key',
          'auth'
        );
      }

      if (error instanceof RateLimitError) {
        return createErrorResponse(
          `Rate limit exceeded${error.retryAfter ? ` (retry after ${error.retryAfter}s)` : ''}`,
          'rate_limit'
        );
      }

      if (error instanceof ServerError) {
        return createErrorResponse(
          'OpenRouter service temporarily unavailable',
          'api'
        );
      }

      if (error instanceof OpenRouterApiError) {
        return createErrorResponse(`API error: ${error.message}`, 'api');
      }

      // Handle timeout and network errors
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          return createErrorResponse(
            'Request timed out - please try again',
            'timeout'
          );
        }

        if (error.message.includes('Network error')) {
          return createErrorResponse(
            'Network error - please check your connection',
            'network'
          );
        }
      }

      // Generic error fallback
      return createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error occurred',
        'unknown'
      );
    }
  }

  /**
   * Test the connection to OpenRouter API
   * @returns Promise<boolean> - Whether connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      return await this.client.testConnection();
    } catch (error) {
      logger.error('Connection test failed', { error });
      return false;
    }
  }

  /**
   * Get client configuration info
   */
  getClientInfo(): { headers: Record<string, string>; baseUrl: string } {
    const headers = this.client.getHeaders();
    // Remove the API key from headers for security
    const safeHeaders = { ...headers };
    delete safeHeaders.Authorization;

    return {
      headers: safeHeaders,
      baseUrl: 'https://openrouter.ai/api/v1', // Default base URL
    };
  }
}

/**
 * Factory function to create a SearchTool instance
 * @param apiKey - OpenRouter API key
 * @returns SearchTool instance
 */
export function createSearchTool(apiKey: string): SearchTool {
  return new SearchTool(apiKey);
}

/**
 * Standalone search function for direct usage
 * @param query - Search query
 * @param apiKey - OpenRouter API key
 * @param options - Optional search parameters
 * @returns Promise<SearchResponse> - Search results
 */
export async function performSearch(
  query: string,
  apiKey: string,
  options: Partial<SearchToolInput> = {}
): Promise<SearchResponse> {
  const searchTool = createSearchTool(apiKey);
  return searchTool.search({
    query,
    ...options,
  });
}
