# Admin Authentication & Authorization Guide

## Overview

The Admin panel uses Supabase magic link authentication with role-based access control. Only users with `role='admin'` in the profiles table can access admin pages.

## Authentication Flow

### 1. Magic Link Login

1. User visits `/login`
2. Enters email address
3. Receives magic link via email
4. Clicks link to authenticate
5. Redirected based on role:
   - Admin → `/admin`
   - User → `/unauthorized`

### 2. Session Management

Sessions are automatically managed by Supabase with:
- Automatic refresh via middleware
- Secure cookie storage
- Server-side validation

### 3. Role Gating

All routes under `/admin/*` require:
1. Valid authentication (JWT token)
2. `role='admin'` in profiles table
3. Server-side verification using `SUPABASE_SERVICE_ROLE_KEY`

## Manual Testing Steps

### Prerequisites

1. **Supabase Project Setup**:
   ```bash
   # Ensure these are set in .env.local
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbG... # CRITICAL: Server-only
   ```

2. **Database Tables**:
   ```sql
   -- Verify profiles table exists
   SELECT * FROM profiles;
   
   -- Should have columns: user_id, email, role, created_at, updated_at
   ```

### Test Scenario 1: Non-Logged-In User

1. **Clear all cookies** (browser dev tools → Application → Cookies)
2. **Navigate to** `/admin`
3. **Expected**: Redirected to `/login`
4. **Verify**: URL changes to `/login`

### Test Scenario 2: Regular User (Non-Admin)

1. **Create test user**:
   ```sql
   -- In Supabase SQL Editor
   -- First, create user via Supabase Dashboard → Authentication → Users
   -- Then set role to 'user'
   UPDATE profiles 
   SET role = 'user' 
   WHERE email = 'testuser@example.com';
   ```

2. **Login steps**:
   - Go to `/login`
   - Enter `testuser@example.com`
   - Click "Send Magic Link"
   - Check email and click link
   
3. **Expected behavior**:
   - After auth callback, redirected to `/unauthorized`
   - Page shows "Access Denied"
   - Displays current email and role
   - Sign Out button available

4. **Verify access blocked**:
   - Try directly accessing `/admin`
   - Should redirect to `/unauthorized`
   - Try `/admin/users`, `/admin/telemetry`, etc.
   - All should redirect to `/unauthorized`

### Test Scenario 3: Admin User

1. **Create admin user**:
   ```sql
   -- In Supabase SQL Editor
   UPDATE profiles 
   SET role = 'admin' 
   WHERE email = 'admin@example.com';
   
   -- Verify
   SELECT user_id, email, role FROM profiles WHERE email = 'admin@example.com';
   ```

2. **Login steps**:
   - Go to `/login`
   - Enter `admin@example.com`
   - Click "Send Magic Link"
   - Check email and click link

3. **Expected behavior**:
   - After auth callback, redirected to `/admin`
   - Can access all admin pages
   - Sidebar shows email and "admin" role
   - Sign Out button in sidebar

4. **Verify full access**:
   - Navigate to `/admin/users` - ✅ Should work
   - Navigate to `/admin/telemetry` - ✅ Should work
   - Navigate to `/admin/pricing` - ✅ Should work
   - Navigate to `/admin/settings` - ✅ Should work

### Test Scenario 4: Session Persistence

1. **Login as admin**
2. **Close browser tab** (don't sign out)
3. **Open new tab** and go to `/admin`
4. **Expected**: Still logged in, no redirect
5. **Verify**: User info shows in sidebar

### Test Scenario 5: Sign Out

1. **While logged in as admin**
2. **Click "Sign Out"** in sidebar
3. **Expected**:
   - Redirected to `/login`
   - Session cleared
4. **Verify**: Try accessing `/admin` - should redirect to `/login`

### Test Scenario 6: Role Check API

Test the server-side role check endpoint:

```bash
# First, get a valid session cookie by logging in via browser
# Then test the API endpoint

# Should return role info when authenticated
curl http://localhost:3001/api/auth/check-role \
  -H "Cookie: [copy-cookies-from-browser]"

# Expected response:
{
  "authenticated": true,
  "userId": "uuid-here",
  "email": "admin@example.com",
  "role": "admin"
}

# Without cookies (not authenticated)
curl http://localhost:3001/api/auth/check-role

# Expected response:
{
  "error": "Not authenticated"
}
```

## Security Notes

### 🔒 Critical Security Points

1. **NEVER expose `SUPABASE_SERVICE_ROLE_KEY` to client**
   - Only use in server components, API routes, middleware
   - If exposed, immediately rotate in Supabase Dashboard

2. **Role verification is server-side only**
   - Middleware checks happen on server
   - Client-side role display is for UX only
   - Never trust client-side role claims

3. **JWT verification**
   - Tokens are verified server-side
   - Supabase handles token refresh automatically
   - Sessions expire after inactivity

### Security Checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` only in server code
- [ ] No console.log of sensitive data
- [ ] Role checks in middleware (not just client)
- [ ] HTTPS in production
- [ ] Secure cookie settings in production
- [ ] Rate limiting on login endpoint
- [ ] Email verification enabled in Supabase

## Troubleshooting

### Common Issues

#### 1. "SUPABASE_SERVICE_ROLE_KEY not configured"
- **Cause**: Missing environment variable
- **Fix**: Add to `.env.local`:
  ```
  SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
  ```

#### 2. Always redirected to `/unauthorized`
- **Cause**: Profile doesn't have admin role
- **Fix**: Update in database:
  ```sql
  UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
  ```

#### 3. Magic link not received
- **Causes**:
  - Email in spam folder
  - Supabase email settings not configured
  - Rate limited (too many attempts)
- **Fix**: 
  - Check spam folder
  - Configure email provider in Supabase Dashboard
  - Wait 60 seconds between attempts

#### 4. Session not persisting
- **Cause**: Cookie issues
- **Fix**: 
  - Check browser allows cookies
  - Verify same domain/port
  - Check Supabase URL is correct

#### 5. Middleware not working
- **Symptoms**: Can access admin without auth
- **Fix**: 
  - Restart Next.js dev server
  - Check middleware.ts is in src/ directory
  - Verify matcher pattern includes admin routes

### Debug Commands

```bash
# Check environment variables
npm run env:check

# Test with verbose logging
DEBUG=* npm run dev

# Clear Next.js cache
rm -rf .next
npm run dev
```

## Production Deployment

### Pre-deployment Checklist

1. **Environment Variables**:
   - [ ] `SUPABASE_SERVICE_ROLE_KEY` set in deployment platform
   - [ ] Never committed to git
   - [ ] Different keys for staging/production

2. **Supabase Configuration**:
   - [ ] Email provider configured
   - [ ] Redirect URLs updated for production domain
   - [ ] Rate limiting configured
   - [ ] RLS policies verified

3. **Security Headers**:
   ```javascript
   // next.config.js
   module.exports = {
     async headers() {
       return [
         {
           source: '/:path*',
           headers: [
             {
               key: 'X-Frame-Options',
               value: 'DENY',
             },
             {
               key: 'X-Content-Type-Options',
               value: 'nosniff',
             },
           ],
         },
       ]
     },
   }
   ```

4. **Monitoring**:
   - [ ] Error tracking (Sentry)
   - [ ] Failed login attempts
   - [ ] Unauthorized access attempts
   - [ ] Session analytics

## Role Management SQL

### Useful Queries

```sql
-- List all admins
SELECT user_id, email, role, created_at 
FROM profiles 
WHERE role = 'admin'
ORDER BY created_at DESC;

-- Grant admin role
UPDATE profiles 
SET role = 'admin', updated_at = NOW() 
WHERE email = 'user@example.com';

-- Revoke admin role
UPDATE profiles 
SET role = 'user', updated_at = NOW() 
WHERE email = 'user@example.com';

-- Audit role changes
SELECT 
  user_id,
  email,
  role,
  updated_at,
  updated_at - created_at as time_since_creation
FROM profiles
WHERE updated_at > created_at
ORDER BY updated_at DESC
LIMIT 10;

-- Count users by role
SELECT role, COUNT(*) as count 
FROM profiles 
GROUP BY role;
```

## Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)