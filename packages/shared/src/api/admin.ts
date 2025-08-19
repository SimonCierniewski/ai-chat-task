/**
 * Admin API DTOs and types
 */

/**
 * User information from admin perspective
 */
export interface AdminUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  created_at: string;
  updated_at?: string;
  last_active?: string;
  message_count?: number;
  session_count?: number;
  total_cost?: number;
}

/**
 * GET /api/v1/admin/users response
 */
export interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  page?: number;
  per_page?: number;
}

/**
 * GET /api/v1/admin/metrics query parameters
 */
export interface AdminMetricsQuery {
  from?: string;
  to?: string;
  userId?: string;
  groupBy?: 'day' | 'week' | 'month';
}

/**
 * Admin metrics query validation schema
 */
export const adminMetricsQuerySchema = {
  type: 'object',
  properties: {
    from: {
      type: 'string',
      format: 'date',
      description: 'Start date (YYYY-MM-DD)'
    },
    to: {
      type: 'string',
      format: 'date',
      description: 'End date (YYYY-MM-DD)'
    },
    userId: {
      type: 'string',
      pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',
      description: 'Filter by specific user ID'
    },
    groupBy: {
      type: 'string',
      enum: ['day', 'week', 'month'],
      default: 'day',
      description: 'Time grouping for metrics'
    }
  },
  additionalProperties: false
};

/**
 * Metrics data point
 */
export interface MetricsDataPoint {
  date: string;
  messages: number;
  users: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  avg_response_time_ms?: number;
  avg_ttft_ms?: number;
  errors?: number;
}

/**
 * GET /api/v1/admin/metrics response
 */
export interface AdminMetricsResponse {
  metrics: {
    totalMessages: number;
    totalUsers: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalCost: number;
    avgResponseTime: number;
    avgTTFT: number;
    errorRate: number;
  };
  timeSeries?: MetricsDataPoint[];
  period: {
    from: string;
    to: string;
  };
  userId?: string;
}

/**
 * Model pricing information
 */
export interface ModelPricing {
  model: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cached_input_per_mtok?: number;
  effective_date?: string;
  active: boolean;
}

/**
 * POST /api/v1/admin/models/pricing request body
 */
export interface ModelPricingUpdateRequest {
  model: string;
  input_per_mtok?: number;
  output_per_mtok?: number;
  cached_input_per_mtok?: number;
}

/**
 * Model pricing update validation schema
 */
export const modelPricingUpdateSchema = {
  type: 'object',
  required: ['model'],
  properties: {
    model: {
      type: 'string',
      pattern: '^[a-z0-9-_.]+$',
      minLength: 1,
      maxLength: 50,
      description: 'Model identifier'
    },
    input_per_mtok: {
      type: 'number',
      minimum: 0,
      maximum: 1000,
      multipleOf: 0.000001,
      description: 'Cost per million input tokens'
    },
    output_per_mtok: {
      type: 'number',
      minimum: 0,
      maximum: 1000,
      multipleOf: 0.000001,
      description: 'Cost per million output tokens'
    },
    cached_input_per_mtok: {
      type: 'number',
      minimum: 0,
      maximum: 1000,
      multipleOf: 0.000001,
      description: 'Cost per million cached input tokens'
    }
  },
  additionalProperties: false
};

/**
 * POST /api/v1/admin/models/pricing response
 */
export interface ModelPricingUpdateResponse {
  success: boolean;
  model: string;
  pricing: ModelPricing;
  previous?: ModelPricing;
}

/**
 * GET /api/v1/admin/models/pricing response
 */
export interface ModelPricingListResponse {
  models: ModelPricing[];
  last_updated: string;
}

/**
 * Admin dashboard settings
 */
export interface AdminSettings {
  features: {
    telemetry_enabled: boolean;
    cost_tracking_enabled: boolean;
    user_management_enabled: boolean;
    model_management_enabled: boolean;
    memory_management_enabled: boolean;
  };
  limits: {
    max_users?: number;
    max_messages_per_day?: number;
    max_cost_per_day?: number;
    max_tokens_per_request?: number;
  };
  alerts: {
    high_cost_threshold?: number;
    high_error_rate_threshold?: number;
    low_performance_threshold_ms?: number;
  };
}

/**
 * System health status
 */
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: boolean;
    auth: boolean;
    openai: boolean;
    zep: boolean;
  };
  metrics: {
    uptime_seconds: number;
    memory_usage_mb: number;
    cpu_usage_percent: number;
    active_connections: number;
    queue_size?: number;
  };
  last_check: string;
}

/**
 * Admin activity log entry
 */
export interface AdminActivity {
  id: string;
  admin_id: string;
  action: 'user_update' | 'pricing_update' | 'settings_update' | 'user_delete' | 'data_export';
  target?: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
}

/**
 * Bulk user operation request
 */
export interface BulkUserOperationRequest {
  user_ids: string[];
  operation: 'activate' | 'deactivate' | 'delete' | 'update_role';
  params?: {
    role?: 'user' | 'admin';
    reason?: string;
  };
}

/**
 * Bulk operation validation schema
 */
export const bulkUserOperationSchema = {
  type: 'object',
  required: ['user_ids', 'operation'],
  properties: {
    user_ids: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      },
      minItems: 1,
      maxItems: 100,
      uniqueItems: true
    },
    operation: {
      type: 'string',
      enum: ['activate', 'deactivate', 'delete', 'update_role']
    },
    params: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          enum: ['user', 'admin']
        },
        reason: {
          type: 'string',
          maxLength: 500
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

/**
 * Data export request
 */
export interface DataExportRequest {
  type: 'users' | 'metrics' | 'telemetry' | 'all';
  format: 'json' | 'csv';
  from?: string;
  to?: string;
  user_ids?: string[];
}

/**
 * Helper to calculate cost
 */
export function calculateCost(
  tokens_in: number,
  tokens_out: number,
  pricing: ModelPricing
): number {
  const inputCost = (tokens_in / 1_000_000) * pricing.input_per_mtok;
  const outputCost = (tokens_out / 1_000_000) * pricing.output_per_mtok;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
}

/**
 * Helper to format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 6,
    maximumFractionDigits: 6
  }).format(amount);
}

/**
 * Helper to aggregate metrics
 */
export function aggregateMetrics(dataPoints: MetricsDataPoint[]): AdminMetricsResponse['metrics'] {
  const totals = dataPoints.reduce((acc, point) => ({
    totalMessages: acc.totalMessages + point.messages,
    totalUsers: Math.max(acc.totalUsers, point.users), // Take max for unique users
    totalTokensIn: acc.totalTokensIn + point.tokens_in,
    totalTokensOut: acc.totalTokensOut + point.tokens_out,
    totalCost: acc.totalCost + point.cost_usd,
    responseTimeSum: acc.responseTimeSum + (point.avg_response_time_ms || 0) * point.messages,
    ttftSum: acc.ttftSum + (point.avg_ttft_ms || 0) * point.messages,
    errorCount: acc.errorCount + (point.errors || 0),
    validResponseTimes: acc.validResponseTimes + (point.avg_response_time_ms ? point.messages : 0),
    validTTFTs: acc.validTTFTs + (point.avg_ttft_ms ? point.messages : 0)
  }), {
    totalMessages: 0,
    totalUsers: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCost: 0,
    responseTimeSum: 0,
    ttftSum: 0,
    errorCount: 0,
    validResponseTimes: 0,
    validTTFTs: 0
  });

  return {
    totalMessages: totals.totalMessages,
    totalUsers: totals.totalUsers,
    totalTokensIn: totals.totalTokensIn,
    totalTokensOut: totals.totalTokensOut,
    totalCost: totals.totalCost,
    avgResponseTime: totals.validResponseTimes > 0 
      ? Math.round(totals.responseTimeSum / totals.validResponseTimes) 
      : 0,
    avgTTFT: totals.validTTFTs > 0 
      ? Math.round(totals.ttftSum / totals.validTTFTs) 
      : 0,
    errorRate: totals.totalMessages > 0 
      ? totals.errorCount / totals.totalMessages 
      : 0
  };
}