/**
 * Configuration types for the OpenRouter Search MCP server
 */

export interface EnvironmentConfig {
  /** OpenRouter API key (required) */
  openRouterApiKey: string;
  /** Default model for search operations */
  defaultModel?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Log level for the application */
  logLevel?: string;
  /** Base URL for OpenRouter API */
  baseUrl?: string;
  /** Default maximum tokens for responses */
  defaultMaxTokens?: number;
  /** Default temperature for response generation */
  defaultTemperature?: number;
  /** Default top_p parameter for nucleus sampling */
  defaultTopP?: number;
  /** Default frequency penalty to reduce repetition */
  defaultFrequencyPenalty?: number;
  /** Default presence penalty to encourage topic diversity */
  defaultPresencePenalty?: number;
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
  /** Maximum cache size (number of entries) */
  cacheMaxSize?: number;
  /** Enable/disable response caching */
  cacheEnabled?: boolean;
}

export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  isValid: boolean;
  /** The validated configuration object (only present if valid) */
  config?: EnvironmentConfig;
  /** Array of validation errors */
  errors: string[];
  /** Array of validation warnings */
  warnings: string[];
}

export interface ConfigSchema {
  /** Field name in the configuration */
  field: keyof EnvironmentConfig;
  /** Environment variable name */
  envVar: string | string[];
  /** Whether this field is required */
  required: boolean;
  /** Default value if not provided */
  defaultValue?: unknown;
  /** Validation function for the field */
  validator?: (value: unknown) => string | null;
  /** Description of the field for documentation */
  description: string;
}

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[],
    public readonly warnings: string[] = []
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
