# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server for OpenRouter model search and discovery. The project provides a TypeScript-based server that interfaces with the OpenRouter API, specifically focused on Perplexity Sonar models for chat completions.

## Development Commands

### Core Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Start development server with hot reload
- `npm run start` - Run the built server
- `npm run clean` - Remove dist directory

### Testing

- `npm test` - Run all tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:integration` - Run only integration tests

### Code Quality

- `npm run lint` - Lint code with ESLint
- `npm run lint:fix` - Fix auto-fixable lint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run type-check` - TypeScript type checking without compilation

## Architecture

### Core Components

1. **MCP Server Entry Point** (`src/index.ts`)

   - Initializes the MCP server using `@modelcontextprotocol/sdk`
   - Sets up stdio transport for communication
   - Currently basic setup with empty capabilities

2. **OpenRouter Client** (`src/clients/openrouter.ts`)

   - Robust HTTP client for OpenRouter API
   - Implements retry logic with exponential backoff
   - Supports both streaming and non-streaming chat completions
   - Comprehensive error handling with specific error classes
   - API key validation and request authentication

3. **Type Definitions** (`src/types/openrouter.ts`)

   - Complete TypeScript interfaces for OpenRouter API
   - Chat completion request/response types
   - Perplexity model type definitions
   - Error response structures

4. **Project Structure**
   - `src/handlers/` - Empty directory for MCP request handlers
   - `src/utils/` - Empty directory for utility functions
   - `tests/` - Comprehensive test suite with fixtures and mocks

### Testing Architecture

- **Vitest** configuration with 90% coverage thresholds
- **MSW** for API mocking in tests
- Structured test organization:
  - `tests/unit/` - Unit tests for individual components
  - `tests/integration/` - Integration tests
  - `tests/fixtures/` - Test data and sample responses
  - `tests/utils/mocks/` - Mock implementations

### Development Tooling

- **TypeScript** with strict mode and ES2022 target
- **ESLint** with comprehensive rules including:
  - TypeScript-specific linting
  - Import order enforcement
  - Unused import removal
  - Node.js specific rules
- **Prettier** for code formatting
- **Nodemon** for development server hot reload

## Key Implementation Details

### OpenRouter Client Features

- Supports Perplexity Sonar models by default
- Implements retry logic for rate limits and server errors
- Provides both streaming and non-streaming interfaces
- Comprehensive error hierarchy (AuthenticationError, RateLimitError, ServerError, ClientError)
- Request timeout handling and abort controller usage

### Type Safety

- Strict TypeScript configuration
- Comprehensive type definitions for OpenRouter API
- Proper error typing with discriminated unions

### Task Master Integration

The project uses Task Master for development workflow management. See `.windsurfrules` for complete development workflow documentation including:

- Task breakdown and complexity analysis
- Dependency management
- Status tracking commands
- Research-backed task expansion

## Development Notes

- The project is in early development with basic MCP server structure
- Handlers directory is empty and ready for MCP tool/resource implementations
- OpenRouter client is fully implemented and tested
- Type definitions focus on chat completions and Perplexity models
- Test coverage requirements are set to 90% across all metrics
- Uses ES modules throughout the project

## Pre-Commit Guidelines

- Run `pre-commit run --all-files` before attempting commits - This should be run repeatedly until all tests pass before committing
- Never run `git commit --no-verify` unless explicitly directed to do so. You see an issue, you fix it.

## Single Test Execution

To run a specific test file during development:

```bash
# Run a specific test file
npm test -- tests/unit/clients/openrouter.test.ts

# Run tests matching a pattern
npm test -- --grep "OpenRouter"

# Run tests in watch mode for specific file
npm run test:watch -- tests/unit/tools/search.test.ts
```

## Configuration and Environment

### Environment Variables

The project uses environment variables for configuration:

- `OPENROUTER_API_KEY` - Required for OpenRouter API access
- `NODE_ENV` - Environment setting (development, production, test)
- Log levels and other settings are managed through the configuration system

### Configuration Architecture

The project uses a sophisticated configuration system in `src/config/`:

- **Schema validation** - Comprehensive environment validation using JSON schema
- **Type safety** - Full TypeScript typing for all configuration options
- **Logging integration** - Structured logging with Winston, configured via config
- **Error handling** - Detailed configuration error reporting with validation feedback

## MCP Server Architecture Details

### Request Flow

1. **Initialization**: Configuration → Logger setup → Search tool initialization
2. **Tool Registration**: Search tool and legacy search_models tool registered
3. **Request Handling**: Structured request/response with comprehensive error handling
4. **Resource Management**: Configuration status endpoint for health monitoring

### Error Handling Strategy

- **Structured errors** - Custom error classes for different failure modes
- **Graceful degradation** - Server continues running even if search tool fails to initialize
- **Comprehensive logging** - All errors logged with context and metadata
- **User-friendly responses** - Clear error messages returned to MCP clients

### Search Tool Implementation

- **OpenRouter integration** - Full client with retry logic and rate limiting
- **Response validation** - Schema validation for all search responses
- **Metadata tracking** - Performance metrics, token usage, source counts
- **Flexible parameters** - Model selection, token limits, temperature control

## Development Workflow Integration

### Task Master Commands

This project integrates with Task Master for workflow management. Key commands available in this project:

```bash
# Initialize Task Master project structure
task-master init

# View current tasks and status
task-master list

# Get next task to work on
task-master next

# Mark task as completed
task-master set-status --id=<id> --status=done

# Expand complex tasks into subtasks
task-master expand --id=<id> --research
```

See `.windsurfrules` for complete Task Master workflow documentation.

## Testing Strategy

### Test Organization

- **Unit tests** - Individual component testing with mocking
- **Integration tests** - End-to-end MCP server testing
- **Fixtures** - Structured test data and mock responses
- **Coverage requirements** - 90% threshold across all metrics

### Mock Strategy

- **MSW** for HTTP API mocking
- **Vitest mocking** for module dependencies
- **Structured mocks** - Organized in `tests/utils/mocks/`

### Running Tests

- Use `npm test` for single run with coverage checking
- Use `npm run test:watch` for development with file watching
- Use `npm run test:ui` for visual test interface
- Integration tests: `npm run test:integration`
