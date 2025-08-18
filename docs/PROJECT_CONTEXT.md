# Project Context — “AI Integrations Quest” (Szymon)

## Mission & Timebox
- **Goal:** Design and ship a real, end-to-end system: **Auth → API → Zep/OpenAI → SSE → Android → Admin telemetry**.
- **Timebox:** **1.5–3 working days** (opt for the shortest viable path).
- **Scoring requirements:** Real integrations (OpenAI + Zep), true SSE streaming, role-gated admin, telemetry + costs + charts, clean code/infra/README.
- **No mocks.** Every external call must be real.

---

## Stack (decisions already made)
- **Auth:** Supabase Auth — **email magic link** first.
- **API:** Node.js (TypeScript) + **Fastify** for performance, TS types, and clean SSE.
- **Memory:** **Zep v3** (US region) — conversation memory + simple graph facts (ontology-ready).
- **LLM:** OpenAI (default **GPT-4.1-mini**), **SSE streaming**.
- **Admin:** Next.js (Vercel, **EU region**), **Recharts** for charts.
- **Mobile:** Android (Kotlin/Compose), SSE client, full per-session history.
- **Rate limiting / cache:** **Skip Redis cache** for now (may add later). Minimal per-user/IP limiter is acceptable.

---

## Non-functional Constraints
- **Regioning:** Host everything we control in **EU (Amsterdam/Frankfurt)**; acknowledge Zep US overhead.
- **TTFT target:** Aim **< 350 ms**. Without Redis, keep retrieval small and stream early.
- **SSE must be real:** EventSource/WebSocket with continuous token streaming (no simulated delays or batching). 
- **Security:** Verify Supabase JWT on the API, lock down CORS, and keep secrets server-side only.
- **Documentation:** Keep README and `/docs` current in every change.

---

## Repository Layout (monorepo)
```
/apps/api        # Fastify API (TS)
/apps/admin      # Next.js admin
/apps/android    # Kotlin/Compose mobile client
/packages/shared # Shared DTOs/types/schemas (TS)
/infra           # Deploy notes, secrets matrix, ops docs
/docs            # Architecture, DoD, envs, commands, release checklist
```

---

## Functional Scope

### 1) Auth & Roles
- Passwordless **magic link** via Supabase.
- Roles: `user`, `admin` (stored in `profiles`).
- Optional: on-signup webhook → create Zep user/collection (nice-to-have).

### 2) API (Fastify, TypeScript)
- **Auth:** Verify Supabase JWT (JWKS). Attach `userId`, `role` to the request context.
- **CORS:** Allow Admin domain + Android dev origins only.
- **Endpoints (minimum):**
  - `POST /api/chat` (SSE) — body: `{ message, useMemory?, sessionId?, model? }`
    - If `useMemory=true`: query **Zep** before OpenAI.
    - Compose prompt with **trimmed memory context**.
    - Stream OpenAI tokens; emit final usage/cost.
    - Telemetry events: `message_sent`, `zep_search?`, `openai_call`, `error?`.
  - `POST /api/memory/upsert` — body: `{ facts: Fact[] }` (and/or graph edges) → write to Zep; log `zep_upsert`.
  - `GET /api/memory/search?q=&limit=` — proxy retrieval from Zep with trimming.
  - **Admin-only:**
    - `GET /api/admin/users`
    - `GET /api/admin/metrics?from=&to=&userId?`
    - `POST /api/admin/models/pricing` (update pricing table)
- **SSE event contract (from `/api/chat`):**
  - `event: token` → `{"text":"..."}` (many)
  - `event: usage` → `{"tokens_in":n,"tokens_out":n,"cost_usd":x,"model":"..."}`
  - `event: done` → `{"finish_reason":"stop"}`

### 3) Memory (Zep v3)
- Store **original messages** (role, content, timestamp, session).
- Retrieval:
  - **Small `top_k` (6–10)**, dedupe, clip to **1–2 sentences per fact**.
  - **Hard context budget** (≈ ≤1.5k tokens from memory) before calling OpenAI.
- Graph facts (ontology-ready): minimal, explicit edges like `(user)-[likes|works_at|located_in]->(entity)`.

### 4) Android Client (Kotlin/Compose)
- Login with Supabase magic link (deep link).
- Chat screen: send message, toggle memory, render SSE stream live.
- History per session (pull from Zep, or via API proxy).

### 5) Admin (Next.js, Vercel EU)
- **Prompt playground**: send prompts, toggle memory, pick model; render SSE; show usage & cost at end.
- **Users**: list from Supabase.
- **Telemetry dashboard** (Recharts): messages/day, avg TTFT, avg response time, costs; filters by user/model.
- **Pricing**: view/update `models_pricing`.

---

## Telemetry & Data

### Event log table (Supabase Postgres)
- `telemetry_events(id, user_id, session_id, type, payload_json, created_at)`
  - `type ∈ { "message_sent","openai_call","zep_upsert","zep_search","error" }`
  - `payload_json` includes timings (`ttft_ms`, `openai_ms`, `zep_ms`, `duration_ms`), `model`, `tokens_in`, `tokens_out`, `cost_usd`.

### Aggregates
- `daily_usage(day, user_id, model, tokens_in, tokens_out, cost_usd, calls, avg_ttft_ms, avg_duration_ms)`
- `models_pricing(model, input_per_mtok, output_per_mtok, cached_input_per_mtok, updated_at)`

### Token & cost accounting
- Prefer streamed usage from OpenAI if available; otherwise approximate at end consistently.
- Multiply by `models_pricing`. Store in `openai_call` event and emit in final `usage` SSE event.

---

## Environment Variables (templates only; no secrets in repo)
- **API:** `OPENAI_API_KEY`, `OPENAI_DEFAULT_MODEL`, `ZEP_API_KEY`, `ZEP_BASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_AUD`, `SUPABASE_PROJECT_REF`, `APP_ORIGIN_ADMIN`, `APP_ORIGIN_ANDROID_DEV`
- **Admin:** `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (plus optional feature flags)
- **Android:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_DEEPLINK_SCHEME`, `APP_DEEPLINK_HOST` (documented; real values via build config)

---

## Deployment Targets
- **API:** Railway, **EU (Amsterdam)**.
- **Admin:** Vercel, **EU function region**.
- **Supabase:** EU project (DB + Auth).
- **Zep:** US region (acknowledged).

---

## Acceptance Criteria (cross-session)
- **Integrations (real):** Zep + OpenAI are actually called; no mocks.  
- **SSE:** Continuous token streaming in Admin and Android; first token arrives promptly.  
- **Auth & roles:** Admin routes reject non-admins; JWT verified server-side.  
- **Telemetry:** Events written for each message; dashboard shows real aggregates & costs.  
- **Docs:** README explains local run + deploy; API contracts documented; known trade-offs listed.  
- **Links for hand-in:** GitHub repo(s), API URL, Admin URL, APK (or Flutter Web link).

---

## Known Trade-offs / Deferrals
- **No Redis cache yet.** Expect +100–200 ms per memory retrieval due to Zep US RTT; mitigate by small `top_k`, trimming, and streaming early.
- **Rate limiting:** Minimal per-user/IP limiter is sufficient for the assignment.

---

## Risks & Mitigations
- **Latency:** Minimize memory tokens, open SSE early; keep all deploys in EU except Zep.  
- **Token usage drift:** Prefer API-reported usage; otherwise approximate consistently.  
- **Email deliverability:** Test magic link flows; document support email and spam folder checks.

---

## Working Rules for Claude Code (very important)
1. **Stay within this architecture & scope.** If a task conflicts, propose the smallest viable alternative and explain trade-offs.
2. **No secrets or live keys** in code or logs. Use `.env.example` with placeholders and update docs.
3. **Idempotent changes:** When generating files, show full path and content; preserve existing content unless explicitly replacing.
4. **Keep docs in sync:** When changing contracts, envs, or behavior, update `/docs` and the relevant app README in the same pass.
5. **Prefer clarity over cleverness:** Short, explicit configs; minimal dependencies; keep performance-critical paths simple.
6. **Acceptance-driven output:** For each change, state which Acceptance Criteria it satisfies or advances.
7. **SSE always real:** Don’t simulate streaming; ensure headers/format/event names match the contract.
8. **Error handling:** Log structured errors and emit `error` telemetry with context (no secrets), then fail fast.
