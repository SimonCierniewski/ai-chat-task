# Phase 2 Verification Guide - Telemetry & Pricing

## Overview

This document provides a complete verification checklist for Phase 2 (Telemetry & Pricing Tables) of the AI Chat Task project. Follow these steps to validate that all telemetry infrastructure is correctly deployed and functional.

**Prerequisites:**
- Supabase project created and accessible
- All Phase 2 migrations executed (005-010)
- Service role key available for testing
- SQL Editor access in Supabase Dashboard

## ✅ Verification Checklist

### 1. Database Schema Verification

#### 1.1 Tables Creation
```sql
-- Run in Supabase SQL Editor
-- Expected: 4 rows returned
SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('telemetry_events', 'daily_usage', 'models_pricing') THEN '✅ Required'
        ELSE '📊 Optional'
    END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'telemetry_events',    -- Core events table
    'daily_usage',         -- Aggregation table
    'models_pricing',      -- Pricing configuration
    'profiles'             -- From Phase 1
  )
ORDER BY 
    CASE table_name 
        WHEN 'telemetry_events' THEN 1
        WHEN 'daily_usage' THEN 2
        WHEN 'models_pricing' THEN 3
        ELSE 4
    END;
```

- [ ] `telemetry_events` table exists
- [ ] `daily_usage` table exists
- [ ] `models_pricing` table exists
- [ ] All tables show in query results

#### 1.2 Views Creation
```sql
-- Check views exist
-- Expected: 2 rows (1 VIEW, 1 MATERIALIZED VIEW)
SELECT 
    table_name,
    table_type,
    CASE table_type
        WHEN 'VIEW' THEN '🔄 Real-time'
        WHEN 'MATERIALIZED VIEW' THEN '💾 Cached'
    END as description
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('daily_usage_view', 'daily_usage_mv')
ORDER BY table_name;
```

- [ ] `daily_usage_view` exists as VIEW
- [ ] `daily_usage_mv` exists as MATERIALIZED VIEW

### 2. Indexes Verification

#### 2.1 Check All Indexes
```sql
-- Verify indexes are created for performance
-- Expected: Multiple indexes per table
SELECT 
    tablename,
    indexname,
    CASE 
        WHEN indexname LIKE '%_pkey' THEN '🔑 Primary Key'
        WHEN indexname LIKE '%_unique' THEN '🔒 Unique'
        ELSE '⚡ Performance'
    END as index_type
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('telemetry_events', 'daily_usage', 'models_pricing')
ORDER BY tablename, indexname;
```

- [ ] `telemetry_events` has indexes on (user_id, created_at), (created_at), (session_id)
- [ ] `daily_usage` has indexes on (day), (user_id, day), (model, day)
- [ ] `models_pricing` has primary key on model

### 3. RLS (Row Level Security) Verification

#### 3.1 RLS Status Check
```sql
-- Verify RLS is enabled on all telemetry tables
-- Expected: All should show rowsecurity = true
SELECT 
    tablename,
    rowsecurity,
    CASE rowsecurity 
        WHEN true THEN '✅ Enabled'
        ELSE '❌ DISABLED - SECURITY RISK!'
    END as rls_status
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('telemetry_events', 'daily_usage', 'models_pricing')
ORDER BY tablename;
```

- [ ] All tables show `rowsecurity = true`

#### 3.2 RLS Policies Check
```sql
-- List all RLS policies
-- Expected: 4 policies per table (SELECT, INSERT, UPDATE, DELETE)
SELECT 
    tablename,
    policyname,
    cmd as operation,
    roles,
    permissive as allows_access
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('telemetry_events', 'daily_usage', 'models_pricing')
ORDER BY tablename, cmd;
```

- [ ] Each table has policies for SELECT, INSERT, UPDATE, DELETE
- [ ] All policies restrict to `service_role` only (except models_pricing SELECT)

### 4. Pricing Table Verification

#### 4.1 Insert Sample Pricing
```sql
-- Insert test pricing data
INSERT INTO public.models_pricing (
    model, 
    input_per_mtok, 
    output_per_mtok, 
    cached_input_per_mtok
) VALUES 
    ('test-model-phase2', 1.50, 3.00, 0.75)
ON CONFLICT (model) DO UPDATE SET
    updated_at = NOW();

-- Verify insertion
SELECT * FROM models_pricing WHERE model = 'test-model-phase2';
```

- [ ] Pricing row inserts successfully
- [ ] Values are stored correctly

#### 4.2 Test Client Access (Should Fail)
```javascript
// Test in browser console with Supabase client
// This should return empty or error
const { data, error } = await supabase
  .from('models_pricing')
  .update({ input_per_mtok: 999 })
  .eq('model', 'test-model-phase2');

console.log('Update attempt:', { data, error });
// Expected: error or empty data due to RLS
```

- [ ] Client update fails (RLS blocks it)
- [ ] Error indicates permission denied

#### 4.3 Server-Side Update (Should Work)
```sql
-- Simulate server-side update with service role
-- Run this in SQL Editor (which uses service role)
UPDATE models_pricing 
SET input_per_mtok = 2.00 
WHERE model = 'test-model-phase2'
RETURNING *;
```

- [ ] Update succeeds in SQL Editor
- [ ] New value is returned

### 5. Telemetry Events Verification

#### 5.1 Insert Test Events
```sql
-- Insert various event types for testing
DO $$
DECLARE
    test_user_id uuid := gen_random_uuid();
    yesterday timestamp := NOW() - INTERVAL '1 day';
    today timestamp := NOW();
BEGIN
    -- Insert test events
    INSERT INTO public.telemetry_events (
        user_id, session_id, type, payload_json, created_at
    ) VALUES 
        -- Yesterday's events
        (test_user_id, 'test-session-1', 'message_sent', 
         '{"duration_ms": 1500}'::jsonb, yesterday),
        
        (test_user_id, 'test-session-1', 'openai_call',
         '{"model": "gpt-4o-mini", "tokens_in": 100, "tokens_out": 300, 
           "cost_usd": 0.000195, "ttft_ms": 200, "openai_ms": 1000, 
           "duration_ms": 1200}'::jsonb, yesterday),
        
        (test_user_id, 'test-session-1', 'openai_call',
         '{"model": "gpt-4o", "tokens_in": 200, "tokens_out": 500,
           "cost_usd": 0.0055, "ttft_ms": 250, "openai_ms": 1500,
           "duration_ms": 1700}'::jsonb, yesterday),
        
        -- Today's events
        (test_user_id, 'test-session-2', 'openai_call',
         '{"model": "gpt-4o-mini", "tokens_in": 150, "tokens_out": 400,
           "cost_usd": 0.000263, "ttft_ms": 180, "openai_ms": 900,
           "duration_ms": 1100}'::jsonb, today),
        
        (test_user_id, 'test-session-2', 'zep_search',
         '{"zep_ms": 150}'::jsonb, today),
        
        (test_user_id, 'test-session-2', 'error',
         '{"error": "Test error", "duration_ms": 50}'::jsonb, today);
    
    -- Store the test user ID for verification
    RAISE NOTICE 'Test user ID: %', test_user_id;
END $$;
```

- [ ] Events insert without errors
- [ ] Note the test user ID for next steps

#### 5.2 Verify Event Storage
```sql
-- Check events were stored correctly
-- Replace 'YOUR-TEST-USER-ID' with the ID from previous step
SELECT 
    type,
    COUNT(*) as event_count,
    MIN(created_at::date) as earliest_date,
    MAX(created_at::date) as latest_date
FROM telemetry_events
WHERE user_id = 'YOUR-TEST-USER-ID'::uuid  -- Replace with actual ID
GROUP BY type
ORDER BY type;
```

- [ ] Shows correct event counts by type
- [ ] Date range spans yesterday and today

### 6. Aggregation Verification

#### 6.1 Test Daily Usage View
```sql
-- Query the real-time aggregation view
-- Replace 'YOUR-TEST-USER-ID' with the test ID
SELECT 
    day,
    model,
    tokens_in,
    tokens_out,
    cost_usd,
    calls,
    ROUND(avg_ttft_ms::numeric, 2) as avg_ttft_ms
FROM daily_usage_view
WHERE user_id = 'YOUR-TEST-USER-ID'::uuid
ORDER BY day DESC, model;
```

- [ ] Returns aggregated rows by day and model
- [ ] Totals match the inserted events
- [ ] Cost calculations are correct

#### 6.2 Test Aggregation Function
```sql
-- Run the aggregation function for specific dates
SELECT public.aggregate_daily_usage(CURRENT_DATE - INTERVAL '1 day');
SELECT public.aggregate_daily_usage(CURRENT_DATE);

-- Check the daily_usage table
SELECT 
    day,
    model,
    tokens_in,
    tokens_out,
    cost_usd,
    calls
FROM daily_usage
WHERE user_id IN (
    SELECT DISTINCT user_id 
    FROM telemetry_events 
    WHERE session_id LIKE 'test-session-%'
)
ORDER BY day DESC, model;
```

- [ ] Aggregation function executes without errors
- [ ] Daily usage table contains aggregated data
- [ ] Values match the view results

### 7. Materialized View Verification

#### 7.1 Refresh Materialized View
```sql
-- Test the refresh function
SELECT refresh_daily_usage_mv();

-- Alternative: Direct refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_usage_mv;

-- Check last refresh time
SELECT 
    MIN(last_refreshed) as earliest_refresh,
    MAX(last_refreshed) as latest_refresh,
    COUNT(DISTINCT last_refreshed) as refresh_count
FROM daily_usage_mv;
```

- [ ] Refresh completes without errors
- [ ] Last refresh time is current
- [ ] All rows have same refresh timestamp

#### 7.2 Compare View vs Materialized View
```sql
-- Compare data between real-time and cached views
WITH view_summary AS (
    SELECT 
        'real_time_view' as source,
        COUNT(*) as row_count,
        SUM(calls) as total_calls,
        SUM(cost_usd) as total_cost
    FROM daily_usage_view
    WHERE day >= CURRENT_DATE - INTERVAL '7 days'
),
mv_summary AS (
    SELECT 
        'materialized_view' as source,
        COUNT(*) as row_count,
        SUM(calls) as total_calls,
        SUM(cost_usd) as total_cost
    FROM daily_usage_mv
    WHERE day >= CURRENT_DATE - INTERVAL '7 days'
)
SELECT * FROM view_summary
UNION ALL
SELECT * FROM mv_summary;
```

- [ ] Both views return same totals
- [ ] Row counts match

### 8. Cost Calculation Verification

#### 8.1 Test Cost Function
```sql
-- Test the cost calculation function with various inputs
SELECT 
    'Small request' as scenario,
    * 
FROM public.calculate_token_cost('gpt-4o-mini', 100, 200, 0)
UNION ALL
SELECT 
    'Large request' as scenario,
    * 
FROM public.calculate_token_cost('gpt-4o', 1000, 2000, 500)
UNION ALL
SELECT 
    'Unknown model' as scenario,
    * 
FROM public.calculate_token_cost('unknown-model', 100, 200, 0);
```

- [ ] Known models return correct costs
- [ ] Unknown model returns model_found = false
- [ ] Cached token discount is applied correctly

#### 8.2 Validate Cost Consistency
```sql
-- Compare stored costs with recalculated costs
WITH cost_comparison AS (
    SELECT 
        t.id,
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
      AND t.payload_json ? 'cost_usd'
)
SELECT 
    COUNT(*) as total_events,
    COUNT(CASE WHEN difference < 0.000001 THEN 1 END) as matching_costs,
    MAX(difference) as max_difference
FROM cost_comparison;
```

- [ ] Most costs match (within rounding tolerance)
- [ ] No large discrepancies

### 9. Security Verification

#### 9.1 Test RLS with Different Roles
```sql
-- This should work (using service role in SQL Editor)
SELECT COUNT(*) as service_role_count 
FROM telemetry_events;

-- Test what anon role would see (should be empty)
-- Note: This is simulated - actual test requires using anon key
SET ROLE anon;
SELECT COUNT(*) as anon_count FROM telemetry_events;
RESET ROLE;
```

- [ ] Service role sees data
- [ ] Anon role sees no data (if testable)

#### 9.2 Verify No Client Access
```javascript
// Test in browser console with Supabase client library
// All of these should return empty arrays or errors

// Test 1: Try to read telemetry
const { data: telemetryData, error: telemetryError } = await supabase
  .from('telemetry_events')
  .select('*')
  .limit(1);
console.log('Telemetry read:', { data: telemetryData, error: telemetryError });

// Test 2: Try to insert telemetry
const { data: insertData, error: insertError } = await supabase
  .from('telemetry_events')
  .insert({
    user_id: 'test-user',
    type: 'message_sent',
    payload_json: { test: true }
  });
console.log('Telemetry insert:', { data: insertData, error: insertError });

// Test 3: Try to read daily usage
const { data: usageData, error: usageError } = await supabase
  .from('daily_usage')
  .select('*')
  .limit(1);
console.log('Usage read:', { data: usageData, error: usageError });
```

- [ ] All client queries return empty or error
- [ ] RLS successfully blocks unauthorized access

### 10. Cleanup

#### 10.1 Remove Test Data
```sql
-- Clean up test events
DELETE FROM telemetry_events 
WHERE session_id LIKE 'test-session-%';

-- Clean up test pricing
DELETE FROM models_pricing 
WHERE model = 'test-model-phase2';

-- Clean up aggregated test data
DELETE FROM daily_usage 
WHERE user_id IN (
    SELECT DISTINCT user_id 
    FROM telemetry_events 
    WHERE session_id LIKE 'test-session-%'
);

-- Refresh materialized view after cleanup
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_usage_mv;
```

- [ ] Test data removed successfully
- [ ] No test artifacts remain

## 📋 Summary Checklist

### Core Requirements
- [ ] All telemetry tables created with proper schema
- [ ] Indexes exist for performance optimization
- [ ] RLS enabled and policies configured correctly
- [ ] Views (real-time and materialized) functioning

### Functional Requirements
- [ ] Pricing can be edited server-side only
- [ ] Telemetry events aggregate correctly
- [ ] Cost calculations match expected values
- [ ] Materialized view refresh works

### Security Requirements
- [ ] Client access blocked by RLS
- [ ] Service role has full access
- [ ] No data leakage to unauthorized roles

### Documentation
- [ ] All Phase 2 docs accessible
- [ ] Migration files present and documented
- [ ] README updated with Phase 2 status

## 🎉 Phase 2 Complete!

If all checks pass, Phase 2 (Telemetry & Pricing Tables) is successfully deployed and verified.

### Next Steps
1. Configure automated refresh for materialized view (cron job or Supabase Edge Function)
2. Set up monitoring alerts for cost anomalies
3. Implement data retention policies
4. Proceed to Phase 3 (Zep Integration)

## 🔧 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Tables not found | Run migrations 005-010 in order |
| RLS blocking service role | Check role in SQL Editor settings |
| Materialized view stale | Run `REFRESH MATERIALIZED VIEW CONCURRENTLY daily_usage_mv` |
| Costs not calculating | Ensure models_pricing has data for used models |
| Client can access data | Verify RLS is enabled on all tables |

### Debug Queries

```sql
-- Check current role
SELECT current_user, current_role;

-- Check RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE '%telemetry%' OR tablename LIKE '%pricing%';

-- Check for missing extensions
SELECT * FROM pg_extension WHERE extname = 'pgcrypto';

-- View recent telemetry events
SELECT * FROM telemetry_events 
ORDER BY created_at DESC 
LIMIT 10;
```

## 📚 Related Documentation

- [TELEMETRY.md](./TELEMETRY.md) - Telemetry system design
- [PRICING.md](./PRICING.md) - Pricing configuration
- [COSTS.md](./COSTS.md) - Cost calculation specification
- [DB_VALIDATION.md](./DB_VALIDATION.md) - Database validation procedures
- [ENVIRONMENT.md](./ENVIRONMENT.md) - Environment variables
- [SECRETS_MATRIX.md](../infra/SECRETS_MATRIX.md) - Security boundaries