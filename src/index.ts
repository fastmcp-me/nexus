import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import winston from 'winston';

// Export our OpenRouter client and types
export * from './clients';
export * from './types';

// Configure logger
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
      stderrLevels: ['error', 'warn', 'info', 'debug'],
    }),
  ],
});

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

// Request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug('Received list tools request');
  return {
    tools: [
      {
        name: 'search_models',
        description: 'Search for OpenRouter models',
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
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async request => {
  logger.debug(`Received call tool request: ${request.params.name}`);

  switch (request.params.name) {
    case 'search_models':
      // TODO: Implement model search functionality
      logger.info('Model search requested', {
        query: request.params.arguments?.query,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Searching models for: ${request.params.arguments?.query || 'all'}`,
          },
        ],
      };
    default:
      logger.warn(`Unknown tool requested: ${request.params.name}`);
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  logger.debug('Received list resources request');
  return {
    resources: [],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async request => {
  logger.debug(`Received read resource request: ${request.params.uri}`);
  throw new Error(`Resource not found: ${request.params.uri}`);
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
    logger.info('Starting OpenRouter Search MCP server');

    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('OpenRouter Search MCP server running on stdio');
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Fatal error in main', { error });
  process.exit(1);
});
