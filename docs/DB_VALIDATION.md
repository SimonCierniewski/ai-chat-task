# Database Validation Guide

This document provides step-by-step queries to validate the telemetry and pricing database setup. Execute these queries in order using `psql` or the Supabase SQL Editor.

## Prerequisites

Before running validation queries, ensure all migrations have been executed:

```sql
-- Check if required extensions are installed
SELECT extname, extversion 
FROM pg_extension 
WHERE extname IN ('pgcrypto', 'uuid-ossp');

-- Expected output: pgcrypto should be listed
```

## 1. Verify Table Creation

### Check All Tables Exist

```sql
-- List telemetry-related tables
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'telemetry_events', 
    'daily_usage', 
    'models_pricing'
  )
ORDER BY table_name;

-- Expected output: 3 rows (all tables)
```

### Check Views Exist

```sql
-- List telemetry views
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('daily_usage_view', 'daily_usage_mv')
ORDER BY table_name;

-- Expected output: 1 VIEW and 1 MATERIALIZED VIEW
```

### Verify Table Structures

```sql
-- Check telemetry_events columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'telemetry_events' 
ORDER BY ordinal_position;

-- Check models_pricing columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'models_pricing' 
ORDER BY ordinal_position;
```

## 2. Insert Sample Data

### Insert Model Pricing

```sql
-- Insert sample pricing data
INSERT INTO public.models_pricing (
    model, 
    input_per_mtok, 
    output_per_mtok, 
    cached_input_per_mtok
) VALUES 
    ('gpt-4o-mini', 0.150000, 0.600000, 0.075000),
    ('gpt-4o', 2.500000, 10.000000, 1.250000),
    ('gpt-4-turbo', 10.000000, 30.000000, 5.000000)
ON CONFLICT (model) DO UPDATE SET
    input_per_mtok = EXCLUDED.input_per_mtok,
    output_per_mtok = EXCLUDED.output_per_mtok,
    updated_at = NOW();

-- Verify insertion
SELECT model, input_per_mtok, output_per_mtok, cached_input_per_mtok 
FROM models_pricing 
ORDER BY model;

-- Expected output: 3 rows with pricing data
```

### Generate Test User IDs

```sql
-- Create test user IDs for consistency
DO $$
DECLARE
    test_user1 uuid := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    test_user2 uuid := 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
BEGIN
    -- Store in a temp table for reference
    CREATE TEMP TABLE IF NOT EXISTS test_users (
        user_id uuid,
        label text
    );
    
    DELETE FROM test_users;
    
    INSERT INTO test_users VALUES 
        (test_user1, 'test_user_1'),
        (test_user2, 'test_user_2');
END $$;

SELECT * FROM test_users;
```

### Insert Telemetry Events

```sql
-- Insert various telemetry events (as service role would)
-- Note: In production, only service role can insert

-- Day 1: User 1 activity
INSERT INTO public.telemetry_events (
    user_id, 
    session_id, 
    type, 
    payload_json, 
    created_at
) VALUES 
    -- Message sent event
    (
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
        'session-001',
        'message_sent',
        '{"duration_ms": 1500}'::jsonb,
        NOW() - INTERVAL '2 days'
    ),
    -- OpenAI call with gpt-4o-mini
    (
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
        'session-001',
        'openai_call',
        '{
            "model": "gpt-4o-mini",
            "tokens_in": 150,
            "tokens_out": 450,
            "cost_usd": 0.000315,
            "ttft_ms": 230,
            "openai_ms": 1200,
            "duration_ms": 1450
        }'::jsonb,
        NOW() - INTERVAL '2 days'
    ),
    -- Zep search event
    (
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
        'session-001',
        'zep_search',
        '{"zep_ms": 150}'::jsonb,
        NOW() - INTERVAL '2 days'
    );

-- Day 2: User 1 and User 2 activity
INSERT INTO public.telemetry_events (
    user_id, 
    session_id, 
    type, 
    payload_json, 
    created_at
) VALUES 
    -- User 1: OpenAI call with gpt-4o
    (
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
        'session-002',
        'openai_call',
        '{
            "model": "gpt-4o",
            "tokens_in": 200,
            "tokens_out": 600,
            "cost_usd": 0.0065,
            "ttft_ms": 180,
            "openai_ms": 2100,
            "duration_ms": 2300
        }'::jsonb,
        NOW() - INTERVAL '1 day'
    ),
    -- User 2: Multiple OpenAI calls
    (
        'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid,
        'session-003',
        'openai_call',
        '{
            "model": "gpt-4o-mini",
            "tokens_in": 100,
            "tokens_out": 300,
            "cost_usd": 0.000195,
            "ttft_ms": 195,
            "openai_ms": 980,
            "duration_ms": 1100
        }'::jsonb,
        NOW() - INTERVAL '1 day'
    ),
    (
        'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid,
        'session-003',
        'openai_call',
        '{
            "model": "gpt-4o-mini",
            "tokens_in": 120,
            "tokens_out": 380,
            "cost_usd": 0.000246,
            "ttft_ms": 210,
            "openai_ms": 1050,
            "duration_ms": 1250
        }'::jsonb,
        NOW() - INTERVAL '1 day'
    );

-- Today: Error event
INSERT INTO public.telemetry_events (
    user_id, 
    session_id, 
    type, 
    payload_json, 
    created_at
) VALUES 
    (
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
        'session-004',
        'error',
        '{
            "error": "Rate limit exceeded",
            "duration_ms": 50
        }'::jsonb,
        NOW()
    );

-- Verify insertions
SELECT 
    type, 
    COUNT(*) as count,
    MIN(created_at::date) as earliest,
    MAX(created_at::date) as latest
FROM telemetry_events 
GROUP BY type 
ORDER BY type;

-- Expected output: 
-- error: 1
-- message_sent: 1
-- openai_call: 4
-- zep_search: 1
```

## 3. Test Aggregation Views

### Query Real-time View

```sql
-- Query daily usage view
SELECT 
    day,
    user_id,
    model,
    tokens_in,
    tokens_out,
    cost_usd,
    calls,
    ROUND(avg_ttft_ms::numeric, 2) as avg_ttft_ms,
    ROUND(avg_duration_ms::numeric, 2) as avg_duration_ms
FROM daily_usage_view
WHERE day >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY day DESC, user_id, model;

-- Expected output: Aggregated rows by day/user/model
```

### Refresh and Query Materialized View

```sql
-- Refresh the materialized view
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_usage_mv;

-- Query materialized view
SELECT 
    day,
    user_id,
    model,
    tokens_in,
    tokens_out,
    cost_usd,
    calls,
    last_refreshed
FROM daily_usage_mv
WHERE day >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY day DESC, user_id, model;

-- Compare counts between view and materialized view
SELECT 
    'view' as source,
    COUNT(*) as row_count,
    SUM(calls) as total_calls,
    SUM(cost_usd) as total_cost
FROM daily_usage_view
WHERE day >= CURRENT_DATE - INTERVAL '7 days'
UNION ALL
SELECT 
    'materialized' as source,
    COUNT(*) as row_count,
    SUM(calls) as total_calls,
    SUM(cost_usd) as total_cost
FROM daily_usage_mv
WHERE day >= CURRENT_DATE - INTERVAL '7 days';

-- Expected output: Both should match
```

### Test Aggregation Function

```sql
-- Test the daily_usage table aggregation function
SELECT public.aggregate_daily_usage(CURRENT_DATE - INTERVAL '2 days');
SELECT public.aggregate_daily_usage(CURRENT_DATE - INTERVAL '1 day');
SELECT public.aggregate_daily_usage(CURRENT_DATE);

-- Query the daily_usage table
SELECT 
    day,
    user_id,
    model,
    tokens_in,
    tokens_out,
    cost_usd,
    calls
FROM daily_usage
ORDER BY day DESC, user_id, model;
```

## 4. Test Cost Calculation

### Calculate Sample Costs

```sql
-- Test cost calculation function
SELECT * FROM public.calculate_token_cost(
    'gpt-4o-mini',
    1000,    -- input tokens
    500,     -- output tokens
    0        -- cached tokens
);

-- Expected output: cost breakdown with model_found = true

-- Test with cached tokens
SELECT * FROM public.calculate_token_cost(
    'gpt-4o',
    1000,    -- input tokens
    500,     -- output tokens  
    800      -- cached tokens
);

-- Test with unknown model
SELECT * FROM public.calculate_token_cost(
    'unknown-model',
    1000,
    500,
    0
);

-- Expected output: model_found = false
```

### Verify Cost Consistency

```sql
-- Compare stored costs with recalculated costs
SELECT 
    t.payload_json->>'model' as model,
    (t.payload_json->>'cost_usd')::numeric as stored_cost,
    c.total_cost_usd as calculated_cost,
    ABS((t.payload_json->>'cost_usd')::numeric - c.total_cost_usd) as difference
FROM telemetry_events t
CROSS JOIN LATERAL (
    SELECT * FROM public.calculate_token_cost(
        t.payload_json->>'model',
        (t.payload_json->>'tokens_in')::bigint,
        (t.payload_json->>'tokens_out')::bigint,
        0
    )
) c
WHERE t.type = 'openai_call'
  AND t.payload_json ? 'model'
  AND t.payload_json ? 'tokens_in'
  AND t.payload_json ? 'tokens_out';

-- Expected output: Small or zero differences
```

## 5. Test Row Level Security (RLS)

### Setup Test Roles

```sql
-- Create test JWT claims for different roles
-- Note: In Supabase, use the Dashboard to test with actual auth tokens

-- For local testing, simulate role contexts
-- WARNING: Only works in local Postgres, not in Supabase
SET LOCAL ROLE postgres;  -- Admin/service role
```

### Test Service Role Access (ALLOWED)

```sql
-- As service role, all operations should work
-- This simulates what the API backend does

-- Test SELECT (should work)
SELECT COUNT(*) FROM telemetry_events;
SELECT COUNT(*) FROM daily_usage;
SELECT COUNT(*) FROM models_pricing;

-- Test INSERT (should work)
INSERT INTO telemetry_events (
    user_id, 
    session_id, 
    type, 
    payload_json
) VALUES (
    gen_random_uuid(),
    'test-rls',
    'message_sent',
    '{"duration_ms": 100}'::jsonb
);

-- Test UPDATE on pricing (should work)
UPDATE models_pricing 
SET input_per_mtok = input_per_mtok * 1.1 
WHERE model = 'gpt-4o-mini'
RETURNING model, input_per_mtok;

-- Rollback the update
UPDATE models_pricing 
SET input_per_mtok = 0.150000 
WHERE model = 'gpt-4o-mini';

-- Clean up test insert
DELETE FROM telemetry_events 
WHERE session_id = 'test-rls';
```

### Test Anon Role Access (BLOCKED)

```sql
-- In Supabase SQL Editor, to test RLS:
-- 1. First, ensure RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('telemetry_events', 'daily_usage', 'models_pricing');

-- Expected: rowsecurity = true for all

-- 2. Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('telemetry_events', 'daily_usage', 'models_pricing')
ORDER BY tablename, policyname;

-- 3. Test with anon key (in Supabase)
-- Use the Supabase client library or REST API with anon key
-- All of these should return empty results or permission denied:

-- Via Supabase REST API with anon key:
-- GET /rest/v1/telemetry_events
-- Expected: [] (empty array)

-- GET /rest/v1/daily_usage  
-- Expected: [] (empty array)

-- GET /rest/v1/models_pricing
-- Expected: [] or data depending on if you allowed public reads

-- POST /rest/v1/telemetry_events
-- Expected: 403 Forbidden
```

### Test Authenticated Role Access

```sql
-- Test with authenticated user (not admin)
-- In Supabase, use a logged-in user's token

-- These should fail or return empty:
-- GET /rest/v1/telemetry_events
-- Expected: [] (blocked by RLS)

-- POST /rest/v1/telemetry_events  
-- Expected: 403 Forbidden

-- Only models_pricing might be readable if configured for public access
-- GET /rest/v1/models_pricing
-- Expected: data if public read enabled, [] otherwise
```

## 6. Performance Validation

### Check Indexes

```sql
-- List all indexes on telemetry tables
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('telemetry_events', 'daily_usage', 'models_pricing')
ORDER BY tablename, indexname;

-- Expected: Multiple indexes per table for optimization
```

### Query Performance

```sql
-- Test query performance with EXPLAIN
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    day,
    SUM(cost_usd) as total_cost,
    SUM(calls) as total_calls
FROM daily_usage_view
WHERE day >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;

-- Check if indexes are being used
EXPLAIN (ANALYZE, BUFFERS)
SELECT * 
FROM telemetry_events
WHERE user_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Expected: Index scans, not sequential scans
```

## 7. Data Integrity Checks

### Validate Constraints

```sql
-- Test CHECK constraints

-- This should fail (negative price)
BEGIN;
INSERT INTO models_pricing (model, input_per_mtok, output_per_mtok)
VALUES ('test-model', -1.0, 1.0);
ROLLBACK;
-- Expected: ERROR - violates check constraint "positive_rates"

-- This should fail (invalid event type)
BEGIN;
INSERT INTO telemetry_events (user_id, type, payload_json)
VALUES (gen_random_uuid(), 'invalid_type', '{}'::jsonb);
ROLLBACK;
-- Expected: ERROR - violates check constraint on type

-- This should fail (cached rate higher than regular rate)
BEGIN;
INSERT INTO models_pricing (
    model, 
    input_per_mtok, 
    output_per_mtok, 
    cached_input_per_mtok
)
VALUES ('test-model', 1.0, 2.0, 1.5);
ROLLBACK;
-- Expected: ERROR - violates check constraint "cached_rate_discount"
```

### Validate Payload Structure

```sql
-- Check that payload validation works
BEGIN;

-- Valid openai_call payload
INSERT INTO telemetry_events (user_id, type, payload_json)
VALUES (
    gen_random_uuid(), 
    'openai_call',
    '{
        "model": "gpt-4o",
        "tokens_in": 100,
        "tokens_out": 200,
        "cost_usd": 0.001,
        "openai_ms": 500
    }'::jsonb
);

-- This should succeed based on constraint
ROLLBACK;

-- Invalid payload (missing required fields for openai_call)
-- Note: This will succeed because our CHECK constraint is permissive
-- In production, validate in application layer
BEGIN;
INSERT INTO telemetry_events (user_id, type, payload_json)
VALUES (
    gen_random_uuid(), 
    'openai_call',
    '{"some_field": "value"}'::jsonb
);
-- This will insert but won't aggregate properly
ROLLBACK;
```

## 8. Cleanup Test Data

### Remove Test Events

```sql
-- Clean up test data (optional)
DELETE FROM telemetry_events 
WHERE user_id IN (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid
);

-- Clean up daily_usage
DELETE FROM daily_usage 
WHERE user_id IN (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid
);

-- Refresh materialized view after cleanup
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_usage_mv;

-- Verify cleanup
SELECT COUNT(*) as remaining_events FROM telemetry_events
WHERE user_id IN (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid
);

-- Expected: 0
```

## Troubleshooting

### Extension Missing

```sql
-- Error: function gen_random_uuid() does not exist
-- Solution: Install pgcrypto extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Verify installation
SELECT * FROM pg_extension WHERE extname = 'pgcrypto';
```

### RLS Blocking Access

```sql
-- Issue: Queries return no data even as admin
-- Check if RLS is enabled
SELECT 
    tablename,
    rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'telemetry_events';

-- Check current role
SELECT current_user, current_role;

-- If using Supabase, ensure using service role key
-- The service_role key bypasses RLS
-- The anon key is subject to RLS policies

-- List all policies
SELECT * FROM pg_policies 
WHERE tablename = 'telemetry_events';

-- Temporarily disable RLS for debugging (DANGEROUS - only in dev)
-- ALTER TABLE telemetry_events DISABLE ROW LEVEL SECURITY;
-- Remember to re-enable: 
-- ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;
```

### View Not Refreshing

```sql
-- Issue: Materialized view shows old data
-- Solution: Refresh it
REFRESH MATERIALIZED VIEW daily_usage_mv;

-- For concurrent refresh (non-blocking)
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_usage_mv;

-- Check last refresh time
SELECT DISTINCT last_refreshed 
FROM daily_usage_mv 
LIMIT 1;

-- Set up automatic refresh (requires pg_cron or external scheduler)
-- Example with pg_cron:
-- SELECT cron.schedule(
--     'refresh-daily-usage',
--     '0 * * * *',  -- Every hour
--     'REFRESH MATERIALIZED VIEW CONCURRENTLY daily_usage_mv;'
-- );
```

### Aggregation Not Working

```sql
-- Issue: daily_usage view returns no data
-- Check if telemetry_events has proper data

-- Verify events exist
SELECT type, COUNT(*) 
FROM telemetry_events 
WHERE type = 'openai_call' 
GROUP BY type;

-- Check payload structure
SELECT 
    payload_json ? 'model' as has_model,
    payload_json ? 'tokens_in' as has_tokens_in,
    payload_json ? 'tokens_out' as has_tokens_out,
    payload_json ? 'cost_usd' as has_cost_usd,
    COUNT(*)
FROM telemetry_events
WHERE type = 'openai_call'
GROUP BY 1, 2, 3, 4;

-- All should be true for proper aggregation

-- Check for NULL values that might break aggregation
SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN payload_json->>'model' IS NULL THEN 1 END) as null_model,
    COUNT(CASE WHEN payload_json->>'tokens_in' IS NULL THEN 1 END) as null_tokens_in
FROM telemetry_events
WHERE type = 'openai_call';
```

### Cost Calculation Mismatch

```sql
-- Issue: Calculated costs don't match stored costs
-- Check pricing table
SELECT * FROM models_pricing 
WHERE model IN (
    SELECT DISTINCT payload_json->>'model' 
    FROM telemetry_events 
    WHERE type = 'openai_call'
);

-- Recalculate and compare
WITH event_costs AS (
    SELECT 
        id,
        payload_json->>'model' as model,
        (payload_json->>'tokens_in')::bigint as tokens_in,
        (payload_json->>'tokens_out')::bigint as tokens_out,
        (payload_json->>'cost_usd')::numeric as stored_cost
    FROM telemetry_events
    WHERE type = 'openai_call'
)
SELECT 
    e.*,
    c.total_cost_usd as calculated_cost,
    e.stored_cost - c.total_cost_usd as difference,
    CASE 
        WHEN ABS(e.stored_cost - c.total_cost_usd) < 0.000001 THEN 'OK'
        ELSE 'MISMATCH'
    END as status
FROM event_costs e
CROSS JOIN LATERAL (
    SELECT * FROM calculate_token_cost(
        e.model,
        e.tokens_in,
        e.tokens_out,
        0
    )
) c;
```

### Permission Denied Errors

```sql
-- Issue: Getting permission denied even with correct role
-- Check role and permissions

-- Current user and role
SELECT 
    current_user,
    current_role,
    current_setting('role') as effective_role,
    session_user;

-- Check grants on tables
SELECT 
    grantee,
    table_name,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('telemetry_events', 'daily_usage', 'models_pricing')
ORDER BY table_name, grantee, privilege_type;

-- Check function permissions
SELECT 
    proname,
    proacl
FROM pg_proc
WHERE proname IN (
    'calculate_token_cost',
    'aggregate_daily_usage',
    'refresh_daily_usage_mv'
);
```

## Expected Results Summary

After running all validation queries:

1. ✅ All tables and views created successfully
2. ✅ Sample data inserts without errors
3. ✅ Aggregation views return correct summaries
4. ✅ Cost calculations match stored values
5. ✅ RLS blocks unauthorized access
6. ✅ Service role has full access
7. ✅ Indexes are used for queries
8. ✅ Constraints prevent invalid data

## Next Steps

1. Set up automated refresh for materialized view
2. Configure monitoring for anomalous costs
3. Implement data retention policy
4. Set up alerts for RLS policy violations
5. Create backup and recovery procedures