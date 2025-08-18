-- Migration: 002_create_profiles_rls_policies.sql
-- Description: Set up Row Level Security (RLS) policies for profiles table
-- Author: System
-- Date: 2024

-- Enable RLS on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role has full access" ON public.profiles;
DROP POLICY IF EXISTS "Anon users cannot access profiles" ON public.profiles;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own profile (for initial creation)
CREATE POLICY "Users can insert own profile"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update only their own profile (but not role)
-- Note: Column-level permissions restrict role updates
CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Service role has unrestricted access (for admin operations)
CREATE POLICY "Service role has full access"
    ON public.profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy: Prevent anonymous access
CREATE POLICY "Anon users cannot access profiles"
    ON public.profiles
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

-- Additional security: Prevent users from changing their own role
-- This is enforced by column-level permissions in the previous migration
-- Users can only update display_name, not role

-- Create a secure view for admins to see all profiles (optional)
CREATE OR REPLACE VIEW public.profiles_admin_view AS
SELECT 
    p.user_id,
    p.role,
    p.display_name,
    p.created_at,
    p.updated_at,
    u.email,
    u.last_sign_in_at,
    u.created_at as user_created_at
FROM public.profiles p
LEFT JOIN auth.users u ON p.user_id = u.id;

-- Grant access to the admin view only to service_role
GRANT SELECT ON public.profiles_admin_view TO service_role;

-- Add comment explaining RLS setup
COMMENT ON POLICY "Users can view own profile" ON public.profiles IS 
    'Allows authenticated users to view only their own profile';
COMMENT ON POLICY "Users can insert own profile" ON public.profiles IS 
    'Allows authenticated users to create their initial profile';
COMMENT ON POLICY "Users can update own profile" ON public.profiles IS 
    'Allows authenticated users to update their own profile (display_name only due to column permissions)';
COMMENT ON POLICY "Service role has full access" ON public.profiles IS 
    'Service role can perform all operations - used for admin tasks';
COMMENT ON POLICY "Anon users cannot access profiles" ON public.profiles IS 
    'Explicitly denies all access to anonymous users';