# SSE Troubleshooting Guide

## Overview

This guide covers common issues and solutions when working with Server-Sent Events (SSE) in the AI Chat API. SSE is used for real-time streaming of chat responses from the `/api/v1/chat` endpoint.

## Production Hardening Features (Phase 5)

### Key Improvements
- **Early Header Flush**: SSE headers are flushed immediately before any upstream calls
- **Heartbeat Comments**: Sent every 10 seconds (configurable via `OPENAI_SSE_HEARTBEAT_MS`)
- **HTTP Keep-Alive**: Connection pooling with up to 50 concurrent sockets for OpenAI
- **Client Disconnect Detection**: Upstream requests are cancelled via AbortSignal when clients disconnect
- **Retry Tracking**: `provider_retry_count` logged in telemetry for monitoring
- **Graceful Failures**: User-friendly messages for 429/5xx errors

## Quick Verification

### 1. Basic SSE Test with curl

```bash
# Test the SSE endpoint with authentication
curl -N -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, how are you?"}' \
  http://localhost:3000/api/v1/chat

# Expected output:
# : Connected to chat stream
# 
# event: token
# data: {"text":"I understand you said: \"Hello, how are you?\". "}
# 
# event: token  
# data: {"text":"This is a stub response for Phase 4."}
# 
# event: usage
# data: {"tokens_in":5,"tokens_out":15,"cost_usd":0.00000975,"model":"gpt-4o-mini"}
# 
# event: done
# data: {"finish_reason":"stop"}
```

### 2. Check Response Headers

```bash
# Test just headers
curl -I -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}' \
  http://localhost:3000/api/v1/chat

# Expected headers:
# HTTP/1.1 200 OK
# content-type: text/event-stream
# cache-control: no-cache, no-store, must-revalidate
# connection: keep-alive
# access-control-allow-origin: *
# x-request-id: req_abc123
# x-accel-buffering: no
# proxy-buffering: off
```

### 3. Test Heartbeats (Phase 5)

```bash
# Watch for heartbeat comments (every 10 seconds by default)
curl -N -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Tell me a long story"}' \
  http://localhost:3000/api/v1/chat 2>&1 | grep -E "(heartbeat|data:|event:)"

# Output should include:
# : heartbeat 1704074400000
# : heartbeat 1704074410000  # 10 seconds later
```

### 3. Test with JavaScript EventSource

```javascript
// Browser or Node.js test
const eventSource = new EventSource('/api/v1/chat', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: 'Hello world',
    useMemory: true
  })
});

eventSource.onmessage = function(event) {
  console.log('Event:', event.type, 'Data:', event.data);
};

eventSource.addEventListener('token', function(event) {
  const data = JSON.parse(event.data);
  console.log('Token:', data.text);
});

eventSource.addEventListener('done', function(event) {
  console.log('Stream complete');
  eventSource.close();
});
```

## Common Issues & Solutions

### 1. Connection Immediately Closes

**Symptoms:**
- curl exits immediately
- EventSource fires 'error' event right away
- No data received

**Causes & Solutions:**

#### Authentication Issues
```bash
# Check if JWT token is valid
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/auth/ping

# If 401 Unauthorized, generate new token:
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { sub: 'test-user-id', email: 'test@example.com', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
  'placeholder-jwt-secret-with-at-least-32-characters',
  { algorithm: 'HS256' }
);
console.log(token);
"
```

#### Request Validation Errors
```bash
# Empty message (should fail)
curl -v -N -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": ""}' \
  http://localhost:3000/api/v1/chat

# Invalid sessionId format (should fail)
curl -v -N -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "test", "sessionId": "invalid"}' \
  http://localhost:3000/api/v1/chat

# Valid request
curl -v -N -H "Accept: text/event-stream" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "test", "sessionId": "session-20250819-143022-a1b2"}' \
  http://localhost:3000/api/v1/chat
```

### 2. Proxy Buffering Issues

**Symptoms:**
- Events arrive in large batches instead of streaming
- Long delays before first token
- EventSource works locally but not through proxy

**Solutions:**

#### Nginx Configuration
```nginx
location /api/v1/chat {
    proxy_pass http://api-backend;
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding off;
    proxy_read_timeout 86400;
}
```

#### Apache Configuration
```apache
ProxyPass /api/v1/chat http://api-backend/api/v1/chat
ProxyPassReverse /api/v1/chat http://api-backend/api/v1/chat
ProxyPreserveHost On
SetEnv proxy-nokeepalive 1
SetEnv proxy-sendchunked 1
```

#### Railway Deployment
```dockerfile
# In your Dockerfile, ensure buffering is disabled
ENV NODE_ENV=production
ENV PROXY_BUFFERING=off
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### 3. CORS Issues in Browser

**Symptoms:**
- CORS error in browser console
- EventSource fails to connect from web app
- OPTIONS preflight requests fail

**Solutions:**

#### Check CORS Headers
```bash
# Test preflight request
curl -X OPTIONS \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization,Content-Type" \
  http://localhost:3000/api/v1/chat

# Should return CORS headers allowing the origin
```

#### Update API Configuration
```typescript
// In server configuration, ensure CORS allows your frontend origin
fastify.register(require('@fastify/cors'), {
  origin: [
    'http://localhost:3001',    // Admin dashboard
    'https://your-admin.vercel.app'
  ],
  credentials: true
});
```

### 4. Mobile/React Native Issues

**Symptoms:**
- SSE doesn't work in React Native
- EventSource undefined error
- Network requests fail on mobile

**Solutions:**

#### Use Fetch with ReadableStream (React Native)
```javascript
// React Native SSE implementation
async function streamChat(message, onToken, onDone) {
  const response = await fetch('/api/v1/chat', {
    method: 'POST',
    headers: {
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (line.includes('event: token')) {
          onToken(data.text);
        } else if (line.includes('event: done')) {
          onDone(data.finish_reason);
          return;
        }
      }
    }
  }
}
```

#### Android Kotlin Implementation
```kotlin
// Using OkHttp for SSE in Android
val client = OkHttpClient.Builder()
    .readTimeout(0, TimeUnit.MILLISECONDS)
    .build()

val request = Request.Builder()
    .url("http://your-api.com/api/v1/chat")
    .post(RequestBody.create(
        "application/json".toMediaType(),
        """{"message": "$message"}"""
    ))
    .addHeader("Accept", "text/event-stream")
    .addHeader("Authorization", "Bearer $token")
    .build()

client.newCall(request).enqueue(object : Callback {
    override fun onResponse(call: Call, response: Response) {
        response.body?.source()?.let { source ->
            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break
                if (line.startsWith("data: ")) {
                    val data = line.substring(6)
                    // Process SSE event
                }
            }
        }
    }
})
```

### 5. Connection Drops/Timeouts

**Symptoms:**
- EventSource reconnects frequently
- Connection drops after 30 seconds
- Heartbeat messages not received

**Solutions:**

#### Check Heartbeat Configuration (Phase 5 Updated)
```typescript
// In SSEStream class, verify heartbeat interval
private startHeartbeat() {
  const heartbeatMs = config.openai.sseHeartbeatMs || 10000; // Default 10s
  this.heartbeatInterval = setInterval(() => {
    if (!this.closed) {
      this.sendComment(`heartbeat ${Date.now()}`);
      this.flush(); // Ensure immediate delivery
    }
  }, heartbeatMs);
}
```

#### Client Disconnect Handling (Phase 5)
```typescript
// Disconnects now cancel upstream requests
reply.raw.on('close', () => {
  this.abortController.abort(); // Cancel OpenAI request
  this.close();
});
```

#### Handle Reconnection in Client
```javascript
// Auto-reconnecting EventSource wrapper
class ReconnectingEventSource {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.reconnectInterval = 3000;
    this.connect();
  }
  
  connect() {
    this.eventSource = new EventSource(this.url, this.options);
    
    this.eventSource.onopen = () => {
      console.log('SSE Connected');
    };
    
    this.eventSource.onerror = (error) => {
      console.log('SSE Error, reconnecting...', error);
      this.eventSource.close();
      setTimeout(() => this.connect(), this.reconnectInterval);
    };
  }
}
```

### 6. Memory Issues with Large Contexts

**Symptoms:**
- Slow response when `useMemory=true`
- Timeout errors with memory retrieval
- High memory usage on server

**Solutions:**

#### Optimize Memory Configuration
```typescript
// Adjust memory config for performance
const memoryConfig = {
  top_k: 5,                    // Reduce from default 10
  memory_token_budget: 800,    // Reduce from default 1500
  clip_sentences: 1,           // Reduce from default 2
  min_relevance_score: 0.8     // Increase from default 0.7
};
```

#### Check Memory Retrieval Logs
```bash
# Monitor memory retrieval performance
tail -f logs/api.log | grep "memory_ms"

# Look for patterns like:
# {"memory_ms": 150, "results_count": 5, "total_tokens": 245}
```

## Error Handling (Phase 5)

### Graceful Failure Messages

```typescript
// User-friendly error messages for common failures
if (statusCode === 429) {
  userMessage = 'Overloaded, please try again soon.';
  errorCode = 'RATE_LIMIT';
} else if (statusCode >= 500) {
  userMessage = 'Server error, please try again later.';
  errorCode = 'SERVER_ERROR';
} else if (error.message.includes('timeout')) {
  userMessage = 'Request timed out. Please try again with a shorter message.';
  errorCode = 'OPENAI_TIMEOUT';
}
```

### Testing Error Scenarios

```bash
# Simulate timeout (requires mock/fault injection)
curl -N -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Test-Scenario: timeout" \
  -d '{"message":"test"}' \
  http://localhost:3000/api/v1/chat

# Expected: Single user-friendly message + done event
# event: token
# data: {"text":"Request timed out. Please try again with a shorter message."}
# event: done
# data: {"finish_reason":"error"}
```

## Performance Optimization

### 1. Reduce Time to First Token (TTFT)

```typescript
// In streaming provider, prioritize early streaming
class OptimizedStreamingProvider {
  async streamCompletion(options) {
    // Start streaming immediately, don't wait for full response
    const firstToken = await this.getFirstToken(options.message);
    options.onToken(firstToken);
    
    // Continue with rest of response
    await this.streamRemainingTokens(options);
  }
}
```

### 2. Optimize Memory Retrieval

```typescript
// Parallel memory retrieval for better performance
async function retrieveMemoryContext(userId, message, sessionId) {
  const memoryPromise = zepAdapter.searchMemory(userId, message, options);
  const fallbackPromise = new Promise(resolve => 
    setTimeout(() => resolve(null), 1000) // 1s timeout
  );
  
  // Race memory retrieval against timeout
  return Promise.race([memoryPromise, fallbackPromise]);
}
```

### 3. Connection Pooling

```typescript
// Configure connection limits for production
const server = fastify({
  keepAliveTimeout: 65000,
  requestTimeout: 120000,
  maxRequestsPerSocket: 100,
});
```

## Debug Commands

### 1. Test Request Validation

```bash
# Valid request
curl -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "test"}'

# Invalid - empty message
curl -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": ""}'

# Invalid - message too long (over 4000 chars)
curl -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"message\": \"$(head -c 4100 < /dev/zero | tr '\0' 'a')\"}"

# Invalid - bad sessionId format
curl -X POST http://localhost:3000/api/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "test", "sessionId": "bad-format"}'

# Valid - with memory and session
curl -N -H "Accept: text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What did we discuss before?", "useMemory": true, "sessionId": "session-20250819-143022-a1b2"}' \
  http://localhost:3000/api/v1/chat
```

### 2. Monitor Server Logs

```bash
# Watch API logs for SSE connections
tail -f logs/api.log | grep -E "(Chat request|SSE|memory_ms|total_ms)"

# Look for specific patterns:
# - "Chat request received" - Request started
# - "Retrieving memory context" - Memory lookup started  
# - "Memory retrieval completed" - Memory results ready
# - "Chat completion finished" - Stream completed
# - "SSE stream error" - Connection issues
```

### 3. Network Analysis

```bash
# Capture network traffic
tcpdump -i any -A -s 0 'port 3000'

# Or use netstat to check connections
netstat -an | grep :3000
```

## Production Checklist

### Before Deploying SSE

- [ ] Test SSE endpoint with curl
- [ ] Verify correct SSE headers are set
- [ ] Check authentication works
- [ ] Test request validation (empty message, invalid sessionId)
- [ ] Verify memory retrieval works when `useMemory=true`
- [ ] Test error handling (invalid auth, server errors)
- [ ] Check proxy configuration disables buffering
- [ ] Test connection drops and reconnection
- [ ] Verify heartbeat keeps connections alive
- [ ] Load test with multiple concurrent streams
- [ ] Monitor memory usage with memory retrieval
- [ ] Test CORS from frontend origin
- [ ] Verify logging captures request IDs and timing

### Performance Targets

- **Time to First Token**: < 350ms (without memory), < 500ms (with memory)
- **Memory Retrieval**: < 200ms for top_k=10
- **Connection Stability**: > 99% uptime for 5-minute streams
- **Concurrent Streams**: Support 100+ concurrent SSE connections
- **Error Rate**: < 1% of requests result in stream errors
- **Retry Rate**: < 5% of requests require retries (monitor `provider_retry_count`)
- **Heartbeat Interval**: 10 seconds (configurable via `OPENAI_SSE_HEARTBEAT_MS`)

### Key Metrics SQL Queries (Phase 5)

```sql
-- Monitor retry rates
SELECT 
  date_trunc('hour', created_at) as hour,
  AVG((payload_json->>'provider_retry_count')::int) as avg_retries,
  MAX((payload_json->>'provider_retry_count')::int) as max_retries,
  COUNT(*) FILTER (WHERE (payload_json->>'provider_retry_count')::int > 0) as requests_with_retries,
  COUNT(*) as total_requests
FROM telemetry_events
WHERE type = 'openai_call'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Check timeout errors
SELECT 
  date_trunc('hour', created_at) as hour,
  COUNT(*) FILTER (WHERE payload_json->>'code' = 'OPENAI_TIMEOUT') as timeout_errors,
  COUNT(*) FILTER (WHERE payload_json->>'code' = 'RATE_LIMIT') as rate_limit_errors,
  COUNT(*) as total_errors
FROM telemetry_events  
WHERE type = 'error'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

## Contact & Support

If you encounter issues not covered in this guide:

1. Check server logs for error details with request ID
2. Test with minimal curl examples above
3. Verify network/proxy configuration
4. Review memory configuration if using `useMemory=true`
5. Check authentication token validity

For development issues, the SSE stream includes request IDs in headers (`X-Request-Id`) that can be used to trace issues in server logs.