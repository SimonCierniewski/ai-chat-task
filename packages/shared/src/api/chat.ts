/**
 * POST /api/v1/chat request body
 */
/**
 * Graph search parameters for advanced context retrieval
 */
export interface GraphSearchParams {
  nodes?: {
    limit?: number;
    reranker?: 'cross_encoder' | 'rrf' | 'mmr' | 'episode_mentions' | 'node_distance';
    mmrLambda?: number; // For mmr reranker (0.0-1.0)
    centerNodeUuid?: string; // For node_distance reranker
  };
  edges?: {
    limit?: number;
    reranker?: 'cross_encoder' | 'rrf' | 'mmr' | 'episode_mentions' | 'node_distance';
    minFactRating?: number; // 0.0-1.0
    mmrLambda?: number; // For mmr reranker (0.0-1.0)
    centerNodeUuid?: string; // For node_distance reranker
  };
  episodes?: {
    limit?: number;
  };
}

export interface ChatRequest {
  message: string;
  useMemory?: boolean;
  sessionId?: string;
  model?: string;
  returnMemory?: boolean; // If true, return memory context in SSE events (for debugging/playground)
  systemPrompt?: string; // Optional custom system prompt (for playground)
  contextMode?: 'basic' | 'summarized' | 'node_search' | 'edge_search' | 'node_edge_search' | 'bfs'; // Context retrieval mode
  testingMode?: boolean; // If true, don't store messages in Zep or database (for testing different responses)
  assistantOutput?: string; // Pre-defined assistant response (skip OpenAI, used for importing conversations)
  pastMessagesCount?: number; // Number of past messages to include in context (0-10)
  graphSearchParams?: GraphSearchParams; // Advanced graph search parameters for query-based context modes
  minRating?: number; // Minimum fact rating for generic context modes (0.0-1.0)
}

/**
 * Chat request validation schema for Ajv
 */
export const chatRequestSchema = {
  type: 'object',
  required: ['message'],
  properties: {
    message: {
      type: 'string',
      minLength: 1,
      maxLength: 4000,
      description: 'User message to send to the AI'
    },
    useMemory: {
      type: 'boolean',
      default: false,
      description: 'Whether to use memory/context retrieval'
    },
    sessionId: {
      type: 'string',
      description: 'Session ID for conversation continuity'
    },
    model: {
      type: 'string',
      description: 'AI model to use'
    },
    returnMemory: {
      type: 'boolean',
      default: false,
      description: 'Return memory context in SSE events (for debugging)'
    },
    systemPrompt: {
      type: 'string',
      maxLength: 1000,
      description: 'Custom system prompt (for playground)'
    },
    contextMode: {
      type: 'string',
      enum: ['basic', 'summarized', 'node_search', 'edge_search', 'node_edge_search', 'bfs'],
      description: 'Context retrieval mode'
    },
    graphSearchParams: {
      type: 'object',
      properties: {
        nodes: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 30 },
            reranker: { type: 'string', enum: ['cross_encoder', 'rrf', 'mmr', 'episode_mentions', 'node_distance'] },
            mmrLambda: { type: 'number', minimum: 0, maximum: 1 },
            centerNodeUuid: { type: 'string' }
          },
          additionalProperties: false
        },
        edges: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 30 },
            reranker: { type: 'string', enum: ['cross_encoder', 'rrf', 'mmr', 'episode_mentions', 'node_distance'] },
            minFactRating: { type: 'number', minimum: 0, maximum: 1 },
            mmrLambda: { type: 'number', minimum: 0, maximum: 1 },
            centerNodeUuid: { type: 'string' }
          },
          additionalProperties: false
        },
        episodes: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 30 }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false,
      description: 'Advanced graph search parameters for query-based context modes'
    },
    testingMode: {
      type: 'boolean',
      default: false,
      description: 'Testing mode - do not store messages in Zep or database'
    },
    assistantOutput: {
      type: 'string',
      maxLength: 10000,
      description: 'Pre-defined assistant response (skip OpenAI, used for importing conversations)'
    },
    pastMessagesCount: {
      type: 'integer',
      minimum: 0,
      maximum: 10,
      default: 4,
      description: 'Number of past messages to include in context'
    },
    minRating: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      default: 0,
      description: 'Minimum fact rating for generic context modes'
    }
  },
  additionalProperties: false
};

/**
 * SSE event types for chat streaming
 */
export enum ChatEventType {
  TOKEN = 'token',
  USAGE = 'usage',
  DONE = 'done',
  ERROR = 'error',
  MEMORY = 'memory'
}

/**
 * Token event data (streamed multiple times)
 */
export interface TokenEventData {
  text: string;
}

/**
 * Usage event data (sent once at the end)
 */
export interface UsageEventData {
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  model: string;
}

/**
 * Done event data (sent once at the end)
 */
export interface DoneEventData {
  finish_reason: 'stop' | 'length' | 'content_filter' | 'error';
  ttft_ms?: number;
  openai_ms?: number;
}

/**
 * Error event data (sent on error)
 */
export interface ErrorEventData {
  error: string;
  code?: string;
}

/**
 * Memory context event data (sent when memory is retrieved)
 */
export interface MemoryEventData {
  results: string | undefined;
  memoryMs: number;
}

/**
 * Union type for all possible SSE event data
 */
export type ChatEventData =
  | { type: ChatEventType.TOKEN; data: TokenEventData }
  | { type: ChatEventType.USAGE; data: UsageEventData }
  | { type: ChatEventType.DONE; data: DoneEventData }
  | { type: ChatEventType.ERROR; data: ErrorEventData }
  | { type: ChatEventType.MEMORY; data: MemoryEventData };

/**
 * Helper to format SSE event
 */
export function formatSSEEvent(type: ChatEventType, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Helper to parse SSE event
 */
export function parseSSEEvent(eventString: string): ChatEventData | null {
  const lines = eventString.trim().split('\n');
  let eventType: string | null = null;
  let eventData: string | null = null;

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7);
    } else if (line.startsWith('data: ')) {
      eventData = line.slice(6);
    }
  }

  if (!eventType || !eventData) {
    return null;
  }

  try {
    const data = JSON.parse(eventData);
    return { type: eventType as ChatEventType, data };
  } catch {
    return null;
  }
}
