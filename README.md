# OpenRouter Search MCP Server

A Model Context Protocol (MCP) server that provides AI-powered search capabilities using Perplexity models via OpenRouter. This server integrates with Claude Code, Cursor, and other MCP-compatible clients to provide real-time web search functionality.

## Features

- **AI-Powered Search**: Uses Perplexity Sonar models for intelligent web search with citations
- **Real-time Results**: Searches current web content and provides up-to-date information
- **Source Citations**: Provides source URLs and metadata for search results
- **Configurable Parameters**: Adjust search models, token limits, temperature, and more
- **Error Handling**: Comprehensive error handling with retry logic and graceful degradation
- **Logging**: Structured logging for debugging and monitoring

## Quick Start

### Prerequisites

- Node.js 16 or higher
- An OpenRouter API key (get one at [OpenRouter](https://openrouter.ai))

### Installation

1. Clone the repository:

```bash
git clone https://github.com/your-username/openrouter-search.git
cd openrouter-search
```

2. Install dependencies:

```bash
npm install
```

3. Build the server:

```bash
npm run build
```

4. Configure your OpenRouter API key:

   **For local development/testing:**

   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Edit .env and add your actual API key
   # OPENROUTER_API_KEY=your-api-key-here
   ```

   **For MCP client integration:** You'll provide the API key directly in your MCP client configuration (see Integration section below).

### Testing the Server

Test the server standalone:

```bash
npm start
```

The server will start and wait for MCP protocol messages on stdin/stdout.

## Integration with MCP Clients

### Claude Code

Add this server to your Claude Code MCP settings:

1. Open your MCP settings file (usually `~/.claude/mcp_settings.json`)

2. Add the server configuration:

```json
{
  "mcpServers": {
    "openrouter-search": {
      "command": "node",
      "args": ["/path/to/openrouter-search/dist/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

3. Restart Claude Code

### Cursor

Configure the server in Cursor's MCP settings:

1. Open Cursor settings and navigate to MCP servers

2. Add a new server with:

   - **Name**: `openrouter-search`
   - **Command**: `node`
   - **Args**: `["/path/to/openrouter-search/dist/index.js"]`
   - **Environment Variables**:
     - `OPENROUTER_API_KEY`: `your-api-key-here`

3. Restart Cursor

### Other MCP Clients

For other MCP-compatible clients, use these connection details:

- **Transport**: stdio
- **Command**: `node /path/to/openrouter-search/dist/index.js`
- **Environment Variables**: Add `OPENROUTER_API_KEY` in your client's environment configuration

## Usage

Once integrated, you can use the search tool in your MCP client:

### Basic Search

```
Use the search tool to find information about "latest developments in AI"
```

### Advanced Search with Parameters

```
Search for "climate change solutions" using:
- Model: perplexity/sonar
- Max tokens: 2000
- Temperature: 0.3
```

## Available Tools

### `search`

The main search tool that provides AI-powered web search capabilities.

**Parameters:**

- `query` (required): Search query (1-2000 characters)
- `model` (optional): Perplexity model to use (default: "perplexity/sonar")
- `maxTokens` (optional): Maximum response tokens (1-4000, default: 1000)
- `temperature` (optional): Response randomness (0-2, default: 0.7)

**Example Response:**

```
Based on current information, here are the latest developments in AI...

[Detailed AI-generated response with current information]

---
**Search Metadata:**
- Model: perplexity/sonar
- Response time: 1250ms
- Tokens used: 850
- Sources: 5 found
```

### `search_models` (Legacy)

Backward compatibility tool. Use the `search` tool instead.

## Configuration

### Environment Variables

- `OPENROUTER_API_KEY` (required): Your OpenRouter API key
- `NODE_ENV` (optional): Environment setting (development, production, test)
- `LOG_LEVEL` (optional): Logging level (debug, info, warn, error)

### Advanced Configuration

The server supports additional configuration through environment variables:

- `OPENROUTER_TIMEOUT_MS`: Request timeout in milliseconds (default: 30000)
- `OPENROUTER_MAX_RETRIES`: Maximum retry attempts (default: 3)
- `OPENROUTER_BASE_URL`: Custom OpenRouter API base URL

## Resources

The server provides a configuration status resource at `config://status` that shows:

- Server health status
- Configuration information (with masked API key)
- Search tool availability
- Server uptime and version

## Troubleshooting

### Common Issues

**"Search functionality is not available"**

- Ensure `OPENROUTER_API_KEY` environment variable is set
- Verify your API key is valid at [OpenRouter](https://openrouter.ai)

**"Authentication failed: Invalid API key"**

- Double-check your API key
- Ensure the key has sufficient credits/permissions

**"Rate limit exceeded"**

- Wait for the rate limit to reset
- Consider upgrading your OpenRouter plan

**Connection timeouts**

- Check your internet connection
- The server will automatically retry failed requests

### Debug Logging

Enable debug logging by:

**For local development:** Add `LOG_LEVEL=debug` to your `.env` file

**For MCP clients:** Add `LOG_LEVEL: "debug"` to the `env` section of your MCP configuration

This will provide detailed information about:

- Configuration loading
- API requests and responses
- Error details and stack traces
- Performance metrics

### Testing Connection

You can test if the server is working by checking the configuration status resource in your MCP client, or by running a simple search query.

## Development

For developers working on this server:

```bash
# Development with hot reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

## API Credits and Costs

This server uses OpenRouter's API, which charges based on token usage. Costs vary by model:

- Perplexity Sonar models: Check current pricing at [OpenRouter Models](https://openrouter.ai/models)
- Monitor your usage through the OpenRouter dashboard
- Set usage limits in your OpenRouter account if needed

## Support

- [OpenRouter Documentation](https://openrouter.ai/docs)
- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [Report Issues](https://github.com/your-username/openrouter-search/issues)

## License

ISC License - see LICENSE file for details.
