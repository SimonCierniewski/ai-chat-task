/**
 * Pricing Types and Schemas
 * Shared contracts for model pricing across API and Admin
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Model pricing structure as stored in database
 */
export interface ModelPricing {
  model: string;                        // Model identifier (e.g., 'gpt-4o-mini')
  input_per_mtok: number;              // Cost per million input tokens (USD)
  output_per_mtok: number;             // Cost per million output tokens (USD)
  cached_input_per_mtok?: number | null; // Cost per million cached tokens (USD)
  updated_at: string | Date;            // Last update timestamp
  created_at?: string | Date;           // Creation timestamp
}

/**
 * Model pricing input for creation/update
 */
export interface CreateModelPricing {
  model: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cached_input_per_mtok?: number | null;
}

/**
 * Cost calculation input
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens?: number;
}

/**
 * Cost calculation result
 */
export interface CostBreakdown {
  total_cost_usd: number;
  input_cost_usd: number;
  output_cost_usd: number;
  cached_cost_usd: number;
  model_found: boolean;
}

/**
 * Bulk pricing update entry
 */
export interface BulkPricingUpdate {
  model: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cached_input_per_mtok?: number | null;
}

// ============================================================================
// JSON Schemas (Ajv-compatible)
// ============================================================================

/**
 * JSON Schema for ModelPricing validation
 */
export const modelPricingSchema: any = {
  type: 'object',
  properties: {
    model: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^[a-zA-Z0-9-._]+$', // Alphanumeric with hyphens, dots, underscores
      description: 'Model identifier'
    },
    input_per_mtok: {
      type: 'number',
      minimum: 0,
      exclusiveMinimum: 0,
      maximum: 1000000, // Reasonable upper limit
      description: 'Cost per million input tokens in USD'
    },
    output_per_mtok: {
      type: 'number',
      minimum: 0,
      exclusiveMinimum: 0,
      maximum: 1000000,
      description: 'Cost per million output tokens in USD'
    },
    cached_input_per_mtok: {
      type: ['number', 'null'],
      minimum: 0,
      exclusiveMinimum: 0,
      maximum: 1000000,
      description: 'Cost per million cached input tokens in USD'
    }
  },
  required: ['model', 'input_per_mtok', 'output_per_mtok'],
  additionalProperties: false
};

/**
 * JSON Schema for token usage validation
 */
export const tokenUsageSchema: any = {
  type: 'object',
  properties: {
    input_tokens: {
      type: 'integer',
      minimum: 0,
      description: 'Number of input tokens'
    },
    output_tokens: {
      type: 'integer',
      minimum: 0,
      description: 'Number of output tokens'
    },
    cached_input_tokens: {
      type: ['integer', 'null'],
      minimum: 0,
      description: 'Number of cached input tokens'
    }
  },
  required: ['input_tokens', 'output_tokens'],
  additionalProperties: false
};

/**
 * JSON Schema for bulk pricing update
 */
export const bulkPricingUpdateSchema: any = {
  type: 'array',
  items: modelPricingSchema,
  minItems: 1,
  maxItems: 1000 // Reasonable limit for bulk updates
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate cost for given token usage and pricing
 */
export function calculateCost(
  usage: TokenUsage,
  pricing: ModelPricing
): CostBreakdown {
  const { input_tokens, output_tokens, cached_input_tokens = 0 } = usage;
  
  // Calculate regular input cost (excluding cached)
  const regularInputTokens = Math.max(0, input_tokens - cached_input_tokens);
  const inputCost = (regularInputTokens / 1_000_000) * pricing.input_per_mtok;
  
  // Calculate cached input cost
  let cachedCost = 0;
  if (cached_input_tokens > 0) {
    const cachedRate = pricing.cached_input_per_mtok ?? pricing.input_per_mtok;
    cachedCost = (cached_input_tokens / 1_000_000) * cachedRate;
  }
  
  // Calculate output cost
  const outputCost = (output_tokens / 1_000_000) * pricing.output_per_mtok;
  
  return {
    total_cost_usd: inputCost + cachedCost + outputCost,
    input_cost_usd: inputCost,
    output_cost_usd: outputCost,
    cached_cost_usd: cachedCost,
    model_found: true
  };
}

/**
 * Format cost for display (USD)
 */
export function formatCost(cost: number, precision: number = 6): string {
  return `$${cost.toFixed(precision)}`;
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  } else if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Common model identifiers
 */
export const COMMON_MODELS = {
  // OpenAI
  GPT_4O: 'gpt-4o',
  GPT_4O_MINI: 'gpt-4o-mini',
  GPT_4_TURBO: 'gpt-4-turbo',
  GPT_4: 'gpt-4',
  GPT_35_TURBO: 'gpt-3.5-turbo',
  
  // Anthropic
  CLAUDE_3_OPUS: 'claude-3-opus',
  CLAUDE_3_SONNET: 'claude-3-sonnet',
  CLAUDE_3_HAIKU: 'claude-3-haiku',
  
  // Others
  MISTRAL_LARGE: 'mistral-large',
  MISTRAL_MEDIUM: 'mistral-medium',
  LLAMA_2_70B: 'llama-2-70b'
} as const;

export type CommonModel = typeof COMMON_MODELS[keyof typeof COMMON_MODELS];

/**
 * Model provider mapping
 */
export const MODEL_PROVIDERS: Record<string, string> = {
  'gpt-4o': 'OpenAI',
  'gpt-4o-mini': 'OpenAI',
  'gpt-4-turbo': 'OpenAI',
  'gpt-4': 'OpenAI',
  'gpt-3.5-turbo': 'OpenAI',
  'claude-3-opus': 'Anthropic',
  'claude-3-sonnet': 'Anthropic',
  'claude-3-haiku': 'Anthropic',
  'mistral-large': 'Mistral',
  'mistral-medium': 'Mistral',
  'llama-2-70b': 'Meta'
};

/**
 * Default pricing fallback (when model not found)
 */
export const DEFAULT_PRICING: ModelPricing = {
  model: 'unknown',
  input_per_mtok: 1.0,
  output_per_mtok: 2.0,
  cached_input_per_mtok: 0.5,
  updated_at: new Date()
};