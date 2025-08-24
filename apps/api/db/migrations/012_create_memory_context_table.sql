-- Migration: 012_create_memory_context_table.sql
-- Purpose: Create memory_context table for caching Zep context blocks and playground users
-- Author: AI Chat Task
-- Date: 2025-01-22
-- Updated: 2025-01-24 - Consolidated changes for playground support

-- Drop existing table if it exists (for clean recreation)
DROP TABLE IF EXISTS public.memory_context CASCADE;

-- Drop existing functions that might conflict
DROP FUNCTION IF EXISTS public.get_or_create_memory_context(UUID);
DROP FUNCTION IF EXISTS public.get_or_create_memory_context(TEXT);
DROP FUNCTION IF EXISTS public.update_memory_context(UUID, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.update_memory_context(TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.update_memory_context_updated_at();
DROP FUNCTION IF EXISTS public.cleanup_expired_memory_contexts();

-- Create memory_context table
CREATE TABLE public.memory_context (
    -- Primary key - auto-generated UUID
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User identifier - TEXT field for flexibility
    -- For real users: matches auth.users.id
    -- For playground users: generated string like 'playground_timestamp_random'
    user_id TEXT,
    
    -- Owner ID - references the admin who created playground users
    -- For real users: can be NULL or same as user_id
    -- For playground users: the admin's user_id from auth.users
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- User display name
    user_name TEXT,
    
    -- Experiment title for easy identification in dropdowns
    experiment_title TEXT,
    
    -- The actual context block from Zep (can be large text)
    context_block TEXT,
    
    -- Zep parameters used to generate this context (JSON)
    zep_parameters JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- TTL tracking - when should this cache be refreshed
    expires_at TIMESTAMPTZ,
    
    -- Version/generation counter for cache invalidation
    version INTEGER DEFAULT 1 NOT NULL,
    
    -- Session ID that last updated this context
    last_session_id TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indices for performance
CREATE INDEX idx_memory_context_user_id ON public.memory_context(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_memory_context_owner_id ON public.memory_context(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_memory_context_updated_at ON public.memory_context(updated_at DESC);
CREATE INDEX idx_memory_context_expires_at ON public.memory_context(expires_at) WHERE expires_at IS NOT NULL;

-- Create unique index to prevent duplicate playground experiments per owner
CREATE UNIQUE INDEX idx_memory_context_owner_experiment 
ON public.memory_context(owner_id, experiment_title) 
WHERE owner_id IS NOT NULL AND experiment_title IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE public.memory_context IS 'Stores memory context for both real users and playground test users';
COMMENT ON COLUMN public.memory_context.id IS 'Primary key - auto-generated UUID';
COMMENT ON COLUMN public.memory_context.user_id IS 'User identifier - TEXT field that can be any value. For real users: auth.users.id, for playground: generated string';
COMMENT ON COLUMN public.memory_context.owner_id IS 'The admin who owns this playground user (NULL for real users)';
COMMENT ON COLUMN public.memory_context.user_name IS 'User display name to add to messages sent to Zep for better context';
COMMENT ON COLUMN public.memory_context.experiment_title IS 'Title of the experiment/conversation for easy identification in dropdowns';
COMMENT ON COLUMN public.memory_context.context_block IS 'The cached context block from Zep';
COMMENT ON COLUMN public.memory_context.zep_parameters IS 'Parameters used to fetch this context from Zep';
COMMENT ON COLUMN public.memory_context.created_at IS 'When this record was first created';
COMMENT ON COLUMN public.memory_context.updated_at IS 'When this context was last updated';
COMMENT ON COLUMN public.memory_context.expires_at IS 'When this cache should be refreshed';
COMMENT ON COLUMN public.memory_context.version IS 'Version counter for cache invalidation';
COMMENT ON COLUMN public.memory_context.last_session_id IS 'Session that last updated this context';
COMMENT ON COLUMN public.memory_context.metadata IS 'Additional metadata (e.g., token count, retrieval stats)';

-- Row Level Security (RLS)
ALTER TABLE public.memory_context ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read contexts they own or created
CREATE POLICY "Users can read own contexts" ON public.memory_context
    FOR SELECT
    USING (
        auth.uid()::TEXT = user_id 
        OR auth.uid() = owner_id
    );

-- Policy: Users can manage contexts they own or created
CREATE POLICY "Users can manage own contexts" ON public.memory_context
    FOR ALL
    USING (
        auth.uid()::TEXT = user_id 
        OR auth.uid() = owner_id
    )
    WITH CHECK (
        auth.uid()::TEXT = user_id 
        OR auth.uid() = owner_id
    );

-- Policy: Service role has full access
CREATE POLICY "Service role has full access" ON public.memory_context
    FOR ALL
    USING (auth.role() = 'service_role');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_context TO authenticated;
GRANT ALL ON public.memory_context TO service_role;

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_memory_context_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_memory_context_updated_at
    BEFORE UPDATE ON public.memory_context
    FOR EACH ROW
    EXECUTE FUNCTION public.update_memory_context_updated_at();

-- Create function to get or create memory context
CREATE OR REPLACE FUNCTION public.get_or_create_memory_context(
    p_user_id TEXT
)
RETURNS TABLE(
    id UUID,
    user_id TEXT,
    owner_id UUID,
    user_name TEXT,
    experiment_title TEXT,
    context_block TEXT,
    zep_parameters JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    version INTEGER,
    last_session_id TEXT,
    metadata JSONB,
    needs_initial_fetch BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- First try to get existing context
    RETURN QUERY
    SELECT 
        mc.id,
        mc.user_id,
        mc.owner_id,
        mc.user_name,
        mc.experiment_title,
        mc.context_block,
        mc.zep_parameters,
        mc.created_at,
        mc.updated_at,
        mc.expires_at,
        mc.version,
        mc.last_session_id,
        mc.metadata,
        FALSE as needs_initial_fetch -- Existing records don't need initial fetch
    FROM public.memory_context mc
    WHERE mc.user_id = p_user_id;
    
    -- If no record exists, create one
    IF NOT FOUND THEN
        INSERT INTO public.memory_context (user_id)
        VALUES (p_user_id);
        
        -- Return the newly created record
        RETURN QUERY
        SELECT 
            mc.id,
            mc.user_id,
            mc.owner_id,
            mc.user_name,
            mc.experiment_title,
            mc.context_block,
            mc.zep_parameters,
            mc.created_at,
            mc.updated_at,
            mc.expires_at,
            mc.version,
            mc.last_session_id,
            mc.metadata,
            TRUE as needs_initial_fetch -- New record needs initial fetch
        FROM public.memory_context mc
        WHERE mc.user_id = p_user_id;
    END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_or_create_memory_context(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_memory_context(TEXT) TO service_role;

COMMENT ON FUNCTION public.get_or_create_memory_context IS 'Gets existing memory context or creates a new one if it doesn''t exist';

-- Create function to update or create memory context (upsert)
CREATE OR REPLACE FUNCTION public.update_memory_context(
    p_user_id TEXT,
    p_context_block TEXT,
    p_zep_parameters JSONB DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update existing record or fail if not found
    UPDATE public.memory_context
    SET 
        context_block = p_context_block,
        zep_parameters = COALESCE(p_zep_parameters, memory_context.zep_parameters),
        expires_at = NULL, -- Never expires
        last_session_id = COALESCE(p_session_id, memory_context.last_session_id),
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- If no rows were updated, try to insert
    IF NOT FOUND THEN
        INSERT INTO public.memory_context (
            user_id,
            context_block,
            zep_parameters,
            last_session_id,
            expires_at
        ) VALUES (
            p_user_id,
            p_context_block,
            COALESCE(p_zep_parameters, '{}'::jsonb),
            p_session_id,
            NULL -- Never expires
        );
    END IF;
    
    RETURN TRUE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_memory_context(TEXT, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_memory_context(TEXT, TEXT, JSONB, TEXT) TO service_role;

COMMENT ON FUNCTION public.update_memory_context IS 'Updates or creates memory context for a user (upsert with no expiry)';

-- Create function to cleanup expired contexts (for scheduled jobs)
CREATE OR REPLACE FUNCTION public.cleanup_expired_memory_contexts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rows_deleted INTEGER;
BEGIN
    -- Clear context blocks that have been expired for more than 24 hours
    -- We keep the record but clear the content to save space
    UPDATE public.memory_context
    SET 
        context_block = NULL,
        metadata = jsonb_build_object('cleared_at', NOW())
    WHERE expires_at < NOW() - INTERVAL '24 hours'
      AND context_block IS NOT NULL;
    
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    
    RETURN rows_deleted;
END;
$$;

-- Grant execute permission to service role only
GRANT EXECUTE ON FUNCTION public.cleanup_expired_memory_contexts() TO service_role;

COMMENT ON FUNCTION public.cleanup_expired_memory_contexts IS 'Cleans up expired memory contexts to save storage space';

-- Verify the table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'memory_context'
ORDER BY ordinal_position;