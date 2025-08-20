# Android Networking Architecture

Comprehensive guide for the typed API client and SSE streaming implementation with robust lifecycle handling.

## Overview

The networking layer provides:
- **Typed API client** with automatic auth header injection
- **SSE client** for real-time chat streaming
- **Flow-based** reactive streams with proper cancellation
- **TTFT tracking** for performance monitoring
- **Error mapping** with user-friendly messages
- **Lifecycle-aware** connection management

## Architecture Components

### 1. ApiClient (`data/api/ApiClient.kt`)

**Purpose**: Base HTTP client with auth and error handling

**Key Features**:
- Auto-injects `Authorization: Bearer <token>` from SessionRepository
- Interceptor-based error handling (401, 429, 5xx)
- Configurable timeouts (30s default)
- Debug logging in development builds

**Public APIs**:
```kotlin
class ApiClient(context: Context) {
    val okHttpClient: OkHttpClient
    fun buildJsonRequest(url: String, body: Any): Request
    fun buildGetRequest(url: String): Request
    inline fun <reified T> executeRequest(request: Request): T
}
```

### 2. SSE Event Types (`domain/models/SSEEvents.kt`)

**Purpose**: Strongly typed SSE event hierarchy

**Event Types**:
```kotlin
sealed class SSEChatEvent {
    data class Token(val text: String)
    data class Usage(tokensIn, tokensOut, costUsd, model)
    data class Done(val finishReason: String)
    data class Error(val message: String, val code: String?)
    object Heartbeat  // Ignored comment events
    data class Unknown(val type: String, val data: String)
}
```

**Metrics Tracking**:
```kotlin
data class StreamingMetrics {
    val ttftMs: Long?  // Time to first token
    val tokenCount: Int
    fun withFirstToken(): StreamingMetrics
}
```

### 3. ChatSSEClient (`data/sse/ChatSSEClient.kt`)

**Purpose**: SSE client for `/api/v1/chat` endpoint

**Key Features**:
- Returns `Flow<SSEChatEvent>` for reactive streaming
- TTFT captured on first non-empty token
- Heartbeat comments handled (ignored)
- Proper cleanup on cancellation
- No automatic reconnection (manual retry in UI)

**Public APIs**:
```kotlin
class ChatSSEClient(apiClient: ApiClient) {
    fun streamChat(request: ChatRequest): Flow<SSEChatEvent>
    fun disconnect()
    fun getMetrics(): StreamingMetrics?
    fun isConnected(): Boolean
}
```

### 4. ChatRepositoryImpl (`data/repository/ChatRepositoryImpl.kt`)

**Purpose**: Repository implementation with stream lifecycle management

**Key Features**:
- Manages SSE connection lifecycle
- Maps API exceptions to user messages
- Tracks streaming state (Idle, Connecting, Streaming, Complete, Error)
- Cancellation propagates to upstream
- In-memory message caching (Room ready)

**Public APIs**:
```kotlin
class ChatRepositoryImpl(context: Context) : ChatRepository {
    val streamingState: StateFlow<StreamingState>
    suspend fun sendMessage(request: ChatRequest): Flow<SSEEvent>
    fun cancelStreaming()
    fun getCurrentTTFT(): Long?
    fun isStreaming(): Boolean
}
```

## Timeout Configuration

### Connection Timeouts

```kotlin
// ApiClient default timeouts
connectTimeout = 30 seconds
readTimeout = 30 seconds  // For SSE, effectively infinite due to streaming
writeTimeout = 30 seconds

// SSE specific
SSE_TIMEOUT_SECONDS = 30L  // Initial connection
SSE_RECONNECT_DELAY_MS = 1000L  // Not used (no auto-reconnect)
SSE_MAX_RECONNECT_ATTEMPTS = 3  // Not used (no auto-reconnect)
```

### Timeout Scenarios

1. **Connection Timeout**: 30s to establish connection
2. **Read Timeout**: Disabled for SSE streams (keep-alive)
3. **Idle Timeout**: Server sends heartbeats every 10s
4. **Request Timeout**: 30s for regular API calls

## Cancellation Handling

### User Navigation Away

```kotlin
// In ViewModel
override fun onCleared() {
    super.onCleared()
    // Cancel streaming when user leaves screen
    chatRepository.cancelStreaming()
}

// In ChatRepositoryImpl
fun cancelStreaming() {
    sseClient.disconnect()  // Closes EventSource
    _streamingState.value = StreamingState.Idle
}
```

### Flow Cancellation

```kotlin
// Collecting flow with lifecycle scope
lifecycleScope.launch {
    chatRepository.sendMessage(request)
        .flowOn(Dispatchers.IO)
        .collect { event ->
            // Handle event
        }
}
// Automatically cancelled when scope is cancelled
```

### Upstream Cancellation

When user navigates away:
1. Lifecycle scope is cancelled
2. Flow collection stops
3. `onCompletion` block runs
4. SSE EventSource is cancelled
5. HTTP connection is closed
6. Server stops sending data

## Error Mapping

### HTTP Status Codes

| Status | Exception | User Message | Action |
|--------|-----------|--------------|--------|
| 401 | UnauthorizedException | "Session expired. Please login again." | Navigate to login |
| 403 | ForbiddenException | "Access denied" | Show error toast |
| 429 | RateLimitException | "Too many requests. Please wait." | Show retry button |
| 500-599 | ServerException | "Server error. Try again later." | Show retry button |
| Timeout | IOException | "Connection timeout. Check network." | Show retry button |

### SSE Stream Errors

```kotlin
override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
    val error = when {
        response?.code == 401 -> SSEChatEvent.Error("Authentication required", "AUTH_REQUIRED")
        response?.code == 429 -> SSEChatEvent.Error("Rate limit exceeded", "RATE_LIMIT")
        response?.code in 500..599 -> SSEChatEvent.Error("Server error", "SERVER_ERROR")
        t?.message?.contains("timeout") == true -> SSEChatEvent.Error("Connection timeout", "TIMEOUT")
        else -> SSEChatEvent.Error(t?.message ?: "Unknown error", "UNKNOWN_ERROR")
    }
}
```

### UI Error Handling

```kotlin
// In ViewModel
streamingState.collect { state ->
    when (state) {
        is StreamingState.Error -> {
            when {
                state.message.contains("Session expired") -> {
                    // Navigate to login
                    _navigationEvent.emit(NavigationEvent.GoToLogin)
                }
                state.message.contains("Rate limit") -> {
                    // Show toast with retry after delay
                    _uiEvent.emit(UiEvent.ShowToast(state.message, showRetry = true))
                }
                else -> {
                    // Show generic error with retry
                    _uiEvent.emit(UiEvent.ShowError(state.message))
                }
            }
        }
    }
}
```

## Heartbeat Handling

Server sends heartbeat comments every 10 seconds:
```
: heartbeat
```

Client handling:
```kotlin
// In SSEEventParser
if (eventType == null && eventData.startsWith(":")) {
    return SSEChatEvent.Heartbeat
}

// In ChatSSEClient
if (event !is SSEChatEvent.Heartbeat) {
    scope.trySend(event)  // Only emit non-heartbeat events
}
```

**Result**: Connection stays alive, no events emitted to UI

## TTFT (Time To First Token) Tracking

### Capture Process

1. **Stream Start**: Record `startTime` in StreamingMetrics
2. **First Token**: When first non-empty token arrives:
   ```kotlin
   if (event is SSEChatEvent.Token && event.text.isNotBlank()) {
       metrics = metrics.withFirstToken()
       // TTFT = firstTokenTime - startTime
   }
   ```
3. **Report**: TTFT available via `getMetrics()?.ttftMs`

### Usage in UI

```kotlin
// Display TTFT after stream completes
when (state) {
    is StreamingState.Complete -> {
        val ttft = state.metadata?.ttftMs
        if (ttft != null) {
            Text("First token: ${ttft}ms")
        }
    }
}
```

## Reconnection Policy

**Current**: No automatic reconnection
**Reason**: User intent clarity, avoid unexpected charges

### Manual Retry Implementation

```kotlin
// In UI
Button(
    onClick = { 
        viewModel.retryLastMessage() 
    }
) {
    Text("Retry")
}

// In ViewModel
fun retryLastMessage() {
    lastRequest?.let { request ->
        sendMessage(request)
    }
}
```

## Network Security

### Development
```xml
<!-- network_security_config_dev.xml -->
<domain-config cleartextTrafficPermitted="true">
    <domain>10.0.2.2</domain>  <!-- Emulator localhost -->
</domain-config>
```

### Production
```xml
<!-- network_security_config_prod.xml -->
<base-config cleartextTrafficPermitted="false">
    <!-- HTTPS only -->
</base-config>
```

## Testing SSE Streams

### Unit Testing

```kotlin
@Test
fun `SSE stream emits tokens correctly`() = runTest {
    // Mock EventSource
    val mockEvents = listOf(
        SSEChatEvent.Token("Hello"),
        SSEChatEvent.Token(" world"),
        SSEChatEvent.Usage(10, 12, 0.0002, "gpt-4"),
        SSEChatEvent.Done()
    )
    
    // Collect and verify
    val events = sseClient.streamChat(request).toList()
    assertEquals(4, events.size)
    assertTrue(events[0] is SSEChatEvent.Token)
}
```

### Integration Testing

```kotlin
// Test with local mock server
val mockServer = MockWebServer()
mockServer.enqueue(MockResponse()
    .setBody("event: token\ndata: {\"text\":\"Hello\"}\n\n")
    .setHeader("Content-Type", "text/event-stream")
)
```

### Manual Testing

1. **Start Stream**: Send chat message
2. **Monitor TTFT**: Check debug logs for "TTFT: XXXms"
3. **Cancel Stream**: Navigate away, verify cleanup
4. **Error Handling**: Force 401/429/500 responses
5. **Heartbeat**: Let stream idle for >10s

## Performance Optimization

### Connection Pooling

```kotlin
// OkHttpClient reuses connections
val okHttpClient = OkHttpClient.Builder()
    .connectionPool(ConnectionPool(
        maxIdleConnections = 5,
        keepAliveDuration = 5,
        timeUnit = TimeUnit.MINUTES
    ))
```

### Flow Operators

```kotlin
// Efficient collection with buffering
chatRepository.sendMessage(request)
    .buffer(Channel.BUFFERED)  // Buffer events
    .flowOn(Dispatchers.IO)    // Process on IO thread
    .collect { /* UI thread */ }
```

### Memory Management

```kotlin
// Clear references on cleanup
override fun onCleared() {
    chatRepository.cancelStreaming()
    _messages.clear()
    super.onCleared()
}
```

## Common Issues

### Issue: Stream stops receiving events

**Cause**: Connection idle timeout
**Solution**: Server sends heartbeats every 10s

### Issue: TTFT is null

**Cause**: No non-empty tokens received yet
**Solution**: Check for empty tokens, wait for content

### Issue: 401 during stream

**Cause**: Token expired mid-stream
**Solution**: Catch error, navigate to login

### Issue: Memory leak on rotation

**Cause**: EventSource not cancelled
**Solution**: Use ViewModel, cancel in onCleared()

## Best Practices

1. **Always cancel streams** when leaving screen
2. **Handle all error codes** explicitly
3. **Show loading states** during connection
4. **Display TTFT** for performance monitoring
5. **Use lifecycle-aware** components (ViewModel)
6. **Test network failures** (airplane mode)
7. **Monitor memory usage** in profiler
8. **Log important events** (connection, first token, errors)

## Future Enhancements

1. **Automatic reconnection** with exponential backoff
2. **Connection quality indicator** in UI
3. **Bandwidth optimization** with compression
4. **Offline queue** for messages
5. **Background streaming** for long responses
6. **WebSocket** alternative for bidirectional communication
7. **Certificate pinning** for production
8. **Request/response caching** for common queries