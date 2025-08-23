/**
 * Memory context caching types
 */

/**
 * Zep parameters used to fetch context
 */
export interface ZepParameters {
  mode?: 'basic' | 'summarized';
  top_k?: number;
  min_score?: number;
  [key: string]: any;
}

/**
 * Memory context metadata
 */
export interface MemoryContextMetadata {
  token_count?: number;
  retrieval_ms?: number;
  cleared_at?: string;
  [key: string]: any;
}

/**
 * Memory context record
 */
export interface MemoryContext {
  user_id: string;
  owner_id?: string;
  context_block?: string;
  zep_parameters?: ZepParameters;
  created_at?: string;
  updated_at?: string;
  expires_at?: string;
  version?: number;
  last_session_id?: string;
  metadata?: MemoryContextMetadata;
}

/**
 * Memory context with initial fetch flag
 */
export interface MemoryContextWithStatus extends MemoryContext {
  needs_initial_fetch: boolean;
}

/**
 * Request to update memory context
 */
export interface UpdateMemoryContextRequest {
  context_block: string;
  zep_parameters?: ZepParameters;
  session_id?: string;
}

/**
 * Check if memory context needs refresh
 * Returns true only if context doesn't exist or doesn't have content
 */
export function needsRefresh(context: MemoryContext | null): boolean {
  if (!context) {
    return true;
  }
  
  // Only needs refresh if there's no content
  return !context.context_block;
}