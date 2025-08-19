-- Migration: 008_create_models_pricing_table.sql
-- Purpose: Create models_pricing table for dynamic cost calculation
-- Author: AI Chat Task
-- Date: 2025-01-19

-- Create models_pricing table
CREATE TABLE IF NOT EXISTS public.models_pricing (
    model text PRIMARY KEY,
    input_per_mtok numeric(10, 6) NOT NULL,
    output_per_mtok numeric(10, 6) NOT NULL,
    cached_input_per_mtok numeric(10, 6),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Ensure positive pricing
    CONSTRAINT positive_pricing CHECK (
        input_per_mtok > 0 AND 
        output_per_mtok > 0 AND 
        (cached_input_per_mtok IS NULL OR cached_input_per_mtok > 0)
    )
);

-- Create index for updated_at to find latest pricing
CREATE INDEX IF NOT EXISTS idx_models_pricing_updated 
    ON public.models_pricing(updated_at DESC);

-- Enable RLS on models_pricing table
ALTER TABLE public.models_pricing ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Models pricing select all" ON public.models_pricing;
DROP POLICY IF EXISTS "Models pricing insert service role only" ON public.models_pricing;
DROP POLICY IF EXISTS "Models pricing update service role only" ON public.models_pricing;
DROP POLICY IF EXISTS "Models pricing delete service role only" ON public.models_pricing;

-- RLS Policies
-- Anyone can read pricing (public information)
CREATE POLICY "Models pricing select all"
    ON public.models_pricing
    FOR SELECT
    TO anon, authenticated, service_role
    USING (true);

-- Only service role can modify pricing
CREATE POLICY "Models pricing insert service role only"
    ON public.models_pricing
    FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "Models pricing update service role only"
    ON public.models_pricing
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Models pricing delete service role only"
    ON public.models_pricing
    FOR DELETE
    TO service_role
    USING (true);

-- Insert initial pricing data (as of January 2025)
-- These are example rates and should be updated with actual OpenAI pricing
INSERT INTO public.models_pricing (model, input_per_mtok, output_per_mtok, cached_input_per_mtok)
VALUES 
    ('gpt-4o', 2.50, 10.00, 1.25),
    ('gpt-4o-mini', 0.15, 0.60, 0.075),
    ('gpt-4-turbo', 10.00, 30.00, 5.00),
    ('gpt-4', 30.00, 60.00, NULL),
    ('gpt-3.5-turbo', 0.50, 1.50, 0.25),
    ('gpt-3.5-turbo-16k', 3.00, 4.00, NULL)
ON CONFLICT (model) DO UPDATE SET
    input_per_mtok = EXCLUDED.input_per_mtok,
    output_per_mtok = EXCLUDED.output_per_mtok,
    cached_input_per_mtok = EXCLUDED.cached_input_per_mtok,
    updated_at = now();

-- Function to calculate cost for a given model and token counts
CREATE OR REPLACE FUNCTION public.calculate_model_cost(
    p_model text,
    p_tokens_in bigint,
    p_tokens_out bigint,
    p_cached_tokens_in bigint DEFAULT 0
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_pricing record;
    v_cost numeric;
BEGIN
    -- Get pricing for the model
    SELECT * INTO v_pricing
    FROM public.models_pricing
    WHERE model = p_model;
    
    -- If model not found, return 0 (or could raise exception)
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Calculate cost
    -- Regular input tokens
    v_cost := ((p_tokens_in - p_cached_tokens_in)::numeric / 1000000) * v_pricing.input_per_mtok;
    
    -- Cached input tokens (if applicable)
    IF p_cached_tokens_in > 0 AND v_pricing.cached_input_per_mtok IS NOT NULL THEN
        v_cost := v_cost + (p_cached_tokens_in::numeric / 1000000) * v_pricing.cached_input_per_mtok;
    ELSIF p_cached_tokens_in > 0 THEN
        -- If no cached pricing, use regular input pricing
        v_cost := v_cost + (p_cached_tokens_in::numeric / 1000000) * v_pricing.input_per_mtok;
    END IF;
    
    -- Output tokens
    v_cost := v_cost + (p_tokens_out::numeric / 1000000) * v_pricing.output_per_mtok;
    
    RETURN v_cost;
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE public.models_pricing IS 'Pricing information for different AI models';
COMMENT ON COLUMN public.models_pricing.model IS 'Model identifier (e.g., gpt-4o-mini)';
COMMENT ON COLUMN public.models_pricing.input_per_mtok IS 'Cost per million input tokens in USD';
COMMENT ON COLUMN public.models_pricing.output_per_mtok IS 'Cost per million output tokens in USD';
COMMENT ON COLUMN public.models_pricing.cached_input_per_mtok IS 'Cost per million cached input tokens in USD (optional)';
COMMENT ON FUNCTION public.calculate_model_cost IS 'Calculate the cost in USD for a given model and token usage';