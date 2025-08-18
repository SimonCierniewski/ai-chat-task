# Database Migrations

## Overview

These migrations set up the authentication and authorization system for the application using Supabase.

## Migration Files

1. **001_create_profiles_table.sql**
   - Creates the `profiles` table for user role management
   - Sets up indexes for performance
   - Adds auto-update trigger for `updated_at` column

2. **002_create_profiles_rls_policies.sql**
   - Enables Row Level Security (RLS)
   - Creates policies for user access control
   - Sets up admin view for service role access

3. **003_create_user_signup_trigger.sql**
   - Auto-creates profile on user signup
   - Provides helper functions for role checking
   - Sets default role as 'user'

4. **004_admin_management_utils.sql**
   - Admin promotion/demotion functions
   - Role audit logging
   - Statistics and monitoring views

## Running Migrations

### Via Supabase Dashboard

1. Go to SQL Editor in your Supabase project
2. Run each migration file in order
3. Verify with test queries

### Via Supabase CLI

```bash
# Apply all migrations
supabase db push

# Or run specific migration
supabase db execute -f apps/api/db/migrations/001_create_profiles_table.sql
```

### Via Direct Connection

```bash
# Using psql
psql $DATABASE_URL -f apps/api/db/migrations/001_create_profiles_table.sql
```

## Quick Admin Commands

### Promote User to Admin

```sql
-- One-liner to promote a user (requires service role)
UPDATE profiles SET role = 'admin' WHERE user_id = 'USER_UUID_HERE';

-- Or using the helper function
SELECT promote_to_admin('USER_UUID_HERE');
```

### Check User Role

```sql
-- Check if user is admin
SELECT is_admin('USER_UUID_HERE');

-- Get user role
SELECT get_user_role('USER_UUID_HERE');
```

### List All Admins

```sql
-- View all admins
SELECT * FROM list_admins();

-- Or simple query
SELECT * FROM profiles WHERE role = 'admin';
```

### View Role Statistics

```sql
-- Get role distribution
SELECT * FROM role_stats;
```

### Audit Role Changes

```sql
-- View recent role changes
SELECT * FROM role_audit_log ORDER BY changed_at DESC LIMIT 10;
```

## Security Notes

- All migrations are idempotent (safe to run multiple times)
- RLS is enforced on the profiles table
- Only service role can modify user roles
- Regular users can only view and update their own profile
- Role changes are logged for audit purposes

## Testing RLS Policies

```sql
-- Test as authenticated user (set JWT)
SET request.jwt.claim.sub = 'user-uuid-here';

-- Should only see own profile
SELECT * FROM profiles;

-- Should fail (can't see other profiles)
SELECT * FROM profiles WHERE user_id != 'user-uuid-here';

-- Should fail (can't change own role)
UPDATE profiles SET role = 'admin' WHERE user_id = 'user-uuid-here';
```