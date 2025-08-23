-- Migration: 011_create_messages_table.sql
-- Purpose: Create messages table for storing chat conversation history
-- Author: AI Chat Task
-- Date: 2025-01-22

-- Drop existing table if it exists (for clean recreation)
DROP TABLE IF EXISTS public.messages CASCADE;

-- Create messages table
CREATE TABLE public.messages (
    -- Primary key
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Thread/Session identifier (matches Zep session IDs)
    thread_id TEXT NOT NULL,
    
    -- Message role: 'user', 'assistant', 'system', 'memory'
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'memory')),
    
    -- Message content
    content TEXT NOT NULL,
    
    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Optional performance metrics (for assistant messages)
    start_ms INTEGER, -- Time when processing started (ms since epoch)
    ttft_ms INTEGER, -- Time to first token (milliseconds)
    total_ms INTEGER, -- Total processing time (milliseconds)
    
    -- Optional token usage (for assistant messages)
    tokens_in INTEGER,
    tokens_out INTEGER,
    
    -- Optional cost tracking (for assistant messages)
    price NUMERIC(10, 6), -- Cost in USD with 6 decimal precision
    
    -- Optional model information (for assistant messages)
    model TEXT,
    
    -- User ID for filtering/access control
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indices for common queries
CREATE INDEX idx_messages_thread_id ON public.messages(thread_id, created_at DESC);
CREATE INDEX idx_messages_user_id ON public.messages(user_id, created_at DESC);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_messages_thread_user ON public.messages(thread_id, user_id);

-- Add comments for documentation
COMMENT ON TABLE public.messages IS 'Stores chat conversation history with performance metrics and cost tracking';
COMMENT ON COLUMN public.messages.id IS 'Unique message identifier';
COMMENT ON COLUMN public.messages.thread_id IS 'Thread/session identifier, matches Zep session IDs';
COMMENT ON COLUMN public.messages.role IS 'Message role: user, assistant, system, or memory';
COMMENT ON COLUMN public.messages.content IS 'The actual message content';
COMMENT ON COLUMN public.messages.created_at IS 'Timestamp when message was created';
COMMENT ON COLUMN public.messages.start_ms IS 'Unix timestamp (ms) when processing started (assistant messages only)';
COMMENT ON COLUMN public.messages.ttft_ms IS 'Time to first token in milliseconds (assistant messages only)';
COMMENT ON COLUMN public.messages.total_ms IS 'Total processing time in milliseconds (assistant messages only)';
COMMENT ON COLUMN public.messages.tokens_in IS 'Number of input tokens (assistant messages only)';
COMMENT ON COLUMN public.messages.tokens_out IS 'Number of output tokens (assistant messages only)';
COMMENT ON COLUMN public.messages.price IS 'Cost in USD with 6 decimal precision (assistant messages only)';
COMMENT ON COLUMN public.messages.model IS 'AI model used for generation (assistant messages only)';
COMMENT ON COLUMN public.messages.user_id IS 'User who owns this message';

-- Row Level Security (RLS)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own messages
CREATE POLICY "Users can read own messages" ON public.messages
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own messages
CREATE POLICY "Users can insert own messages" ON public.messages
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Service role has full access
CREATE POLICY "Service role has full access" ON public.messages
    FOR ALL
    USING (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

-- Create function to get conversation history
CREATE OR REPLACE FUNCTION public.get_conversation_history(
    p_thread_id TEXT,
    p_user_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
    id UUID,
    thread_id TEXT,
    role TEXT,
    content TEXT,
    created_at TIMESTAMPTZ,
    start_ms INTEGER,
    ttft_ms INTEGER,
    total_ms INTEGER,
    tokens_in INTEGER,
    tokens_out INTEGER,
    price NUMERIC,
    model TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.thread_id,
        m.role,
        m.content,
        m.created_at,
        m.start_ms,
        m.ttft_ms,
        m.total_ms,
        m.tokens_in,
        m.tokens_out,
        m.price,
        m.model
    FROM public.messages m
    WHERE m.thread_id = p_thread_id
      AND (p_user_id IS NULL OR m.user_id = p_user_id)
    ORDER BY m.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_conversation_history(TEXT, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_history(TEXT, UUID, INTEGER) TO service_role;

COMMENT ON FUNCTION public.get_conversation_history IS 'Retrieves conversation history for a specific thread/session';

-- Create function to get thread summary
CREATE OR REPLACE FUNCTION public.get_thread_summary(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(
    thread_id TEXT,
    message_count BIGINT,
    last_message_at TIMESTAMPTZ,
    total_cost NUMERIC,
    total_tokens_in BIGINT,
    total_tokens_out BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.thread_id,
        COUNT(CASE WHEN m.role IN ('user', 'assistant') THEN 1 END)::BIGINT as message_count,
        MAX(m.created_at) as last_message_at,
        SUM(m.price)::NUMERIC as total_cost,
        SUM(m.tokens_in)::BIGINT as total_tokens_in,
        SUM(m.tokens_out)::BIGINT as total_tokens_out
    FROM public.messages m
    WHERE (p_user_id IS NULL OR m.user_id = p_user_id)
    GROUP BY m.thread_id
    ORDER BY MAX(m.created_at) DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_thread_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_thread_summary(UUID) TO service_role;

COMMENT ON FUNCTION public.get_thread_summary IS 'Gets summary statistics for all threads/sessions (counts only user and assistant messages)';
