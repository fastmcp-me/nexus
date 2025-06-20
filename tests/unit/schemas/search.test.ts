import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';

import {
  validateSearchInput,
  SearchToolInputSchema,
  SUPPORTED_MODELS,
} from '../../../src/schemas/search';

describe('Search Schema Validation', () => {
  describe('validateSearchInput', () => {
    it('should validate a basic query', () => {
      const input = { query: 'test query' };
      const result = validateSearchInput(input);

      expect(result.query).toBe('test query');
      expect(result.model).toBe('perplexity/llama-3.1-sonar-small-128k-online');
      expect(result.maxTokens).toBe(1000);
      expect(result.temperature).toBe(0.7);
    });

    it('should validate with all parameters', () => {
      const input = {
        query: 'test query',
        model: 'perplexity/llama-3.1-sonar-large-128k-online' as const,
        maxTokens: 2000,
        temperature: 0.5,
      };

      const result = validateSearchInput(input);

      expect(result.query).toBe('test query');
      expect(result.model).toBe('perplexity/llama-3.1-sonar-large-128k-online');
      expect(result.maxTokens).toBe(2000);
      expect(result.temperature).toBe(0.5);
    });

    it('should apply defaults for optional parameters', () => {
      const input = { query: 'test query' };
      const result = validateSearchInput(input);

      expect(result.model).toBe('perplexity/llama-3.1-sonar-small-128k-online');
      expect(result.maxTokens).toBe(1000);
      expect(result.temperature).toBe(0.7);
    });

    it('should reject empty query', () => {
      const input = { query: '' };

      expect(() => validateSearchInput(input)).toThrow(ZodError);
    });

    it('should reject missing query', () => {
      const input = {};

      expect(() => validateSearchInput(input)).toThrow(ZodError);
    });

    it('should reject query that is too long', () => {
      const input = { query: 'a'.repeat(2001) };

      expect(() => validateSearchInput(input)).toThrow(ZodError);
    });

    it('should reject invalid model', () => {
      const input = {
        query: 'test query',
        model: 'invalid-model',
      };

      expect(() => validateSearchInput(input)).toThrow(ZodError);
    });

    it('should reject maxTokens below minimum', () => {
      const input = {
        query: 'test query',
        maxTokens: 0,
      };

      expect(() => validateSearchInput(input)).toThrow(ZodError);
    });

    it('should reject maxTokens above maximum', () => {
      const input = {
        query: 'test query',
        maxTokens: 5000,
      };

      expect(() => validateSearchInput(input)).toThrow(ZodError);
    });

    it('should reject temperature below minimum', () => {
      const input = {
        query: 'test query',
        temperature: -0.1,
      };

      expect(() => validateSearchInput(input)).toThrow(ZodError);
    });

    it('should reject temperature above maximum', () => {
      const input = {
        query: 'test query',
        temperature: 2.1,
      };

      expect(() => validateSearchInput(input)).toThrow(ZodError);
    });

    it('should accept boundary values', () => {
      const input = {
        query: 'a', // minimum length
        maxTokens: 1, // minimum value
        temperature: 0, // minimum value
      };

      const result = validateSearchInput(input);
      expect(result.query).toBe('a');
      expect(result.maxTokens).toBe(1);
      expect(result.temperature).toBe(0);
    });

    it('should accept maximum boundary values', () => {
      const input = {
        query: 'a'.repeat(2000), // maximum length
        maxTokens: 4000, // maximum value
        temperature: 2, // maximum value
      };

      const result = validateSearchInput(input);
      expect(result.query).toBe('a'.repeat(2000));
      expect(result.maxTokens).toBe(4000);
      expect(result.temperature).toBe(2);
    });
  });

  describe('SUPPORTED_MODELS', () => {
    it('should contain expected Perplexity models', () => {
      expect(SUPPORTED_MODELS).toContain(
        'perplexity/llama-3.1-sonar-small-128k-online'
      );
      expect(SUPPORTED_MODELS).toContain(
        'perplexity/llama-3.1-sonar-large-128k-online'
      );
      expect(SUPPORTED_MODELS).toContain(
        'perplexity/llama-3.1-sonar-huge-128k-online'
      );
    });

    it('should have correct number of models', () => {
      expect(SUPPORTED_MODELS).toHaveLength(3);
    });
  });

  describe('SearchToolInputSchema', () => {
    it('should parse valid input', () => {
      const input = {
        query: 'test query',
        model: 'perplexity/llama-3.1-sonar-small-128k-online',
        maxTokens: 500,
        temperature: 0.3,
      };

      const result = SearchToolInputSchema.parse(input);
      expect(result).toEqual(input);
    });

    it('should provide detailed error messages', () => {
      const input = {
        query: '',
        maxTokens: -1,
        temperature: 3,
      };

      try {
        SearchToolInputSchema.parse(input);
        expect.fail('Should have thrown validation error');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        expect(zodError.errors).toHaveLength(3);
        expect(zodError.errors.some(e => e.path.includes('query'))).toBe(true);
        expect(zodError.errors.some(e => e.path.includes('maxTokens'))).toBe(
          true
        );
        expect(zodError.errors.some(e => e.path.includes('temperature'))).toBe(
          true
        );
      }
    });
  });
});
