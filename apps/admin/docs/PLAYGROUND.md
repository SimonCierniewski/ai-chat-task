# SSE Playground Documentation

## Overview

The SSE Playground is an interactive testing interface for the chat API with real-time Server-Sent Events (SSE) streaming. It provides a complete testing environment with model selection, memory toggle, and real-time performance metrics.

## Features

### 1. Configuration Panel
- **Model Selector**: Dynamically fetches available models from `/api/v1/admin/models`
- **Memory Toggle**: Enable/disable Zep memory context for responses
- **Session ID**: Auto-generated unique session identifier
- **Message Input**: Multi-line text area for composing prompts

### 2. Response Viewer
- **Real-time Streaming**: Tokens appear as they're received from the API
- **Error Display**: Friendly error messages without breaking the UI
- **Usage Panel**: Shows token counts and cost after completion
- **Performance Metrics**: TTFT (Time to First Token) and total duration

### 3. API Integration
- **Endpoint**: `POST /api/v1/chat`
- **Authentication**: Uses Supabase session token
- **Content-Type**: `text/event-stream` for SSE responses

## Manual Test Steps

### Prerequisites
1. Ensure API server is running on configured port (default: 3000)
2. Sign in to admin panel with admin role
3. Navigate to `/admin/playground`

### Test Case 1: Basic Streaming
1. **Setup**:
   - Select "GPT-4 Mini" model
   - Enable "Use Memory Context"
   - Enter message: "Tell me a short joke"

2. **Execute**:
   - Click "Send Message"
   - Observe button changes to "Streaming..."

3. **Expected Results**:
   - Response area shows "Waiting for response..."
   - Tokens start appearing within 350ms (TTFT target)
   - Response streams smoothly without batching
   - After completion:
     - Usage panel shows token counts
     - Cost displays with 4 decimal precision
     - Performance panel shows TTFT and total duration

### Test Case 2: Model Selection
1. **Setup**:
   - Page loads with model dropdown

2. **Execute**:
   - Open model dropdown

3. **Expected Results**:
   - Models populated from `/api/v1/admin/models` endpoint
   - Default selection is first available model
   - Each model shows display name

### Test Case 3: Memory Context Toggle
1. **Setup**:
   - Send initial message with memory enabled: "My name is Alice"
   - Send follow-up with memory enabled: "What's my name?"

2. **Execute**:
   - Toggle memory off
   - Send: "What's my name?"

3. **Expected Results**:
   - With memory: Response includes reference to "Alice"
   - Without memory: Response indicates no context

### Test Case 4: Error Handling
1. **Setup**:
   - Stop API server or use invalid endpoint

2. **Execute**:
   - Send any message

3. **Expected Results**:
   - Error displays in red box within response area
   - UI remains responsive
   - Can retry after fixing issue

### Test Case 5: Session Isolation
1. **Setup**:
   - Note current session ID
   - Send message: "Remember the number 42"

2. **Execute**:
   - Refresh page (new session ID)
   - Send: "What number should I remember?"

3. **Expected Results**:
   - New session has different ID
   - No memory from previous session

## Expected SSE Headers

### Request Headers
```http
POST /api/v1/chat HTTP/1.1
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
Accept: text/event-stream
```

### Response Headers
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

## SSE Event Format

### Token Events
```
data: {"text": "Hello"}
data: {"text": " world"}
data: {"text": "!"}
```

### Usage Event
```
data: {"tokens_in": 25, "tokens_out": 150, "cost_usd": 0.0045, "model": "gpt-4o-mini"}
```

### Done Event
```
data: {"finish_reason": "stop"}
data: [DONE]
```

### Error Event
```
event: error
data: {"error": "Rate limit exceeded", "code": "RATE_LIMIT"}
```

## Performance Targets

- **TTFT (Time to First Token)**: < 350ms
- **Streaming**: Continuous without batching
- **Model List Load**: < 500ms
- **Error Recovery**: Immediate UI recovery

## Troubleshooting

### Issue: Models not loading
- **Check**: API endpoint `/api/v1/admin/models` accessible
- **Check**: User has admin role
- **Fallback**: Default models (GPT-4 Mini, GPT-4, GPT-3.5 Turbo) are shown

### Issue: No streaming, response appears all at once
- **Check**: Response headers include `X-Accel-Buffering: no`
- **Check**: No proxy buffering between client and server
- **Check**: API implements proper SSE flushing

### Issue: Authentication errors
- **Check**: Session token is valid
- **Check**: Token included in Authorization header
- **Action**: Sign out and sign in again

### Issue: CORS errors
- **Check**: API CORS configuration includes admin origin
- **Check**: Credentials included in fetch request

## Development Notes

### Key Files
- `/apps/admin/src/app/admin/playground/page.tsx` - Main playground component
- `/apps/admin/lib/config.ts` - API configuration
- `/apps/api/src/routes/v1/chat.ts` - SSE endpoint implementation

### State Management
- **Response**: Accumulated string from token events
- **Usage**: Final token counts and cost
- **Timing**: TTFT and total duration tracking
- **Error**: Single error message display

### Security Considerations
- JWT token fetched from Supabase session
- No API keys exposed to client
- Admin role required for model listing

## Future Enhancements

1. **Conversation History**: Show previous messages in session
2. **Model Comparison**: Side-by-side streaming from different models
3. **Advanced Settings**: Temperature, max tokens, top-p controls
4. **Export**: Save conversation as markdown/JSON
5. **Metrics**: Real-time latency graph
6. **Prompt Templates**: Saved prompt library