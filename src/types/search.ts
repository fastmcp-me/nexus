import type { ChatCompletionResponse, Usage } from './openrouter';

/**
 * Source information for search results
 */
export interface SearchSource {
  /** URL of the source */
  url: string;
  /** Title of the source */
  title: string;
  /** Brief description or snippet */
  description?: string;
}

/**
 * Metadata about the search operation
 */
export interface SearchMetadata {
  /** Model used for search */
  model: string;
  /** Timestamp when search was performed */
  timestamp: number;
  /** Query that was searched */
  query: string;
  /** Temperature used for generation */
  temperature?: number;
  /** Maximum tokens requested */
  maxTokens?: number;
  /** Token usage information */
  usage?: Usage;
  /** Response time in milliseconds */
  responseTime?: number;
}

/**
 * Search result data structure
 */
export interface SearchResult {
  /** Main search result content */
  content: string;
  /** Confidence score (0-1) if available */
  confidence?: number;
  /** Sources cited in the result */
  sources: SearchSource[];
  /** Additional metadata */
  metadata: SearchMetadata;
}

/**
 * Complete search response structure
 */
export interface SearchResponse {
  /** Whether the search was successful */
  success: boolean;
  /** Search result data (if successful) */
  result?: SearchResult;
  /** Error message (if unsuccessful) */
  error?: string;
  /** Error type for better error handling */
  errorType?:
    | 'validation'
    | 'api'
    | 'network'
    | 'timeout'
    | 'rate_limit'
    | 'auth'
    | 'unknown';
  /** Request ID for tracking */
  requestId?: string;
}

/**
 * Format a ChatCompletionResponse into a SearchResponse
 */
export function formatSearchResponse(
  apiResponse: ChatCompletionResponse,
  query: string,
  startTime: number,
  temperature?: number,
  maxTokens?: number
): SearchResponse {
  const endTime = Date.now();
  const responseTime = endTime - startTime;

  // Extract main content from the first choice
  const mainContent = apiResponse.choices[0]?.message?.content || '';

  // Extract sources from content (basic implementation)
  // Note: Perplexity models typically include sources in their responses
  const sources = extractSourcesFromContent(mainContent);

  const searchResult: SearchResult = {
    content: mainContent,
    sources,
    metadata: {
      model: apiResponse.model,
      timestamp: endTime,
      query,
      temperature,
      maxTokens,
      usage: apiResponse.usage,
      responseTime,
    },
  };

  return {
    success: true,
    result: searchResult,
    requestId: apiResponse.id,
  };
}

/**
 * Create an error SearchResponse
 */
export function createErrorResponse(
  error: string,
  errorType: SearchResponse['errorType'] = 'unknown',
  requestId?: string
): SearchResponse {
  return {
    success: false,
    error,
    errorType,
    requestId,
  };
}

/**
 * Extract source information from content
 * Basic implementation - in practice, Perplexity models provide structured source info
 */
function extractSourcesFromContent(content: string): SearchSource[] {
  const sources: SearchSource[] = [];

  // Look for URLs in the content
  const urlRegex = /https?:\/\/[^\s\]]+/g;
  const urls = content.match(urlRegex) || [];

  // Create basic source objects
  urls.forEach((url, index) => {
    sources.push({
      url,
      title: `Source ${index + 1}`,
      description: `Reference from ${new globalThis.URL(url).hostname}`,
    });
  });

  return sources;
}

/**
 * Validate that a SearchResponse is well-formed
 */
export function validateSearchResponse(response: SearchResponse): boolean {
  if (!response.success && !response.error) {
    return false;
  }

  if (response.success && !response.result) {
    return false;
  }

  if (response.result) {
    if (!response.result.content || !response.result.metadata) {
      return false;
    }

    if (!Array.isArray(response.result.sources)) {
      return false;
    }
  }

  return true;
}
