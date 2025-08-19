# Phase 1 Verification Guide - Supabase Auth

## 📋 Overview

This document provides a comprehensive test plan to verify Phase 1 (Supabase Auth) implementation. Follow these steps to validate that authentication, role-based access control, and all related components are working correctly.

**Phase 1 Scope:**
- ✅ Supabase magic link authentication
- ✅ Role-based access control (user/admin)
- ✅ JWT verification via JWKS
- ✅ CORS configuration
- ✅ Profile auto-creation
- ✅ On-signup Zep initialization hook
- ✅ Session persistence

## 🚀 Quick Start Verification

### Prerequisites Checklist

- [ ] Node.js 20+ installed
- [ ] pnpm installed (`npm install -g pnpm`)
- [ ] Android Studio (for Android testing) or Android device
- [ ] Supabase project created in EU region
- [ ] Git repository cloned

### Initial Setup from Clean Clone

```bash
# 1. Clone and install
git clone https://github.com/SimonCierniewski/ai-chat-task.git
cd ai-chat-task
pnpm install

# 2. Configure API
cd apps/api
cp .env.example .env.local
# Edit .env.local with Supabase credentials

# 3. Configure Admin
cd ../admin
cp .env.example .env.local
# Edit .env.local with Supabase credentials

# 4. Configure Android
cd ../android
cp local.properties.example local.properties
# Edit local.properties with Supabase credentials
```

## 🔐 Environment Configuration Checklist

### API Environment (.env.local)

```bash
# Required for Phase 1
✅ SUPABASE_URL=https://xxxx.supabase.co
✅ SUPABASE_SERVICE_KEY=eyJhbG...  # Service role key
✅ SUPABASE_JWT_SECRET=your-secret-at-least-32-chars
✅ SUPABASE_JWT_AUD=authenticated
✅ SUPABASE_PROJECT_REF=xxxx
✅ JWKS_URI=https://xxxx.supabase.co/auth/v1/.well-known/jwks.json
✅ APP_ORIGIN_ADMIN=http://localhost:3001
✅ APP_ORIGIN_ANDROID_DEV=http://localhost:8081

# Optional (can be empty for Phase 1)
⚪ ZEP_API_KEY=  # Empty = Zep disabled (ok for Phase 1)
⚪ ZEP_BASE_URL=https://api.getzep.com
```

### Admin Environment (.env.local)

```bash
# Required for Phase 1
✅ NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
✅ NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
✅ NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...  # Anon key only
✅ NEXT_PUBLIC_APP_URL=http://localhost:3001
```

### Android Environment (local.properties)

```properties
# Required for Phase 1
✅ supabase.url=https://xxxx.supabase.co
✅ supabase.anonKey=eyJhbG...  # Anon key
✅ app.deeplink.scheme=aichat
✅ app.deeplink.host=auth
✅ api.baseUrl=http://10.0.2.2:3000  # For emulator
```

## 🗄️ Database Setup Verification

### 1. Run Migrations in Supabase SQL Editor

Execute in order:

```sql
-- 1. Check if profiles table exists
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'profiles';

-- 2. Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'profiles';

-- 3. Check policies
SELECT * FROM pg_policies 
WHERE tablename = 'profiles';

-- 4. Verify admin helper functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('promote_to_admin', 'is_admin', 'list_admins');
```

### 2. Verify Profile Auto-Creation

**Profiles are created automatically via database trigger when users sign up.**

The trigger in migration `003_create_user_signup_trigger.sql`:
- Fires automatically on user signup
- Creates profile with 'user' role
- No webhook configuration needed

**Test the trigger:**
```sql
-- Sign up a new user, then check:
SELECT * FROM profiles ORDER BY created_at DESC LIMIT 5;
```

**If profiles are still empty, the API has a fallback:**
- Profiles are auto-created on first authenticated API request
- This ensures profiles always exist

### 3. Create Test Users

```sql
-- Check existing users
SELECT id, email, created_at 
FROM auth.users 
ORDER BY created_at DESC;

-- Check profiles (should have entries after webhook is configured)
SELECT * FROM profiles;

-- If profiles is empty, manually create for existing users:
INSERT INTO profiles (user_id, role) 
SELECT id, 'user' FROM auth.users 
WHERE id NOT IN (SELECT user_id FROM profiles);

-- Promote a user to admin (replace UUID)
UPDATE profiles SET role = 'admin' WHERE user_id = 'UUID-HERE';
-- Or use helper
SELECT promote_to_admin('UUID-HERE');
```

## 🧪 API Authentication Tests

### Start API Server

```bash
cd apps/api
pnpm dev
# Should see: 🚀 Server listening at http://0.0.0.0:3000
```

### Test 1: Health Check (No Auth)

```bash
# Should return 200
curl -v http://localhost:3000/health

# Expected response:
{
  "ok": true,
  "version": "0.0.1",
  "environment": "development",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Test 2: Protected Endpoint (401 Unauthorized)

```bash
# Without token - should return 401
curl -v http://localhost:3000/api/me

# Expected response:
HTTP/1.1 401 Unauthorized
{
  "error": "Unauthorized",
  "message": "Missing authorization header"
}

# With invalid token - should return 401
curl -v http://localhost:3000/api/me \
  -H "Authorization: Bearer invalid-token"

# Expected response:
HTTP/1.1 401 Unauthorized
{
  "error": "Unauthorized",
  "message": "Invalid token"
}
```

### Test 3: Get Valid Token (via Supabase Dashboard)

1. Create user in http://localhost:3000/login
2. Open developer tools and copy `Cookie` from Network log header
3. Decode `Cookie` with https://www.urldecoder.org/ and copy `access_token` value

Or use the Admin app to get a token (see Admin testing section).

### Test 4: Protected Endpoint (200 OK)

```bash
# With valid token - should return 200
export TOKEN="your-valid-jwt-token"

curl -v http://localhost:3000/api/me \
  -H "Authorization: Bearer $TOKEN"

# Expected response:
HTTP/1.1 200 OK
{
  "user": {
    "id": "uuid",
    "email": "test@example.com",
    "role": "user"
  }
}
```

### Test 5: Admin Endpoint (Role Check)

```bash
# As regular user - should return 403
curl -v http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer $USER_TOKEN"

# Expected response:
HTTP/1.1 403 Forbidden
{
  "error": "Forbidden",
  "message": "Admin access required"
}

# As admin - should return 200
curl -v http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Expected response:
HTTP/1.1 200 OK
{
  "users": [...],
  "total": 2
}
```

### Test 6: CORS Validation

```bash
# From allowed origin - should succeed
curl -v http://localhost:3000/api/auth/status \
  -H "Origin: http://localhost:3001" \
  -H "Authorization: Bearer $TOKEN"

# Should see headers:
# < Access-Control-Allow-Origin: http://localhost:3001
# < Access-Control-Allow-Credentials: true

# From disallowed origin - should fail preflight
curl -v -X OPTIONS http://localhost:3000/api/me \
  -H "Origin: http://evil.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization"

# Expected response:
HTTP/1.1 403 Forbidden
{
  "error": "CORS: Origin not allowed"
}
```

### Test 7: On-Signup Hook

```bash
# Test Zep initialization (no auth required)
curl -X POST http://localhost:3000/auth/on-signup \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user-123",
    "email": "newuser@example.com"
  }'

# Expected response (always succeeds):
{
  "success": true,
  "message": "User signup processed",
  "zep_initialized": false  # false if no ZEP_API_KEY
}

# Check initialization status (requires auth)
curl http://localhost:3000/auth/zep-status/test-user-123 \
  -H "Authorization: Bearer $TOKEN"

# Expected response:
{
  "initialized": true,
  "enabled": false  # false if no ZEP_API_KEY
}
```

## 🖥️ Admin App Testing

### Start Admin App

```bash
cd apps/admin
pnpm dev
# Should see: ready - started server on http://localhost:3001
```

### Test 1: Login Flow

1. **Navigate to http://localhost:3001**
   - [ ] Redirected to `/login`
   - [ ] Login form visible

2. **Enter email and request magic link**
   - [ ] Enter valid email
   - [ ] Click "Send Magic Link"
   - [ ] See success message: "Check your email for the magic link!"

3. **Check email**
   - [ ] Email received (check spam)
   - [ ] Subject: "Your Magic Link"
   - [ ] Link format: `https://xxxx.supabase.co/auth/v1/verify?token=...&redirect_to=http://localhost:3001/auth/callback`

4. **Click magic link**
   - [ ] Browser opens
   - [ ] Redirected to `/admin`
   - [ ] Session established

### Test 2: Role Gating

1. **As regular user (role = 'user')**
   - [ ] Login successful
   - [ ] Navigate to `/admin`
   - [ ] Redirected to `/unauthorized`
   - [ ] Message: "You need admin privileges"

2. **As admin (role = 'admin')**
   - [ ] Login successful
   - [ ] Navigate to `/admin`
   - [ ] Admin dashboard visible
   - [ ] See cards: Playground, Users, Telemetry
   - [ ] Session info shows role: **admin**

### Test 3: Session Persistence

1. **After successful login**
   - [ ] Close browser tab
   - [ ] Reopen http://localhost:3001
   - [ ] Still logged in (no redirect to login)
   - [ ] User info visible in header

2. **Sign out**
   - [ ] Click "Sign Out" button
   - [ ] Redirected to `/login`
   - [ ] Session cleared

### Test 4: Auth Status Display

When logged in, verify:
- [ ] Email displayed in header
- [ ] Role badge shows correctly (admin/user)
- [ ] Sign Out button functional

## 📱 Android App Testing

### Build and Run

```bash
cd apps/android
./gradlew assembleDebug
# Install on emulator/device
./gradlew installDebug
```

### Test 1: Magic Link Flow

1. **Launch app**
   - [ ] Login screen appears
   - [ ] Email input field visible
   - [ ] "Send Magic Link" button visible

2. **Enter email**
   - [ ] Email validation works
   - [ ] Invalid email shows error
   - [ ] Valid email enables button

3. **Send magic link**
   - [ ] Loading indicator appears
   - [ ] Success message: "Magic link sent to [email]"
   - [ ] Email received

4. **Deep link handling**
   
   **On Physical Device:**
   - [ ] Tap link in email app
   - [ ] System prompt: "Open with AI Chat?"
   - [ ] Select app
   - [ ] Session established
   
   **On Emulator:**
   ```bash
   # Test deep link via ADB
   adb shell am start -W -a android.intent.action.VIEW \
     -d "aichat://auth?token=test" com.prototype.aichat
   ```
   - [ ] App opens
   - [ ] Attempts to handle link

### Test 2: Session Display

After authentication:
- [ ] Session screen appears
- [ ] Shows email address
- [ ] Shows user ID
- [ ] Shows session expiry
- [ ] "Copy Full Token" button works
- [ ] Token copied to clipboard

### Test 3: Session Persistence

1. **Force close app**
   - [ ] Swipe away from recents
   
2. **Reopen app**
   - [ ] Session restored
   - [ ] No login required
   - [ ] Session screen visible

### Test 4: Sign Out

- [ ] Tap "Sign Out" button
- [ ] Returns to login screen
- [ ] Session cleared

## ✅ Complete Verification Checklist

### Environment & Configuration

- [ ] **API**
  - [ ] All required env vars set
  - [ ] Server starts without errors
  - [ ] CORS configured correctly
  - [ ] JWKS verification working

- [ ] **Admin**
  - [ ] All NEXT_PUBLIC vars set
  - [ ] Build succeeds
  - [ ] Supabase client initialized

- [ ] **Android**
  - [ ] local.properties configured
  - [ ] Deep link scheme/host set
  - [ ] Build succeeds

### Database

- [ ] **Tables**
  - [ ] profiles table exists
  - [ ] RLS enabled
  - [ ] Policies active

- [ ] **Functions**
  - [ ] Admin helper functions created
  - [ ] Trigger for profile creation (if applicable)

### Authentication Flow

- [ ] **Magic Link**
  - [ ] Email sent successfully
  - [ ] Link contains correct redirect
  - [ ] Token exchange works

- [ ] **JWT Verification**
  - [ ] Valid tokens accepted
  - [ ] Invalid tokens rejected
  - [ ] Expired tokens handled

- [ ] **Role Management**
  - [ ] User role loaded correctly
  - [ ] Admin role enforced
  - [ ] Profile auto-creation works

### API Endpoints

- [ ] **Public**
  - [ ] `/health` - no auth required
  - [ ] `/` - no auth required

- [ ] **Protected**
  - [ ] `/api/me` - requires auth
  - [ ] `/api/auth/status` - shows auth state

- [ ] **Admin**
  - [ ] `/api/admin/users` - requires admin role
  - [ ] `/api/admin/metrics` - requires admin role

- [ ] **Hooks**
  - [ ] `/auth/on-signup` - processes without blocking
  - [ ] `/auth/zep-status/:id` - returns status

### Client Applications

- [ ] **Admin Dashboard**
  - [ ] Login flow complete
  - [ ] Role gating works
  - [ ] Session persists
  - [ ] Sign out works

- [ ] **Android App**
  - [ ] Magic link sent
  - [ ] Deep link handled
  - [ ] Session displayed
  - [ ] Token copyable

## 🐛 Common Issues & Solutions

### Issue: Magic link not received

**Solutions:**
1. Check spam folder
2. Verify Supabase email settings
3. Check Supabase logs for email errors
4. Ensure email provider not blocking

### Issue: CORS errors in browser

**Solutions:**
1. Verify `APP_ORIGIN_ADMIN` in API env
2. Check exact origin match (including port)
3. Ensure CORS plugin loaded before routes
4. Test with curl to isolate browser issues

### Issue: 401 Unauthorized with valid token

**Solutions:**
1. Check token not expired
2. Verify JWKS_URI is correct
3. Ensure `audience` matches
4. Check Supabase project is active

### Issue: Android deep link not working

**Solutions:**
1. Verify scheme/host in manifest
2. Check `launchMode="singleTask"`
3. Test with ADB command
4. Ensure redirect URL in Supabase

### Issue: Profile not created

**Solutions:**
1. Check if trigger exists on auth.users
2. Verify RLS policies
3. Check service key permissions
4. Look for errors in Supabase logs

## 📊 Performance Benchmarks

Expected response times:

| Operation | Target | Acceptable |
|-----------|--------|------------|
| Health check | < 50ms | < 100ms |
| JWT verification | < 100ms | < 200ms |
| Profile lookup | < 50ms | < 150ms |
| Magic link send | < 2s | < 5s |
| Deep link handle | < 500ms | < 1s |

## 🎯 Phase 1 Success Criteria

All of the following must be true:

1. ✅ Users can sign in with magic link
2. ✅ Sessions persist across app restarts
3. ✅ JWT verification works via JWKS
4. ✅ Roles are enforced (user vs admin)
5. ✅ CORS allows only configured origins
6. ✅ Profile auto-creation works
7. ✅ On-signup hook doesn't block login
8. ✅ Both Admin and Android apps authenticate
9. ✅ API returns appropriate 401/403 errors
10. ✅ No hardcoded secrets in code

## 📝 Test Report Template

```markdown
## Phase 1 Verification Report

**Date:** [Date]
**Tester:** [Name]
**Environment:** [Local/Staging/Production]

### Test Results

| Component | Status | Notes |
|-----------|--------|-------|
| API Auth | ✅/❌ | |
| Admin Login | ✅/❌ | |
| Android Auth | ✅/❌ | |
| Role Gating | ✅/❌ | |
| CORS | ✅/❌ | |
| Session Persistence | ✅/❌ | |
| On-signup Hook | ✅/❌ | |

### Issues Found
1. [Issue description]
2. [Issue description]

### Overall Status
[ ] PASS - Ready for Phase 2
[ ] FAIL - Issues need resolution
```

## 🔗 Related Documentation

- [AUTH_SETUP.md](./AUTH_SETUP.md) - Complete auth implementation guide
- [DEFINITION_OF_DONE.md](./DEFINITION_OF_DONE.md) - Phase 1 acceptance criteria
- [ENVIRONMENT.md](./ENVIRONMENT.md) - Environment variable reference
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) - Overall project phases

---

**Last Updated:** Phase 1 verification complete
**Next Phase:** [Phase 2 - Telemetry & Pricing Tables](./DEFINITION_OF_DONE.md#phase-2)
