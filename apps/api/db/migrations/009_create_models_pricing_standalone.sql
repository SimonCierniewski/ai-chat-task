-- Migration: 009_create_models_pricing_standalone.sql
-- Purpose: Create/update models_pricing table for per-model token rate storage
-- Author: AI Chat Task
-- Date: 2025-01-19
-- Note: This migration is idempotent and can be run independently

-- Drop table if we need a clean recreate (commented out for safety)
-- DROP TABLE IF EXISTS public.models_pricing CASCADE;

-- Create models_pricing table (idempotent)
CREATE TABLE IF NOT EXISTS public.models_pricing (
    model text PRIMARY KEY,
    input_per_mtok numeric(12, 6) NOT NULL,
    output_per_mtok numeric(12, 6) NOT NULL,
    cached_input_per_mtok numeric(12, 6),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Ensure positive pricing values
    CONSTRAINT positive_rates CHECK (
        input_per_mtok > 0 AND 
        output_per_mtok > 0 AND 
        (cached_input_per_mtok IS NULL OR cached_input_per_mtok > 0)
    ),
    
    -- Ensure cached rate is less than regular input rate when present
    CONSTRAINT cached_rate_discount CHECK (
        cached_input_per_mtok IS NULL OR 
        cached_input_per_mtok < input_per_mtok
    )
);

-- Create unique constraint explicitly (already enforced by PRIMARY KEY)
-- This is for documentation purposes
ALTER TABLE public.models_pricing 
    DROP CONSTRAINT IF EXISTS models_pricing_model_unique;
ALTER TABLE public.models_pricing 
    ADD CONSTRAINT models_pricing_model_unique UNIQUE (model);

-- Create index on updated_at for audit queries
CREATE INDEX IF NOT EXISTS idx_models_pricing_updated 
    ON public.models_pricing(updated_at DESC);

-- Create trigger to auto-update updated_at on modifications
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_models_pricing_updated_at ON public.models_pricing;
CREATE TRIGGER update_models_pricing_updated_at
    BEFORE UPDATE ON public.models_pricing
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.models_pricing ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies (clean slate)
DROP POLICY IF EXISTS "Models pricing select service role" ON public.models_pricing;
DROP POLICY IF EXISTS "Models pricing insert service role" ON public.models_pricing;
DROP POLICY IF EXISTS "Models pricing update service role" ON public.models_pricing;
DROP POLICY IF EXISTS "Models pricing delete service role" ON public.models_pricing;

-- RLS Policies: Service role only by default
-- SELECT: Service role only (can be changed to allow anon/authenticated if needed)
CREATE POLICY "Models pricing select service role"
    ON public.models_pricing
    FOR SELECT
    TO service_role
    USING (true);

-- INSERT: Service role only (admin server routes)
CREATE POLICY "Models pricing insert service role"
    ON public.models_pricing
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- UPDATE: Service role only (admin server routes)
CREATE POLICY "Models pricing update service role"
    ON public.models_pricing
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- DELETE: Service role only (admin server routes)
CREATE POLICY "Models pricing delete service role"
    ON public.models_pricing
    FOR DELETE
    TO service_role
    USING (true);

-- Optional: Uncomment to allow public read access
-- DROP POLICY IF EXISTS "Models pricing select public" ON public.models_pricing;
-- CREATE POLICY "Models pricing select public"
--     ON public.models_pricing
--     FOR SELECT
--     TO anon, authenticated
--     USING (true);

-- Seed data with placeholder pricing (optional)
-- Using UPSERT pattern for idempotency
INSERT INTO public.models_pricing (
    model, 
    input_per_mtok, 
    output_per_mtok, 
    cached_input_per_mtok
) VALUES 
    -- OpenAI Models (example rates - update with actual pricing)
    ('gpt-4o', 2.500000, 10.000000, 1.250000),
    ('gpt-4o-mini', 0.150000, 0.600000, 0.075000),
    ('gpt-4-turbo', 10.000000, 30.000000, 5.000000),
    ('gpt-4-turbo-preview', 10.000000, 30.000000, 5.000000),
    ('gpt-4', 30.000000, 60.000000, NULL),
    ('gpt-3.5-turbo', 0.500000, 1.500000, 0.250000),
    ('gpt-3.5-turbo-16k', 3.000000, 4.000000, 1.500000),
    
    -- Anthropic Models (placeholder rates)
    ('claude-3-opus', 15.000000, 75.000000, 7.500000),
    ('claude-3-sonnet', 3.000000, 15.000000, 1.500000),
    ('claude-3-haiku', 0.250000, 1.250000, 0.125000),
    
    -- Other Models (placeholder rates)
    ('mistral-large', 8.000000, 24.000000, NULL),
    ('mistral-medium', 2.700000, 8.100000, NULL),
    ('llama-2-70b', 1.000000, 1.000000, NULL)
ON CONFLICT (model) DO UPDATE SET
    input_per_mtok = EXCLUDED.input_per_mtok,
    output_per_mtok = EXCLUDED.output_per_mtok,
    cached_input_per_mtok = EXCLUDED.cached_input_per_mtok,
    updated_at = now()
WHERE 
    -- Only update if values actually changed
    public.models_pricing.input_per_mtok != EXCLUDED.input_per_mtok OR
    public.models_pricing.output_per_mtok != EXCLUDED.output_per_mtok OR
    public.models_pricing.cached_input_per_mtok IS DISTINCT FROM EXCLUDED.cached_input_per_mtok;

-- Helper function to calculate costs
CREATE OR REPLACE FUNCTION public.calculate_token_cost(
    p_model text,
    p_input_tokens bigint,
    p_output_tokens bigint,
    p_cached_input_tokens bigint DEFAULT 0
)
RETURNS TABLE (
    total_cost_usd numeric,
    input_cost_usd numeric,
    output_cost_usd numeric,
    cached_cost_usd numeric,
    model_found boolean
) 
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_pricing record;
    v_input_cost numeric := 0;
    v_output_cost numeric := 0;
    v_cached_cost numeric := 0;
BEGIN
    -- Fetch pricing for the model
    SELECT * INTO v_pricing
    FROM public.models_pricing
    WHERE model = p_model;
    
    IF NOT FOUND THEN
        -- Return zeros with model_found = false
        RETURN QUERY SELECT 
            0::numeric,
            0::numeric,
            0::numeric,
            0::numeric,
            false;
        RETURN;
    END IF;
    
    -- Calculate costs (rates are per million tokens)
    -- Regular input tokens (excluding cached)
    IF p_input_tokens > p_cached_input_tokens THEN
        v_input_cost := ((p_input_tokens - p_cached_input_tokens)::numeric / 1000000.0) * v_pricing.input_per_mtok;
    END IF;
    
    -- Cached input tokens
    IF p_cached_input_tokens > 0 THEN
        IF v_pricing.cached_input_per_mtok IS NOT NULL THEN
            v_cached_cost := (p_cached_input_tokens::numeric / 1000000.0) * v_pricing.cached_input_per_mtok;
        ELSE
            -- Fall back to regular input rate if no cached rate
            v_cached_cost := (p_cached_input_tokens::numeric / 1000000.0) * v_pricing.input_per_mtok;
        END IF;
    END IF;
    
    -- Output tokens
    v_output_cost := (p_output_tokens::numeric / 1000000.0) * v_pricing.output_per_mtok;
    
    -- Return all components
    RETURN QUERY SELECT 
        (v_input_cost + v_cached_cost + v_output_cost),
        v_input_cost,
        v_output_cost,
        v_cached_cost,
        true;
END;
$$;

-- Add table and column comments
COMMENT ON TABLE public.models_pricing IS 
    'Stores token pricing rates for different AI models. Used for cost calculation and billing.';
COMMENT ON COLUMN public.models_pricing.model IS 
    'Unique model identifier (e.g., gpt-4o-mini, claude-3-opus)';
COMMENT ON COLUMN public.models_pricing.input_per_mtok IS 
    'Cost in USD per million input tokens';
COMMENT ON COLUMN public.models_pricing.output_per_mtok IS 
    'Cost in USD per million output tokens';
COMMENT ON COLUMN public.models_pricing.cached_input_per_mtok IS 
    'Cost in USD per million cached input tokens (optional, for models supporting caching)';
COMMENT ON COLUMN public.models_pricing.updated_at IS 
    'Timestamp of last rate update';

COMMENT ON FUNCTION public.calculate_token_cost IS 
    'Calculate token costs for a given model and usage. Returns cost breakdown and whether model was found.';

-- Grant execute permission on the calculation function to authenticated users
-- (They can calculate costs but not modify pricing)
GRANT EXECUTE ON FUNCTION public.calculate_token_cost TO authenticated;