import { EnvironmentConfig, ConfigurationError } from './types.js';
import { validateConfigurationOrThrow } from './validation.js';

/**
 * ConfigurationManager provides a singleton interface to access configuration values
 * loaded from environment variables. It validates configuration on initialization
 * and provides type-safe getters for all configuration fields.
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager | null = null;
  private readonly config: EnvironmentConfig;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config: EnvironmentConfig) {
    this.config = config;
  }

  /**
   * Get the singleton instance of ConfigurationManager
   * @throws {ConfigurationError} if configuration validation fails
   */
  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      try {
        const config = validateConfigurationOrThrow();
        ConfigurationManager.instance = new ConfigurationManager(config);
      } catch (error) {
        if (error instanceof ConfigurationError) {
          // Enhance error message with specific details
          const enhancedMessage = error.errors.join('; ');
          throw new ConfigurationError(
            enhancedMessage,
            error.errors,
            error.warnings
          );
        }
        throw error;
      }
    }
    return ConfigurationManager.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static reset(): void {
    ConfigurationManager.instance = null;
  }

  /**
   * Get the OpenRouter API key
   */
  public getApiKey(): string {
    return this.config.openRouterApiKey;
  }

  /**
   * Get a masked version of the API key for logging
   */
  public getMaskedApiKey(): string {
    const apiKey = this.config.openRouterApiKey;
    if (apiKey.length <= 10) {
      // For very short keys, show first 3 and last 3 characters
      return `${apiKey.substring(0, 3)}...${apiKey.substring(apiKey.length - 3)}`;
    }
    // Show first 15 and last 5 characters
    return `${apiKey.substring(0, 15)}...${apiKey.substring(apiKey.length - 5)}`;
  }

  /**
   * Get the default model for search operations
   */
  public getDefaultModel(): string {
    return this.config.defaultModel || 'perplexity/sonar';
  }

  /**
   * Get the request timeout in milliseconds
   */
  public getTimeoutMs(): number {
    return this.config.timeoutMs || 30000;
  }

  /**
   * Get the configured log level
   */
  public getLogLevel(): string {
    return this.config.logLevel || 'info';
  }

  /**
   * Get the base URL for OpenRouter API
   */
  public getBaseUrl(): string {
    return this.config.baseUrl || 'https://openrouter.ai/api/v1';
  }

  /**
   * Get the full configuration object
   */
  public getConfig(): EnvironmentConfig {
    return {
      openRouterApiKey: this.config.openRouterApiKey,
      defaultModel: this.getDefaultModel(),
      timeoutMs: this.getTimeoutMs(),
      logLevel: this.getLogLevel(),
      baseUrl: this.getBaseUrl(),
    };
  }

  /**
   * Get a safe version of the configuration with sensitive values masked
   */
  public getSafeConfig(): EnvironmentConfig {
    return {
      openRouterApiKey: this.getMaskedApiKey(),
      defaultModel: this.getDefaultModel(),
      timeoutMs: this.getTimeoutMs(),
      logLevel: this.getLogLevel(),
      baseUrl: this.getBaseUrl(),
    };
  }

  /**
   * Validate the current configuration
   * @throws {ConfigurationError} if configuration is invalid
   */
  public validate(): void {
    // Configuration is already validated in constructor
    // This method exists for explicit validation if needed
    validateConfigurationOrThrow();
  }

  /**
   * Custom JSON serialization to prevent leaking sensitive data
   */
  public toJSON(): EnvironmentConfig {
    return this.getSafeConfig();
  }
}
