import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import winston from 'winston';

import { ConfigurationManager, ConfigurationError } from './config';
import { createSearchTool } from './tools/search';
import { validateSearchResponse } from './types/search';

// Export our OpenRouter client and types
export * from './clients';
export * from './types';
export * from './tools';
export * from './schemas';

// Global configuration and logger
let config: ConfigurationManager;
let logger: winston.Logger;

// Initialize configuration and logger
function initializeConfiguration(): void {
  try {
    config = ConfigurationManager.getInstance();

    // Configure logger with settings from configuration
    logger = winston.createLogger({
      level: config.getLogLevel(),
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
          stderrLevels: ['error', 'warn', 'info', 'debug'],
        }),
      ],
    });

    logger.info('Configuration loaded successfully', {
      config: config.getSafeConfig(),
    });
  } catch (error) {
    // Create a basic logger for error reporting if configuration fails
    const basicLogger = winston.createLogger({
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.simple()
      ),
      transports: [new winston.transports.Console()],
    });

    if (error instanceof ConfigurationError) {
      basicLogger.error('Configuration validation failed:', {
        errors: error.errors,
        warnings: error.warnings,
      });
    } else {
      basicLogger.error('Failed to initialize configuration:', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    throw error;
  }
}

const server = new Server(
  {
    name: 'openrouter-search',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// Initialize search tool
let searchTool: ReturnType<typeof createSearchTool> | null = null;

// Initialize search tool with configuration
function initializeSearchTool(): void {
  try {
    const apiKey = config.getApiKey();
    searchTool = createSearchTool(apiKey);
    logger.info('Search tool initialized successfully', {
      apiKey: config.getMaskedApiKey(),
      defaultModel: config.getDefaultModel(),
      timeout: config.getTimeoutMs(),
    });
  } catch (error) {
    logger.error('Failed to initialize search tool', { error });
    throw error;
  }
}

// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug('Received list tools request');

  const tools = [];

  // Add search tool if available
  if (searchTool) {
    tools.push({
      name: 'search',
      description:
        'Perform AI-powered search using Perplexity models via OpenRouter. Searches the web for current information and provides comprehensive answers with sources.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'The search query to process (required, 1-2000 characters)',
            minLength: 1,
            maxLength: 2000,
          },
          model: {
            type: 'string',
            description: 'Perplexity model to use for search',
            enum: ['perplexity/sonar'],
            default: 'perplexity/sonar',
          },
          maxTokens: {
            type: 'number',
            description: 'Maximum number of tokens in the response (1-4000)',
            minimum: 1,
            maximum: 4000,
            default: 1000,
          },
          temperature: {
            type: 'number',
            description: 'Controls randomness in the response (0-2)',
            minimum: 0,
            maximum: 2,
            default: 0.7,
          },
        },
        required: ['query'],
      },
    });
  }

  // Legacy search_models tool for backward compatibility
  tools.push({
    name: 'search_models',
    description:
      'Search for OpenRouter models (legacy - use search tool instead)',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for models',
        },
      },
      required: ['query'],
    },
  });

  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async request => {
  logger.debug(`Received call tool request: ${request.params.name}`);

  switch (request.params.name) {
    case 'search': {
      if (!searchTool) {
        logger.error('Search tool not available - API key not configured');
        return {
          content: [
            {
              type: 'text',
              text: 'Search functionality is not available. Please configure OPENROUTER_API_KEY environment variable.',
            },
          ],
          isError: true,
        };
      }

      try {
        logger.info('Search request received', {
          query: request.params.arguments?.query,
          model: request.params.arguments?.model,
        });

        const searchResponse = await searchTool.search(
          request.params.arguments
        );

        if (!validateSearchResponse(searchResponse)) {
          logger.error('Invalid search response format', { searchResponse });
          return {
            content: [
              {
                type: 'text',
                text: 'Internal error: Invalid search response format',
              },
            ],
            isError: true,
          };
        }

        if (!searchResponse.success) {
          logger.warn('Search request failed', {
            error: searchResponse.error,
            errorType: searchResponse.errorType,
          });

          return {
            content: [
              {
                type: 'text',
                text: `Search failed: ${searchResponse.error}`,
              },
            ],
            isError: true,
          };
        }

        const result = searchResponse.result!;

        // Format response with metadata
        const responseText = [
          result.content,
          '',
          '---',
          `**Search Metadata:**`,
          `- Model: ${result.metadata.model}`,
          `- Response time: ${result.metadata.responseTime}ms`,
          `- Tokens used: ${result.metadata.usage?.total_tokens || 'N/A'}`,
          result.sources.length > 0
            ? `- Sources: ${result.sources.length} found`
            : '',
        ]
          .filter(Boolean)
          .join('\n');

        logger.info('Search completed successfully', {
          requestId: searchResponse.requestId,
          tokensUsed: result.metadata.usage?.total_tokens,
          sourcesFound: result.sources.length,
          responseTime: result.metadata.responseTime,
        });

        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
        };
      } catch (error) {
        logger.error('Unexpected error during search', { error });
        return {
          content: [
            {
              type: 'text',
              text: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    }

    case 'search_models': {
      // Legacy functionality - kept for backward compatibility
      logger.info('Legacy model search requested', {
        query: request.params.arguments?.query,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Legacy model search for: ${request.params.arguments?.query || 'all'}. Use the 'search' tool instead for actual search functionality.`,
          },
        ],
      };
    }

    default:
      logger.warn(`Unknown tool requested: ${request.params.name}`);
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  logger.debug('Received list resources request');
  return {
    resources: [
      {
        uri: 'config://status',
        name: 'Configuration Status',
        description: 'Current configuration status and health information',
        mimeType: 'application/json',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async request => {
  logger.debug(`Received read resource request: ${request.params.uri}`);

  switch (request.params.uri) {
    case 'config://status': {
      try {
        const status = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          configuration: config ? config.getSafeConfig() : null,
          searchTool: {
            initialized: searchTool !== null,
            available: searchTool !== null,
          },
          server: {
            name: 'openrouter-search',
            version: '1.0.0',
            uptime: process.uptime(),
          },
        };

        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'application/json',
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error('Error generating status report', { error });
        const errorStatus = {
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        };

        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'application/json',
              text: JSON.stringify(errorStatus, null, 2),
            },
          ],
        };
      }
    }

    default:
      throw new Error(`Resource not found: ${request.params.uri}`);
  }
});

// Server lifecycle management
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, forcing exit');
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown`);

  try {
    // Close server connections
    logger.info('Server shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle unhandled errors
process.on('uncaughtException', error => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { reason, promise });
  process.exit(1);
});

async function main() {
  try {
    // Initialize configuration first
    initializeConfiguration();
    logger.info('Starting OpenRouter Search MCP server');

    // Initialize search tool after configuration is loaded
    initializeSearchTool();

    // Start the MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('OpenRouter Search MCP server running on stdio', {
      version: '1.0.0',
      config: config.getSafeConfig(),
    });
  } catch (error) {
    // If we don't have a logger yet, create a basic one
    const errorLogger =
      logger ||
      winston.createLogger({
        level: 'error',
        format: winston.format.simple(),
        transports: [new winston.transports.Console()],
      });

    errorLogger.error('Failed to start server', { error });
    process.exit(1);
  }
}

main().catch(error => {
  const errorLogger =
    logger ||
    winston.createLogger({
      level: 'error',
      format: winston.format.simple(),
      transports: [new winston.transports.Console()],
    });
  errorLogger.error('Fatal error in main', { error });
  process.exit(1);
});
