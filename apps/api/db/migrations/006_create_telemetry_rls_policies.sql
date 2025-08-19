-- Migration: 006_create_telemetry_rls_policies.sql
-- Purpose: Set up Row Level Security for telemetry_events table
-- Author: AI Chat Task
-- Date: 2025-01-19

-- Enable RLS on telemetry_events table
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Telemetry events insert service role only" ON public.telemetry_events;
DROP POLICY IF EXISTS "Telemetry events update service role only" ON public.telemetry_events;
DROP POLICY IF EXISTS "Telemetry events delete service role only" ON public.telemetry_events;
DROP POLICY IF EXISTS "Telemetry events select service role only" ON public.telemetry_events;

-- Policy: Only service role can INSERT telemetry events
-- This ensures only the API backend can write events
CREATE POLICY "Telemetry events insert service role only"
    ON public.telemetry_events
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Policy: Only service role can UPDATE telemetry events
-- Generally shouldn't be needed, but allowed for service role
CREATE POLICY "Telemetry events update service role only"
    ON public.telemetry_events
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Only service role can DELETE telemetry events
-- For data cleanup/maintenance operations
CREATE POLICY "Telemetry events delete service role only"
    ON public.telemetry_events
    FOR DELETE
    TO service_role
    USING (true);

-- Policy: Only service role can SELECT telemetry events
-- Admin dashboards will use service role for server-side queries
CREATE POLICY "Telemetry events select service role only"
    ON public.telemetry_events
    FOR SELECT
    TO service_role
    USING (true);

-- Explicitly deny all operations for anon and authenticated roles
-- This is the default behavior with RLS enabled and no permissive policies,
-- but we document it explicitly for clarity

-- Add comments for documentation
COMMENT ON POLICY "Telemetry events insert service role only" ON public.telemetry_events IS 
    'Only the API backend (service role) can insert telemetry events';
COMMENT ON POLICY "Telemetry events update service role only" ON public.telemetry_events IS 
    'Only the API backend (service role) can update telemetry events';
COMMENT ON POLICY "Telemetry events delete service role only" ON public.telemetry_events IS 
    'Only the API backend (service role) can delete telemetry events';
COMMENT ON POLICY "Telemetry events select service role only" ON public.telemetry_events IS 
    'Only the API backend and admin dashboard (service role) can read telemetry events';