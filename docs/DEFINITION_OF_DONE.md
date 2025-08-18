# Definition of Done

## 🎯 Overall Project Criteria

### Core Requirements
- [ ] **Real Integrations**: Zep + OpenAI actually called (no mocks)
- [ ] **SSE Streaming**: Continuous token streaming in Admin and Android
- [ ] **Auth & Roles**: Admin routes reject non-admins; JWT verified server-side
- [ ] **Telemetry**: Events written for each message; dashboard shows real data
- [ ] **Documentation**: README explains setup, deploy, and known trade-offs

### Performance Targets
- [ ] **TTFT < 350ms**: First token arrives quickly (EU hosting helps)
- [ ] **Memory Budget**: ≤1.5k tokens from Zep before OpenAI call
- [ ] **No Buffering**: SSE streams immediately, no batching

### Security Requirements
- [ ] **No Secrets in Code**: Only .env.example templates
- [ ] **CORS Locked**: Only Admin + Android origins allowed
- [ ] **JWT Verification**: JWKS-based, no round-trips
- [ ] **RLS Enabled**: Supabase Row Level Security active

---

## 📋 Phase-Specific Checklists

### Phase 0: Foundations ✅
- [x] Monorepo with pnpm workspaces
- [x] Directory structure created
- [x] Root configs (prettier, editorconfig, tsconfig)
- [x] Environment templates for all apps
- [x] CI/CD pipeline configured
- [x] Documentation structure

### Phase 1: Supabase Auth (Magic Link) & Roles
- [ ] **Supabase Setup**
  - [ ] Project created in EU region (Frankfurt/Amsterdam)
  - [ ] Email provider enabled
  - [ ] Magic link configured (OTP expiry: 3600s)
  - [ ] Redirect URLs configured for all environments
  - [ ] Email template customized

- [ ] **Database Schema**
  - [ ] `profiles` table created with user_id, role, timestamps
  - [ ] RLS policies implemented
  - [ ] Signup trigger creates profile
  - [ ] At least one admin user seeded

- [ ] **API Auth Middleware**
  - [ ] JWKS client configured
  - [ ] JWT verification working
  - [ ] User context attached to requests
  - [ ] Role loaded from profiles table

- [ ] **Client Integration**
  - [ ] Admin: Magic link UI implemented
  - [ ] Admin: Session persistence working
  - [ ] Android: Deep link configured (myapp://auth/callback)
  - [ ] Android: Auth callback handled

- [ ] **Verification**
  - [ ] Magic link email arrives
  - [ ] Link redirects correctly
  - [ ] Session persists across refreshes
  - [ ] Admin routes require admin role

### Phase 2: Telemetry & Pricing Tables
- [ ] **Database Tables**
  - [ ] `telemetry_events` table with proper schema
  - [ ] `daily_usage` aggregates table
  - [ ] `models_pricing` table with initial rates
  - [ ] Indices on (user_id, created_at) and (day, user_id, model)

- [ ] **Data Flow**
  - [ ] Events logged for all interactions
  - [ ] Aggregates computed correctly
  - [ ] Cost calculation matches pricing table

### Phase 3: Zep v3 Integration
- [ ] **Memory Management**
  - [ ] User namespaces created (user:<id>)
  - [ ] Messages stored with metadata
  - [ ] Retrieval returns trimmed results
  - [ ] Graph facts can be upserted

- [ ] **Performance**
  - [ ] Top_k limited to 6-10 results
  - [ ] Facts trimmed to ≤2 sentences
  - [ ] Total memory ≤1.5k tokens
  - [ ] Zep latency documented

### Phase 4-5: API Service (Fastify + OpenAI)
- [ ] **Core Endpoints**
  - [ ] POST /api/chat (SSE streaming)
  - [ ] POST /api/memory/upsert
  - [ ] GET /api/memory/search
  - [ ] GET /api/admin/* (role-gated)

- [ ] **SSE Contract**
  - [ ] `event: token` with incremental text
  - [ ] `event: usage` with final costs
  - [ ] `event: done` on completion
  - [ ] Errors handled gracefully

- [ ] **Integration**
  - [ ] Zep called before OpenAI when useMemory=true
  - [ ] OpenAI streams tokens immediately
  - [ ] Costs calculated from models_pricing
  - [ ] All timings logged (ttft_ms, duration_ms)

### Phase 6: Admin Panel (Next.js)
- [ ] **Core Features**
  - [ ] Prompt playground with SSE rendering
  - [ ] Users list from Supabase
  - [ ] Telemetry dashboard with charts
  - [ ] Pricing editor for models

- [ ] **Data Visualization**
  - [ ] Messages/day chart
  - [ ] Average TTFT chart
  - [ ] Cost breakdown by model
  - [ ] User activity metrics

- [ ] **Security**
  - [ ] Admin role required for access
  - [ ] Server-side data fetching
  - [ ] No sensitive keys in client

### Phase 7: Android App
- [ ] **Authentication**
  - [ ] Magic link flow complete
  - [ ] Deep link handling works
  - [ ] Session persists

- [ ] **Chat Interface**
  - [ ] Message sending works
  - [ ] SSE tokens render live
  - [ ] Memory toggle functional
  - [ ] Usage/costs displayed

- [ ] **User Experience**
  - [ ] Smooth scrolling during stream
  - [ ] Reconnection on network change
  - [ ] Error states handled
  - [ ] History loads per session

### Phase 8: Security & Rate Limiting
- [ ] **Security Hardening**
  - [ ] CORS origins validated
  - [ ] Rate limiter active
  - [ ] Secrets never exposed
  - [ ] Input validation on all endpoints

- [ ] **Testing**
  - [ ] Unauthorized requests blocked (401)
  - [ ] Wrong origin blocked (403)
  - [ ] Rate limits enforced (429)
  - [ ] XSS/injection prevented

### Phase 9: Deployment
- [ ] **Infrastructure**
  - [ ] API deployed to Railway EU
  - [ ] Admin deployed to Vercel EU
  - [ ] Supabase in EU region
  - [ ] Environment variables set

- [ ] **Verification**
  - [ ] Public URLs accessible
  - [ ] SSE works over internet
  - [ ] Auth flow works in production
  - [ ] Logs accessible for debugging

### Phase 10: QA & Verification
- [ ] **Functional Testing**
  - [ ] End-to-end chat flow
  - [ ] Memory retrieval works
  - [ ] Costs match expectations
  - [ ] Role gating enforced

- [ ] **Performance Testing**
  - [ ] TTFT measured and < 350ms
  - [ ] No buffering in SSE
  - [ ] Zep latency acceptable
  - [ ] UI responsive during streaming

### Phase 11: Observability
- [ ] **Logging**
  - [ ] Structured logs with req_id
  - [ ] User context included
  - [ ] No secrets in logs
  - [ ] Errors tracked with context

- [ ] **Metrics**
  - [ ] All telemetry events captured
  - [ ] Aggregates computed correctly
  - [ ] Dashboard reflects reality
  - [ ] Alerts configured (optional)

### Phase 12: Documentation & Hand-in
- [ ] **Documentation Complete**
  - [ ] Architecture diagram included
  - [ ] Environment setup documented
  - [ ] API contracts specified
  - [ ] Known trade-offs listed

- [ ] **Deliverables**
  - [ ] GitHub repository public
  - [ ] API URL provided
  - [ ] Admin URL provided
  - [ ] APK or web demo link

---

## 🏆 Scoring Evidence

| Requirement | Points | Evidence Location |
|------------|--------|-------------------|
| Real Integrations | 12 | Network logs, no mock code |
| SSE Streaming | 10 | DevTools traces, video demo |
| Auth & Roles | 8 | Admin panel access, JWT logs |
| Telemetry & Costs | 6 | Dashboard screenshots, DB queries |
| Clean Code & Docs | 4 | GitHub repo, README quality |
| TTFT < 350ms | +6 | Performance logs, measurements |

---

## 📝 Sign-off Checklist

Before marking any phase complete:

1. [ ] Code reviewed and formatted
2. [ ] Documentation updated
3. [ ] Environment variables documented
4. [ ] Tests pass (if applicable)
5. [ ] No secrets committed
6. [ ] Acceptance criteria met
7. [ ] Next phase unblocked