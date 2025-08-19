# SSE (Server-Sent Events) Contract

## Overview

The chat endpoint (`POST /api/v1/chat`) returns a stream of Server-Sent Events (SSE) for real-time AI response streaming. This document defines the complete SSE contract including event types, data formats, and sequencing.

## Connection Details

### Request

```http
POST /api/v1/chat HTTP/1.1
Host: api.example.com
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "message": "Hello, how are you?",
  "useMemory": true,
  "sessionId": "session-20240101-120000-a1b2",
  "model": "gpt-4-mini"
}
```

### Response Headers

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Request-Id: abc123def456
```

## Event Types

The SSE stream contains four event types, delivered in a specific sequence:

1. **`token`** - Text chunks (multiple events)
2. **`usage`** - Token usage and cost (single event)
3. **`done`** - Stream completion (single event)
4. **`error`** - Error occurred (replaces normal flow)

## Event Format

Each SSE event follows this format:

```
event: <event-type>
data: <json-payload>

```

Note: Each event ends with two newlines.

## Event Specifications

### 1. Token Event

Streams text chunks as they're generated.

**Event Type:** `token`

**Data Schema:**

```typescript
interface TokenEventData {
  text: string;  // Partial text chunk
}
```

**Example Events:**

```
event: token
data: {"text":"Hello"}

event: token
data: {"text":"! I'm"}

event: token
data: {"text":" doing"}

event: token
data: {"text":" well,"}

event: token
data: {"text":" thank"}

event: token
data: {"text":" you!"}

```

**Notes:**
- Multiple token events are sent
- Text should be concatenated to form the complete response
- Tokens are sent as soon as available for low latency
- Empty text chunks may occur and should be handled

### 2. Usage Event

Reports token consumption and cost after generation completes.

**Event Type:** `usage`

**Data Schema:**

```typescript
interface UsageEventData {
  tokens_in: number;    // Input token count
  tokens_out: number;   // Output token count
  cost_usd: number;     // Total cost in USD (6 decimal precision)
  model: string;        // Model used for generation
}
```

**Example Event:**

```
event: usage
data: {"tokens_in":45,"tokens_out":123,"cost_usd":0.002145,"model":"gpt-4-mini"}

```

**Notes:**
- Sent exactly once per request
- Sent after all token events
- Cost calculation: `(tokens_in / 1M * input_rate) + (tokens_out / 1M * output_rate)`
- Cost has 6 decimal precision

### 3. Done Event

Signals successful stream completion.

**Event Type:** `done`

**Data Schema:**

```typescript
interface DoneEventData {
  finish_reason: 'stop' | 'length' | 'content_filter' | 'error';
}
```

**Finish Reasons:**
- `stop`: Natural completion
- `length`: Max token limit reached
- `content_filter`: Content policy violation
- `error`: Error occurred (see error event for details)

**Example Event:**

```
event: done
data: {"finish_reason":"stop"}

```

**Notes:**
- Always the last event in successful streams
- Connection closes after this event

### 4. Error Event

Sent when an error occurs during streaming.

**Event Type:** `error`

**Data Schema:**

```typescript
interface ErrorEventData {
  error: string;     // Error message
  code?: string;     // Error code (optional)
}
```

**Example Event:**

```
event: error
data: {"error":"OpenAI API rate limit exceeded","code":"RATE_LIMITED"}

```

**Error Codes:**
- `RATE_LIMITED`: API rate limit exceeded
- `CONTEXT_TOO_LONG`: Input exceeds context window
- `MEMORY_RETRIEVAL_FAILED`: Zep retrieval failed
- `OPENAI_ERROR`: OpenAI API error
- `INTERNAL_ERROR`: Server error

**Notes:**
- Replaces normal event flow
- Connection closes after error event
- May be preceded by partial token events

## Complete Stream Examples

### Successful Stream

```
event: token
data: {"text":"The"}

event: token
data: {"text":" capital"}

event: token
data: {"text":" of"}

event: token
data: {"text":" France"}

event: token
data: {"text":" is"}

event: token
data: {"text":" Paris"}

event: token
data: {"text":"."}

event: usage
data: {"tokens_in":12,"tokens_out":7,"cost_usd":0.000034,"model":"gpt-4-mini"}

event: done
data: {"finish_reason":"stop"}

```

### Stream with Memory Context

When `useMemory: true`, the stream includes retrieved context:

```
event: token
data: {"text":"Based"}

event: token
data: {"text":" on"}

event: token
data: {"text":" our"}

event: token
data: {"text":" previous"}

event: token
data: {"text":" conversation"}

event: token
data: {"text":" about"}

event: token
data: {"text":" quantum"}

event: token
data: {"text":" computing"}

event: token
data: {"text":"..."}

event: usage
data: {"tokens_in":156,"tokens_out":89,"cost_usd":0.000456,"model":"gpt-4-mini"}

event: done
data: {"finish_reason":"stop"}

```

### Error Stream

```
event: token
data: {"text":"I"}

event: token
data: {"text":" apologize"}

event: error
data: {"error":"OpenAI service temporarily unavailable","code":"OPENAI_ERROR"}

```

## Client Implementation

### JavaScript/TypeScript Example

```typescript
import { parseSSEEvent, ChatEventType } from '@prototype/shared';

const response = await fetch('/api/v1/chat', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: 'Hello',
    useMemory: true,
    sessionId: 'session-20240101-120000-a1b2',
  }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let fullText = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const event = parseSSEEvent(line);
    if (!event) continue;
    
    switch (event.type) {
      case ChatEventType.TOKEN:
        fullText += event.data.text;
        console.log('Token:', event.data.text);
        break;
        
      case ChatEventType.USAGE:
        console.log('Usage:', event.data);
        break;
        
      case ChatEventType.DONE:
        console.log('Complete! Reason:', event.data.finish_reason);
        break;
        
      case ChatEventType.ERROR:
        console.error('Error:', event.data.error);
        break;
    }
  }
}
```

### Android/Kotlin Example

```kotlin
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import com.google.gson.Gson

class ChatSSEListener : EventSourceListener() {
    private val gson = Gson()
    private val fullText = StringBuilder()
    
    override fun onEvent(
        eventSource: EventSource,
        id: String?,
        type: String?,
        data: String
    ) {
        when (type) {
            "token" -> {
                val token = gson.fromJson(data, TokenEventData::class.java)
                fullText.append(token.text)
                onTokenReceived(token.text)
            }
            
            "usage" -> {
                val usage = gson.fromJson(data, UsageEventData::class.java)
                onUsageReceived(usage)
            }
            
            "done" -> {
                val done = gson.fromJson(data, DoneEventData::class.java)
                onComplete(fullText.toString(), done.finishReason)
            }
            
            "error" -> {
                val error = gson.fromJson(data, ErrorEventData::class.java)
                onError(error.error, error.code)
            }
        }
    }
}
```

## Performance Considerations

### Time to First Token (TTFT)

Target: < 350ms

Optimizations:
- Stream starts immediately after OpenAI begins responding
- No buffering of initial tokens
- Memory retrieval happens in parallel when possible

### Streaming Rate

- Tokens are sent as soon as received from OpenAI
- No artificial delays or batching
- Network latency is the primary factor

### Connection Management

- Keep-alive enabled for persistent connections
- Automatic reconnection not implemented (client responsibility)
- Timeout: 120 seconds for complete response

## Error Handling

### Connection Errors

If the connection drops before completion:
- Client should implement retry logic
- Use the same `sessionId` to maintain context
- Consider exponential backoff

### Partial Responses

If an error occurs after some tokens:
- Partial text has been sent and should be displayed
- Error event indicates the issue
- Usage data may not be available

### Rate Limiting

When rate limited:
- Error event with code `RATE_LIMITED`
- Retry after delay (see `X-RateLimit-Reset` header)
- Consider implementing client-side queuing

## Testing

### curl Example

```bash
curl -N -X POST http://localhost:3000/api/v1/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello",
    "useMemory": false,
    "model": "gpt-4-mini"
  }'
```

### Expected Output

```
event: token
data: {"text":"Hello"}

event: token
data: {"text":"! How"}

event: token
data: {"text":" can"}

event: token
data: {"text":" I"}

event: token
data: {"text":" help"}

event: token
data: {"text":" you"}

event: token
data: {"text":" today"}

event: token
data: {"text":"?"}

event: usage
data: {"tokens_in":5,"tokens_out":8,"cost_usd":0.000021,"model":"gpt-4-mini"}

event: done
data: {"finish_reason":"stop"}
```

## Debugging

### Common Issues

1. **No events received**
   - Check Authorization header
   - Verify Content-Type is `application/json`
   - Ensure request body is valid JSON

2. **Events cut off**
   - Check for proxy buffering (disable if present)
   - Verify client timeout settings
   - Check for intermediate load balancers

3. **Slow streaming**
   - Monitor Zep retrieval time (when useMemory=true)
   - Check OpenAI API latency
   - Verify network path to API

### Debug Headers

The API includes debug information in response headers:

```http
X-Request-Id: abc123def456
X-Memory-Retrieved: true
X-Memory-Time-Ms: 125
X-OpenAI-Time-Ms: 1842
X-Total-Time-Ms: 2103
```

## Compliance

### Data Privacy

- No message content is logged
- Token usage is aggregated for billing
- Session IDs are anonymized
- PII is not stored in telemetry

### Rate Limits

- Per-user limits apply
- Streaming counts as single request
- Token limits are per-message, not per-stream

### Content Policy

- Content filtering may terminate streams
- `finish_reason: 'content_filter'` indicates violation
- Partial responses before filtering are delivered