import { ConfigSchema } from './types';

// URL is a global in Node.js environments
declare const URL: typeof globalThis.URL;

/**
 * Validates that a value is a non-empty string
 */
function validateNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return 'Must be a string';
  }
  if (value.trim().length === 0) {
    return 'Cannot be empty';
  }
  return null;
}

/**
 * Validates that a value is a valid API key format
 */
function validateApiKey(value: unknown): string | null {
  const stringError = validateNonEmptyString(value);
  if (stringError) return stringError;

  const apiKey = value as string;

  // Basic API key format validation - should be at least 20 characters
  if (apiKey.length < 20) {
    return 'API key appears to be too short (minimum 20 characters)';
  }

  // Check for common API key patterns
  if (!/^[a-zA-Z0-9_-]+$/.test(apiKey)) {
    return 'API key contains invalid characters (only alphanumeric, underscore, and dash allowed)';
  }

  return null;
}

/**
 * Validates that a value is a positive integer
 */
function validatePositiveInteger(value: unknown): string | null {
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      return 'Must be a valid number';
    }
    value = parsed;
  }

  if (typeof value !== 'number') {
    return 'Must be a number';
  }

  if (!Number.isInteger(value)) {
    return 'Must be an integer';
  }

  if (value <= 0) {
    return 'Must be a positive number';
  }

  return null;
}

/**
 * Validates that a value is a valid log level
 */
function validateLogLevel(value: unknown): string | null {
  const validLevels = ['error', 'warn', 'info', 'debug', 'silly'];

  if (typeof value !== 'string') {
    return 'Must be a string';
  }

  if (!validLevels.includes(value.toLowerCase())) {
    return `Must be one of: ${validLevels.join(', ')}`;
  }

  return null;
}

/**
 * Validates that a value is a valid URL
 */
function validateUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return 'Must be a string';
  }

  try {
    new URL(value);
    return null;
  } catch {
    return 'Must be a valid URL';
  }
}

/**
 * Validates that a value is a valid Perplexity model identifier
 */
function validateModel(value: unknown): string | null {
  const stringError = validateNonEmptyString(value);
  if (stringError) return stringError;

  const model = value as string;
  const validModels = [
    'perplexity/llama-3.1-sonar-small-128k-online',
    'perplexity/llama-3.1-sonar-large-128k-online',
    'perplexity/llama-3.1-sonar-huge-128k-online',
  ];

  if (!validModels.includes(model)) {
    return `Must be one of: ${validModels.join(', ')}`;
  }

  return null;
}

/**
 * Configuration schema defining all environment variables and their validation rules
 */
export const CONFIG_SCHEMA: ConfigSchema[] = [
  {
    field: 'openRouterApiKey',
    envVar: ['OPENROUTER_API_KEY', 'OPENROUTER_KEY'],
    required: true,
    validator: validateApiKey,
    description: 'OpenRouter API key for authentication (required)',
  },
  {
    field: 'defaultModel',
    envVar: 'OPENROUTER_DEFAULT_MODEL',
    required: false,
    defaultValue: 'perplexity/llama-3.1-sonar-small-128k-online',
    validator: validateModel,
    description: 'Default Perplexity model to use for search operations',
  },
  {
    field: 'timeoutMs',
    envVar: 'OPENROUTER_TIMEOUT_MS',
    required: false,
    defaultValue: 30000,
    validator: validatePositiveInteger,
    description: 'Request timeout in milliseconds (default: 30000)',
  },
  {
    field: 'logLevel',
    envVar: 'LOG_LEVEL',
    required: false,
    defaultValue: 'info',
    validator: validateLogLevel,
    description:
      'Log level for the application (error, warn, info, debug, silly)',
  },
  {
    field: 'baseUrl',
    envVar: 'OPENROUTER_BASE_URL',
    required: false,
    defaultValue: 'https://openrouter.ai/api/v1',
    validator: validateUrl,
    description:
      'Base URL for OpenRouter API (default: https://openrouter.ai/api/v1)',
  },
];

/**
 * Get the schema definition for a specific field
 */
export function getSchemaForField(
  field: keyof import('./types').EnvironmentConfig
): ConfigSchema | undefined {
  return CONFIG_SCHEMA.find(schema => schema.field === field);
}

/**
 * Get all required fields from the schema
 */
export function getRequiredFields(): ConfigSchema[] {
  return CONFIG_SCHEMA.filter(schema => schema.required);
}

/**
 * Get all optional fields from the schema
 */
export function getOptionalFields(): ConfigSchema[] {
  return CONFIG_SCHEMA.filter(schema => !schema.required);
}
