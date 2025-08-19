# Claude Session Context - AI Chat Task

## 🎯 Project Overview

**Project**: AI Integrations Quest (Szymon)  
**Goal**: Build a real, end-to-end system with Auth → API → Zep/OpenAI → SSE → Android → Admin telemetry  
**Timeline**: 1.5-3 working days  
**Current Phase**: Phase 1 (Supabase Auth) - Implementation Complete

### Key Requirements
- Real integrations (no mocks) - OpenAI + Zep
- True SSE streaming with <350ms TTFT
- Role-based auth (user/admin) via Supabase
- Telemetry & cost tracking
- EU deployment (except Zep which is US)

## 📊 Current Progress

### ✅ Phase 0: Foundations (COMPLETE)
- Monorepo structure with pnpm workspaces
- Directory layout: `/apps/api`, `/apps/admin`, `/apps/android`, `/packages/shared`
- Root configurations (prettier, editorconfig, tsconfig)
- Environment templates for all apps
- CI/CD pipeline with GitHub Actions
- Documentation structure created

### ✅ Phase 1: Supabase Auth (IMPLEMENTATION COMPLETE)

**Status**: All code implemented, awaiting Supabase project creation for final testing

#### Completed:
1. **Documentation**:
   - `AUTH_SETUP.md` - Complete auth implementation guide
   - `DEFINITION_OF_DONE.md` - Phase checklists with current status
   - `ENVIRONMENT.md` - Auth environment variables
   - `PHASE1_VERIFICATION.md` - Comprehensive QA test procedures
   - Updated all `.env.example` files with auth configs

2. **Database Migrations**:
   - `001_create_profiles_table.sql` ✅
   - `002_create_profiles_rls_policies.sql` ✅
   - `003_create_user_signup_trigger_alternative.sql` ✅ (alternative due to auth.users restriction)
   - `004_admin_management_utils.sql` ✅
   - Note: Original trigger on auth.users failed due to permissions

3. **API Implementation** (`/apps/api/`):
   - Fastify server with JWKS-based JWT verification ✅
   - Auth middleware plugin with user context injection ✅
   - CORS plugin with strict origin validation ✅
   - Admin role guards (`requireAdmin()`) ✅
   - **ProfilesClient with real Supabase integration** ✅ (fixed from stub)
   - **Auto-creation of profiles on first request** ✅
   - On-signup webhook endpoint for Zep initialization ✅
   - Debug scripts for webhook testing ✅
   - Health and status endpoints ✅

4. **Admin Dashboard** (`/apps/admin/`):
   - Complete Next.js 14 app with App Router ✅
   - Supabase Auth with magic links ✅
   - Protected routes with role-based middleware ✅
   - Session persistence via Supabase SSR ✅
   - Admin panel UI with Playground, Users, Telemetry cards ✅
   - Unauthorized access handling ✅

5. **Android App** (`/apps/android/`):
   - Full Kotlin/Compose application ✅
   - Supabase SDK integration ✅
   - Magic link authentication flow ✅
   - Deep link handling (`aichat://auth`) ✅
   - Session display screen with token copy ✅
   - Persistent session storage ✅

6. **Additional Features**:
   - Stub Zep client for Phase 1 (real integration in Phase 3) ✅
   - Stub telemetry service for Phase 1 (real in Phase 2) ✅
   - Comprehensive error handling to never block auth ✅
   - Multiple profile creation fallback mechanisms ✅

#### Pending (Requires Supabase Project):
- [ ] Create Supabase project in EU region
- [ ] Run database migrations in Supabase
- [ ] Configure magic link in Dashboard
- [ ] Set redirect URLs for all environments
- [ ] Test complete auth flow end-to-end
- [ ] Seed admin user

### 🔮 Upcoming Phases

**Phase 2**: Telemetry & Pricing Tables  
**Phase 3**: Zep v3 Integration  
**Phase 4-5**: API Service (Fastify + OpenAI SSE)  
**Phase 6**: Admin Panel (Next.js)  
**Phase 7**: Android App  
**Phase 8-12**: Security, Deployment, QA

## 🔑 Important Configuration

### Supabase Project (When Created)
- **URL**: `https://fgscwpqqadqncgjknsmk.supabase.co` (placeholder in code)
- **Region**: EU (Frankfurt/Amsterdam)
- **JWKS**: `https://fgscwpqqadqncgjknsmk.supabase.co/auth/v1/.well-known/jwks.json`

### Current Tech Stack
- **API**: Fastify + TypeScript (Node.js)
- **Auth**: Supabase with magic links
- **Database**: PostgreSQL via Supabase
- **Admin**: Next.js 14 with App Router (implemented)
- **Android**: Kotlin/Compose (implemented)
- **Monorepo**: pnpm workspaces

## 🚨 Known Issues & Solutions

### 1. auth.users Trigger Permission Error
**Issue**: Cannot create triggers on auth.users table  
**Solution**: Using alternative approaches:
- Database webhook with Edge Function (recommended)
- API-side auto-creation of profiles (implemented as fallback)
- Client-side RPC call after signup

### 2. Profile Auto-Creation (FIXED)
**Issue**: Profiles weren't being created, table was empty despite users existing  
**Root Cause**: ProfilesClient was using stub data instead of real Supabase  
**Solution Implemented**: 
- Rewrote ProfilesClient to use Supabase Admin SDK with service role key
- Added auto-creation in `getUserRole()` method as fallback
- Profile now created on first authenticated request if missing
- Also triggers on-signup hook for Zep initialization

### 3. Database Webhook Format
**Issue**: Webhook payload format mismatch between auth.users and profiles tables  
**Solution**: On-signup endpoint handles both formats:
- Direct calls with `user_id` and `email`
- Supabase webhook format with `record` object
- Supports both auth.users and profiles table webhooks

## 📁 Key Files to Review

### Documentation
- `/PROJECT_CONTEXT.md` - Full project requirements
- `/IMPLEMENTATION_PLAN.md` - Detailed phase breakdown
- `/docs/AUTH_SETUP.md` - Auth implementation guide
- `/docs/DEFINITION_OF_DONE.md` - Acceptance criteria with current status
- `/docs/PHASE1_VERIFICATION.md` - Complete QA test procedures

### Code - API
- `/apps/api/src/plugins/auth.ts` - JWT verification middleware
- `/apps/api/src/plugins/cors.ts` - CORS origin validation
- `/apps/api/src/utils/guards.ts` - Admin role guards
- `/apps/api/src/db/profiles.ts` - **Database client with real Supabase (fixed)**
- `/apps/api/src/routes/auth.ts` - On-signup webhook endpoint
- `/apps/api/db/migrations/` - SQL migrations ready to run
- `/apps/api/debug-webhook.sh` - Webhook testing script

### Code - Admin
- `/apps/admin/app/` - Complete Next.js app with auth
- `/apps/admin/lib/supabase/` - Supabase client utilities
- `/apps/admin/middleware.ts` - Auth and role protection

### Code - Android
- `/apps/android/app/src/main/` - Complete Android app
- `/apps/android/app/src/main/java/com/prototype/aichat/MainActivity.kt` - Deep link handling

### Configuration
- `/apps/api/.env.example` - API environment template
- `/apps/admin/.env.example` - Admin environment template
- `/apps/android/local.properties.example` - Android configuration template

## 🎬 Next Actions

1. **Create Supabase Project**:
   ```bash
   # Go to https://app.supabase.com
   # Create new project in EU region
   # Enable email auth (magic links)
   ```

2. **Run Migrations**:
   ```bash
   # In Supabase SQL Editor, run in order:
   # 001_create_profiles_table.sql
   # 002_create_profiles_rls_policies.sql
   # 003_create_user_signup_trigger_alternative.sql
   # 004_admin_management_utils.sql
   ```

3. **Configure Auth**:
   - Set redirect URLs in Supabase Dashboard
   - Customize magic link email template
   - Create first admin user

4. **Test API**:
   ```bash
   cd apps/api
   pnpm install
   cp .env.example .env.local
   # Add real Supabase credentials
   pnpm dev
   ```

## 💡 Session Restoration Tips

When continuing this project:

1. **Read these first**:
   - This file (CLAUDE.md)
   - PROJECT_CONTEXT.md
   - IMPLEMENTATION_PLAN.md
   - PHASE1_VERIFICATION.md for testing procedures

2. **Check current phase status**:
   - Phase 1 implementation is COMPLETE
   - Look at DEFINITION_OF_DONE.md for detailed status
   - All three apps (API, Admin, Android) are fully implemented
   - Just awaiting Supabase project creation for testing

3. **Verify environment**:
   ```bash
   pnpm install  # Install all workspace dependencies
   cd apps/api && pnpm dev  # Test API
   cd ../admin && pnpm dev  # Test Admin
   cd ../android && ./gradlew assembleDebug  # Build Android
   ```

4. **Key technical decisions**:
   - **JWKS for JWT verification** (not Supabase client round-trips)
   - **Profiles table with RLS** for role management
   - **ProfilesClient uses real Supabase** (fixed from stub)
   - **Auto-creation of profiles** as resilient fallback
   - **CORS strict origin validation** (Admin + Android only)
   - **Never block auth** - errors handled gracefully

5. **Recent fixes implemented**:
   - Fixed ProfilesClient to use real Supabase instead of stub data
   - Added profile auto-creation on first authenticated request
   - Updated on-signup endpoint to handle webhook payload formats
   - Created debug scripts for testing webhooks and CORS

## 📝 Commands Reference

```bash
# Development
pnpm dev:api          # Start API server
pnpm dev:admin        # Start admin dashboard
pnpm dev:all          # Start all services

# Testing
curl http://localhost:3000/health                    # Health check
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/me                      # Test auth

# Database
psql $DATABASE_URL -f migrations/001_*.sql          # Run migration

# Utilities
pnpm format           # Format code
pnpm check:all        # Run all checks
```

## 🔗 External Resources

- **Supabase Project**: [Create here](https://app.supabase.com)
- **Railway Deployment**: [Railway.app](https://railway.app) (EU region)
- **Vercel Deployment**: [Vercel.com](https://vercel.com) (EU region)
- **Zep Memory**: [Zep.ai](https://www.getzep.com/) (US region)

---

## 📈 Progress Summary

**Phase 0**: ✅ Complete  
**Phase 1**: ✅ Implementation Complete (awaiting Supabase project for testing)  
**Phase 2-12**: ⏳ Not started  

**Critical Achievement**: All three applications (API, Admin, Android) have complete authentication implementations with role-based access control, session persistence, and resilient error handling.

**Last Session Work**:
1. Debugged and fixed profile creation issue (ProfilesClient was using stub data)
2. Implemented auto-creation fallback for profiles
3. Added webhook payload format handling
4. Created comprehensive verification documentation
5. Updated all status tracking documents

---

**Last Updated**: Phase 1 implementation complete with all fixes applied. ProfilesClient now uses real Supabase. Auto-creation ensures profiles always exist. Ready for testing once Supabase project is created.

**GitHub Repo**: SimonCierniewski/ai-chat-task
