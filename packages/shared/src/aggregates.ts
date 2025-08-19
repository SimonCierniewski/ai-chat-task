/**
 * Aggregate Types for Reporting Views
 * Shared contracts for daily usage and other aggregated data
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Daily usage aggregation row from views/materialized views
 * Matches the structure of daily_usage_view and daily_usage_mv
 */
export interface DailyUsageRow {
  // Dimensions
  day: string | Date;           // Date of aggregation
  user_id: string;             // User UUID
  model: string;               // Model identifier
  
  // Token metrics
  tokens_in: number;           // Total input tokens
  tokens_out: number;          // Total output tokens
  
  // Cost metrics
  cost_usd: number;            // Total cost in USD
  
  // Volume metrics
  calls: number;               // Number of API calls
  
  // Performance metrics (milliseconds)
  avg_ttft_ms: number | null;     // Average time to first token
  avg_duration_ms: number | null;  // Average request duration
  
  // Extended percentile metrics (from view only)
  min_ttft_ms?: number | null;     // Minimum TTFT
  max_ttft_ms?: number | null;     // Maximum TTFT
  median_ttft_ms?: number | null;  // 50th percentile TTFT
  p95_ttft_ms?: number | null;     // 95th percentile TTFT
  
  // Metadata (from materialized view only)
  last_refreshed?: string | Date;  // When the data was last refreshed
}

/**
 * Query parameters for daily usage filtering
 */
export interface DailyUsageQuery {
  start_date?: string | Date;   // Start of date range (inclusive)
  end_date?: string | Date;     // End of date range (inclusive)
  user_id?: string;             // Filter by specific user
  model?: string;               // Filter by specific model
  limit?: number;               // Maximum rows to return
  offset?: number;              // Pagination offset
}

/**
 * Aggregated metrics summary
 */
export interface UsageSummary {
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  total_calls: number;
  unique_users: number;
  unique_models: number;
  avg_ttft_ms: number | null;
  avg_duration_ms: number | null;
  period_start: string | Date;
  period_end: string | Date;
}

/**
 * User-level usage summary
 */
export interface UserUsageSummary {
  user_id: string;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  total_calls: number;
  most_used_model: string;
  models_used: string[];
  first_usage: string | Date;
  last_usage: string | Date;
}

/**
 * Model-level usage summary
 */
export interface ModelUsageSummary {
  model: string;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  total_calls: number;
  unique_users: number;
  avg_tokens_per_call: number;
  avg_cost_per_call: number;
}

/**
 * Time series data point for charts
 */
export interface TimeSeriesPoint {
  timestamp: string | Date;
  value: number;
  label?: string;
}

/**
 * Chart data structure for dashboard visualizations
 */
export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Group daily usage rows by a specific dimension
 */
export function groupDailyUsage<K extends keyof DailyUsageRow>(
  rows: DailyUsageRow[],
  groupBy: K
): Map<DailyUsageRow[K], DailyUsageRow[]> {
  const grouped = new Map<DailyUsageRow[K], DailyUsageRow[]>();
  
  for (const row of rows) {
    const key = row[groupBy];
    const existing = grouped.get(key) || [];
    existing.push(row);
    grouped.set(key, existing);
  }
  
  return grouped;
}

/**
 * Calculate summary statistics from daily usage rows
 */
export function calculateUsageSummary(rows: DailyUsageRow[]): UsageSummary {
  if (rows.length === 0) {
    const now = new Date();
    return {
      total_tokens_in: 0,
      total_tokens_out: 0,
      total_cost_usd: 0,
      total_calls: 0,
      unique_users: 0,
      unique_models: 0,
      avg_ttft_ms: null,
      avg_duration_ms: null,
      period_start: now,
      period_end: now
    };
  }
  
  const uniqueUsers = new Set(rows.map(r => r.user_id));
  const uniqueModels = new Set(rows.map(r => r.model));
  
  const totals = rows.reduce((acc, row) => {
    acc.tokens_in += row.tokens_in;
    acc.tokens_out += row.tokens_out;
    acc.cost_usd += row.cost_usd;
    acc.calls += row.calls;
    
    if (row.avg_ttft_ms !== null) {
      acc.ttft_sum += row.avg_ttft_ms * row.calls;
      acc.ttft_count += row.calls;
    }
    
    if (row.avg_duration_ms !== null) {
      acc.duration_sum += row.avg_duration_ms * row.calls;
      acc.duration_count += row.calls;
    }
    
    return acc;
  }, {
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: 0,
    calls: 0,
    ttft_sum: 0,
    ttft_count: 0,
    duration_sum: 0,
    duration_count: 0
  });
  
  const dates = rows.map(r => new Date(r.day).getTime());
  
  return {
    total_tokens_in: totals.tokens_in,
    total_tokens_out: totals.tokens_out,
    total_cost_usd: totals.cost_usd,
    total_calls: totals.calls,
    unique_users: uniqueUsers.size,
    unique_models: uniqueModels.size,
    avg_ttft_ms: totals.ttft_count > 0 ? totals.ttft_sum / totals.ttft_count : null,
    avg_duration_ms: totals.duration_count > 0 ? totals.duration_sum / totals.duration_count : null,
    period_start: new Date(Math.min(...dates)),
    period_end: new Date(Math.max(...dates))
  };
}

/**
 * Convert daily usage to time series for charting
 */
export function toTimeSeries(
  rows: DailyUsageRow[],
  metric: 'cost_usd' | 'calls' | 'tokens_in' | 'tokens_out'
): TimeSeriesPoint[] {
  // Group by day and sum the metric
  const byDay = new Map<string, number>();
  
  for (const row of rows) {
    const day = new Date(row.day).toISOString().split('T')[0];
    const existing = byDay.get(day) || 0;
    byDay.set(day, existing + row[metric]);
  }
  
  // Convert to time series points
  return Array.from(byDay.entries())
    .map(([day, value]) => ({
      timestamp: day,
      value,
      label: day
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Format daily usage for CSV export
 */
export function toCsv(rows: DailyUsageRow[]): string {
  if (rows.length === 0) return '';
  
  // Define columns
  const columns = [
    'day',
    'user_id',
    'model',
    'tokens_in',
    'tokens_out',
    'cost_usd',
    'calls',
    'avg_ttft_ms',
    'avg_duration_ms'
  ];
  
  // Create header
  const header = columns.join(',');
  
  // Create rows
  const dataRows = rows.map(row => {
    return columns.map(col => {
      const value = row[col as keyof DailyUsageRow];
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value.toString();
    }).join(',');
  });
  
  return [header, ...dataRows].join('\n');
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default query limits
 */
export const QUERY_DEFAULTS = {
  LIMIT: 100,
  MAX_LIMIT: 10000,
  DEFAULT_DAYS: 30
} as const;

/**
 * Metric display names
 */
export const METRIC_LABELS = {
  tokens_in: 'Input Tokens',
  tokens_out: 'Output Tokens',
  cost_usd: 'Cost (USD)',
  calls: 'API Calls',
  avg_ttft_ms: 'Avg. TTFT (ms)',
  avg_duration_ms: 'Avg. Duration (ms)',
  median_ttft_ms: 'Median TTFT (ms)',
  p95_ttft_ms: 'P95 TTFT (ms)'
} as const;

/**
 * Chart color palette
 */
export const CHART_COLORS = {
  primary: '#3b82f6',    // blue-500
  secondary: '#10b981',  // emerald-500
  tertiary: '#f59e0b',   // amber-500
  quaternary: '#8b5cf6', // violet-500
  danger: '#ef4444',     // red-500
  success: '#22c55e',    // green-500
  warning: '#f97316',    // orange-500
  info: '#06b6d4'        // cyan-500
} as const;