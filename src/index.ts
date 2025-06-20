import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Export our OpenRouter client and types
export * from './clients';
export * from './types';

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error('OpenRouter Search MCP server running on stdio');
}

// eslint-disable-next-line no-console
main().catch(console.error);
