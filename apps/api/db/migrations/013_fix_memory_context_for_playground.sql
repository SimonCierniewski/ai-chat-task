-- Fix memory_context table to support playground users
-- These are test users that don't exist in auth.users

BEGIN;

-- First, drop the foreign key constraint on user_id
ALTER TABLE public.memory_context 
DROP CONSTRAINT IF EXISTS memory_context_user_id_fkey;

-- Add a new id column as the primary key
ALTER TABLE public.memory_context 
DROP CONSTRAINT IF EXISTS memory_context_pkey CASCADE;

-- Add an auto-incrementing ID as the new primary key
ALTER TABLE public.memory_context 
ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid() PRIMARY KEY;

-- Make user_id nullable and not a primary key anymore
ALTER TABLE public.memory_context 
ALTER COLUMN user_id DROP NOT NULL;

-- Add back a foreign key constraint but make it optional (for real users)
ALTER TABLE public.memory_context 
ADD CONSTRAINT memory_context_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;

-- Add experiment_title column if it doesn't exist
ALTER TABLE public.memory_context 
ADD COLUMN IF NOT EXISTS experiment_title TEXT;

-- Rename 'name' column to 'user_name' for clarity
ALTER TABLE public.memory_context 
RENAME COLUMN name TO user_name;

-- Create an index on user_id for performance (it's no longer the primary key)
CREATE INDEX IF NOT EXISTS idx_memory_context_user_id 
ON public.memory_context(user_id) 
WHERE user_id IS NOT NULL;

-- Create an index on owner_id for querying playground users by admin
CREATE INDEX IF NOT EXISTS idx_memory_context_owner_id 
ON public.memory_context(owner_id) 
WHERE owner_id IS NOT NULL;

-- Add a unique constraint to prevent duplicate playground experiments per owner
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_context_owner_experiment 
ON public.memory_context(owner_id, experiment_title) 
WHERE user_id IS NULL AND owner_id IS NOT NULL;

-- Add a comment explaining the dual use
COMMENT ON TABLE public.memory_context IS 
'Stores memory context for both real users (user_id NOT NULL) and playground test users (user_id NULL, owner_id NOT NULL)';

COMMIT;