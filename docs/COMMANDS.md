# Commands Reference

Quick reference for all monorepo commands. All commands run from root directory.

## 🚀 Development

| Command            | Description                           | Failure Mode                    |
| ------------------ | ------------------------------------- | ------------------------------- |
| `pnpm dev`         | Start all app dev servers in parallel | Shows warning if no dev scripts |
| `pnpm dev:api`     | Start API service only                | Shows warning if not configured |
| `pnpm dev:admin`   | Start admin dashboard only            | Shows warning if not configured |
| `pnpm dev:android` | Instructions for Android development  | Info message only               |
| `pnpm dev:all`     | Start API + Admin together            | Warnings for unconfigured apps  |

## 📦 Building

| Command             | Description                        | Failure Mode                    |
| ------------------- | ---------------------------------- | ------------------------------- |
| `pnpm build`        | Build shared package then all apps | Shows warning if no scripts     |
| `pnpm build:api`    | Build API for production           | Shows warning if not configured |
| `pnpm build:admin`  | Build admin dashboard              | Shows warning if not configured |
| `pnpm build:shared` | Build shared utilities package     | Shows warning if not configured |
| `pnpm build:all`    | Build everything sequentially      | Continues despite failures      |

## ✨ Code Quality

| Command             | Description                      | Failure Mode                     |
| ------------------- | -------------------------------- | -------------------------------- |
| `pnpm lint`         | Run ESLint in all workspaces     | Shows warning if not configured  |
| `pnpm lint:fix`     | Auto-fix linting issues          | Shows warning if not configured  |
| `pnpm format`       | Format all files with Prettier   | Skips if files don't exist       |
| `pnpm format:check` | Check formatting without changes | Returns non-zero if issues found |
| `pnpm typecheck`    | Run TypeScript checks            | Shows warning if not configured  |

## 🧪 Testing

| Command              | Description               | Failure Mode                    |
| -------------------- | ------------------------- | ------------------------------- |
| `pnpm test`          | Run all tests in parallel | Shows warning if no tests       |
| `pnpm test:watch`    | Run tests in watch mode   | Shows warning if not configured |
| `pnpm test:coverage` | Generate coverage reports | Shows warning if not configured |

## 🧹 Maintenance

| Command            | Description                         | Failure Mode             |
| ------------------ | ----------------------------------- | ------------------------ |
| `pnpm clean`       | Remove all build artifacts and deps | Safe, continues on error |
| `pnpm clean:build` | Remove only build outputs           | Safe, continues on error |
| `pnpm clean:deps`  | Remove all node_modules             | Safe, continues on error |
| `pnpm clean:cache` | Clear pnpm and build caches         | Safe, continues on error |

## ✅ Health Checks

| Command           | Description                    | Expected Output                                         |
| ----------------- | ------------------------------ | ------------------------------------------------------- |
| `pnpm check:repo` | Verify Node, pnpm, workspaces  | `✓ Node v20.x.x`<br>`✓ pnpm 8.x.x`<br>`✓ Workspaces OK` |
| `pnpm check:deps` | Show outdated dependencies     | Table of updates available                              |
| `pnpm check:all`  | Run all checks + quality tools | All checks pass or show issues                          |

## 🔧 Setup

| Command        | Description                 | When to Use           |
| -------------- | --------------------------- | --------------------- |
| `pnpm setup`   | Install deps + verify setup | After cloning repo    |
| `pnpm install` | Install all dependencies    | After pulling changes |

## 💡 Usage Tips

### Starting Fresh

```bash
git clone <repo>
cd <repo>
pnpm setup        # Install + verify
pnpm dev          # Start development
```

### Daily Workflow

```bash
pnpm dev:all      # Start API + Admin
pnpm format       # Format before commit
pnpm check:all    # Verify before push
```

### Before Deploy

```bash
pnpm clean        # Start clean
pnpm install      # Fresh dependencies
pnpm build:all    # Build everything
pnpm check:all    # Final verification
```

## 🔐 Phase 1: Authentication Commands

### Supabase Setup Verification

```bash
# Check if Supabase CLI is installed (optional for local dev)
supabase --version

# Start local Supabase (optional)
supabase start

# View local Supabase dashboard
open http://localhost:54323

# Check Inbucket for test emails (local only)
open http://localhost:54324
```

### Environment Verification

```bash
# Verify all Phase 1 env vars are set (run in each app)
cd apps/api && grep "PHASE 1" .env.example
cd apps/admin && grep "PHASE 1" .env.example
cd apps/android && grep "PHASE 1" .env.example

# Test JWKS endpoint is accessible
curl https://[PROJECT_REF].supabase.co/auth/v1/.well-known/jwks.json
```

### Auth Flow Testing

```bash
# API: Test JWT verification middleware (once implemented)
curl -H "Authorization: Bearer [JWT_TOKEN]" http://localhost:3000/api/health

# Admin: Test magic link request
curl -X POST http://localhost:3001/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Android: Test deep link handling
adb shell am start -W -a android.intent.action.VIEW \
  -d "myapp://auth/callback?token=test&type=magiclink" \
  com.yourapp.package
```

### Database Verification

```sql
-- Connect to Supabase SQL Editor or psql
-- Check profiles table exists
SELECT * FROM profiles LIMIT 1;

-- Check RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename = 'profiles';

-- Test trigger works (after user signup)
SELECT * FROM auth.users;
SELECT * FROM profiles;
```

### Role Management

```bash
# Promote user to admin (run in Supabase SQL Editor)
UPDATE profiles 
SET role = 'admin' 
WHERE user_id = '[USER_UUID]';

# Verify role in JWT claims (decode JWT at jwt.io)
# Should see role in app_metadata or custom claims
```

## 🎯 Script Behavior

**Resilient by Design**: All scripts handle missing implementations gracefully:

- `--if-present` flag prevents crashes on missing scripts
- Fallback messages guide setup when apps aren't configured
- Parallel execution continues despite individual failures
- Error streams suppressed with `2>/dev/null` where appropriate

**Zero Configuration**: Works immediately after clone:

- No assumptions about app implementations
- Prettier works without any app code
- Check commands verify environment setup
- Clean commands safe on empty directories
