import { parseArgs } from 'node:util';

import { createServer } from './index.js';

function printUsage() {
  console.log(`
Usage: openrouter-search-mcp [options]

Options:
  --stdio     Use STDIO transport (required for MCP clients)
  --help      Show this help message
  --version   Show version information

Environment Variables:
  OPENROUTER_API_KEY    OpenRouter API key (required)
  NODE_ENV             Environment (development, production, test)

Example:
  npx openrouter-search-mcp --stdio
`);
}

function printVersion() {
  console.log(`openrouter-search-mcp v1.0.0`);
}

async function main() {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        stdio: {
          type: 'boolean',
          default: false,
        },
        help: {
          type: 'boolean',
          default: false,
        },
        version: {
          type: 'boolean',
          default: false,
        },
      },
      allowPositionals: true,
    });

    if (values.help) {
      printUsage();
      process.exit(0);
    }

    if (values.version) {
      printVersion();
      process.exit(0);
    }

    if (!values.stdio) {
      console.error('Error: --stdio flag is required for MCP server operation');
      printUsage();
      process.exit(1);
    }

    // Check for required environment variables
    if (!process.env.OPENROUTER_API_KEY) {
      console.error(
        'Error: OPENROUTER_API_KEY environment variable is required'
      );
      console.error('Please set your OpenRouter API key:');
      console.error('  export OPENROUTER_API_KEY=your_api_key_here');
      process.exit(1);
    }

    // Set default environment if not specified
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'production';
    }

    // Start the MCP server
    await createServer();
  } catch (error) {
    console.error('Failed to start OpenRouter Search MCP server:', error);
    process.exit(1);
  }
}

main();
