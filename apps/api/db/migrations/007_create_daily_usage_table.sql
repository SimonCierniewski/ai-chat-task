-- Migration: 007_create_daily_usage_table.sql
-- Purpose: Create daily_usage aggregate table for efficient dashboard queries
-- Author: AI Chat Task
-- Date: 2025-01-19

-- Create daily_usage table for aggregated metrics
CREATE TABLE IF NOT EXISTS public.daily_usage (
    day date NOT NULL,
    user_id uuid NOT NULL,
    model text NOT NULL,
    tokens_in bigint NOT NULL DEFAULT 0,
    tokens_out bigint NOT NULL DEFAULT 0,
    cost_usd numeric(10, 6) NOT NULL DEFAULT 0,
    calls integer NOT NULL DEFAULT 0,
    avg_ttft_ms numeric(10, 2),
    avg_duration_ms numeric(10, 2),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Composite primary key
    PRIMARY KEY (day, user_id, model)
);

-- Create indices for efficient querying
-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_daily_usage_day 
    ON public.daily_usage(day DESC);

-- Index for user-specific queries
CREATE INDEX IF NOT EXISTS idx_daily_usage_user 
    ON public.daily_usage(user_id, day DESC);

-- Index for model-specific queries
CREATE INDEX IF NOT EXISTS idx_daily_usage_model 
    ON public.daily_usage(model, day DESC);

-- Enable RLS on daily_usage table
ALTER TABLE public.daily_usage ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Daily usage insert service role only" ON public.daily_usage;
DROP POLICY IF EXISTS "Daily usage update service role only" ON public.daily_usage;
DROP POLICY IF EXISTS "Daily usage delete service role only" ON public.daily_usage;
DROP POLICY IF EXISTS "Daily usage select service role only" ON public.daily_usage;

-- RLS Policies: Only service role can access
CREATE POLICY "Daily usage insert service role only"
    ON public.daily_usage
    FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Daily usage update service role only"
    ON public.daily_usage
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Daily usage delete service role only"
    ON public.daily_usage
    FOR DELETE
    TO service_role
    USING (true);

CREATE POLICY "Daily usage select service role only"
    ON public.daily_usage
    FOR SELECT
    TO service_role
    USING (true);

-- Function to aggregate telemetry_events into daily_usage
CREATE OR REPLACE FUNCTION public.aggregate_daily_usage(target_date date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Insert or update aggregated data for the specified date
    INSERT INTO public.daily_usage (
        day,
        user_id,
        model,
        tokens_in,
        tokens_out,
        cost_usd,
        calls,
        avg_ttft_ms,
        avg_duration_ms
    )
    SELECT 
        target_date::date as day,
        t.user_id,
        COALESCE(t.payload_json->>'model', 'unknown') as model,
        SUM((t.payload_json->>'tokens_in')::bigint) as tokens_in,
        SUM((t.payload_json->>'tokens_out')::bigint) as tokens_out,
        SUM((t.payload_json->>'cost_usd')::numeric) as cost_usd,
        COUNT(*) as calls,
        AVG((t.payload_json->>'ttft_ms')::numeric) as avg_ttft_ms,
        AVG((t.payload_json->>'duration_ms')::numeric) as avg_duration_ms
    FROM public.telemetry_events t
    WHERE 
        t.type = 'openai_call'
        AND t.created_at::date = target_date
        AND t.payload_json ? 'model'
        AND t.payload_json ? 'tokens_in'
        AND t.payload_json ? 'tokens_out'
        AND t.payload_json ? 'cost_usd'
    GROUP BY 
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
        updated_at = now();
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE public.daily_usage IS 'Aggregated daily usage metrics for efficient dashboard queries';
COMMENT ON COLUMN public.daily_usage.day IS 'Date of the aggregated metrics';
COMMENT ON COLUMN public.daily_usage.user_id IS 'User whose usage is being tracked';
COMMENT ON COLUMN public.daily_usage.model IS 'AI model used (e.g., gpt-4-mini)';
COMMENT ON COLUMN public.daily_usage.tokens_in IS 'Total input tokens for the day';
COMMENT ON COLUMN public.daily_usage.tokens_out IS 'Total output tokens for the day';
COMMENT ON COLUMN public.daily_usage.cost_usd IS 'Total cost in USD for the day';
COMMENT ON COLUMN public.daily_usage.calls IS 'Number of API calls made';
COMMENT ON COLUMN public.daily_usage.avg_ttft_ms IS 'Average time to first token in milliseconds';
COMMENT ON COLUMN public.daily_usage.avg_duration_ms IS 'Average request duration in milliseconds';
COMMENT ON FUNCTION public.aggregate_daily_usage IS 'Aggregates telemetry_events into daily_usage table for a specific date';