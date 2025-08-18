# Profile Creation Setup Guide

## ⚠️ Important: auth.users Trigger Limitation

Supabase doesn't allow regular database users to create triggers on `auth.users` table for security reasons. You'll get this error:
```
ERROR: 42501: must be owner of relation users
```

## ✅ Solution Options

### Option 1: Database Webhook (Recommended for Production)

1. **In Supabase Dashboard:**
   - Go to **Database → Webhooks**
   - Click **Create a new webhook**
   - Configure:
     ```
     Name: create_profile_on_signup
     Table: auth.users
     Events: ✓ Insert
     Type: HTTP Request
     HTTP URL: https://[PROJECT_REF].supabase.co/functions/v1/create-profile
     HTTP Headers: 
       x-webhook-secret: [YOUR_SECRET]
     ```

2. **Deploy the Edge Function:**
   ```bash
   # From apps/api directory
   cd supabase/functions/create-profile
   supabase functions deploy create-profile
   ```

3. **Set Edge Function Secrets:**
   ```bash
   supabase secrets set WEBHOOK_SECRET=[YOUR_SECRET]
   ```

### Option 2: Client-Side Profile Creation (Quick Setup)

Add this to your signup flow in the client apps:

**Admin Dashboard (Next.js):**
```typescript
const { data: authData, error } = await supabase.auth.signUp({
  email,
  password,
});

if (authData.user && !error) {
  // Create profile
  await supabase.rpc('create_profile_for_user', {
    user_id: authData.user.id,
    user_email: email,
  });
}
```

**Android App (Kotlin):**
```kotlin
val result = supabase.auth.signUpWith(Email) {
    email = userEmail
    password = userPassword
}

result.user?.let { user ->
    supabase.postgrest.rpc("create_profile_for_user", 
        mapOf(
            "user_id" to user.id,
            "user_email" to userEmail
        )
    )
}
```

### Option 3: API-Side Auto-Creation (Currently Implemented)

The API automatically creates a profile when it doesn't exist:

1. User signs up via Supabase Auth
2. User makes first API request with JWT
3. API checks for profile
4. If missing, creates profile with default 'user' role

This is handled in `src/db/profiles.ts`:
```typescript
if (!profile) {
  // Auto-create profile
  const newProfile = {
    user_id: userId,
    role: 'user',
    // ... 
  };
}
```

## 📝 Migration Order

Run migrations in this order:

```bash
# 1. Create profiles table
psql $DATABASE_URL -f 001_create_profiles_table.sql

# 2. Set up RLS policies
psql $DATABASE_URL -f 002_create_profiles_rls_policies.sql

# 3. Use alternative approach (no auth.users trigger)
psql $DATABASE_URL -f 003_create_user_signup_trigger_alternative.sql

# 4. Admin utilities (optional)
psql $DATABASE_URL -f 004_admin_management_utils.sql
```

Or via Supabase Dashboard SQL Editor - run each file's content.

## 🔧 Manual Profile Creation

If you need to manually create profiles for existing users:

```sql
-- Create profiles for all existing users
INSERT INTO public.profiles (user_id, role, display_name, created_at, updated_at)
SELECT 
    id,
    'user',
    COALESCE(raw_user_meta_data->>'display_name', email),
    NOW(),
    NOW()
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.profiles)
ON CONFLICT (user_id) DO NOTHING;

-- Verify
SELECT COUNT(*) as users_without_profiles
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.user_id
WHERE p.user_id IS NULL;
```

## 🎯 Best Practices

1. **For Development**: Option 3 (API auto-creation) is fine
2. **For Production**: Use Option 1 (Database Webhook) for reliability
3. **For Testing**: Manually create profiles as needed

## 🔍 Verify Setup

```sql
-- Check if functions exist
SELECT proname FROM pg_proc 
WHERE proname IN ('create_profile_for_user', 'ensure_profile_exists', 'is_admin', 'get_user_role');

-- Test profile creation
SELECT create_profile_for_user(
    'test-user-uuid'::uuid,
    'test@example.com',
    'Test User'
);

-- Verify profile was created
SELECT * FROM profiles WHERE user_id = 'test-user-uuid';
```