/**
 * Memory Configuration Types and Schemas
 * Configuration for memory retrieval and graph processing
 */

import { GraphPredicate } from './graph';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Memory system configuration
 * Controls retrieval, token budgets, and graph processing
 */
export interface MemoryConfig {
  // Retrieval settings
  top_k: number;                           // Number of results to retrieve
  memory_token_budget: number;             // Max tokens for memory context
  
  // Content processing
  clip_sentences: number;                  // Max sentences per retrieved item
  
  // Graph settings
  allowed_edge_types: GraphPredicate[];    // Which predicates to use
  max_facts_in_context: number;            // Max facts to include
  max_edges_per_turn: number;              // Max new edges to extract per turn
  
  // Optional advanced settings
  min_relevance_score?: number;            // Minimum score threshold
  deduplication_enabled?: boolean;         // Deduplicate similar content
  fact_extraction_enabled?: boolean;       // Auto-extract facts from messages
  memory_decay_factor?: number;            // Weight older memories less
  session_context_window?: number;         // Messages to consider from session
}

/**
 * Partial config for updates
 */
export type PartialMemoryConfig = Partial<MemoryConfig>;

/**
 * Memory retrieval strategy
 */
export interface RetrievalStrategy {
  type: 'semantic' | 'recency' | 'hybrid';
  semantic_weight?: number;                // Weight for semantic similarity (0-1)
  recency_weight?: number;                 // Weight for recency (0-1)
  session_boost?: number;                  // Boost for same-session results
}

/**
 * Memory pruning configuration
 */
export interface PruningConfig {
  enabled: boolean;
  max_age_days: number;                    // Remove memories older than
  max_messages_per_session: number;        // Limit per conversation
  max_facts_per_user: number;              // Limit graph size
  low_confidence_threshold: number;        // Remove facts below threshold
  prune_schedule: 'daily' | 'weekly' | 'monthly';
}

/**
 * Complete memory system settings
 */
export interface MemorySystemConfig {
  memory: MemoryConfig;
  retrieval: RetrievalStrategy;
  pruning: PruningConfig;
  version: string;                         // Config version for migrations
}

// ============================================================================
// JSON Schemas (Ajv-compatible)
// ============================================================================

/**
 * JSON Schema for MemoryConfig validation
 */
export const memoryConfigSchema: any = {
  type: 'object',
  properties: {
    top_k: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      description: 'Number of results to retrieve'
    },
    memory_token_budget: {
      type: 'integer',
      minimum: 100,
      maximum: 10000,
      description: 'Maximum tokens for memory context'
    },
    clip_sentences: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      description: 'Max sentences per retrieved item'
    },
    allowed_edge_types: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'likes', 'dislikes', 'prefers',
          'works_at', 'worked_at',
          'located_in', 'lives_in',
          'knows', 'uses', 'owns',
          'interested_in', 'expert_in', 'learning',
          'speaks_language', 'has_role',
          'manages', 'reports_to', 'collaborates_with'
        ] as const
      },
      minItems: 1,
      uniqueItems: true,
      description: 'Allowed graph predicate types'
    },
    max_facts_in_context: {
      type: 'integer',
      minimum: 0,
      maximum: 50,
      description: 'Maximum facts to include in context'
    },
    max_edges_per_turn: {
      type: 'integer',
      minimum: 0,
      maximum: 20,
      description: 'Maximum edges to extract per turn'
    },
    min_relevance_score: {
      type: 'number',
      nullable: true,
      minimum: 0,
      maximum: 1,
      description: 'Minimum relevance score threshold'
    },
    deduplication_enabled: {
      type: 'boolean',
      nullable: true,
      description: 'Enable content deduplication'
    },
    fact_extraction_enabled: {
      type: 'boolean',
      nullable: true,
      description: 'Enable automatic fact extraction'
    },
    memory_decay_factor: {
      type: 'number',
      nullable: true,
      minimum: 0,
      maximum: 1,
      description: 'Decay factor for older memories'
    },
    session_context_window: {
      type: 'integer',
      nullable: true,
      minimum: 1,
      maximum: 100,
      description: 'Recent messages to consider'
    }
  },
  required: [
    'top_k',
    'memory_token_budget',
    'clip_sentences',
    'allowed_edge_types',
    'max_facts_in_context',
    'max_edges_per_turn'
  ],
  additionalProperties: false
};

/**
 * JSON Schema for RetrievalStrategy validation
 */
export const retrievalStrategySchema: any = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['semantic', 'recency', 'hybrid'] as const,
      description: 'Retrieval strategy type'
    },
    semantic_weight: {
      type: 'number',
      nullable: true,
      minimum: 0,
      maximum: 1,
      description: 'Weight for semantic similarity'
    },
    recency_weight: {
      type: 'number',
      nullable: true,
      minimum: 0,
      maximum: 1,
      description: 'Weight for recency'
    },
    session_boost: {
      type: 'number',
      nullable: true,
      minimum: 0,
      maximum: 10,
      description: 'Boost factor for same-session results'
    }
  },
  required: ['type'],
  additionalProperties: false
};

/**
 * JSON Schema for PruningConfig validation
 */
export const pruningConfigSchema: any = {
  type: 'object',
  properties: {
    enabled: {
      type: 'boolean',
      description: 'Enable automatic pruning'
    },
    max_age_days: {
      type: 'integer',
      minimum: 1,
      maximum: 365,
      description: 'Maximum age of memories in days'
    },
    max_messages_per_session: {
      type: 'integer',
      minimum: 10,
      maximum: 10000,
      description: 'Maximum messages per session'
    },
    max_facts_per_user: {
      type: 'integer',
      minimum: 10,
      maximum: 10000,
      description: 'Maximum facts per user'
    },
    low_confidence_threshold: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Remove facts below this confidence'
    },
    prune_schedule: {
      type: 'string',
      enum: ['daily', 'weekly', 'monthly'] as const,
      description: 'Pruning schedule'
    }
  },
  required: [
    'enabled',
    'max_age_days',
    'max_messages_per_session',
    'max_facts_per_user',
    'low_confidence_threshold',
    'prune_schedule'
  ],
  additionalProperties: false
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create default memory configuration
 */
export function createDefaultConfig(): MemoryConfig {
  return {
    top_k: 10,
    memory_token_budget: 1500,
    clip_sentences: 2,
    allowed_edge_types: [
      'likes',
      'prefers',
      'works_at',
      'located_in',
      'interested_in',
      'expert_in'
    ],
    max_facts_in_context: 10,
    max_edges_per_turn: 5,
    min_relevance_score: 0.7,
    deduplication_enabled: true,
    fact_extraction_enabled: true,
    memory_decay_factor: 0.95,
    session_context_window: 10
  };
}

/**
 * Create conservative configuration (lower resource usage)
 */
export function createConservativeConfig(): MemoryConfig {
  return {
    top_k: 5,
    memory_token_budget: 500,
    clip_sentences: 1,
    allowed_edge_types: ['likes', 'works_at', 'located_in'],
    max_facts_in_context: 5,
    max_edges_per_turn: 2,
    min_relevance_score: 0.8,
    deduplication_enabled: true,
    fact_extraction_enabled: false
  };
}

/**
 * Create aggressive configuration (maximum context)
 */
export function createAggressiveConfig(): MemoryConfig {
  return {
    top_k: 20,
    memory_token_budget: 3000,
    clip_sentences: 3,
    allowed_edge_types: [
      'likes', 'dislikes', 'prefers',
      'works_at', 'worked_at',
      'located_in', 'lives_in',
      'knows', 'uses', 'owns',
      'interested_in', 'expert_in', 'learning'
    ],
    max_facts_in_context: 20,
    max_edges_per_turn: 10,
    min_relevance_score: 0.5,
    deduplication_enabled: false,
    fact_extraction_enabled: true,
    memory_decay_factor: 1.0,
    session_context_window: 20
  };
}

/**
 * Validate config values are within reasonable bounds
 */
export function validateConfig(config: MemoryConfig): string[] {
  const errors: string[] = [];
  
  if (config.top_k > 50) {
    errors.push('top_k should not exceed 50 for performance reasons');
  }
  
  if (config.memory_token_budget > 5000) {
    errors.push('memory_token_budget should not exceed 5000 to leave room for response');
  }
  
  if (config.max_facts_in_context > config.top_k) {
    errors.push('max_facts_in_context should not exceed top_k');
  }
  
  if (config.allowed_edge_types.length === 0) {
    errors.push('At least one edge type must be allowed');
  }
  
  return errors;
}

/**
 * Merge partial config with defaults
 */
export function mergeWithDefaults(
  partial: PartialMemoryConfig
): MemoryConfig {
  const defaults = createDefaultConfig();
  return { ...defaults, ...partial };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Configuration presets
 */
export const CONFIG_PRESETS = {
  DEFAULT: createDefaultConfig(),
  CONSERVATIVE: createConservativeConfig(),
  AGGRESSIVE: createAggressiveConfig()
} as const;

/**
 * Configuration limits
 */
export const CONFIG_LIMITS = {
  MIN_TOP_K: 1,
  MAX_TOP_K: 100,
  MIN_TOKEN_BUDGET: 100,
  MAX_TOKEN_BUDGET: 10000,
  MIN_CLIP_SENTENCES: 1,
  MAX_CLIP_SENTENCES: 10,
  MIN_FACTS: 0,
  MAX_FACTS: 50,
  MIN_EDGES_PER_TURN: 0,
  MAX_EDGES_PER_TURN: 20
} as const;

/**
 * Default retrieval strategy
 */
export const DEFAULT_RETRIEVAL_STRATEGY: RetrievalStrategy = {
  type: 'hybrid',
  semantic_weight: 0.7,
  recency_weight: 0.3,
  session_boost: 1.5
};

/**
 * Default pruning configuration
 */
export const DEFAULT_PRUNING_CONFIG: PruningConfig = {
  enabled: true,
  max_age_days: 90,
  max_messages_per_session: 1000,
  max_facts_per_user: 500,
  low_confidence_threshold: 0.3,
  prune_schedule: 'weekly'
};