import { z } from 'zod';

import type { PerplexityModelId } from '../types/openrouter';

/**
 * Supported Perplexity models for search operations
 */
export const SUPPORTED_MODELS: PerplexityModelId[] = [
  'perplexity/llama-3.1-sonar-small-128k-online',
  'perplexity/llama-3.1-sonar-large-128k-online',
  'perplexity/llama-3.1-sonar-huge-128k-online',
];

/**
 * Zod schema for search tool input validation
 */
export const SearchToolInputSchema = z.object({
  /**
   * Search query string (required, non-empty)
   */
  query: z
    .string()
    .min(1, 'Query cannot be empty')
    .max(2000, 'Query too long (max 2000 characters)')
    .describe('The search query to process'),

  /**
   * Model selection (optional, defaults to small model)
   */
  model: z
    .enum([
      'perplexity/llama-3.1-sonar-small-128k-online',
      'perplexity/llama-3.1-sonar-large-128k-online',
      'perplexity/llama-3.1-sonar-huge-128k-online',
    ])
    .default('perplexity/llama-3.1-sonar-small-128k-online')
    .describe('Perplexity model to use for search'),

  /**
   * Maximum tokens for response (optional, with reasonable bounds)
   */
  maxTokens: z
    .number()
    .int()
    .min(1, 'maxTokens must be at least 1')
    .max(4000, 'maxTokens cannot exceed 4000')
    .default(1000)
    .describe('Maximum number of tokens in the response'),

  /**
   * Temperature for response generation (optional, 0-2 range)
   */
  temperature: z
    .number()
    .min(0, 'Temperature must be at least 0')
    .max(2, 'Temperature cannot exceed 2')
    .default(0.7)
    .describe(
      'Controls randomness in the response (0 = deterministic, 2 = very random)'
    ),
});

/**
 * TypeScript type for validated search tool input
 */
export type SearchToolInput = z.infer<typeof SearchToolInputSchema>;

/**
 * Validation function for search tool inputs
 */
export function validateSearchInput(input: unknown): SearchToolInput {
  return SearchToolInputSchema.parse(input);
}
