/**
 * Chat API DTOs and types
 */

export const SUPPORTED_MODELS = ['gpt-4-mini', 'gpt-4', 'gpt-3.5-turbo'] as const;
export type SupportedModel = typeof SUPPORTED_MODELS[number];

/**
 * POST /api/v1/chat request body
 */
export interface ChatRequest {
  message: string;
  useMemory?: boolean;
  sessionId?: string;
  model?: SupportedModel;
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
      pattern: '^session-[0-9]{8}-[0-9]{6}-[A-Za-z0-9]{4}$',
      description: 'Session ID for conversation continuity'
    },
    model: {
      type: 'string',
      enum: SUPPORTED_MODELS,
      default: 'gpt-4-mini',
      description: 'AI model to use'
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
  results: Array<{
    text: string;
    score: number;
    source_type: string;
    session_id?: string | null;
  }>;
  total_tokens: number;
  results_count: number;
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