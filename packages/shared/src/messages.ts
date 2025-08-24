/**
 * Message types for conversation storage
 */

/**
 * Message role in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'memory';

/**
 * Base message structure
 */
export interface Message {
  id?: string;
  thread_id: string;
  role: MessageRole;
  content: string;
  created_at?: string;
  user_id: string;
  
  // Optional performance metrics (for assistant messages)
  start_ms?: number;
  ttft_ms?: number;
  total_ms?: number;
  
  // Optional token usage (for assistant messages)
  tokens_in?: number;
  tokens_out?: number;
  
  // Optional cost tracking (for assistant messages)
  price?: number;
  
  // Optional model information (for assistant messages)
  model?: string;
}

/**
 * User message
 */
export interface UserMessage extends Omit<Message, 'role' | 'start_ms' | 'tokens_in' | 'tokens_out' | 'price' | 'model'> {
  role: 'user';
}

/**
 * Assistant message with metrics
 */
export interface AssistantMessage extends Message {
  role: 'assistant';
  start_ms: number;
  ttft_ms?: number;
  total_ms: number;
  tokens_in: number;
  tokens_out: number;
  price: number;
  model: string;
}

/**
 * System message
 */
export interface SystemMessage extends Omit<Message, 'role' | 'start_ms' | 'ttft_ms' | 'total_ms' | 'tokens_in' | 'tokens_out' | 'price' | 'model'> {
  role: 'system';
}

/**
 * Memory context message
 */
export interface MemoryMessage extends Omit<Message, 'role' | 'ttft_ms' | 'tokens_in' | 'tokens_out' | 'price' | 'model'> {
  role: 'memory';
  start_ms?: number;
  total_ms?: number;
}

/**
 * Thread summary
 */
export interface ThreadSummary {
  thread_id: string;
  message_count: number;
  last_message_at: string;
  total_cost?: number;
  total_tokens_in?: number;
  total_tokens_out?: number;
}

/**
 * Message insert request
 */
export interface MessageInsert {
  thread_id: string;
  role: MessageRole;
  content: string;
  user_id: string;
  start_ms?: number;
  ttft_ms?: number;
  total_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  price?: number;
  model?: string;
}
