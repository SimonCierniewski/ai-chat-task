# Claude Session Context - AI Chat Task

## 🎯 Project Overview

**Project**: AI Integrations Quest (Szymon)  
**Goal**: Build a real, end-to-end system with Auth → API → Zep/OpenAI → SSE → Android → Admin telemetry  
**Timeline**: 1.5-3 working days  
**Current Phase**: Phase 1 (Supabase Auth) - Partially Complete

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

### 🚧 Phase 1: Supabase Auth (IN PROGRESS)

#### Completed:
1. **Documentation**:
   - `AUTH_SETUP.md` - Complete auth implementation guide
   - `DEFINITION_OF_DONE.md` - Phase checklists
   - `ENVIRONMENT.md` - Auth environment variables
   - Updated all `.env.example` files with auth configs

2. **Database Migrations**:
   - `001_create_profiles_table.sql` ✅
   - `002_create_profiles_rls_policies.sql` ✅
   - `003_create_user_signup_trigger_alternative.sql` ✅ (alternative due to auth.users restriction)
   - `004_admin_management_utils.sql` ✅
   - Note: Original trigger on auth.users failed due to permissions

3. **API Auth Implementation**:
   - Fastify server with JWKS-based JWT verification ✅
   - Auth middleware plugin (`/apps/api/src/plugins/auth.ts`) ✅
   - Admin guard utilities (`requireAdmin()`) ✅
   - Database client stub for profiles ✅
   - Server bootstrap with example endpoints ✅
   - Full testing documentation in API README ✅

#### Pending:
- [ ] Create Supabase project in EU region
- [ ] Configure magic link in Supabase Dashboard
- [ ] Deploy Edge Function for profile creation webhook
- [ ] Test end-to-end auth flow
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
- **URL**: `https://pjktmicpanriimktvcam.supabase.co` (placeholder in code)
- **Region**: EU (Frankfurt/Amsterdam)
- **JWKS**: `https://pjktmicpanriimktvcam.supabase.co/auth/v1/.well-known/jwks.json`

### Current Tech Stack
- **API**: Fastify + TypeScript (Node.js)
- **Auth**: Supabase with magic links
- **Database**: PostgreSQL via Supabase
- **Admin**: Next.js (planned)
- **Android**: Kotlin/Compose (planned)
- **Monorepo**: pnpm workspaces

## 🚨 Known Issues & Solutions

### 1. auth.users Trigger Permission Error
**Issue**: Cannot create triggers on auth.users table  
**Solution**: Using alternative approaches:
- Database webhook with Edge Function
- API-side auto-creation of profiles
- Client-side RPC call after signup

### 2. Profile Auto-Creation
**Current Implementation**: API creates profile on-demand if missing  
**Production Solution**: Database webhook on user signup

## 📁 Key Files to Review

### Documentation
- `/PROJECT_CONTEXT.md` - Full project requirements
- `/IMPLEMENTATION_PLAN.md` - Detailed phase breakdown
- `/docs/AUTH_SETUP.md` - Auth implementation guide
- `/docs/DEFINITION_OF_DONE.md` - Acceptance criteria

### Code
- `/apps/api/src/plugins/auth.ts` - JWT verification middleware
- `/apps/api/src/utils/guards.ts` - Admin role guards
- `/apps/api/src/db/profiles.ts` - Database client (stub)
- `/apps/api/db/migrations/` - SQL migrations

### Configuration
- `/apps/api/.env.example` - API environment template
- `/apps/admin/.env.example` - Admin environment template
- `/apps/android/.env.example` - Android environment template

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

2. **Check current phase status**:
   - Look at DEFINITION_OF_DONE.md Phase 1 checklist
   - Review completed migrations in `/apps/api/db/migrations/`

3. **Verify environment**:
   ```bash
   pnpm check:repo
   cd apps/api && pnpm install
   ```

4. **Key decisions made**:
   - Using JWKS for JWT verification (not Supabase client)
   - Profiles table with RLS for role management
   - Stub database client ready for Supabase integration
   - Auto-creation of profiles in API if missing

## 📝 Commands Reference

```bash
# Development
pnpm dev:api          # Start API server
pnpm dev:admin        # Start admin dashboard (not yet implemented)
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

**Last Updated**: Session created with Phase 0 complete, Phase 1 auth implementation done, awaiting Supabase project creation and testing.

**GitHub Repo**: SimonCierniewski/ai-chat-task (from CI badge URL)