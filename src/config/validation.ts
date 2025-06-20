import { CONFIG_SCHEMA } from './schema';
import {
  EnvironmentConfig,
  ConfigValidationResult,
  ConfigurationError,
  ConfigSchema,
} from './types';

/**
 * Gets the value from environment variables, supporting multiple variable names
 */
function getEnvValue(envVar: string | string[]): string | undefined {
  if (Array.isArray(envVar)) {
    // Try each environment variable name in order
    for (const varName of envVar) {
      const value = process.env[varName];
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }
  return process.env[envVar];
}

/**
 * Validates a single configuration field using its schema definition
 */
function validateField(
  schema: ConfigSchema,
  rawValue: string | undefined,
  errors: string[],
  warnings: string[]
): unknown {
  // Check if required field is missing
  if (schema.required && rawValue === undefined) {
    const envVarNames = Array.isArray(schema.envVar)
      ? schema.envVar.join(' or ')
      : schema.envVar;
    errors.push(`Required environment variable ${envVarNames} is not set`);
    return undefined;
  }

  // Use default value if not provided
  let value: unknown = rawValue;
  if (value === undefined && schema.defaultValue !== undefined) {
    value = schema.defaultValue;
    if (Array.isArray(schema.envVar)) {
      warnings.push(
        `Using default value for ${schema.field} (${schema.envVar.join(' or ')} not set)`
      );
    } else {
      warnings.push(
        `Using default value for ${schema.field} (${schema.envVar} not set)`
      );
    }
  }

  // Skip validation if value is still undefined (optional field without default)
  if (value === undefined) {
    return undefined;
  }

  // Run custom validator if provided
  if (schema.validator) {
    const validationError = schema.validator(value);
    if (validationError) {
      const envVarNames = Array.isArray(schema.envVar)
        ? schema.envVar.join(' or ')
        : schema.envVar;
      errors.push(`${envVarNames}: ${validationError}`);
      return undefined;
    }
  }

  // Convert string values to appropriate types for numeric fields
  if (schema.field === 'timeoutMs' && typeof value === 'string') {
    return parseInt(value, 10);
  }

  return value;
}

/**
 * Validates all environment variables according to the configuration schema
 */
export function validateConfiguration(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config: Partial<EnvironmentConfig> = {};

  // Validate each field in the schema
  for (const schema of CONFIG_SCHEMA) {
    const rawValue = getEnvValue(schema.envVar);
    const validatedValue = validateField(schema, rawValue, errors, warnings);

    if (validatedValue !== undefined) {
      (config as Record<string, unknown>)[schema.field] = validatedValue;
    }
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    config: isValid ? (config as EnvironmentConfig) : undefined,
    errors,
    warnings,
  };
}

/**
 * Validates configuration and throws an error if invalid
 */
export function validateConfigurationOrThrow(): EnvironmentConfig {
  const result = validateConfiguration();

  if (!result.isValid) {
    throw new ConfigurationError(
      'Configuration validation failed',
      result.errors,
      result.warnings
    );
  }

  return result.config!;
}

/**
 * Checks if a specific environment variable is set
 */
export function isEnvironmentVariableSet(envVar: string | string[]): boolean {
  return getEnvValue(envVar) !== undefined;
}

/**
 * Gets a human-readable summary of the configuration schema
 */
export function getConfigurationSummary(): string {
  const lines: string[] = [];

  lines.push('Environment Configuration:');
  lines.push('');

  // Required fields
  const requiredFields = CONFIG_SCHEMA.filter(schema => schema.required);
  if (requiredFields.length > 0) {
    lines.push('Required:');
    for (const schema of requiredFields) {
      const envVarNames = Array.isArray(schema.envVar)
        ? schema.envVar.join(' or ')
        : schema.envVar;
      lines.push(`  ${envVarNames}: ${schema.description}`);
    }
    lines.push('');
  }

  // Optional fields
  const optionalFields = CONFIG_SCHEMA.filter(schema => !schema.required);
  if (optionalFields.length > 0) {
    lines.push('Optional:');
    for (const schema of optionalFields) {
      const envVarNames = Array.isArray(schema.envVar)
        ? schema.envVar.join(' or ')
        : schema.envVar;
      const defaultInfo =
        schema.defaultValue !== undefined
          ? ` (default: ${schema.defaultValue})`
          : '';
      lines.push(`  ${envVarNames}: ${schema.description}${defaultInfo}`);
    }
  }

  return lines.join('\n');
}

/**
 * Validates configuration and returns a formatted error message if invalid
 */
export function getValidationErrorMessage(): string | null {
  const result = validateConfiguration();

  if (result.isValid) {
    return null;
  }

  const lines: string[] = [];
  lines.push('Configuration validation failed:');
  lines.push('');

  if (result.errors.length > 0) {
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
    lines.push('');
  }

  lines.push('Please check your environment variables and try again.');
  lines.push('');
  lines.push(getConfigurationSummary());

  return lines.join('\n');
}
