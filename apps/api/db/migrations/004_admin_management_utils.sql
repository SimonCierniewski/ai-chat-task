-- Migration: 004_admin_management_utils.sql
-- Description: Utility functions and procedures for admin role management
-- Author: System
-- Date: 2024

-- Function to promote a user to admin (must be called with service role)
CREATE OR REPLACE FUNCTION public.promote_to_admin(target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    updated_rows INTEGER;
BEGIN
    UPDATE public.profiles
    SET 
        role = 'admin',
        updated_at = NOW()
    WHERE user_id = target_user_id;
    
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    
    -- Return true if a row was updated
    RETURN updated_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only service role can promote users
REVOKE ALL ON FUNCTION public.promote_to_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_to_admin(UUID) TO service_role;

COMMENT ON FUNCTION public.promote_to_admin(UUID) IS 
    'Promotes a user to admin role - requires service role permission';

-- Function to demote an admin to regular user
CREATE OR REPLACE FUNCTION public.demote_to_user(target_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    updated_rows INTEGER;
BEGIN
    UPDATE public.profiles
    SET 
        role = 'user',
        updated_at = NOW()
    WHERE user_id = target_user_id;
    
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    
    -- Return true if a row was updated
    RETURN updated_rows > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only service role can demote users
REVOKE ALL ON FUNCTION public.demote_to_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demote_to_user(UUID) TO service_role;

COMMENT ON FUNCTION public.demote_to_user(UUID) IS 
    'Demotes an admin to regular user role - requires service role permission';

-- Function to list all admins (useful for monitoring)
CREATE OR REPLACE FUNCTION public.list_admins()
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    display_name TEXT,
    created_at TIMESTAMPTZ,
    last_sign_in_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.user_id,
        u.email,
        p.display_name,
        p.created_at,
        u.last_sign_in_at
    FROM public.profiles p
    JOIN auth.users u ON p.user_id = u.id
    WHERE p.role = 'admin'
    ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute to service role only
REVOKE ALL ON FUNCTION public.list_admins() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admins() TO service_role;

COMMENT ON FUNCTION public.list_admins() IS 
    'Lists all users with admin role - requires service role permission';

-- Create audit log table for role changes (optional but recommended)
CREATE TABLE IF NOT EXISTS public.role_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    target_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    old_role TEXT,
    new_role TEXT,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    reason TEXT
);

-- Enable RLS on audit log
ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can access audit log
CREATE POLICY "Service role only" ON public.role_audit_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_role_audit_log_user ON public.role_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_log_timestamp ON public.role_audit_log(changed_at DESC);

-- Function to log role changes
CREATE OR REPLACE FUNCTION public.log_role_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        INSERT INTO public.role_audit_log (
            target_user_id,
            old_role,
            new_role,
            changed_by,
            changed_at
        ) VALUES (
            NEW.user_id,
            OLD.role,
            NEW.role,
            auth.uid(), -- Will be null when using service role
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to log role changes
DROP TRIGGER IF EXISTS log_profile_role_changes ON public.profiles;
CREATE TRIGGER log_profile_role_changes
    AFTER UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.log_role_change();

COMMENT ON TABLE public.role_audit_log IS 
    'Audit trail for all role changes in the system';

-- Convenience view for role statistics
CREATE OR REPLACE VIEW public.role_stats AS
SELECT 
    role,
    COUNT(*) as user_count,
    MAX(created_at) as last_created
FROM public.profiles
GROUP BY role;

-- Grant access to service role
GRANT SELECT ON public.role_stats TO service_role;

COMMENT ON VIEW public.role_stats IS 
    'Summary statistics of user roles';