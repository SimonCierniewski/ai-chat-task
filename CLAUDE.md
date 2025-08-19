# Claude Session Context - AI Chat Task

## 🎯 Project Overview

**Project**: AI Integrations Quest (Szymon)  
**Goal**: Build a real, end-to-end system with Auth → API → Zep/OpenAI → SSE → Android → Admin telemetry  
**Timeline**: 1.5-3 working days  
**Current Phase**: Phase 4 (API Service Implementation) - COMPLETE

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

### ✅ Phase 2: Telemetry & Pricing (COMPLETE)

**Status**: Database schema and documentation complete, ready for implementation

#### Completed:
1. **Database Migrations** (`/apps/api/db/migrations/`):
   - `005_create_telemetry_events_table.sql` ✅ - Core event storage with indices
   - `006_create_telemetry_rls_policies.sql` ✅ - Service role only RLS
   - `007_create_daily_usage_table.sql` ✅ - Aggregation with auto-function
   - `008_create_models_pricing_table.sql` ✅ - Pricing with cost calculation
   - `009_create_models_pricing_standalone.sql` ✅ - Enhanced pricing
   - `010_create_daily_usage_views.sql` ✅ - Real-time and materialized views

2. **Documentation**:
   - `TELEMETRY.md` ✅ - Complete telemetry system design
   - `PRICING.md` ✅ - Pricing configuration guide
   - `COSTS.md` ✅ - Detailed cost calculation rules (6-8 decimal precision)
   - `DB_VALIDATION.md` ✅ - SQL validation queries
   - `PHASE2_VERIFICATION.md` ✅ - Complete QA checklist
   - `ENVIRONMENT.md` ✅ - Updated with Phase 2 requirements
   - `SECRETS_MATRIX.md` ✅ - Security boundaries documentation

3. **Shared Types** (`/packages/shared/src/`):
   - `telemetry.ts` ✅ - Event types and schemas
   - `pricing.ts` ✅ - Pricing types and cost calculation
   - `aggregates.ts` ✅ - Daily usage and reporting types
   - `telemetry-memory.ts` ✅ - Message and retrieval types
   - `graph.ts` ✅ - Knowledge graph edge types
   - `memory-config.ts` ✅ - Memory configuration
   - `admin-settings.ts` ✅ - Admin dashboard settings

### ✅ Phase 3: Zep v3 Integration (DOCUMENTATION COMPLETE)

**Status**: Documentation and configuration complete, ready for implementation

#### Completed:
1. **Documentation**:
   - `ZEP_INTEGRATION.md` ✅ - Complete API documentation
   - `ZEP_COLLECTIONS.md` ✅ - Multi-tenant architecture
   - Updated `ARCHITECTURE.md` with Zep integration

2. **Configuration**:
   - Updated `/apps/api/.env.example` with Zep v3 variables
   - Updated `/apps/admin/.env.example` with server-side config
   - Defined collection naming: `user:{supabase_user_id}`
   - Session ID pattern: `session-YYYYMMDD-HHMMSS-XXXX`

3. **Security Decisions**:
   - Zep API key is **server-only** (never exposed to clients)
   - All operations proxied through API backend
   - US region deployment (expect +100-150ms latency)

### 🚧 Phase 4: API Service (IN PROGRESS)

**Status**: Core infrastructure complete, SSE endpoints ready for OpenAI integration

#### Completed Today:

1. **API Service Shell** ✅:
   - Fastify server with versioned routes (`/api/v1`)
   - Structured logging with request IDs (`req_id`)
   - Global error handler (always returns JSON)
   - CORS with strict origin validation (403 for blocked origins)
   - Health endpoint with uptime tracking
   - Ajv JSON Schema validator integration
   - Created `RUNBOOK_API.md` operational documentation

2. **JWT Authentication** ✅:
   - JWKS verification for RS256 tokens
   - HS256 support for development
   - User context (`req.user = { id, email, role }`)
   - Request-level role caching
   - `requireAdmin()` guard utility
   - Error codes: `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `FORBIDDEN`
   - Test endpoint `/api/v1/auth/ping`
   - Complete `README.md` with curl examples

3. **API Contracts & Validation** ✅:
   - **Shared DTOs** (`/packages/shared/src/api/`):
     - `chat.ts`: Chat request/response, SSE event types
     - `memory.ts`: Memory upsert/search with graph edges
     - `admin.ts`: Admin users, metrics, pricing types
   - **JSON Schemas**: All endpoints have Ajv validation
   - **SSE Contract**: Complete streaming event definitions
   - **Documentation**:
     - `/docs/API_CONTRACTS.md`: Full endpoint specifications
     - `/docs/SSE_CONTRACT.md`: Detailed SSE streaming contract

#### Pending:
- [ ] OpenAI integration with real SSE streaming
- [ ] Zep memory retrieval implementation
- [ ] Telemetry event logging
- [ ] Rate limiting implementation
- [ ] Cost calculation and tracking

### 🔮 Upcoming Phases

**Phase 5**: OpenAI Integration (SSE streaming)  
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

### 4. CORS Package Compatibility (FIXED)
**Issue**: `fastify-cors` deprecated and incompatible with Fastify v4  
**Solution**: Migrated to `@fastify/cors` v8.5.0

## 📁 Key Files to Review

### Documentation
- `/PROJECT_CONTEXT.md` - Full project requirements
- `/IMPLEMENTATION_PLAN.md` - Detailed phase breakdown
- `/docs/API_CONTRACTS.md` - **NEW: Complete API endpoint specifications**
- `/docs/SSE_CONTRACT.md` - **NEW: SSE streaming contract with examples**
- `/apps/api/RUNBOOK_API.md` - **NEW: API operational documentation**
- `/apps/api/README.md` - **UPDATED: Auth testing with curl examples**

### Code - API (Updated)
- `/apps/api/src/server.ts` - **UPDATED: Versioned routes, structured logging**
- `/apps/api/src/config/index.ts` - **NEW: Centralized configuration**
- `/apps/api/src/plugins/auth.ts` - **UPDATED: JWKS verification, request caching**
- `/apps/api/src/utils/error-handler.ts` - **NEW: Global JSON error handler**
- `/apps/api/src/utils/validator.ts` - **NEW: Ajv schema validators**
- `/apps/api/src/utils/guards.ts` - **UPDATED: Error codes in guards**
- `/apps/api/src/routes/health.ts` - **NEW: Health & readiness endpoints**
- `/apps/api/src/routes/v1/*.ts` - **NEW: Versioned API routes**

### Code - Shared Types (New)
- `/packages/shared/src/api/chat.ts` - **NEW: Chat & SSE types**
- `/packages/shared/src/api/memory.ts` - **NEW: Memory API types**
- `/packages/shared/src/api/admin.ts` - **NEW: Admin API types**
- `/packages/shared/src/api/index.ts` - **NEW: Central API exports**

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
   # 001_create_profiles_table.sql through 010_create_daily_usage_views.sql
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
   
   # Test endpoints
   curl http://localhost:3000/health
   curl http://localhost:3000/api/v1/auth/ping -H "Authorization: Bearer $TOKEN"
   ```

## 💡 Session Restoration Tips

When continuing this project:

1. **Read these first**:
   - This file (CLAUDE.md)
   - PROJECT_CONTEXT.md
   - IMPLEMENTATION_PLAN.md
   - API_CONTRACTS.md for endpoint specifications
   - SSE_CONTRACT.md for streaming details

2. **Check current phase status**:
   - Phase 1-3: Documentation and schemas complete
   - Phase 4: API infrastructure ready, needs OpenAI integration
   - Look at DEFINITION_OF_DONE.md for detailed status

3. **Verify environment**:
   ```bash
   pnpm install  # Install all workspace dependencies
   cd apps/api && pnpm dev  # Test API
   cd ../admin && pnpm dev  # Test Admin
   cd ../android && ./gradlew assembleDebug  # Build Android
   ```

4. **Key technical decisions**:
   - **JWKS for JWT verification** (not Supabase client round-trips)
   - **Versioned API routes** under `/api/v1`
   - **Request IDs** on all logs and errors
   - **SSE streaming** for chat responses
   - **Shared DTOs** in monorepo package
   - **CORS strict validation** returns 403 for blocked origins

5. **Recent work completed** (Current Session):
   - API service shell with Fastify
   - JWT authentication with JWKS
   - Request ID tracking and structured logging
   - CORS with strict origin validation
   - Health endpoint with uptime
   - Versioned routes structure
   - Complete API contracts and SSE specifications
   - Shared TypeScript DTOs for all endpoints
   - Ajv JSON Schema validation

## 📝 Commands Reference

```bash
# Development
pnpm dev:api          # Start API server
pnpm dev:admin        # Start admin dashboard
pnpm dev:all          # Start all services

# Testing Auth
# Generate test token
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    sub: 'test-user-id',
    email: 'test@example.com',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600
  },
  'placeholder-jwt-secret-with-at-least-32-characters',
  { algorithm: 'HS256' }
);
console.log(token);
"

# Test endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/auth/ping -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/v1/admin/users -H "Authorization: Bearer $ADMIN_TOKEN"

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
**Phase 2**: ✅ Schema & Types Complete  
**Phase 3**: ✅ Documentation Complete  
**Phase 4**: 🚧 API Infrastructure Complete, OpenAI Integration Pending  
**Phase 5-12**: ⏳ Not started  

**Critical Achievement**: API service now has complete infrastructure with versioned routes, JWT auth via JWKS, structured logging with request IDs, strict CORS, and comprehensive contracts for all endpoints including SSE streaming.

**Current Session Work**:
1. Built API service shell with Fastify and versioned routes
2. Implemented JWT verification using JWKS with role loading
3. Added structured logging with request IDs throughout
4. Created requireAdmin() guard with proper error codes
5. Defined complete API contracts and SSE streaming specifications
6. Created shared TypeScript DTOs for all endpoints
7. Integrated Ajv JSON Schema validation
8. Documented everything in API_CONTRACTS.md and SSE_CONTRACT.md

---

**Last Updated**: 2025-08-19 - Phase 4 API infrastructure complete with auth, logging, CORS, and contracts. Ready for OpenAI SSE integration.

**GitHub Repo**: SimonCierniewski/ai-chat-task