-- Migration: 015_add_name_to_memory_context.sql
-- Purpose: Add name field to memory_context table for user identification in History view
-- Author: AI Chat Task
-- Date: 2025-01-23

-- Add name column to memory_context table
ALTER TABLE public.memory_context 
ADD COLUMN IF NOT EXISTS name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.memory_context.name IS 'User display name for identification in History view';

-- Optionally update existing records with user email or a default name
-- This would require joining with auth.users table
UPDATE public.memory_context mc
SET name = COALESCE(
    (SELECT email FROM auth.users WHERE id = mc.user_id),
    'User ' || LEFT(mc.user_id::text, 8)
)
WHERE name IS NULL;