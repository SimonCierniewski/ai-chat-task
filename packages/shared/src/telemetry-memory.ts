/**
 * Telemetry Memory Types and Schemas
 * Types for message storage and retrieval in Zep memory system
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Message role types in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Source type for retrieved content
 */
export type RetrievalSourceType = 'message' | 'fact';

/**
 * Message structure for conversation history
 * Stored in Zep collections per user
 */
export interface Message {
  id: string;                      // Unique message identifier
  session_id: string;               // Session/thread identifier
  role: MessageRole;                // Who sent the message
  content: string;                  // Message text content
  created_at: string | Date;        // ISO timestamp or Date object
  metadata?: MessageMetadata;       // Optional additional data
}

/**
 * Optional metadata for messages
 */
export interface MessageMetadata {
  model?: string;                   // AI model used (for assistant messages)
  tokens?: number;                  // Token count
  cost_usd?: number;                // Cost for this message
  ttft_ms?: number;                 // Time to first token (streaming)
  duration_ms?: number;             // Total response time
  user_feedback?: 'positive' | 'negative' | null;
  [key: string]: unknown;           // Extensible for future fields
}

/**
 * Result from memory retrieval/search (telemetry version with text field)
 */
export interface TelemetryRetrievalResult {
  id: string;                       // Unique result identifier
  session_id?: string | null;       // Session if from message history
  text: string;                     // Retrieved content
  score: number;                    // Relevance score (0-1)
  source_type: RetrievalSourceType; // Where this came from
  tokens_estimate: number;          // Estimated token count
  metadata?: RetrievalMetadata;     // Optional additional context
}

/**
 * Optional metadata for retrieval results
 */
export interface RetrievalMetadata {
  original_message_id?: string;     // If from a message
  fact_id?: string;                 // If from knowledge graph
  timestamp?: string;               // When originally created
  confidence?: number;              // Confidence score for facts
  [key: string]: unknown;           // Extensible
}

/**
 * Input for creating a new message
 */
export interface CreateMessage {
  session_id: string;
  role: MessageRole;
  content: string;
  metadata?: MessageMetadata;
}

/**
 * Search query parameters
 */
export interface MemorySearchQuery {
  query: string;                    // Search text
  collection_name: string;          // User collection (user:uuid)
  session_id?: string;              // Filter to specific session
  limit?: number;                   // Max results (default: 10)
  min_score?: number;               // Minimum relevance score
  source_types?: RetrievalSourceType[]; // Filter by source
}

/**
 * Batch message storage request
 */
export interface BatchMessages {
  collection_name: string;          // User collection
  session_id: string;
  messages: CreateMessage[];
}

// ============================================================================
// JSON Schemas (Ajv-compatible)
// ============================================================================

/**
 * JSON Schema for Message validation
 */
export const messageSchema: any = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      description: 'Unique message identifier'
    },
    session_id: {
      type: 'string',
      minLength: 1,
      pattern: '^session-\\d{8}-\\d{6}-[a-z0-9]{4}$',
      description: 'Session identifier'
    },
    role: {
      type: 'string',
      enum: ['user', 'assistant', 'system'],
      description: 'Message sender role'
    },
    content: {
      type: 'string',
      minLength: 1,
      maxLength: 100000, // ~25k tokens max
      description: 'Message content'
    },
    created_at: {
      type: 'string',
      format: 'date-time',
      description: 'Creation timestamp'
    },
    metadata: {
      type: ['object', 'null'],
      properties: {
        model: { type: ['string', 'null'] },
        tokens: { type: ['integer', 'null'], minimum: 0 },
        cost_usd: { type: ['number', 'null'], minimum: 0 },
        ttft_ms: { type: ['number', 'null'], minimum: 0 },
        duration_ms: { type: ['number', 'null'], minimum: 0 },
        user_feedback: {
          type: ['string', 'null'],
          enum: ['positive', 'negative', null]
        }
      },
      additionalProperties: true
    }
  },
  required: ['id', 'session_id', 'role', 'content', 'created_at'],
  additionalProperties: false
};

/**
 * JSON Schema for TelemetryRetrievalResult validation
 */
export const retrievalResultSchema: any = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      minLength: 1,
      description: 'Result identifier'
    },
    session_id: {
      type: ['string', 'null'],
      minLength: 1,
      description: 'Session if from message'
    },
    text: {
      type: 'string',
      minLength: 1,
      maxLength: 10000, // Limit retrieved content size
      description: 'Retrieved content'
    },
    score: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Relevance score'
    },
    source_type: {
      type: 'string',
      enum: ['message', 'fact'],
      description: 'Source of retrieved content'
    },
    tokens_estimate: {
      type: 'integer',
      minimum: 0,
      maximum: 10000,
      description: 'Estimated token count'
    },
    metadata: {
      type: ['object', 'null'],
      properties: {
        original_message_id: { type: ['string', 'null'] },
        fact_id: { type: ['string', 'null'] },
        timestamp: { type: ['string', 'null'] },
        confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 }
      },
      additionalProperties: true
    }
  },
  required: ['id', 'text', 'score', 'source_type', 'tokens_estimate'],
  additionalProperties: false
};

/**
 * JSON Schema for CreateMessage validation
 */
export const createMessageSchema: any = {
  type: 'object',
  properties: {
    session_id: {
      type: 'string',
      minLength: 1,
      description: 'Session identifier'
    },
    role: {
      type: 'string',
      enum: ['user', 'assistant', 'system'],
      description: 'Message role'
    },
    content: {
      type: 'string',
      minLength: 1,
      maxLength: 100000,
      description: 'Message content'
    },
    metadata: {
      type: ['object', 'null'],
      additionalProperties: true
    }
  },
  required: ['session_id', 'role', 'content'],
  additionalProperties: false
};

/**
 * JSON Schema for MemorySearchQuery validation
 */
export const memorySearchQuerySchema: any = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 1,
      maxLength: 1000,
      description: 'Search query'
    },
    collection_name: {
      type: 'string',
      pattern: '^user:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',
      description: 'User collection name'
    },
    session_id: {
      type: ['string', 'null'],
      minLength: 1,
      description: 'Filter by session'
    },
    limit: {
      type: ['integer', 'null'],
      minimum: 1,
      maximum: 100,
      description: 'Max results'
    },
    min_score: {
      type: ['number', 'null'],
      minimum: 0,
      maximum: 1,
      description: 'Minimum relevance'
    },
    source_types: {
      type: ['array', 'null'],
      items: {
        type: 'string',
        enum: ['message', 'fact']
      },
      minItems: 1,
      maxItems: 2,
      uniqueItems: true
    }
  },
  required: ['query', 'collection_name'],
  additionalProperties: false
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate token count for text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~1 token per 4 characters (English)
  // More accurate for code: ~1 token per 2.5 characters
  const isCode = /[{};()[\]<>]/.test(text);
  const charsPerToken = isCode ? 2.5 : 4;
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Truncate text to fit within token budget
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;
  
  // Rough truncation based on ratio
  const ratio = maxTokens / estimated;
  const targetLength = Math.floor(text.length * ratio * 0.95); // 95% to be safe
  
  return text.substring(0, targetLength) + '...';
}

/**
 * Sort retrieval results by relevance
 */
export function sortByRelevance(results: TelemetryRetrievalResult[]): TelemetryRetrievalResult[] {
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Filter results by minimum score
 */
export function filterByScore(
  results: TelemetryRetrievalResult[], 
  minScore: number
): TelemetryRetrievalResult[] {
  return results.filter(r => r.score >= minScore);
}

/**
 * Calculate total tokens for results
 */
export function calculateTotalTokens(results: TelemetryRetrievalResult[]): number {
  return results.reduce((sum, r) => sum + r.tokens_estimate, 0);
}

/**
 * Trim results to fit token budget
 */
export function trimToTokenBudget(
  results: TelemetryRetrievalResult[],
  maxTokens: number
): TelemetryRetrievalResult[] {
  const trimmed: TelemetryRetrievalResult[] = [];
  let totalTokens = 0;
  
  for (const result of results) {
    if (totalTokens + result.tokens_estimate > maxTokens) break;
    trimmed.push(result);
    totalTokens += result.tokens_estimate;
  }
  
  return trimmed;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default configuration values
 */
export const MEMORY_DEFAULTS = {
  SEARCH_LIMIT: 10,
  MIN_SCORE: 0.7,
  MAX_TOKENS_PER_MESSAGE: 25000,
  MAX_SEARCH_RESULTS: 100,
  SESSION_ID_PATTERN: /^session-\d{8}-\d{6}-[a-z0-9]{4}$/,
  COLLECTION_NAME_PATTERN: /^user:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
} as const;

/**
 * Message role labels for UI
 */
export const MESSAGE_ROLE_LABELS: Record<MessageRole, string> = {
  user: 'User',
  assistant: 'Assistant',
  system: 'System'
};

/**
 * Source type labels for UI
 */
export const SOURCE_TYPE_LABELS: Record<RetrievalSourceType, string> = {
  message: 'Conversation History',
  fact: 'Knowledge Graph'
};