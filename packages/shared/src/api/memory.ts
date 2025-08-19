/**
 * Memory API DTOs and types
 */

import { CreateGraphEdge, createGraphEdgeSchema } from '../graph';

/**
 * POST /api/v1/memory/upsert request body
 */
export interface MemoryUpsertRequest {
  facts: CreateGraphEdge[];
}

/**
 * Memory upsert validation schema for Ajv
 */
export const memoryUpsertRequestSchema = {
  type: 'object',
  required: ['facts'],
  properties: {
    facts: {
      type: 'array',
      items: createGraphEdgeSchema,
      minItems: 1,
      maxItems: 100,
      description: 'Graph edges to upsert'
    }
  },
  additionalProperties: false
};

/**
 * POST /api/v1/memory/upsert response
 */
export interface MemoryUpsertResponse {
  success: boolean;
  upserted: number;
  errors?: string[];
}

/**
 * GET /api/v1/memory/search query parameters
 */
export interface MemorySearchQuery {
  q?: string;
  limit?: number;
}

/**
 * Memory search query validation schema for Ajv
 */
export const memorySearchQuerySchema = {
  type: 'object',
  properties: {
    q: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      description: 'Search query'
    },
    limit: {
      type: 'number',
      minimum: 1,
      maximum: 50,
      default: 10,
      description: 'Maximum number of results'
    }
  },
  additionalProperties: false
};

/**
 * Retrieval result from memory search
 */
export interface RetrievalResult {
  content: string;
  score: number;
  metadata?: {
    source?: string;
    timestamp?: string;
    session_id?: string;
    message_id?: string;
    fact_type?: 'message' | 'fact' | 'summary';
    [key: string]: any;
  };
}

/**
 * GET /api/v1/memory/search response
 */
export interface MemorySearchResponse {
  results: RetrievalResult[];
  query: string;
  count: number;
  total_available?: number;
  search_time_ms?: number;
}

/**
 * Memory search response validation schema
 */
export const memorySearchResponseSchema = {
  type: 'object',
  required: ['results', 'query', 'count'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        required: ['content', 'score'],
        properties: {
          content: {
            type: 'string',
            description: 'Retrieved content'
          },
          score: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Relevance score'
          },
          metadata: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              timestamp: { type: 'string' },
              session_id: { type: 'string' },
              message_id: { type: 'string' },
              fact_type: {
                type: 'string',
                enum: ['message', 'fact', 'summary']
              }
            },
            additionalProperties: true
          }
        },
        additionalProperties: false
      }
    },
    query: {
      type: 'string',
      description: 'Original search query'
    },
    count: {
      type: 'number',
      minimum: 0,
      description: 'Number of results returned'
    },
    total_available: {
      type: 'number',
      minimum: 0,
      description: 'Total results available'
    },
    search_time_ms: {
      type: 'number',
      minimum: 0,
      description: 'Search execution time in milliseconds'
    }
  },
  additionalProperties: false
};

/**
 * Memory context for chat
 */
export interface MemoryContext {
  facts: string[];
  messages: RetrievalResult[];
  total_tokens: number;
  truncated: boolean;
}

/**
 * Helper to format memory context for prompts
 */
export function formatMemoryContext(context: MemoryContext): string {
  const sections: string[] = [];
  
  if (context.facts.length > 0) {
    sections.push('### Known Facts:\n' + context.facts.join('\n'));
  }
  
  if (context.messages.length > 0) {
    const messages = context.messages
      .map(m => `- ${m.content} (relevance: ${(m.score * 100).toFixed(0)}%)`)
      .join('\n');
    sections.push('### Relevant Context:\n' + messages);
  }
  
  if (context.truncated) {
    sections.push('\n[Note: Context was truncated to fit token limit]');
  }
  
  return sections.join('\n\n');
}

/**
 * Helper to deduplicate retrieval results
 */
export function deduplicateResults(results: RetrievalResult[]): RetrievalResult[] {
  const seen = new Set<string>();
  const deduplicated: RetrievalResult[] = [];
  
  for (const result of results) {
    const hash = result.content.toLowerCase().trim();
    if (!seen.has(hash)) {
      seen.add(hash);
      deduplicated.push(result);
    }
  }
  
  return deduplicated;
}

/**
 * Helper to sort results by score
 */
export function sortByScore(results: RetrievalResult[]): RetrievalResult[] {
  return [...results].sort((a, b) => b.score - a.score);
}

/**
 * Helper to trim content to max length
 */
export function trimContent(content: string, maxLength: number = 200): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength - 3) + '...';
}

/**
 * Memory configuration
 */
export interface MemoryConfig {
  max_retrieval_results: number;
  min_relevance_score: number;
  max_context_tokens: number;
  enable_deduplication: boolean;
  enable_fact_extraction: boolean;
  retrieval_timeout_ms: number;
}

/**
 * Default memory configuration
 */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  max_retrieval_results: 10,
  min_relevance_score: 0.5,
  max_context_tokens: 1500,
  enable_deduplication: true,
  enable_fact_extraction: true,
  retrieval_timeout_ms: 3000
};