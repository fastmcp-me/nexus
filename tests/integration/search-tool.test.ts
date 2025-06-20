import { describe, it, expect, beforeEach, vi } from 'vitest';

import { SearchTool } from '../../src/tools/search';
import { validateSearchResponse } from '../../src/types/search';

// Mock OpenRouter API responses
const mockApiKey = 'sk-or-test-integration-key';

// Mock the fetch function for integration testing
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Search Tool Integration', () => {
  let searchTool: SearchTool;

  beforeEach(() => {
    vi.clearAllMocks();
    searchTool = new SearchTool(mockApiKey);
  });

  describe('End-to-End Search Flow', () => {
    it('should complete full search workflow successfully', async () => {
      // Mock successful API response
      const mockApiResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-test-123',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'perplexity/llama-3.1-sonar-small-128k-online',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: `Based on the latest information, artificial intelligence (AI) continues to evolve rapidly in 2024.

Key developments include:
- Advanced language models with improved reasoning capabilities
- Integration of AI in healthcare, education, and business processes
- Enhanced safety measures and ethical AI frameworks

Sources:
https://example.com/ai-news-2024
https://techjournal.org/ai-developments

This information reflects the current state of AI technology and its applications across various industries.`,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 120,
            total_tokens: 135,
          },
        }),
      };

      mockFetch.mockResolvedValue(mockApiResponse);

      const searchInput = {
        query: 'What are the latest developments in AI technology?',
        model: 'perplexity/llama-3.1-sonar-small-128k-online' as const,
        maxTokens: 1500,
        temperature: 0.7,
      };

      const result = await searchTool.search(searchInput);

      // Validate the response structure
      expect(validateSearchResponse(result)).toBe(true);
      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      const searchResult = result.result!;

      // Verify content and sources
      expect(searchResult.content).toContain('artificial intelligence');
      expect(searchResult.sources).toHaveLength(2);
      expect(searchResult.sources[0].url).toBe(
        'https://example.com/ai-news-2024'
      );
      expect(searchResult.sources[1].url).toBe(
        'https://techjournal.org/ai-developments'
      );

      // Verify metadata
      expect(searchResult.metadata.query).toBe(searchInput.query);
      expect(searchResult.metadata.model).toBe(searchInput.model);
      expect(searchResult.metadata.temperature).toBe(searchInput.temperature);
      expect(searchResult.metadata.maxTokens).toBe(searchInput.maxTokens);
      expect(searchResult.metadata.usage?.total_tokens).toBe(135);
      expect(searchResult.metadata.responseTime).toBeGreaterThan(0);

      // Verify API call was made correctly
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            model: searchInput.model,
            messages: [
              {
                role: 'user',
                content: searchInput.query,
              },
            ],
            temperature: searchInput.temperature,
            max_tokens: searchInput.maxTokens,
            stream: false,
          }),
        })
      );
    });

    it('should handle API error responses correctly', async () => {
      // Mock API error response
      const mockErrorResponse = {
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: 401,
            message: 'Invalid authentication credentials',
            type: 'authentication_error',
          },
        }),
      };

      mockFetch.mockResolvedValue(mockErrorResponse);

      const searchInput = {
        query: 'test query',
      };

      const result = await searchTool.search(searchInput);

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('auth');
      expect(result.error).toBe('Authentication failed: Invalid API key');
    });

    it('should handle rate limiting correctly', async () => {
      // Mock rate limit response
      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        headers: {
          get: (header: string) => (header === 'retry-after' ? '60' : null),
        },
        json: vi.fn().mockResolvedValue({
          error: {
            code: 429,
            message: 'Rate limit exceeded',
            type: 'rate_limit_error',
          },
        }),
      };

      mockFetch.mockResolvedValue(mockRateLimitResponse);

      const result = await searchTool.search({ query: 'test query' });

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('rate_limit');
      expect(result.error).toContain('Rate limit exceeded');
    }, 10000);

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network connection failed'));

      const result = await searchTool.search({ query: 'test query' });

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('network');
      expect(result.error).toContain('Network error');
    }, 10000);

    it('should validate input parameters end-to-end', async () => {
      const invalidInputs = [
        { query: '' }, // Empty query
        { query: 'test', maxTokens: 0 }, // Invalid maxTokens
        { query: 'test', temperature: 3 }, // Invalid temperature
        { query: 'test', model: 'invalid-model' }, // Invalid model
      ];

      for (const input of invalidInputs) {
        const result = await searchTool.search(input);
        expect(result.success).toBe(false);
        expect(result.errorType).toBe('validation');
      }
    });

    it('should extract sources correctly from various content formats', async () => {
      const contentWithSources = `Here's information about climate change:

Climate change refers to long-term shifts in global temperatures and weather patterns.
According to recent studies, temperatures have risen by 1.1°C since the late 1800s.
Source: https://climate.nasa.gov/latest-research

Additional information can be found at:
- https://www.ipcc.ch/reports
- https://unfccc.int/climate-action

For more details, see the comprehensive report at https://www.nature.com/climate-science`;

      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'test-sources',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'perplexity/llama-3.1-sonar-small-128k-online',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: contentWithSources,
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 50, total_tokens: 60 },
        }),
      };

      mockFetch.mockResolvedValue(mockResponse);

      const result = await searchTool.search({
        query: 'climate change research',
      });

      expect(result.success).toBe(true);
      expect(result.result?.sources).toHaveLength(4);

      const urls = result.result?.sources.map(s => s.url) || [];
      expect(urls).toContain('https://climate.nasa.gov/latest-research');
      expect(urls).toContain('https://www.ipcc.ch/reports');
      expect(urls).toContain('https://unfccc.int/climate-action');
      expect(urls).toContain('https://www.nature.com/climate-science');
    });
  });

  describe('Connection Testing', () => {
    it('should test connection successfully', async () => {
      const mockModelsResponse = {
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'perplexity/llama-3.1-sonar-small-128k-online',
              name: 'Llama 3.1 Sonar Small',
            },
          ],
        }),
      };

      mockFetch.mockResolvedValue(mockModelsResponse);

      const connectionResult = await searchTool.testConnection();
      expect(connectionResult).toBe(true);
    });

    it('should handle connection test failures', async () => {
      mockFetch.mockRejectedValue(new Error('Connection timeout'));

      const connectionResult = await searchTool.testConnection();
      expect(connectionResult).toBe(false);
    }, 10000);
  });

  describe('Performance Testing', () => {
    it('should complete search within reasonable time', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'perf-test',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: 'perplexity/llama-3.1-sonar-small-128k-online',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Quick response for performance testing.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        }),
      };

      // Simulate a realistic network delay
      mockFetch.mockImplementation(
        () =>
          new Promise(resolve => setTimeout(() => resolve(mockResponse), 500))
      );

      const startTime = Date.now();
      const result = await searchTool.search({ query: 'performance test' });
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeGreaterThan(400); // At least the simulated delay
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(result.result?.metadata.responseTime).toBeGreaterThan(400);
    });
  });
});
