# Telemetry System Documentation

## Overview

The telemetry system tracks API usage, performance metrics, and costs for the AI Chat application. It consists of three main database tables and provides comprehensive monitoring capabilities for both operational insights and billing.

## Database Schema

### 1. telemetry_events

The main event storage table that captures all telemetry data in real-time.

#### Table Structure

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `id` | uuid | Unique event identifier | PRIMARY KEY, auto-generated |
| `user_id` | uuid | User who triggered the event | NOT NULL |
| `session_id` | text | Optional session identifier | Nullable |
| `type` | text | Event type | CHECK constraint, NOT NULL |
| `payload_json` | jsonb | Event-specific data | NOT NULL, validated per type |
| `created_at` | timestamptz | Event timestamp | NOT NULL, defaults to now() |

#### Event Types

1. **message_sent** - User sends a message to the API
   - Required payload fields:
     - `duration_ms`: Total request duration

2. **openai_call** - API calls OpenAI
   - Required payload fields:
     - `openai_ms`: OpenAI API response time
     - `model`: Model used (e.g., "gpt-4o-mini")
     - `tokens_in`: Input token count
     - `tokens_out`: Output token count
     - `cost_usd`: Calculated cost in USD
   - Optional payload fields:
     - `ttft_ms`: Time to first token (for streaming)

3. **zep_upsert** - Memory facts written to Zep
   - Required payload fields:
     - `zep_ms`: Zep API response time

4. **zep_search** - Memory retrieval from Zep
   - Required payload fields:
     - `zep_ms`: Zep API response time

5. **error** - Error events
   - Required payload fields:
     - `error`: Error message or details

#### Indices

- `(user_id, created_at DESC)` - User-specific queries with time range
- `(created_at DESC)` - Time-series queries
- `(session_id)` - Session-based queries (partial index where not null)
- `(type)` - Event type filtering
- `((payload_json->>'model'))` - Model-specific queries for openai_call events

### 2. daily_usage

Aggregated daily metrics for efficient dashboard queries and reporting.

#### Table Structure

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `day` | date | Date of aggregation | Part of composite PK |
| `user_id` | uuid | User identifier | Part of composite PK |
| `model` | text | AI model used | Part of composite PK |
| `tokens_in` | bigint | Total input tokens | NOT NULL, default 0 |
| `tokens_out` | bigint | Total output tokens | NOT NULL, default 0 |
| `cost_usd` | numeric(10,6) | Total cost in USD | NOT NULL, default 0 |
| `calls` | integer | Number of API calls | NOT NULL, default 0 |
| `avg_ttft_ms` | numeric(10,2) | Average time to first token | Nullable |
| `avg_duration_ms` | numeric(10,2) | Average request duration | Nullable |
| `created_at` | timestamptz | Record creation time | NOT NULL |
| `updated_at` | timestamptz | Last update time | NOT NULL |

#### Aggregation Function

```sql
public.aggregate_daily_usage(target_date date)
```

Aggregates telemetry_events into daily_usage for a specific date. Should be called periodically (e.g., via cron job or after batch inserts).

### 3. models_pricing

Stores pricing information for different AI models to calculate costs dynamically.

#### Table Structure

| Column | Type | Description | Constraints |
|--------|------|-------------|-------------|
| `model` | text | Model identifier | PRIMARY KEY |
| `input_per_mtok` | numeric(10,6) | Cost per million input tokens | NOT NULL, > 0 |
| `output_per_mtok` | numeric(10,6) | Cost per million output tokens | NOT NULL, > 0 |
| `cached_input_per_mtok` | numeric(10,6) | Cost per million cached tokens | Nullable, > 0 if set |
| `created_at` | timestamptz | Record creation time | NOT NULL |
| `updated_at` | timestamptz | Last update time | NOT NULL |

#### Cost Calculation Function

```sql
public.calculate_model_cost(
    p_model text,
    p_tokens_in bigint,
    p_tokens_out bigint,
    p_cached_tokens_in bigint DEFAULT 0
) RETURNS numeric
```

Calculates the cost in USD for a given model and token usage.

## Security & Access Control

### Row Level Security (RLS)

All telemetry tables have RLS enabled with the following policies:

#### telemetry_events
- **INSERT/UPDATE/DELETE**: Service role only
- **SELECT**: Service role only
- **Rationale**: Only the API backend should write events, and only admin dashboards (using service role) should read them

#### daily_usage
- **INSERT/UPDATE/DELETE**: Service role only
- **SELECT**: Service role only
- **Rationale**: Aggregated data is managed by backend jobs and read by admin dashboards

#### models_pricing
- **INSERT/UPDATE/DELETE**: Service role only
- **SELECT**: All roles (public information)
- **Rationale**: Pricing is public information but only admins can modify it

### Writers and Readers

#### Who Writes Telemetry Data?

1. **API Backend** (using service role key):
   - Writes to `telemetry_events` after each operation
   - Runs aggregation to populate `daily_usage`
   - Updates `models_pricing` via admin endpoints

2. **Scheduled Jobs** (using service role key):
   - Aggregates `telemetry_events` → `daily_usage` daily
   - Cleans up old telemetry data (if configured)

#### Who Reads Telemetry Data?

1. **Admin Dashboard** (server-side with service role):
   - Queries `daily_usage` for charts and metrics
   - Queries `telemetry_events` for detailed logs
   - Reads `models_pricing` for cost calculations

2. **API Backend** (using service role key):
   - Reads `models_pricing` to calculate costs
   - May query recent events for rate limiting

## Implementation Guidelines

### Writing Events

```typescript
// Example: Writing an openai_call event
await supabase.from('telemetry_events').insert({
  user_id: userId,
  session_id: sessionId,
  type: 'openai_call',
  payload_json: {
    ttft_ms: 245,
    openai_ms: 1230,
    duration_ms: 1500,
    model: 'gpt-4o-mini',
    tokens_in: 150,
    tokens_out: 420,
    cost_usd: 0.000315
  }
});
```

### Querying Metrics

```typescript
// Example: Get daily usage for a user
const { data } = await supabase
  .from('daily_usage')
  .select('*')
  .eq('user_id', userId)
  .gte('day', startDate)
  .lte('day', endDate)
  .order('day', { ascending: false });
```

### Aggregating Data

```sql
-- Run daily aggregation (typically via cron)
SELECT public.aggregate_daily_usage(CURRENT_DATE - INTERVAL '1 day');
```

## Performance Considerations

1. **Indexing Strategy**: Optimized for time-series queries and user-specific lookups
2. **JSONB Efficiency**: Payload stored as JSONB for flexibility with GIN indexing on common fields
3. **Aggregation**: Pre-computed daily metrics reduce query complexity for dashboards
4. **Partitioning**: Consider partitioning `telemetry_events` by month if data volume grows significantly

## Reporting Views

### daily_usage_view

A real-time view that aggregates telemetry events by day, user, and model. This view performs on-the-fly aggregation of the raw telemetry data.

#### Features
- Real-time data (always current)
- No refresh needed
- Includes percentile metrics (median, p95)
- Suitable for small to medium datasets

#### Aggregation Logic

The view aggregates `openai_call` events from `telemetry_events`:

1. **Day Truncation**: Uses `date_trunc('day', created_at AT TIME ZONE 'UTC')` for consistent UTC-based grouping
2. **Metrics Calculated**:
   - `tokens_in/out`: Sum of token usage
   - `cost_usd`: Sum of pre-calculated costs from events
   - `calls`: Count of API calls
   - `avg_ttft_ms`: Average time to first token
   - `avg_duration_ms`: Average request duration
   - `median_ttft_ms`: 50th percentile TTFT
   - `p95_ttft_ms`: 95th percentile TTFT

### daily_usage_mv (Materialized View)

A cached version of the aggregation for better performance on large datasets.

#### Features
- Cached data (requires refresh)
- Much faster queries
- Includes `last_refreshed` timestamp
- Supports concurrent refresh (non-blocking)

#### Refresh Strategies

1. **Full Refresh**: `SELECT refresh_daily_usage_mv()`
   - Rebuilds entire view
   - Uses CONCURRENTLY to avoid blocking reads

2. **Incremental Refresh**: `SELECT refresh_daily_usage_mv_incremental(7)`
   - Updates only recent N days
   - More efficient for large datasets
   - Reduces refresh time

### Timezone Considerations

#### UTC vs Local Time Trade-offs

**Default (UTC)**:
```sql
date_trunc('day', created_at AT TIME ZONE 'UTC')::date
```
- ✅ Consistent across regions
- ✅ No ambiguity during DST changes
- ✅ Easier for global aggregation
- ❌ May not align with business hours

**Local Time (e.g., Europe/Warsaw)**:
```sql
date_trunc('day', created_at AT TIME ZONE 'Europe/Warsaw')::date
```
- ✅ Aligns with business reporting
- ✅ Intuitive for local teams
- ❌ DST transitions cause complexity
- ❌ Different results per timezone

#### Switching Timezones

To switch from UTC to local timezone:
1. Update the view definition (both standard and materialized)
2. Replace all instances of `'UTC'` with your timezone (e.g., `'Europe/Warsaw'`)
3. Refresh the materialized view
4. Update any dependent reports

### Query Examples

```sql
-- Query the real-time view
SELECT * FROM daily_usage_view 
WHERE day BETWEEN '2025-01-01' AND '2025-01-31'
  AND user_id = 'specific-user-uuid'
ORDER BY day DESC;

-- Query the materialized view (faster)
SELECT * FROM daily_usage_mv
WHERE day >= CURRENT_DATE - INTERVAL '30 days'
  AND model = 'gpt-4o-mini'
ORDER BY day DESC, cost_usd DESC;

-- Check when materialized view was last refreshed
SELECT DISTINCT last_refreshed 
FROM daily_usage_mv 
LIMIT 1;
```

## Migration Order

Run migrations in this sequence:
1. `005_create_telemetry_events_table.sql` - Core event table
2. `006_create_telemetry_rls_policies.sql` - Security policies
3. `007_create_daily_usage_table.sql` - Aggregation table
4. `008_create_models_pricing_table.sql` - Pricing configuration
5. `009_create_models_pricing_standalone.sql` - Enhanced pricing with triggers
6. `010_create_daily_usage_views.sql` - Reporting views and refresh functions

## Monitoring & Alerts

Recommended monitoring:
- Alert if aggregation job fails
- Monitor event ingestion rate
- Track storage growth of `telemetry_events`
- Alert on unusual cost spikes in `daily_usage`

## Data Retention

Suggested retention policies:
- `telemetry_events`: Keep 90 days of raw events
- `daily_usage`: Keep indefinitely (low storage overhead)
- Archive old `telemetry_events` to cold storage if needed