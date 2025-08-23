-- Fix memory_context table to make user_id a simple text field
-- Remove the foreign key constraint to auth.users

BEGIN;

-- Drop the foreign key constraint if it exists
ALTER TABLE public.memory_context 
DROP CONSTRAINT IF EXISTS memory_context_user_id_fkey;

-- Change user_id to TEXT type (if it's currently UUID)
ALTER TABLE public.memory_context 
ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- Make sure user_id can be null (for some playground users)
ALTER TABLE public.memory_context 
ALTER COLUMN user_id DROP NOT NULL;

-- Create an index on user_id for performance
CREATE INDEX IF NOT EXISTS idx_memory_context_user_id 
ON public.memory_context(user_id) 
WHERE user_id IS NOT NULL;

-- Add a comment explaining the new structure
COMMENT ON COLUMN public.memory_context.user_id IS 
'User identifier - can be any text value. For real users, this matches auth.users.id. For playground users, this can be any generated ID or NULL.';

COMMIT;

-- Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'memory_context'
AND column_name = 'user_id';

-- Check that no foreign key constraint exists
SELECT 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
AND tc.table_name = 'memory_context'
AND tc.constraint_type = 'FOREIGN KEY'
AND kcu.column_name = 'user_id';