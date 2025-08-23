-- Migration: 013_add_experiment_title_to_memory_context.sql
-- Purpose: Add experiment_title column and rename name to user_name in memory_context table
-- Author: AI Chat Task
-- Date: 2025-01-23

-- Add experiment_title column
ALTER TABLE public.memory_context 
ADD COLUMN IF NOT EXISTS experiment_title TEXT;

-- Rename name column to user_name
ALTER TABLE public.memory_context 
RENAME COLUMN name TO user_name;

-- Add comments for documentation
COMMENT ON COLUMN public.memory_context.experiment_title IS 'Title of the experiment/conversation for easy identification in dropdowns';
COMMENT ON COLUMN public.memory_context.user_name IS 'User display name to add to messages sent to Zep for better context';

-- Update the get_or_create_memory_context function to include the new field
DROP FUNCTION IF EXISTS get_or_create_memory_context(uuid);
CREATE OR REPLACE FUNCTION public.get_or_create_memory_context(
    p_user_id UUID
)
RETURNS TABLE(
    user_id UUID,
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
        VALUES (p_user_id)
        ON CONFLICT (user_id) DO NOTHING;
        
        -- Return the newly created record
        RETURN QUERY
        SELECT 
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
GRANT EXECUTE ON FUNCTION public.get_or_create_memory_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_memory_context(UUID) TO service_role;
