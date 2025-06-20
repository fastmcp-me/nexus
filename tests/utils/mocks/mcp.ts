/**
 * Mock factories for MCP protocol messages and interactions
 */

import type { JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';

export interface McpToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export const mockMcpRequest = (
  overrides?: Partial<JSONRPCRequest>
): JSONRPCRequest => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'search_models',
    arguments: {
      query: 'claude',
    },
  },
  ...overrides,
});

export const mockMcpResponse = (
  result?: Record<string, unknown>,
  error?: unknown
) => ({
  jsonrpc: '2.0' as const,
  id: 1,
  ...(error ? { error } : { result: result || { success: true } }),
});

export const mockMcpToolCall = (
  overrides?: Partial<McpToolCall>
): McpToolCall => ({
  name: 'search_models',
  arguments: {
    query: 'claude',
    limit: 10,
  },
  ...overrides,
});

export const mockMcpResource = (
  overrides?: Partial<McpResource>
): McpResource => ({
  uri: 'openrouter://models',
  name: 'Available Models',
  description: 'List of available OpenRouter models',
  mimeType: 'application/json',
  ...overrides,
});

export const mockMcpError = {
  code: -32600,
  message: 'Invalid Request',
  data: {
    details: 'The request is malformed',
  },
};
