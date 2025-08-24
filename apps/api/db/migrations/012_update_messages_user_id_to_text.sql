-- Migration: 012_update_messages_user_id_to_text.sql
-- Purpose: Update messages table to support both UUID and text user IDs for playground users
-- Author: AI Chat Task
-- Date: 2025-01-24

-- Step 1: Drop existing RLS policies that depend on user_id column
DROP POLICY IF EXISTS "Users can read own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON public.messages;
DROP POLICY IF EXISTS "Service role has full access" ON public.messages;

-- Step 2: Drop the foreign key constraint on user_id
ALTER TABLE public.messages 
DROP CONSTRAINT IF EXISTS messages_user_id_fkey;

-- Step 3: Change user_id column from UUID to TEXT
ALTER TABLE public.messages 
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Step 4: Update the index to work with TEXT user_id
DROP INDEX IF EXISTS idx_messages_user_id;
CREATE INDEX idx_messages_user_id ON public.messages(user_id, created_at DESC);

-- Step 5: Recreate RLS policies to handle both UUID and text user IDs
-- Policy: Users can read their own messages (works with text user_id)
CREATE POLICY "Users can read own messages" ON public.messages
    FOR SELECT
    USING (
        -- For regular users, match the UUID
        (auth.uid() IS NOT NULL AND user_id = auth.uid()::TEXT)
        OR 
        -- For playground users, allow admin to read playground messages
        (user_id LIKE 'playground_%' AND EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        ))
    );

-- Policy: Users can insert their own messages (works with text user_id)
CREATE POLICY "Users can insert own messages" ON public.messages
    FOR INSERT
    WITH CHECK (
        -- For regular users, match the UUID
        (auth.uid() IS NOT NULL AND user_id = auth.uid()::TEXT)
        OR
        -- For playground users, allow admin to insert playground messages
        (user_id LIKE 'playground_%' AND EXISTS (
            SELECT 1 FROM profiles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        ))
    );

-- Policy: Service role has full access (recreate)
CREATE POLICY "Service role has full access" ON public.messages
    FOR ALL
    USING (auth.role() = 'service_role');

-- Step 6: Update the get_conversation_history function to handle text user_id
DROP FUNCTION IF EXISTS public.get_conversation_history(TEXT, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_conversation_history(
    p_thread_id TEXT,
    p_user_id TEXT DEFAULT NULL,  -- Changed from UUID to TEXT
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

-- Step 7: Update the get_thread_summary function to handle text user_id
DROP FUNCTION IF EXISTS public.get_thread_summary(UUID);

CREATE OR REPLACE FUNCTION public.get_thread_summary(p_user_id TEXT DEFAULT NULL)  -- Changed from UUID to TEXT
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

-- Step 8: Grant execute permissions on updated functions
GRANT EXECUTE ON FUNCTION public.get_conversation_history(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_history(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_thread_summary(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_thread_summary(TEXT) TO service_role;

-- Step 9: Update column comment
COMMENT ON COLUMN public.messages.user_id IS 'User who owns this message (UUID for auth users, text ID for playground users)';

-- Step 10: Add check constraint to ensure user_id is not empty
ALTER TABLE public.messages
ADD CONSTRAINT messages_user_id_not_empty CHECK (user_id IS NOT NULL AND user_id != '');