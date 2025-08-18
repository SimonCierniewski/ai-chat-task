# Implementation Plan — AI Integrations Quest (Szymon)

> **Objective:** Deliver a real, end‑to‑end system in 1.5–3 working days: **Auth → API → Zep/OpenAI → SSE → Android → Admin telemetry**, with clean deploys and no mocks.

---

## 0) High‑Level Milestones & Timeline (indicative)

- **Day 0.5** — Phase 0: Foundations & repo layout
- **Day 1 (AM)** — Phase 1: Supabase Auth (magic link) & roles
- **Day 1 (PM)** — Phase 2: Telemetry tables & pricing; Phase 3: Zep memory wiring
- **Day 2 (AM)** — Phase 4 & 5: API (Fastify) + OpenAI SSE; contracts finalized
- **Day 2 (PM)** — Phase 6: Admin (playground, users, telemetry, pricing)
- **Day 3 (AM)** — Phase 7: Android client (auth, chat, SSE, history)
- **Day 3 (PM)** — Phases 8–12: Security hardening, deploys, QA, README, hand‑in

> **Constraint:** Skip Redis cache for now; keep memory `top_k` small and stream early to maintain TTFT.

---

## 1) Deliverables Checklist (final hand‑in)

- ✅ **GitHub repo(s)** with `/apps/api`, `/apps/admin`, `/apps/android`, `/packages/shared`, `/docs`, `/infra`
- ✅ **Deployed API URL** (Railway EU), **Admin URL** (Vercel EU)
- ✅ **APK** (or Flutter Web link, if applicable)
- ✅ **README** with local run, deploy steps, API contracts, known trade‑offs
- ✅ **SSE streaming** verified in Admin playground and Android
- ✅ **Telemetry dashboard** with real data (messages/day, avg TTFT, costs); **Users list**
- ✅ **No mocks**; real calls to Zep + OpenAI; JWT verification enabled

---

## 2) Architecture Snapshot (frozen decisions)

- **Auth:** Supabase (magic link), roles `user`/`admin` in `profiles`
- **API:** Node.js + **Fastify** (TypeScript); SSE proxy to OpenAI; Zep retrieval first (if enabled)
- **Memory:** **Zep v3** (US) for messages, retrieval, minimal graph facts
- **Admin:** Next.js (Vercel EU) + Recharts
- **Mobile:** Android (Kotlin/Compose)
- **Rate limiting / cache:** Basic per‑IP/user limiter; **no Redis cache yet**
- **Regions:** API (Railway EU, Amsterdam), Admin (Vercel EU), Supabase (EU), Zep (US)

---

## 3) Environments & Secrets (single source of truth)

### 3.1 Env templates
- **API:** `OPENAI_API_KEY`, `OPENAI_DEFAULT_MODEL`, `ZEP_API_KEY`, `ZEP_BASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_AUD`, `SUPABASE_PROJECT_REF`, `APP_ORIGIN_ADMIN`, `APP_ORIGIN_ANDROID_DEV`
- **Admin:** `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, flags
- **Android:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_DEEPLINK_SCHEME`, `APP_DEEPLINK_HOST`

### 3.2 Secrets hygiene
- No server secrets in clients; `.env.example` only in repo; real keys set in Railway/Vercel/Supabase UI.
- Use **JWKS** verification of Supabase JWT (no round‑trip to Supabase).

---

## 4) Phase 0 — Foundations & Repo Layout

**Tasks**
1. Initialize monorepo with pnpm workspaces, Node 20.
2. Create folders: `/apps/api`, `/apps/admin`, `/apps/android`, `/packages/shared`, `/infra`, `/docs`.
3. Add root configs: `.editorconfig`, `.prettierrc`, `.eslint` (placeholder), `tsconfig.base.json`, `.gitignore`.
4. Add `.env.example` for each app; write `/docs/ENVIRONMENT.md`.
5. Add `/docs/ARCHITECTURE.md`, `/docs/DEFINITION_OF_DONE.md`, `/docs/COMMANDS.md`.
6. Add CI (GitHub Actions) for install + lint + format check.

**Acceptance**
- `pnpm i` succeeds; root scripts run; docs explain envs and commands.

---

## 5) Phase 1 — Supabase Auth (Magic Link) & Roles

**Tasks**
1. Create Supabase project in **EU** region; enable **passwordless email**.
2. Configure **Additional Redirect URLs** for Android deep link (e.g., `myapp://auth`).
3. Create `profiles` table with `user_id PK`, `role ENUM('user','admin') default 'user'`, timestamps.
4. Add RLS policies: user can read own profile; service/admin can manage roles.
5. (Optional) Set up on‑signup hook (edge function or server) to initialize Zep user/collection.

**API Impacts**
- Build a small middleware that verifies Supabase JWT via JWKS and loads role from `profiles` (cached).

**Acceptance**
- Magic link sign‑in works end‑to‑end; API sees `userId` and `role` from JWT/profile.

---

## 6) Phase 2 — Telemetry & Pricing Tables

**Schema**
- `telemetry_events(id, user_id, session_id, type, payload_json, created_at)`  
  - `type ∈ {'message_sent','openai_call','zep_upsert','zep_search','error'}`  
  - `payload_json`: `{ ttft_ms, openai_ms, zep_ms, duration_ms, model, tokens_in, tokens_out, cost_usd, error? }`
- `daily_usage(day, user_id, model, tokens_in, tokens_out, cost_usd, calls, avg_ttft_ms, avg_duration_ms)`
- `models_pricing(model, input_per_mtok, output_per_mtok, cached_input_per_mtok, updated_at)`

**Tasks**
1. Create tables + indices on `(user_id, created_at)` and `(day, user_id, model)`.
2. Add a view or scheduled job to populate `daily_usage` from `telemetry_events`.
3. Seed `models_pricing` with initial rates (manual for now).

**Acceptance**
- Insert/select works; basic aggregate query returns rows for Admin charts.

---

## 7) Phase 3 — Zep v3 Integration (Memory & Graph)

**Decisions**
- Namespace by user: `user:<id>`; sessions within namespace.
- **Store original messages** (role, content, timestamp, session).
- Graph facts minimal: `(user)-[likes|works_at|located_in]->(entity)`.

**Tasks**
1. Define API adapter for Zep endpoints used: create/get collection, add message, search, upsert facts/edges.
2. Retrieval policy (no Redis):
   - `top_k = 6–10`
   - Deduplicate by semantic id / hash
   - Clip each fact to ≤2 sentences
   - Enforce **memory budget ≤ ~1.5k tokens** before calling OpenAI
3. Document Zep latency consideration (US region) and mitigation by trimming + streaming early.

**Acceptance**
- `/api/memory/search` returns concise, deduped results; `/api/memory/upsert` writes facts; logs include `zep_*` events.

---

## 8) Phase 4 — API Service (Fastify, TypeScript)

**Cross‑cutting**
- **JWT verify** (JWKS) → `req.user = { id, role }`
- **CORS**: allow Admin domain + Android dev origin; block others
- **Rate limit**: simple in‑memory limiter per IP/user (assignment‑level)
- **Structured logs**: include `req_id`, `user_id`, `session_id`

**Endpoints**
- `POST /api/chat` (**SSE**)
  - Body: `{ message, useMemory?, sessionId?, model? }`
  - Steps:
    1. Validate auth; start timer
    2. If `useMemory`, call Zep search (log `zep_search`)
    3. Compose prompt with trimmed memory context
    4. Call OpenAI with **streaming**
    5. Relay SSE tokens: `event: token` for each delta
    6. On finish, emit `event: usage` with tokens & cost; `event: done`
    7. Log `message_sent` and `openai_call` with timings
- `POST /api/memory/upsert` → write facts/edges to Zep, log `zep_upsert`
- `GET /api/memory/search` → Zep retrieval (trimming)
- **Admin (role=admin)**:
  - `GET /api/admin/users` (from Supabase Admin/server role)
  - `GET /api/admin/metrics?from=&to=&userId?`
  - `POST /api/admin/models/pricing` (update pricing)

**SSE Contract**
- `token` → `{"text":"..."}` (many)
- `usage` → `{"tokens_in":n,"tokens_out":n,"cost_usd":x,"model":"..."}` (once)
- `done` → `{"finish_reason":"stop"}` (once)

**Error Paths**
- Authentication failure → 401
- CORS violation → 403
- Upstream (Zep/OpenAI) errors → log `error` event; close SSE gracefully

**Acceptance**
- Real streaming over public API; Zep retrieval precedes OpenAI when enabled.

---

## 9) Phase 5 — OpenAI Integration (Streaming & Costs)

**Decisions**
- Default model: **GPT‑4.1‑mini**; overridable per request or per session
- Prefer server‑reported usage in stream (if available); otherwise approximate

**Tasks**
1. Implement streaming call yielding early tokens as soon as available (fast flush).
2. Capture timestamps for `ttft_ms`, `openai_ms`, `duration_ms`.
3. Compute costs: `(tokens_in / 1e6 * input_rate) + (tokens_out / 1e6 * output_rate)` using `models_pricing`.
4. Emit final `usage` SSE event; persist `openai_call` telemetry.

**Acceptance**
- Admin playground shows live tokens; final usage & cost received and stored.

---

## 10) Phase 6 — Admin Panel (Next.js on Vercel EU)

**Views**
- **Playground**: input box, toggle `useMemory`, model picker; render SSE output; show final usage & cost
- **Users**: list from Supabase (email, created, role, message/session counts)
- **Telemetry**: charts (Recharts)
  - Metrics: messages/day, avg TTFT, avg response time, total cost
  - Filters: date range, model, user
- **Pricing**: table editor for `models_pricing`

**Server‑side concerns**
- Server routes verify JWT or use service role key (server only)
- Only Admin can access these pages/API routes

**Acceptance**
- All views load with real data; role gate enforced; EU region selected in Vercel.

---

## 11) Phase 7 — Android App (Kotlin/Compose)

**Flows**
- **Auth**: Magic link with deep link (`scheme://host`); session import on open
- **Chat**: send message, toggle `useMemory`, render SSE tokens in place
- **History**: per‑session view (from Zep via API or direct)

**UX**
- Show timestamps; show final usage for each assistant response
- Handle reconnection if SSE drops; safe cancel on screen change

**Acceptance**
- End‑to‑end chat works; SSE is smooth; history loads per session.

---

## 12) Phase 8 — Security, CORS, Rate Limiting

**Tasks**
- Lock CORS to Admin origin + Android dev hosts
- Implement basic limiter per user/IP with sensible thresholds
- Ensure secrets never leak to clients; validate envs on boot

**Acceptance**
- Negative tests confirm blocked origins and limited abuse (429).

---

## 13) Phase 9 — Deployment

**API (Railway EU/Amsterdam)**
- Containerize API; set envs; confirm SSE over public URL
- Health endpoint reports OK; logs visible

**Admin (Vercel EU)**
- Set **EU function region**; configure `NEXT_PUBLIC_*` and API base URL

**Supabase (EU)**
- Apply schema; set RLS; service role keys only on server routes

**Acceptance**
- Public URLs shared; SSE verified in production; latency acceptable.

---

## 14) Phase 10 — QA & Verification

**Manual checks**
- **SSE**: continuous tokens (no batching), first token quickly
- **Memory**: with `useMemory=true`, Zep is called **before** OpenAI (check logs)
- **Costs**: final usage matches telemetry; pricing changes affect new calls
- **Roles**: Admin routes reject non‑admins
- **Docs**: README steps work from a clean clone

**Artifacts**
- Screenshots: Admin playground stream; Telemetry charts; Users list
- Network traces: proof of SSE; Zep → OpenAI order

---

## 15) Phase 11 — Observability & Logs

**Conventions**
- `req_id` per request; include `user_id`, `session_id`
- Telemetry events for each leg: `message_sent`, `zep_search`, `openai_call`, `zep_upsert`, `error`
- Centralized error formatting; no secrets in logs

**Acceptance**
- Queries on telemetry confirm coverage; averages line up with dashboards.

---

## 16) Phase 12 — Hand‑in Package & README

**README must include**
- Architecture diagram & summary
- Env setup & where to put secrets (Railway/Vercel/Supabase)
- Local run steps for each app
- Deploy steps & regions
- API contracts (incl. SSE event names)
- Known trade‑offs (US Zep, no Redis)
- Links: GitHub, API URL, Admin URL, APK / web demo

**Acceptance**
- Reviewer can reproduce basic flows locally and validate features online.

---

## 17) Risk Management & Contingencies

- **Zep latency (US):** Keep `top_k` small, trim facts, stream early. If TTFT remains high, add Redis cache later.
- **Token usage drift:** Prefer API‑reported usage; otherwise compute consistently and note approximation in telemetry.
- **Email deliverability:** Use a sender with good reputation; document spam folder checks.
- **CORS/SSE issues behind proxies:** Confirm headers; disable buffering; test from Admin & Android.

---

## 18) Rubric Mapping (evidence‑driven)

| Rubric Area | Points | Evidence / How We Prove It |
|---|---:|---|
| Integrations real (OpenAI + Zep) | 12 | Network logs show real calls; Admin playground runs live; no mocks in code |
| SSE chat end‑to‑end | 10 | Admin & Android show continuous token stream; HAR/DevTools traces attached |
| Auth + role + admin | 8 | Admin routes gated; Users list from Supabase; role visible in UI |
| Telemetry + costs + charts | 6 | `telemetry_events` filled; `daily_usage` aggregates; charts reflect changes |
| Code/infra/README | 4 | Clean repo layout; env templates; CI; clear README & docs |
| **Bonus:** TTFT < 350ms | 6 | Timing logs show TTFT; optimizations documented (EU regions, trimming) |

---

## 19) Appendix

### A) SSE event contract
- `token` → `{"text":"..."}` (repeated)
- `usage` → `{"tokens_in":n,"tokens_out":n,"cost_usd":x,"model":"..."}`
- `done` → `{"finish_reason":"stop"}`

### B) Telemetry payload fields
- `ttft_ms`, `openai_ms`, `zep_ms`, `duration_ms`, `model`, `tokens_in`, `tokens_out`, `cost_usd`, `error?`

### C) Cost formula
```
cost_usd = (tokens_in / 1_000_000) * input_per_mtok
         + (tokens_out / 1_000_000) * output_per_mtok
```
Use `models_pricing` table values.

### D) Out‑of‑scope (deferred)
- Redis short‑TTL retrieval cache
- Multi‑provider LLM abstraction
- Full Prometheus/Grafana stack (basic logs suffice for assignment)

---

**Execution rule of thumb:** If blocked, choose the **simplest path that preserves scoring** (real integrations, SSE, telemetry, admin gating). Update docs immediately after each change.
