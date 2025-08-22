-- Migration: 010_create_daily_usage_views.sql
-- Purpose: Create reporting views for daily usage aggregation
-- Author: AI Chat Task
-- Date: 2025-01-19

-- Drop existing views if they exist (for clean recreation)
DROP VIEW IF EXISTS public.daily_usage_view CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.daily_usage_mv CASCADE;
DROP FUNCTION IF EXISTS public.refresh_daily_usage_mv() CASCADE;

-- ============================================================================
-- STANDARD VIEW (Real-time aggregation)
-- ============================================================================

-- Create daily_usage_view for real-time aggregation
-- Uses UTC timezone by default for consistency across regions
CREATE OR REPLACE VIEW public.daily_usage_view AS
SELECT 
    -- Day truncation using UTC
    date_trunc('day', t.created_at AT TIME ZONE 'UTC')::date as day,
    
    -- For Europe/Warsaw timezone (commented variant):
    -- date_trunc('day', t.created_at AT TIME ZONE 'Europe/Warsaw')::date as day,
    
    t.user_id,
    COALESCE(t.payload_json->>'model', 'unknown') as model,
    
    -- Token aggregations
    COALESCE(SUM((t.payload_json->>'tokens_in')::bigint), 0) as tokens_in,
    COALESCE(SUM((t.payload_json->>'tokens_out')::bigint), 0) as tokens_out,
    
    -- Cost aggregation (already calculated in events)
    COALESCE(SUM((t.payload_json->>'cost_usd')::numeric), 0.0) as cost_usd,
    
    -- Call count
    COUNT(*) as calls,
    
    -- Performance metrics (milliseconds)
    AVG((t.payload_json->>'ttft_ms')::numeric) as avg_ttft_ms,
    -- Get duration_ms from correlated message_sent events
    AVG((
        SELECT (m.payload_json->>'duration_ms')::numeric
        FROM public.telemetry_events m
        WHERE m.type = 'message_sent'
        AND m.session_id = t.session_id
        AND m.created_at BETWEEN t.created_at - INTERVAL '5 seconds' AND t.created_at + INTERVAL '30 seconds'
        ORDER BY ABS(EXTRACT(EPOCH FROM (m.created_at - t.created_at)))
        LIMIT 1
    )) as avg_duration_ms,
    
    -- Additional useful metrics
    MIN((t.payload_json->>'ttft_ms')::numeric) as min_ttft_ms,
    MAX((t.payload_json->>'ttft_ms')::numeric) as max_ttft_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (t.payload_json->>'ttft_ms')::numeric) as median_ttft_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (t.payload_json->>'ttft_ms')::numeric) as p95_ttft_ms
FROM 
    public.telemetry_events t
WHERE 
    t.type = 'openai_call'
    AND t.payload_json ? 'model'
    AND t.payload_json ? 'tokens_in'
    AND t.payload_json ? 'tokens_out'
    AND t.payload_json ? 'cost_usd'
GROUP BY 
    date_trunc('day', t.created_at AT TIME ZONE 'UTC')::date,
    -- For Europe/Warsaw: date_trunc('day', t.created_at AT TIME ZONE 'Europe/Warsaw')::date,
    t.user_id,
    t.payload_json->>'model'
ORDER BY 
    day DESC,
    user_id,
    model;

-- Add comment for documentation
COMMENT ON VIEW public.daily_usage_view IS 
    'Real-time view aggregating telemetry events by day (UTC), user, and model. Provides token usage, costs, and performance metrics.';

-- ============================================================================
-- MATERIALIZED VIEW (Cached aggregation for better performance)
-- ============================================================================

-- Create materialized view for better query performance on large datasets
-- This version uses a lateral join to efficiently correlate message_sent events for duration
CREATE MATERIALIZED VIEW public.daily_usage_mv AS
WITH openai_with_duration AS (
    SELECT 
        t.*,
        t.payload_json->>'model' as model,
        (t.payload_json->>'tokens_in')::bigint as tokens_in,
        (t.payload_json->>'tokens_out')::bigint as tokens_out,
        (t.payload_json->>'cost_usd')::numeric as cost_usd,
        (t.payload_json->>'ttft_ms')::numeric as ttft_ms,
        -- Get duration from the closest message_sent event
        m.duration_ms
    FROM 
        public.telemetry_events t
    LEFT JOIN LATERAL (
        SELECT (payload_json->>'duration_ms')::numeric as duration_ms
        FROM public.telemetry_events
        WHERE type = 'message_sent'
        AND session_id = t.session_id
        AND created_at BETWEEN t.created_at - INTERVAL '5 seconds' AND t.created_at + INTERVAL '30 seconds'
        ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - t.created_at)))
        LIMIT 1
    ) m ON true
    WHERE 
        t.type = 'openai_call'
        AND t.payload_json ? 'model'
        AND t.payload_json ? 'tokens_in'
        AND t.payload_json ? 'tokens_out'
        AND t.payload_json ? 'cost_usd'
)
SELECT 
    -- Day truncation using UTC
    date_trunc('day', created_at AT TIME ZONE 'UTC')::date as day,
    user_id,
    COALESCE(model, 'unknown') as model,
    
    -- Token aggregations
    COALESCE(SUM(tokens_in), 0) as tokens_in,
    COALESCE(SUM(tokens_out), 0) as tokens_out,
    
    -- Cost aggregation
    COALESCE(SUM(cost_usd), 0.0) as cost_usd,
    
    -- Call count
    COUNT(*) as calls,
    
    -- Performance metrics
    AVG(ttft_ms) as avg_ttft_ms,
    AVG(duration_ms) as avg_duration_ms,
    
    -- Additional metrics
    MIN(ttft_ms) as min_ttft_ms,
    MAX(ttft_ms) as max_ttft_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttft_ms) as median_ttft_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttft_ms) as p95_ttft_ms,
    
    -- Metadata
    NOW() as last_refreshed
FROM 
    openai_with_duration
GROUP BY 
    date_trunc('day', created_at AT TIME ZONE 'UTC')::date,
    user_id,
    model
WITH DATA;

-- Create indices on materialized view for fast queries
CREATE UNIQUE INDEX idx_daily_usage_mv_unique 
    ON public.daily_usage_mv (day, user_id, model);

CREATE INDEX idx_daily_usage_mv_day 
    ON public.daily_usage_mv (day DESC);

CREATE INDEX idx_daily_usage_mv_user 
    ON public.daily_usage_mv (user_id, day DESC);

CREATE INDEX idx_daily_usage_mv_model 
    ON public.daily_usage_mv (model, day DESC);

-- Add comment
COMMENT ON MATERIALIZED VIEW public.daily_usage_mv IS 
    'Materialized view for cached daily usage aggregation. Refresh periodically for better performance.';

-- ============================================================================
-- REFRESH FUNCTION
-- ============================================================================

-- Function to refresh the materialized view with better error handling
CREATE OR REPLACE FUNCTION public.refresh_daily_usage_mv()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result text;
    v_row_count integer;
    v_start_time timestamp;
BEGIN
    v_start_time := clock_timestamp();
    
    -- Try CONCURRENTLY first (non-blocking but requires unique index)
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_usage_mv;
        
        -- Get row count
        SELECT COUNT(*) INTO v_row_count FROM public.daily_usage_mv;
        
        v_result := format('SUCCESS: Refreshed CONCURRENTLY at %s. Rows: %s, Duration: %s ms', 
                          NOW()::text, 
                          v_row_count, 
                          EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::integer);
        
        RAISE NOTICE '%', v_result;
        RETURN v_result;
        
    EXCEPTION 
        WHEN unique_violation THEN
            -- Index might be corrupted, try non-concurrent refresh
            REFRESH MATERIALIZED VIEW public.daily_usage_mv;
            
            SELECT COUNT(*) INTO v_row_count FROM public.daily_usage_mv;
            
            v_result := format('WARNING: Used non-concurrent refresh due to index issue at %s. Rows: %s, Duration: %s ms', 
                              NOW()::text, 
                              v_row_count,
                              EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::integer);
            
            RAISE WARNING '%', v_result;
            RETURN v_result;
            
        WHEN OTHERS THEN
            -- Try non-concurrent as fallback
            BEGIN
                REFRESH MATERIALIZED VIEW public.daily_usage_mv;
                
                SELECT COUNT(*) INTO v_row_count FROM public.daily_usage_mv;
                
                v_result := format('WARNING: Fallback to non-concurrent refresh at %s. Rows: %s, Error was: %s', 
                                  NOW()::text, 
                                  v_row_count,
                                  SQLERRM);
                
                RAISE WARNING '%', v_result;
                RETURN v_result;
                
            EXCEPTION WHEN OTHERS THEN
                v_result := format('ERROR: Failed to refresh at %s. Error: %s', NOW()::text, SQLERRM);
                RAISE EXCEPTION '%', v_result;
                RETURN v_result;
            END;
    END;
END;
$$;

-- Grant execute permission to service role only
REVOKE ALL ON FUNCTION public.refresh_daily_usage_mv() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_daily_usage_mv() TO service_role;

COMMENT ON FUNCTION public.refresh_daily_usage_mv() IS 
    'Refreshes the daily_usage_mv materialized view concurrently. Should be called periodically via cron job.';

-- ============================================================================
-- DIAGNOSTIC FUNCTION
-- ============================================================================

-- Function to diagnose materialized view issues
CREATE OR REPLACE FUNCTION public.diagnose_daily_usage_mv()
RETURNS TABLE(
    check_name text,
    status text,
    details text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check 1: MV exists and has data
    RETURN QUERY
    SELECT 
        'Materialized View Status'::text,
        CASE 
            WHEN EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'daily_usage_mv' AND schemaname = 'public') 
            THEN 'EXISTS'::text 
            ELSE 'MISSING'::text 
        END,
        (SELECT format('Rows: %s, Last Refresh: %s', 
                      COUNT(*)::text, 
                      MAX(last_refreshed)::text)
         FROM public.daily_usage_mv)::text;
    
    -- Check 2: Unique index exists
    RETURN QUERY
    SELECT 
        'Unique Index'::text,
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM pg_indexes 
                WHERE schemaname = 'public' 
                AND tablename = 'daily_usage_mv' 
                AND indexname = 'idx_daily_usage_mv_unique'
            ) THEN 'EXISTS'::text 
            ELSE 'MISSING'::text 
        END,
        'Required for CONCURRENTLY refresh'::text;
    
    -- Check 3: Source data availability
    RETURN QUERY
    SELECT 
        'Source Data (telemetry_events)'::text,
        'CHECK'::text,
        format('Total events: %s, OpenAI calls: %s, Recent (24h): %s',
               (SELECT COUNT(*) FROM public.telemetry_events)::text,
               (SELECT COUNT(*) FROM public.telemetry_events WHERE type = 'openai_call')::text,
               (SELECT COUNT(*) FROM public.telemetry_events 
                WHERE type = 'openai_call' 
                AND created_at > NOW() - INTERVAL '24 hours')::text
        )::text;
    
    -- Check 4: Data freshness
    RETURN QUERY
    SELECT 
        'Data Freshness'::text,
        CASE 
            WHEN (SELECT MAX(last_refreshed) FROM public.daily_usage_mv) > NOW() - INTERVAL '1 hour' 
            THEN 'FRESH'::text
            WHEN (SELECT MAX(last_refreshed) FROM public.daily_usage_mv) > NOW() - INTERVAL '24 hours' 
            THEN 'STALE'::text
            ELSE 'VERY STALE'::text
        END,
        format('MV last refresh: %s, Latest event: %s',
               (SELECT MAX(last_refreshed) FROM public.daily_usage_mv)::text,
               (SELECT MAX(created_at) FROM public.telemetry_events WHERE type = 'openai_call')::text
        )::text;
    
    -- Check 5: Potential duplicates
    RETURN QUERY
    SELECT 
        'Duplicate Check'::text,
        CASE 
            WHEN EXISTS (
                SELECT 1 
                FROM public.daily_usage_mv 
                GROUP BY day, user_id, model 
                HAVING COUNT(*) > 1
            ) THEN 'DUPLICATES FOUND'::text 
            ELSE 'OK'::text 
        END,
        (SELECT COALESCE(
            string_agg(format('(%s, %s, %s)', day::text, user_id::text, model), '; '),
            'No duplicates'
         )
         FROM (
             SELECT day, user_id, model, COUNT(*) as cnt
             FROM public.daily_usage_mv 
             GROUP BY day, user_id, model 
             HAVING COUNT(*) > 1
             LIMIT 5
         ) dups)::text;
END;
$$;

COMMENT ON FUNCTION public.diagnose_daily_usage_mv() IS 
    'Diagnostic function to check the health and status of the daily_usage_mv materialized view';

-- ============================================================================
-- INCREMENTAL REFRESH FUNCTION (Optional, more efficient for large datasets)
-- ============================================================================

-- Function to refresh only recent data (last N days)
CREATE OR REPLACE FUNCTION public.refresh_daily_usage_mv_incremental(days_back integer DEFAULT 7)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date date;
BEGIN
    v_start_date := CURRENT_DATE - days_back;
    
    -- Delete recent data from materialized view
    DELETE FROM public.daily_usage_mv 
    WHERE day >= v_start_date;
    
    -- Re-insert aggregated data for recent days with duration from message_sent
    INSERT INTO public.daily_usage_mv
    WITH openai_with_duration AS (
        SELECT 
            t.*,
            t.payload_json->>'model' as model,
            (t.payload_json->>'tokens_in')::bigint as tokens_in,
            (t.payload_json->>'tokens_out')::bigint as tokens_out,
            (t.payload_json->>'cost_usd')::numeric as cost_usd,
            (t.payload_json->>'ttft_ms')::numeric as ttft_ms,
            m.duration_ms
        FROM 
            public.telemetry_events t
        LEFT JOIN LATERAL (
            SELECT (payload_json->>'duration_ms')::numeric as duration_ms
            FROM public.telemetry_events
            WHERE type = 'message_sent'
            AND session_id = t.session_id
            AND created_at BETWEEN t.created_at - INTERVAL '5 seconds' AND t.created_at + INTERVAL '30 seconds'
            ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - t.created_at)))
            LIMIT 1
        ) m ON true
        WHERE 
            t.type = 'openai_call'
            AND t.payload_json ? 'model'
            AND t.payload_json ? 'tokens_in'
            AND t.payload_json ? 'tokens_out'
            AND t.payload_json ? 'cost_usd'
            AND date_trunc('day', t.created_at AT TIME ZONE 'UTC')::date >= v_start_date
    )
    SELECT 
        date_trunc('day', created_at AT TIME ZONE 'UTC')::date as day,
        user_id,
        COALESCE(model, 'unknown') as model,
        COALESCE(SUM(tokens_in), 0) as tokens_in,
        COALESCE(SUM(tokens_out), 0) as tokens_out,
        COALESCE(SUM(cost_usd), 0.0) as cost_usd,
        COUNT(*) as calls,
        AVG(ttft_ms) as avg_ttft_ms,
        AVG(duration_ms) as avg_duration_ms,
        MIN(ttft_ms) as min_ttft_ms,
        MAX(ttft_ms) as max_ttft_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttft_ms) as median_ttft_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttft_ms) as p95_ttft_ms,
        NOW() as last_refreshed
    FROM 
        openai_with_duration
    GROUP BY 
        date_trunc('day', created_at AT TIME ZONE 'UTC')::date,
        user_id,
        model
    ON CONFLICT (day, user_id, model) 
    DO UPDATE SET
        tokens_in = EXCLUDED.tokens_in,
        tokens_out = EXCLUDED.tokens_out,
        cost_usd = EXCLUDED.cost_usd,
        calls = EXCLUDED.calls,
        avg_ttft_ms = EXCLUDED.avg_ttft_ms,
        avg_duration_ms = EXCLUDED.avg_duration_ms,
        min_ttft_ms = EXCLUDED.min_ttft_ms,
        max_ttft_ms = EXCLUDED.max_ttft_ms,
        median_ttft_ms = EXCLUDED.median_ttft_ms,
        p95_ttft_ms = EXCLUDED.p95_ttft_ms,
        last_refreshed = NOW();
    
    RAISE NOTICE 'Incremental refresh completed for % days at %', days_back, NOW();
END;
$$;

COMMENT ON FUNCTION public.refresh_daily_usage_mv_incremental IS 
    'Incrementally refreshes recent data in the materialized view. More efficient than full refresh for large datasets.';

-- ============================================================================
-- FORCE REBUILD FUNCTION (For when things are broken)
-- ============================================================================

-- Function to completely rebuild the materialized view
CREATE OR REPLACE FUNCTION public.rebuild_daily_usage_mv()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result text;
    v_row_count integer;
BEGIN
    -- Drop and recreate the materialized view completely
    DROP MATERIALIZED VIEW IF EXISTS public.daily_usage_mv CASCADE;
    
    -- Recreate the materialized view with duration from message_sent events
    CREATE MATERIALIZED VIEW public.daily_usage_mv AS
    WITH openai_with_duration AS (
        SELECT 
            t.*,
            t.payload_json->>'model' as model,
            (t.payload_json->>'tokens_in')::bigint as tokens_in,
            (t.payload_json->>'tokens_out')::bigint as tokens_out,
            (t.payload_json->>'cost_usd')::numeric as cost_usd,
            (t.payload_json->>'ttft_ms')::numeric as ttft_ms,
            -- Get duration from the closest message_sent event
            m.duration_ms
        FROM 
            public.telemetry_events t
        LEFT JOIN LATERAL (
            SELECT (payload_json->>'duration_ms')::numeric as duration_ms
            FROM public.telemetry_events
            WHERE type = 'message_sent'
            AND session_id = t.session_id
            AND created_at BETWEEN t.created_at - INTERVAL '5 seconds' AND t.created_at + INTERVAL '30 seconds'
            ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - t.created_at)))
            LIMIT 1
        ) m ON true
        WHERE 
            t.type = 'openai_call'
            AND t.payload_json ? 'model'
            AND t.payload_json ? 'tokens_in'
            AND t.payload_json ? 'tokens_out'
            AND t.payload_json ? 'cost_usd'
    )
    SELECT 
        date_trunc('day', created_at AT TIME ZONE 'UTC')::date as day,
        user_id,
        COALESCE(model, 'unknown') as model,
        COALESCE(SUM(tokens_in), 0) as tokens_in,
        COALESCE(SUM(tokens_out), 0) as tokens_out,
        COALESCE(SUM(cost_usd), 0.0) as cost_usd,
        COUNT(*) as calls,
        AVG(ttft_ms) as avg_ttft_ms,
        AVG(duration_ms) as avg_duration_ms,
        MIN(ttft_ms) as min_ttft_ms,
        MAX(ttft_ms) as max_ttft_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttft_ms) as median_ttft_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ttft_ms) as p95_ttft_ms,
        NOW() as last_refreshed
    FROM 
        openai_with_duration
    GROUP BY 
        date_trunc('day', created_at AT TIME ZONE 'UTC')::date,
        user_id,
        model
    WITH DATA;
    
    -- Recreate indices
    CREATE UNIQUE INDEX idx_daily_usage_mv_unique 
        ON public.daily_usage_mv (day, user_id, model);
    
    CREATE INDEX idx_daily_usage_mv_day 
        ON public.daily_usage_mv (day DESC);
    
    CREATE INDEX idx_daily_usage_mv_user 
        ON public.daily_usage_mv (user_id, day DESC);
    
    CREATE INDEX idx_daily_usage_mv_model 
        ON public.daily_usage_mv (model, day DESC);
    
    -- Grant permissions
    GRANT SELECT ON public.daily_usage_mv TO service_role;
    
    -- Get final row count
    SELECT COUNT(*) INTO v_row_count FROM public.daily_usage_mv;
    
    v_result := format('SUCCESS: Rebuilt materialized view at %s. Total rows: %s', 
                      NOW()::text, 
                      v_row_count);
    
    RAISE NOTICE '%', v_result;
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.rebuild_daily_usage_mv() IS 
    'Completely rebuilds the daily_usage_mv materialized view. Use when the view is corrupted or indices are broken.';

-- ============================================================================
-- RLS CONFIGURATION
-- ============================================================================

-- Views inherit RLS from base tables, but we can add explicit policies if needed
-- Since telemetry_events is restricted to service_role, the views will also be restricted

-- For the materialized view, we need to set up RLS if we want to enforce it
-- NOTE: In Supabase, we can't change ownership to service_role, but we can grant permissions
-- ALTER MATERIALIZED VIEW public.daily_usage_mv OWNER TO service_role;
GRANT SELECT ON public.daily_usage_mv TO service_role;

-- ============================================================================
-- SAMPLE DATA FOR TESTING (Optional, remove in production)
-- ============================================================================

-- Uncomment to insert sample data for testing
/*
INSERT INTO public.telemetry_events (user_id, session_id, type, payload_json, created_at)
VALUES 
    (gen_random_uuid(), 'session-1', 'openai_call', 
     '{"model": "gpt-4o-mini", "tokens_in": 150, "tokens_out": 450, "cost_usd": 0.000315, "ttft_ms": 230, "duration_ms": 1450}'::jsonb,
     NOW() - INTERVAL '2 days'),
    (gen_random_uuid(), 'session-1', 'openai_call', 
     '{"model": "gpt-4o", "tokens_in": 200, "tokens_out": 600, "cost_usd": 0.0065, "ttft_ms": 180, "duration_ms": 2100}'::jsonb,
     NOW() - INTERVAL '1 day'),
    (gen_random_uuid(), 'session-2', 'openai_call', 
     '{"model": "gpt-4o-mini", "tokens_in": 100, "tokens_out": 300, "cost_usd": 0.000195, "ttft_ms": 195, "duration_ms": 980}'::jsonb,
     NOW());

-- Refresh the materialized view with sample data
SELECT refresh_daily_usage_mv();

-- Test query
SELECT * FROM daily_usage_view 
WHERE day BETWEEN CURRENT_DATE - INTERVAL '7 days' AND CURRENT_DATE
ORDER BY day DESC, user_id, model;
*/

-- ============================================================================
-- SCHEDULING SETUP (For reference - implement in your scheduler)
-- ============================================================================

-- Example cron job setup (using pg_cron extension if available):
-- NOTE: pg_cron is only available on paid Supabase plans
/*
-- Schedule refresh every hour
SELECT cron.schedule(
    'refresh-daily-usage-mv',
    '0 * * * *',
    'SELECT public.refresh_daily_usage_mv();'
);
*/
-- Or schedule incremental refresh every 15 minutes for last 2 days

-- SELECT cron.schedule(
--     'refresh-daily-usage-incremental',
--     '0 * * * *',        -- '*/15 * * * *',
--     'SELECT public.refresh_daily_usage_mv_incremental(2);'
-- );


-- Example using Supabase Edge Functions or external scheduler:
-- POST to: https://your-project.supabase.co/rest/v1/rpc/refresh_daily_usage_mv
-- Headers: apikey: your-service-role-key, Content-Type: application/json
