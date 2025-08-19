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
    AVG((t.payload_json->>'duration_ms')::numeric) as avg_duration_ms,
    
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
CREATE MATERIALIZED VIEW public.daily_usage_mv AS
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
    
    -- Cost aggregation
    COALESCE(SUM((t.payload_json->>'cost_usd')::numeric), 0.0) as cost_usd,
    
    -- Call count
    COUNT(*) as calls,
    
    -- Performance metrics
    AVG((t.payload_json->>'ttft_ms')::numeric) as avg_ttft_ms,
    AVG((t.payload_json->>'duration_ms')::numeric) as avg_duration_ms,
    
    -- Additional metrics
    MIN((t.payload_json->>'ttft_ms')::numeric) as min_ttft_ms,
    MAX((t.payload_json->>'ttft_ms')::numeric) as max_ttft_ms,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (t.payload_json->>'ttft_ms')::numeric) as median_ttft_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (t.payload_json->>'ttft_ms')::numeric) as p95_ttft_ms,
    
    -- Metadata
    NOW() as last_refreshed
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

-- Function to refresh the materialized view concurrently (non-blocking)
CREATE OR REPLACE FUNCTION public.refresh_daily_usage_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Use CONCURRENTLY to avoid locking the view during refresh
    -- This allows continued read access during the refresh operation
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_usage_mv;
    
    -- Log the refresh (optional - requires a logging table)
    -- INSERT INTO refresh_log (view_name, refreshed_at)
    -- VALUES ('daily_usage_mv', NOW());
    
    RAISE NOTICE 'Materialized view daily_usage_mv refreshed at %', NOW();
END;
$$;

-- Grant execute permission to service role only
REVOKE ALL ON FUNCTION public.refresh_daily_usage_mv() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_daily_usage_mv() TO service_role;

COMMENT ON FUNCTION public.refresh_daily_usage_mv() IS 
    'Refreshes the daily_usage_mv materialized view concurrently. Should be called periodically via cron job.';

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
    
    -- Re-insert aggregated data for recent days
    INSERT INTO public.daily_usage_mv
    SELECT 
        date_trunc('day', t.created_at AT TIME ZONE 'UTC')::date as day,
        t.user_id,
        COALESCE(t.payload_json->>'model', 'unknown') as model,
        COALESCE(SUM((t.payload_json->>'tokens_in')::bigint), 0) as tokens_in,
        COALESCE(SUM((t.payload_json->>'tokens_out')::bigint), 0) as tokens_out,
        COALESCE(SUM((t.payload_json->>'cost_usd')::numeric), 0.0) as cost_usd,
        COUNT(*) as calls,
        AVG((t.payload_json->>'ttft_ms')::numeric) as avg_ttft_ms,
        AVG((t.payload_json->>'duration_ms')::numeric) as avg_duration_ms,
        MIN((t.payload_json->>'ttft_ms')::numeric) as min_ttft_ms,
        MAX((t.payload_json->>'ttft_ms')::numeric) as max_ttft_ms,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (t.payload_json->>'ttft_ms')::numeric) as median_ttft_ms,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (t.payload_json->>'ttft_ms')::numeric) as p95_ttft_ms,
        NOW() as last_refreshed
    FROM 
        public.telemetry_events t
    WHERE 
        t.type = 'openai_call'
        AND t.payload_json ? 'model'
        AND t.payload_json ? 'tokens_in'
        AND t.payload_json ? 'tokens_out'
        AND t.payload_json ? 'cost_usd'
        AND date_trunc('day', t.created_at AT TIME ZONE 'UTC')::date >= v_start_date
    GROUP BY 
        date_trunc('day', t.created_at AT TIME ZONE 'UTC')::date,
        t.user_id,
        t.payload_json->>'model'
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
-- RLS CONFIGURATION
-- ============================================================================

-- Views inherit RLS from base tables, but we can add explicit policies if needed
-- Since telemetry_events is restricted to service_role, the views will also be restricted

-- For the materialized view, we need to set up RLS if we want to enforce it
ALTER MATERIALIZED VIEW public.daily_usage_mv OWNER TO service_role;

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
/*
-- Schedule refresh every hour
SELECT cron.schedule(
    'refresh-daily-usage-mv',
    '0 * * * *',
    'SELECT public.refresh_daily_usage_mv();'
);

-- Or schedule incremental refresh every 15 minutes for last 2 days
SELECT cron.schedule(
    'refresh-daily-usage-incremental',
    '*/15 * * * *',
    'SELECT public.refresh_daily_usage_mv_incremental(2);'
);
*/

-- Example using Supabase Edge Functions or external scheduler:
-- POST to: https://your-project.supabase.co/rest/v1/rpc/refresh_daily_usage_mv
-- Headers: apikey: your-service-role-key, Content-Type: application/json