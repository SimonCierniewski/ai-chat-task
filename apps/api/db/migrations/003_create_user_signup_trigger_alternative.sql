-- Migration: 003_create_user_signup_trigger_alternative.sql
-- Description: Alternative approach for auto-creating profiles without auth.users trigger
-- Author: System
-- Date: 2024
-- Note: Supabase doesn't allow triggers on auth.users for security reasons

-- ============================================
-- OPTION 1: Use Supabase Database Webhook (Recommended)
-- ============================================
-- Configure this in Supabase Dashboard:
-- 1. Go to Database → Webhooks
-- 2. Create new webhook:
--    - Name: create_profile_on_signup
--    - Table: auth.users
--    - Events: INSERT
--    - URL: Your edge function or API endpoint
-- 
-- OR use Supabase Edge Function:
-- supabase functions new create-profile
-- Then deploy with the webhook

-- ============================================
-- OPTION 2: Handle in Application Code
-- ============================================
-- Call this function after successful signup in your app

CREATE OR REPLACE FUNCTION public.create_profile_for_user(
    user_id UUID,
    user_email TEXT DEFAULT NULL,
    user_display_name TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO public.profiles (user_id, role, display_name, created_at, updated_at)
    VALUES (
        user_id,
        'user', -- default role
        COALESCE(user_display_name, user_email),
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO NOTHING; -- Prevent duplicate profiles
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_profile_for_user(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_profile_for_user(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.create_profile_for_user(UUID, TEXT, TEXT) IS 
    'Manually create a profile for a user - call this after signup';

-- ============================================
-- OPTION 3: RPC Call from Client After Signup
-- ============================================
-- Client code example:
-- const { data: authData } = await supabase.auth.signUp({ email, password });
-- if (authData.user) {
--   await supabase.rpc('create_profile_for_user', { 
--     user_id: authData.user.id,
--     user_email: email 
--   });
-- }

-- ============================================
-- Helper Functions (These still work)
-- ============================================

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.profiles 
        WHERE user_id = check_user_id 
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO service_role;

COMMENT ON FUNCTION public.is_admin(UUID) IS 
    'Helper function to check if a user has admin role';

-- Function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(check_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE user_id = check_user_id;
    
    -- Return 'user' as default if no profile exists
    RETURN COALESCE(user_role, 'user');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO service_role;

COMMENT ON FUNCTION public.get_user_role(UUID) IS 
    'Returns the role of a user from their profile, defaults to user if no profile exists';

-- ============================================
-- Ensure Profile Exists Function
-- ============================================
-- This can be called from the API to ensure a profile exists

CREATE OR REPLACE FUNCTION public.ensure_profile_exists(check_user_id UUID)
RETURNS void AS $$
DECLARE
    user_email TEXT;
BEGIN
    -- Check if profile already exists
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = check_user_id) THEN
        -- Get email from auth.users if available
        SELECT email INTO user_email FROM auth.users WHERE id = check_user_id;
        
        -- Create profile
        INSERT INTO public.profiles (user_id, role, display_name, created_at, updated_at)
        VALUES (
            check_user_id,
            'user',
            user_email,
            NOW(),
            NOW()
        )
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.ensure_profile_exists(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile_exists(UUID) TO service_role;

COMMENT ON FUNCTION public.ensure_profile_exists(UUID) IS 
    'Ensures a profile exists for the given user, creates one if missing';