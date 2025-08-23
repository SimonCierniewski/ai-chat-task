/**
 * @ai-chat-task/shared
 * Shared types, schemas, and utilities for the AI Chat Task monorepo
 */

// Export all telemetry types and schemas
export * from './telemetry';

// Export all pricing types and schemas (excluding conflicts)
export {
  type ModelPricing,
  type CreateModelPricing,
  type TokenUsage,
  type CostBreakdown,
  type BulkPricingUpdate,
  modelPricingSchema,
  calculateCost,
  formatCost,
  formatTokens,
  COMMON_MODELS,
  type CommonModel,
  MODEL_PROVIDERS,
  DEFAULT_PRICING
} from './pricing';

// Export all aggregate types
export * from './aggregates';

// Export memory and retrieval types (renamed to avoid conflicts)
export {
  type MessageRole,
  type RetrievalSourceType,
  type Message,
  type MessageMetadata,
  type TelemetryRetrievalResult,
  type RetrievalMetadata,
  type CreateMessage,
  type MemorySearchQuery as TelemetryMemorySearchQuery,
  type BatchMessages,
  messageSchema,
  retrievalResultSchema,
  createMessageSchema,
  memorySearchQuerySchema as telemetryMemorySearchQuerySchema,
  estimateTokens,
  truncateToTokens,
  sortByRelevance,
  filterByScore,
  calculateTotalTokens,
  trimToTokenBudget,
  MEMORY_DEFAULTS,
  MESSAGE_ROLE_LABELS,
  SOURCE_TYPE_LABELS
} from './telemetry-memory';

// Export knowledge graph types
export * from './graph';

// Export memory configuration types (renamed to avoid conflicts)
export {
  type MemoryConfig as BaseMemoryConfig,
  type PartialMemoryConfig,
  type RetrievalStrategy,
  type PruningConfig,
  type MemorySystemConfig,
  memoryConfigSchema,
  retrievalStrategySchema,
  pruningConfigSchema,
  createDefaultConfig,
  createConservativeConfig,
  createAggressiveConfig,
  validateConfig,
  mergeWithDefaults,
  CONFIG_PRESETS,
  CONFIG_LIMITS,
  DEFAULT_RETRIEVAL_STRATEGY,
  DEFAULT_PRUNING_CONFIG
} from './memory-config';

// Export admin settings types
export * from './admin-settings';

// Export message types
export * from './messages';

// Export API DTOs and schemas (with specific imports to avoid conflicts)
export * from './api/chat';
export * from './api/admin';

// Export from api/memory with renamed types to avoid conflicts
export {
  type MemoryUpsertRequest,
  type MemoryUpsertResponse,
  type MemorySearchQuery,
  type MemoryRetrievalResult,
  type MemorySearchResponse,
  type MemoryContext,
  type MemoryConfig,
  memoryUpsertRequestSchema,
  memorySearchQuerySchema,
  memorySearchResponseSchema,
  formatMemoryContext,
  deduplicateResults,
  sortByScore,
  trimContent,
  DEFAULT_MEMORY_CONFIG
} from './api/memory';