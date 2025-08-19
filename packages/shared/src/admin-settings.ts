/**
 * Admin Settings Types and Schemas
 * Configuration for admin dashboard memory and system settings
 */

import { JSONSchemaType } from 'ajv';
import { MemoryConfig, RetrievalStrategy, PruningConfig } from './memory-config';
import { GraphPredicate } from './graph';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Admin-specific memory settings
 * Extends MemoryConfig with admin UI preferences
 */
export interface AdminMemorySettings extends MemoryConfig {
  // UI Display settings
  display_name: string;                    // Human-friendly config name
  description?: string;                    // Config description
  is_active: boolean;                      // Currently active config
  is_default: boolean;                     // System default config
  
  // Admin overrides
  allow_user_override: boolean;            // Users can customize
  require_admin_approval: boolean;         // Changes need approval
  
  // Monitoring
  alert_on_high_usage: boolean;            // Alert when limits approached
  usage_threshold_percent: number;         // Alert threshold (0-100)
  
  // Metadata
  created_by: string;                      // Admin who created
  created_at: string | Date;               // Creation timestamp
  updated_by?: string;                     // Last admin to update
  updated_at?: string | Date;              // Last update timestamp
}

/**
 * System-wide memory settings
 */
export interface SystemMemorySettings {
  global_enabled: boolean;                 // Memory system on/off
  default_config: AdminMemorySettings;     // Default for new users
  user_configs: Map<string, AdminMemorySettings>; // Per-user overrides
  max_collections_per_user: number;        // Collection limit
  max_total_storage_gb: number;            // Total storage limit
  
  // Zep configuration
  zep_endpoint: string;                    // Zep API URL
  zep_timeout_ms: number;                  // API timeout
  zep_retry_attempts: number;              // Retry count
  zep_health_check_interval_ms: number;    // Health check frequency
  
  // Performance
  cache_enabled: boolean;                  // Enable caching
  cache_ttl_seconds: number;               // Cache TTL
  parallel_retrieval: boolean;             // Parallel Zep queries
  
  // Cost management
  monthly_budget_usd: number;              // Monthly Zep budget
  cost_per_gb: number;                     // Storage cost
  alert_at_percent: number;                // Budget alert threshold
}

/**
 * Admin dashboard preferences
 */
export interface AdminDashboardSettings {
  // Display preferences
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  date_format: string;
  
  // Memory management UI
  show_advanced_settings: boolean;
  default_view: 'grid' | 'list' | 'table';
  items_per_page: number;
  
  // Notifications
  email_notifications: boolean;
  slack_notifications: boolean;
  notification_email?: string;
  slack_webhook_url?: string;
  
  // Features
  enable_bulk_operations: boolean;
  enable_export: boolean;
  enable_api_access: boolean;
  api_rate_limit: number;
}

/**
 * Complete admin configuration
 */
export interface AdminConfiguration {
  memory: AdminMemorySettings;
  system: SystemMemorySettings;
  dashboard: AdminDashboardSettings;
  retrieval: RetrievalStrategy;
  pruning: PruningConfig;
  version: string;
  last_validated: string | Date;
}

// ============================================================================
// JSON Schemas (Ajv-compatible)
// ============================================================================

/**
 * JSON Schema for AdminMemorySettings validation
 */
export const adminMemorySettingsSchema: JSONSchemaType<AdminMemorySettings> = {
  type: 'object',
  properties: {
    // Inherited from MemoryConfig
    top_k: { type: 'integer', minimum: 1, maximum: 100 },
    memory_token_budget: { type: 'integer', minimum: 100, maximum: 10000 },
    clip_sentences: { type: 'integer', minimum: 1, maximum: 10 },
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
      uniqueItems: true
    },
    max_facts_in_context: { type: 'integer', minimum: 0, maximum: 50 },
    max_edges_per_turn: { type: 'integer', minimum: 0, maximum: 20 },
    min_relevance_score: { type: 'number', nullable: true, minimum: 0, maximum: 1 },
    deduplication_enabled: { type: 'boolean', nullable: true },
    fact_extraction_enabled: { type: 'boolean', nullable: true },
    memory_decay_factor: { type: 'number', nullable: true, minimum: 0, maximum: 1 },
    session_context_window: { type: 'integer', nullable: true, minimum: 1, maximum: 100 },
    
    // Admin-specific fields
    display_name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', nullable: true, maxLength: 500 },
    is_active: { type: 'boolean' },
    is_default: { type: 'boolean' },
    allow_user_override: { type: 'boolean' },
    require_admin_approval: { type: 'boolean' },
    alert_on_high_usage: { type: 'boolean' },
    usage_threshold_percent: { type: 'number', minimum: 0, maximum: 100 },
    created_by: { type: 'string', minLength: 1 },
    created_at: { type: 'string', format: 'date-time' },
    updated_by: { type: 'string', nullable: true, minLength: 1 },
    updated_at: { type: 'string', nullable: true, format: 'date-time' }
  },
  required: [
    'top_k', 'memory_token_budget', 'clip_sentences',
    'allowed_edge_types', 'max_facts_in_context', 'max_edges_per_turn',
    'display_name', 'is_active', 'is_default',
    'allow_user_override', 'require_admin_approval',
    'alert_on_high_usage', 'usage_threshold_percent',
    'created_by', 'created_at'
  ],
  additionalProperties: false
};

/**
 * JSON Schema for SystemMemorySettings validation
 */
export const systemMemorySettingsSchema: JSONSchemaType<Omit<SystemMemorySettings, 'user_configs' | 'default_config'> & { 
  default_config: AdminMemorySettings;
  user_configs: Array<{ user_id: string; config: AdminMemorySettings }>;
}> = {
  type: 'object',
  properties: {
    global_enabled: { type: 'boolean' },
    default_config: adminMemorySettingsSchema,
    user_configs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          config: adminMemorySettingsSchema
        },
        required: ['user_id', 'config'],
        additionalProperties: false
      }
    },
    max_collections_per_user: { type: 'integer', minimum: 1, maximum: 100 },
    max_total_storage_gb: { type: 'number', minimum: 1, maximum: 10000 },
    zep_endpoint: { type: 'string', format: 'uri' },
    zep_timeout_ms: { type: 'integer', minimum: 100, maximum: 30000 },
    zep_retry_attempts: { type: 'integer', minimum: 0, maximum: 5 },
    zep_health_check_interval_ms: { type: 'integer', minimum: 1000, maximum: 3600000 },
    cache_enabled: { type: 'boolean' },
    cache_ttl_seconds: { type: 'integer', minimum: 0, maximum: 86400 },
    parallel_retrieval: { type: 'boolean' },
    monthly_budget_usd: { type: 'number', minimum: 0, maximum: 100000 },
    cost_per_gb: { type: 'number', minimum: 0, maximum: 100 },
    alert_at_percent: { type: 'number', minimum: 0, maximum: 100 }
  },
  required: [
    'global_enabled', 'default_config', 'user_configs',
    'max_collections_per_user', 'max_total_storage_gb',
    'zep_endpoint', 'zep_timeout_ms', 'zep_retry_attempts',
    'zep_health_check_interval_ms', 'cache_enabled',
    'cache_ttl_seconds', 'parallel_retrieval',
    'monthly_budget_usd', 'cost_per_gb', 'alert_at_percent'
  ],
  additionalProperties: false
};

// ============================================================================
// Default Settings
// ============================================================================

/**
 * Create default admin memory settings
 */
export function createDefaultAdminSettings(): AdminMemorySettings {
  return {
    // Memory config defaults
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
    ] as GraphPredicate[],
    max_facts_in_context: 10,
    max_edges_per_turn: 5,
    min_relevance_score: 0.7,
    deduplication_enabled: true,
    fact_extraction_enabled: true,
    memory_decay_factor: 0.95,
    session_context_window: 10,
    
    // Admin-specific defaults
    display_name: 'Default Configuration',
    description: 'Standard memory configuration for all users',
    is_active: true,
    is_default: true,
    allow_user_override: false,
    require_admin_approval: true,
    alert_on_high_usage: true,
    usage_threshold_percent: 80,
    created_by: 'system',
    created_at: new Date().toISOString()
  };
}

/**
 * Create default system settings
 */
export function createDefaultSystemSettings(): SystemMemorySettings {
  return {
    global_enabled: true,
    default_config: createDefaultAdminSettings(),
    user_configs: new Map(),
    max_collections_per_user: 10,
    max_total_storage_gb: 100,
    
    // Zep defaults
    zep_endpoint: 'https://api.getzep.com/v3',
    zep_timeout_ms: 3000,
    zep_retry_attempts: 3,
    zep_health_check_interval_ms: 60000, // 1 minute
    
    // Performance defaults
    cache_enabled: true,
    cache_ttl_seconds: 300, // 5 minutes
    parallel_retrieval: true,
    
    // Cost defaults
    monthly_budget_usd: 100,
    cost_per_gb: 0.10,
    alert_at_percent: 80
  };
}

/**
 * Create default dashboard settings
 */
export function createDefaultDashboardSettings(): AdminDashboardSettings {
  return {
    theme: 'auto',
    language: 'en',
    timezone: 'UTC',
    date_format: 'YYYY-MM-DD',
    
    show_advanced_settings: false,
    default_view: 'grid',
    items_per_page: 20,
    
    email_notifications: true,
    slack_notifications: false,
    
    enable_bulk_operations: true,
    enable_export: true,
    enable_api_access: false,
    api_rate_limit: 100
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate admin settings
 */
export function validateAdminSettings(settings: AdminMemorySettings): string[] {
  const errors: string[] = [];
  
  if (settings.usage_threshold_percent < 50) {
    errors.push('Usage threshold should be at least 50%');
  }
  
  if (settings.is_default && !settings.is_active) {
    errors.push('Default configuration must be active');
  }
  
  if (settings.allow_user_override && settings.require_admin_approval) {
    errors.push('User overrides with admin approval may cause delays');
  }
  
  return errors;
}

/**
 * Clone settings for a new configuration
 */
export function cloneSettings(
  source: AdminMemorySettings,
  newName: string,
  createdBy: string
): AdminMemorySettings {
  return {
    ...source,
    display_name: newName,
    is_default: false,
    is_active: false,
    created_by: createdBy,
    created_at: new Date().toISOString(),
    updated_by: undefined,
    updated_at: undefined
  };
}

/**
 * Check if user has custom config
 */
export function hasCustomConfig(
  userId: string,
  system: SystemMemorySettings
): boolean {
  return system.user_configs.has(userId);
}

/**
 * Get effective config for user
 */
export function getEffectiveConfig(
  userId: string,
  system: SystemMemorySettings
): AdminMemorySettings {
  return system.user_configs.get(userId) || system.default_config;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Setting presets for different use cases
 */
export const ADMIN_PRESETS = {
  MINIMAL: {
    name: 'Minimal',
    description: 'Lowest resource usage, basic functionality',
    config: {
      top_k: 3,
      memory_token_budget: 300,
      clip_sentences: 1,
      max_facts_in_context: 3,
      max_edges_per_turn: 1
    }
  },
  BALANCED: {
    name: 'Balanced',
    description: 'Good balance of features and performance',
    config: {
      top_k: 10,
      memory_token_budget: 1500,
      clip_sentences: 2,
      max_facts_in_context: 10,
      max_edges_per_turn: 5
    }
  },
  COMPREHENSIVE: {
    name: 'Comprehensive',
    description: 'Maximum context and extraction',
    config: {
      top_k: 20,
      memory_token_budget: 3000,
      clip_sentences: 3,
      max_facts_in_context: 20,
      max_edges_per_turn: 10
    }
  }
} as const;

/**
 * Admin role permissions
 */
export const ADMIN_PERMISSIONS = {
  VIEW_SETTINGS: 'memory:settings:view',
  EDIT_SETTINGS: 'memory:settings:edit',
  VIEW_USAGE: 'memory:usage:view',
  MANAGE_USERS: 'memory:users:manage',
  EXPORT_DATA: 'memory:data:export',
  DELETE_DATA: 'memory:data:delete'
} as const;