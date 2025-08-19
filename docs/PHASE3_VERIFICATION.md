# Phase 3 Verification Guide - Zep v3 Integration

## Overview

This document provides step-by-step verification procedures for Phase 3 (Zep v3 Memory Integration). Use this guide to validate that memory storage, retrieval, and knowledge graph features work correctly and securely.

## Prerequisites

Before starting verification:

1. **Environment Setup**
   - API server running with Zep configuration
   - Admin dashboard accessible
   - Test user account created
   - API testing tool ready (curl, Postman, or browser console)

2. **Required Environment Variables**
   ```bash
   # API Server (.env.local)
   ZEP_API_KEY=z_proj_xxxxxxxxxxxxx
   ZEP_BASE_URL=https://api.getzep.com/v3
   
   # Verify these are set
   echo $ZEP_API_KEY  # Should show value on server
   ```

3. **Test User Credentials**
   - User ID: `test-user-{timestamp}`
   - Session ID: `session-{YYYYMMDD}-{HHMMSS}-test`
   - JWT token for authenticated requests

## 1. Collection Management Verification

### 1.1 Lazy Collection Creation

**Test**: Verify collections are created on first use

```bash
# Step 1: Send first message (should create collection)
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, this is my first message",
    "sessionId": "session-20250119-120000-test",
    "useMemory": false
  }'

# Expected in logs:
# - "Ensuring user collection: user:{userId}"
# - "Collection created: user:{userId}"
```

**Verification Steps**:
1. Check API logs for collection creation
2. Verify telemetry event:
   ```sql
   SELECT * FROM telemetry_events 
   WHERE type = 'zep_upsert' 
   AND payload_json->>'operation' = 'ensure_collection'
   AND payload_json->>'created' = 'true'
   ORDER BY created_at DESC LIMIT 1;
   ```

### 1.2 Collection Reuse

**Test**: Verify collection is not recreated

```bash
# Step 2: Send second message (should reuse collection)
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "This is my second message",
    "sessionId": "session-20250119-120000-test",
    "useMemory": false
  }'

# Expected in logs:
# - "Collection exists: user:{userId}"
# - No "Collection created" message
```

## 2. Message Storage Verification

### 2.1 Basic Message Storage

**Test**: Verify messages are stored in Zep

```bash
# Send message with content to store
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I work at TechCorp as a software engineer",
    "sessionId": "session-20250119-120000-test",
    "useMemory": false
  }'
```

**Verification**:
1. Check for `zep_upsert` event with `operation: 'add_messages'`
2. Verify message count in telemetry:
   ```sql
   SELECT 
     payload_json->>'message_count' as messages,
     payload_json->>'success_count' as success,
     payload_json->>'zep_ms' as latency
   FROM telemetry_events 
   WHERE type = 'zep_upsert' 
   AND payload_json->>'operation' = 'add_messages'
   ORDER BY created_at DESC LIMIT 5;
   ```

### 2.2 Session History Retrieval

**Test**: Retrieve stored messages via test endpoint

```bash
# If test endpoint exists:
curl -X GET "http://localhost:3000/api/test/sessions/session-20250119-120000-test/messages?limit=10" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Expected response:
{
  "messages": [
    {
      "role": "user",
      "content": "I work at TechCorp as a software engineer",
      "timestamp": "2025-01-19T12:00:00Z",
      "metadata": {...}
    },
    {
      "role": "assistant",
      "content": "That's interesting! TechCorp is...",
      "timestamp": "2025-01-19T12:00:01Z",
      "metadata": {...}
    }
  ],
  "has_more": false,
  "total_count": 2
}
```

## 3. Memory Retrieval Verification

### 3.1 Basic Memory Search

**Test**: Verify memory retrieval with useMemory=true

```bash
# Step 1: Store context
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I love TypeScript and Python programming languages",
    "sessionId": "session-20250119-120000-test",
    "useMemory": false
  }'

# Wait 2 seconds for indexing

# Step 2: Query with memory
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What programming languages did I mention?",
    "sessionId": "session-20250119-120100-test",
    "useMemory": true
  }'
```

**Expected Event Sequence**:
```sql
-- Verify correct event order
SELECT 
  type,
  payload_json->>'operation' as operation,
  created_at
FROM telemetry_events 
WHERE req_id = '{request_id}'
ORDER BY created_at ASC;

-- Expected order:
-- 1. message_sent
-- 2. zep_search (with useMemory=true)
-- 3. openai_call
-- 4. zep_upsert (optional, for storing new messages)
```

### 3.2 Retrieval Policy Validation

**Test**: Verify retrieval trimming and deduplication

```bash
# Create multiple similar messages
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/chat \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"message\": \"I really enjoy working with TypeScript (message $i)\",
      \"sessionId\": \"session-20250119-120000-test\",
      \"useMemory\": false
    }"
  sleep 1
done

# Query with memory (should deduplicate and trim)
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What do I enjoy?",
    "sessionId": "session-20250119-120200-test",
    "useMemory": true
  }'
```

**Verification**:
```sql
-- Check retrieval metrics
SELECT 
  payload_json->>'results_count' as results,
  payload_json->>'total_results' as total_before_filter,
  payload_json->>'dedup_count' as duplicates_removed,
  payload_json->>'tokens_used' as tokens,
  payload_json->>'memory_token_budget' as budget,
  payload_json->>'clip_sentences' as sentences_per_fact
FROM telemetry_events 
WHERE type = 'zep_search'
ORDER BY created_at DESC LIMIT 1;

-- Verify constraints:
-- results_count <= 10 (topK default)
-- tokens_used <= 1500 (budget)
-- clip_sentences = 2 (default)
```

## 4. Knowledge Graph Verification

### 4.1 Fact Extraction

**Test**: Verify knowledge graph edge creation

```bash
# Send message with extractable facts
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I work at Google in Mountain View. I love machine learning and have been using TensorFlow.",
    "sessionId": "session-20250119-120000-test",
    "useMemory": false
  }'
```

**Expected Graph Edges**:
- `(user) -[works_at]-> (google)`
- `(user) -[located_in]-> (mountain view)`
- `(user) -[likes]-> (machine learning)`
- `(user) -[uses]-> (tensorflow)`

**Verification**:
```sql
-- Check fact upsert events
SELECT 
  payload_json->>'edge_count' as edges,
  payload_json->>'new_edges' as new,
  payload_json->>'updated_edges' as updated,
  payload_json->>'predicates' as predicates
FROM telemetry_events 
WHERE type = 'zep_upsert'
AND payload_json->>'operation' = 'upsert_facts'
ORDER BY created_at DESC LIMIT 1;

-- Expected: edge_count <= 3 (max per message)
```

### 4.2 Test Endpoint Validation (if available)

```bash
# Query knowledge graph via test endpoint
curl -X GET "http://localhost:3000/api/test/knowledge?subject=user&predicate=works_at" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Expected response:
{
  "edges": [
    {
      "subject": "user",
      "predicate": "works_at",
      "object": "google",
      "confidence": 0.9
    }
  ]
}
```

## 5. Security Verification

### 5.1 API Key Protection

**Test**: Verify Zep API key is not exposed to clients

```bash
# Check Admin dashboard network tab
1. Open Admin dashboard in browser
2. Open Developer Tools > Network tab
3. Perform any operation
4. Search all requests for "z_proj" or "ZEP"
5. Verify NO Zep API key in:
   - Request headers
   - Request body
   - Response body
   - Cookies

# Check Android app (if available)
1. Use proxy tool (Charles, mitmproxy)
2. Monitor all API calls
3. Verify no Zep API key in traffic

# Check API responses
curl -X GET http://localhost:3000/api/config \
  -H "Authorization: Bearer $JWT_TOKEN"

# Should NOT contain ZEP_API_KEY
```

### 5.2 Environment Variable Validation

**Server-Side Only**:
```bash
# On API server
env | grep ZEP
# Should show: ZEP_API_KEY=z_proj_xxxxx

# On Admin server
env | grep ZEP
# Should show: Nothing (unless server-side routes need it)

# Client bundle check
# Search built JavaScript for "z_proj"
grep -r "z_proj" apps/admin/.next/static/
# Should return: No matches
```

### 5.3 Collection Isolation

**Test**: Verify users cannot access other users' collections

```bash
# As User A
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $USER_A_TOKEN" \
  -d '{"message": "User A secret", "sessionId": "session-a"}'

# As User B trying to access User A's data
curl -X GET "http://localhost:3000/api/test/collections/user:$USER_A_ID/messages" \
  -H "Authorization: Bearer $USER_B_TOKEN"

# Expected: 403 Forbidden or 404 Not Found
```

## 6. Failure Scenario Testing

### 6.1 Zep Timeout Simulation

**Test**: Verify SSE continues when Zep times out

```bash
# Option 1: Use network throttling
# - Set API server ZEP_TIMEOUT_MS=100 (very low)
# - Send request with useMemory=true

# Option 2: Block Zep endpoint (if testing locally)
# Add to /etc/hosts:
# 127.0.0.1 api.getzep.com

# Send request
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Test message during Zep outage",
    "sessionId": "session-timeout-test",
    "useMemory": true
  }' \
  --no-buffer

# Expected:
# 1. SSE stream starts and completes
# 2. Response generated without memory context
# 3. Check for zep_error event
```

**Verification**:
```sql
-- Check error was logged
SELECT 
  payload_json->>'error_code' as code,
  payload_json->>'error_type' as type,
  payload_json->>'fallback' as fallback,
  payload_json->>'zep_ms' as latency
FROM telemetry_events 
WHERE type = 'zep_error'
ORDER BY created_at DESC LIMIT 1;

-- Expected:
-- error_code: 'TIMEOUT'
-- fallback: 'no_memory'
-- zep_ms: > timeout threshold
```

### 6.2 Zep API Error Simulation

**Test**: Verify handling of Zep API errors

```bash
# Use invalid collection name or malformed request
curl -X POST http://localhost:3000/api/test/trigger-zep-error \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{"error_type": "404"}'

# Or send very large message to trigger 413
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d "{
    \"message\": \"$(python -c 'print(\"x\" * 100000)')\",
    \"sessionId\": \"session-large\",
    \"useMemory\": true
  }"
```

**Verification**:
- Chat continues without memory
- Error logged but not exposed to client
- No retry on 4xx errors

### 6.3 Circuit Breaker Test

**Test**: Verify circuit breaker trips after repeated failures

```bash
# Cause multiple failures rapidly
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/chat \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -d "{
      \"message\": \"Test $i with Zep down\",
      \"useMemory\": true
    }"
done

# Check circuit breaker status
curl http://localhost:3000/health/zep

# Expected after 5 failures:
{
  "status": "degraded",
  "circuit_breaker": "open",
  "metrics": {
    "error_rate": 1.0
  }
}
```

## 7. Performance Validation

### 7.1 Latency Requirements

**Test**: Verify Zep operations meet timing requirements

```sql
-- Check operation latencies
SELECT 
  type,
  payload_json->>'operation' as operation,
  AVG((payload_json->>'zep_ms')::int) as avg_ms,
  MAX((payload_json->>'zep_ms')::int) as max_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (
    ORDER BY (payload_json->>'zep_ms')::int
  ) as p95_ms
FROM telemetry_events 
WHERE type IN ('zep_search', 'zep_upsert')
AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY type, operation;

-- Expected latencies (with US region):
-- ensure_collection: < 500ms
-- memory_search: < 700ms  
-- add_messages: < 2000ms
-- upsert_facts: < 2000ms
```

### 7.2 Token Budget Compliance

```sql
-- Verify token budget is respected
SELECT 
  COUNT(*) as violations
FROM telemetry_events 
WHERE type = 'zep_search'
AND (payload_json->>'tokens_used')::int > 1500;

-- Expected: 0 violations
```

## 8. End-to-End Flow Test

### Complete Conversation Flow

```bash
# 1. Start new session
SESSION_ID="session-$(date +%Y%m%d-%H%M%S)-e2e"

# 2. First message (no memory, create collection)
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d "{
    \"message\": \"Hi, I'm a software engineer at Microsoft working on Azure\",
    \"sessionId\": \"$SESSION_ID\",
    \"useMemory\": false
  }"

# 3. Second message (with memory)
sleep 2
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d "{
    \"message\": \"What company do I work for?\",
    \"sessionId\": \"$SESSION_ID\",
    \"useMemory\": true
  }"

# Expected: Response mentions Microsoft/Azure
```

**Verify Complete Event Chain**:
```sql
-- Get all events for the session
SELECT 
  type,
  payload_json->>'operation' as operation,
  payload_json->>'zep_ms' as latency,
  created_at
FROM telemetry_events 
WHERE session_id = '{SESSION_ID}'
ORDER BY created_at ASC;

-- Expected sequence:
-- 1. message_sent (first message)
-- 2. openai_call (no memory)
-- 3. zep_upsert (ensure_collection)
-- 4. zep_upsert (add_messages)
-- 5. zep_upsert (upsert_facts) - optional
-- 6. message_sent (second message)
-- 7. zep_search (memory retrieval)
-- 8. openai_call (with context)
-- 9. zep_upsert (add_messages)
```

## 9. Admin Dashboard Verification

### Memory Settings UI

1. Navigate to Admin Dashboard > Settings > Memory
2. Verify configuration options:
   - Top K: 6-10 range
   - Token Budget: 100-3000 range
   - Clip Sentences: 1-5 range
   - Allowed Predicates: Checkboxes for each type
3. Save changes and verify persistence

### Telemetry Dashboard

1. Navigate to Admin Dashboard > Telemetry
2. Verify Zep metrics display:
   - Average Zep latency chart
   - Memory retrieval success rate
   - Error rate by operation
   - Token usage distribution

## 10. Acceptance Checklist

### Functional Requirements

- [ ] Collections created lazily on first use
- [ ] Messages stored in Zep with correct session association
- [ ] Memory retrieval returns relevant context
- [ ] Retrieval respects token budget (≤1500)
- [ ] Results are deduplicated and clipped
- [ ] Knowledge graph edges extracted (max 3 per message)
- [ ] Event sequence: `message_sent` → `zep_search` → `openai_call`

### Security Requirements

- [ ] No Zep API key in client code or responses
- [ ] Collections isolated per user
- [ ] API key only in server environment variables
- [ ] No sensitive data in error messages

### Reliability Requirements

- [ ] SSE continues when Zep unavailable
- [ ] Timeouts respected (300-700ms for critical path)
- [ ] Retries work for transient 5xx errors
- [ ] No retries on 4xx errors
- [ ] Circuit breaker prevents cascade failures
- [ ] Fallback to no-memory mode works

### Performance Requirements

- [ ] Memory search < 700ms (p95)
- [ ] Collection creation < 500ms
- [ ] Message storage < 2000ms (async)
- [ ] Token budget enforced

## Troubleshooting

### Common Issues

1. **Collection not created**
   - Check Zep API key is set
   - Verify Zep endpoint is reachable
   - Check user ID format

2. **Memory not retrieved**
   - Verify useMemory=true in request
   - Check messages were stored first
   - Wait for indexing (2-3 seconds)

3. **High latencies**
   - Expected due to US region (add 100-150ms)
   - Check network connectivity
   - Verify circuit breaker state

4. **No facts extracted**
   - Check fact extraction is enabled
   - Verify message contains extractable entities
   - Check allowed predicates configuration

### Debug Queries

```sql
-- Recent Zep errors
SELECT * FROM telemetry_events 
WHERE type = 'zep_error'
ORDER BY created_at DESC LIMIT 10;

-- Memory search performance
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as searches,
  AVG((payload_json->>'zep_ms')::int) as avg_latency,
  SUM(CASE WHEN payload_json->>'cache_hit' = 'true' 
    THEN 1 ELSE 0 END)::float / COUNT(*) as cache_rate
FROM telemetry_events 
WHERE type = 'zep_search'
GROUP BY hour
ORDER BY hour DESC;

-- User collection status
SELECT DISTINCT
  user_id,
  payload_json->>'collection_name' as collection,
  MAX(created_at) as last_activity
FROM telemetry_events 
WHERE type = 'zep_upsert'
GROUP BY user_id, collection
ORDER BY last_activity DESC;
```

## Sign-off

### Phase 3 Complete When:

1. **All functional tests pass** - Collections, storage, retrieval, graph
2. **Security validated** - No key exposure, proper isolation
3. **Failures handled gracefully** - SSE never blocked
4. **Performance acceptable** - Within timeout thresholds
5. **Telemetry complete** - All events logged correctly

**Reviewer**: _________________________ **Date**: _____________

**Notes**: _____________________________________________________

---

## Related Documentation

- [Zep Integration Overview](./ZEP_INTEGRATION.md)
- [Retrieval Policy](./RETRIEVAL_POLICY.md)
- [Ontology Specification](./ONTOLOGY.md)
- [Zep Adapter Interface](../apps/api/docs/ZEP_ADAPTER.md)
- [Telemetry Events](../apps/api/docs/TELEMETRY_EVENTS_ZEP.md)
- [Failure Handling](./ZEP_FAILURES.md)