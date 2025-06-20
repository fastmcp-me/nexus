/**
 * Mock factories for OpenRouter API responses
 */

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
  };
  top_provider: {
    max_completion_tokens: number;
  };
}

export interface OpenRouterResponse {
  data: OpenRouterModel[];
}

export const mockOpenRouterModel = (
  overrides?: Partial<OpenRouterModel>
): OpenRouterModel => ({
  id: 'anthropic/claude-3-sonnet',
  name: 'Claude 3 Sonnet',
  description: 'A balanced AI model for various tasks',
  context_length: 200000,
  pricing: {
    prompt: '0.000003',
    completion: '0.000015',
  },
  top_provider: {
    max_completion_tokens: 4096,
  },
  ...overrides,
});

export const mockOpenRouterResponse = (
  models?: OpenRouterModel[]
): OpenRouterResponse => ({
  data: models || [
    mockOpenRouterModel(),
    mockOpenRouterModel({
      id: 'openai/gpt-4',
      name: 'GPT-4',
      description: 'Most capable GPT model',
    }),
  ],
});

export const mockOpenRouterError = {
  error: {
    code: 429,
    message: 'Rate limit exceeded',
    type: 'rate_limit_error',
  },
};
