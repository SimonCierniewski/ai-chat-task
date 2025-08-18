-- Migration: 003_create_user_signup_trigger.sql
-- Description: Auto-create profile on user signup with default 'user' role
-- Author: System
-- Date: 2024

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_role TEXT := 'user';
BEGIN
    -- Insert new profile with default role
    INSERT INTO public.profiles (user_id, role, display_name, created_at, updated_at)
    VALUES (
        NEW.id,
        default_role,
        COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO NOTHING; -- Prevent duplicate profiles

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user signups
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Add helpful comments
COMMENT ON FUNCTION public.handle_new_user() IS 
    'Automatically creates a profile with default user role when a new auth user signs up';
COMMENT ON TRIGGER on_auth_user_created ON auth.users IS 
    'Trigger that fires after user signup to create their profile';

-- Create helper function to check if user is admin (useful for API)
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO service_role;

COMMENT ON FUNCTION public.is_admin(UUID) IS 
    'Helper function to check if a user has admin role';

-- Create function to get user role (useful for JWT claims)
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(UUID) TO service_role;

COMMENT ON FUNCTION public.get_user_role(UUID) IS 
    'Returns the role of a user from their profile, defaults to user if no profile exists';