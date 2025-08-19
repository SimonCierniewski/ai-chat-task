-- Migration: 005_create_telemetry_events_table.sql
-- Purpose: Create telemetry_events table for tracking API usage and performance metrics
-- Author: AI Chat Task
-- Date: 2025-01-19

-- Enable required extensions idempotently
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create telemetry_events table
CREATE TABLE IF NOT EXISTS public.telemetry_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    session_id text,
    type text NOT NULL CHECK (type IN ('message_sent', 'openai_call', 'zep_upsert', 'zep_search', 'error')),
    payload_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    
    -- Validate payload_json structure for each event type
    CONSTRAINT valid_payload_structure CHECK (
        -- All events should have at least these fields when applicable
        (type = 'message_sent' AND payload_json ? 'duration_ms') OR
        (type = 'openai_call' AND payload_json ? 'openai_ms' AND payload_json ? 'model' AND payload_json ? 'tokens_in' AND payload_json ? 'tokens_out' AND payload_json ? 'cost_usd') OR
        (type = 'zep_upsert' AND payload_json ? 'zep_ms') OR
        (type = 'zep_search' AND payload_json ? 'zep_ms') OR
        (type = 'error' AND payload_json ? 'error') OR
        type NOT IN ('message_sent', 'openai_call', 'zep_upsert', 'zep_search', 'error')
    )
);

-- Add indices for efficient querying
-- Index for user-specific queries with time range
CREATE INDEX IF NOT EXISTS idx_telemetry_events_user_created 
    ON public.telemetry_events(user_id, created_at DESC);

-- Index for time-series queries (admin dashboards)
CREATE INDEX IF NOT EXISTS idx_telemetry_events_created 
    ON public.telemetry_events(created_at DESC);

-- Index for session-based queries
CREATE INDEX IF NOT EXISTS idx_telemetry_events_session 
    ON public.telemetry_events(session_id) 
    WHERE session_id IS NOT NULL;

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_telemetry_events_type 
    ON public.telemetry_events(type);

-- Index for JSONB queries on common fields
CREATE INDEX IF NOT EXISTS idx_telemetry_events_payload_model 
    ON public.telemetry_events((payload_json->>'model')) 
    WHERE type = 'openai_call';

-- Add comment for documentation
COMMENT ON TABLE public.telemetry_events IS 'Stores telemetry events for API usage tracking, performance metrics, and cost accounting';
COMMENT ON COLUMN public.telemetry_events.user_id IS 'User who triggered the event';
COMMENT ON COLUMN public.telemetry_events.session_id IS 'Optional session identifier for grouping related events';
COMMENT ON COLUMN public.telemetry_events.type IS 'Event type: message_sent, openai_call, zep_upsert, zep_search, error';
COMMENT ON COLUMN public.telemetry_events.payload_json IS 'Event-specific data including timings, tokens, costs, and errors';
COMMENT ON COLUMN public.telemetry_events.created_at IS 'Timestamp when the event occurred';