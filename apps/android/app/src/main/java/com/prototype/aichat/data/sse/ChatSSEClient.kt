package com.prototype.aichat.data.sse

import com.prototype.aichat.core.config.AppConfig
import com.prototype.aichat.data.api.ApiClient
import com.prototype.aichat.domain.models.*
import kotlinx.coroutines.channels.ProducerScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources

/**
 * SSE client specifically for the chat endpoint with proper lifecycle handling
 */
class ChatSSEClient(
    private val apiClient: ApiClient
) {
    
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }
    
    private var currentEventSource: EventSource? = null
    private var metrics: StreamingMetrics? = null
    
    /**
     * Start SSE stream for chat endpoint
     * Returns a Flow of SSEChatEvent that can be collected
     */
    fun streamChat(request: ChatRequest): Flow<SSEChatEvent> = callbackFlow {
        // Reset metrics for new stream
        metrics = StreamingMetrics()
        
        // Build request
        val url = "${AppConfig.API_BASE_URL}/api/v1/chat"
        val jsonBody = json.encodeToString(request)
        val requestBody = jsonBody.toRequestBody("application/json".toMediaType())
        
        val httpRequest = Request.Builder()
            .url(url)
            .post(requestBody)
            .header("Accept", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .header("Connection", "keep-alive")
            .build()
        
        // Create event source listener
        val listener = createEventSourceListener(this)
        
        // Create and store event source
        currentEventSource = EventSources.createFactory(apiClient.okHttpClient)
            .newEventSource(httpRequest, listener)
        
        // Wait for close and cleanup
        awaitClose {
            disconnect()
        }
    }
    
    /**
     * Create EventSourceListener with proper event handling
     */
    private fun createEventSourceListener(
        scope: ProducerScope<SSEChatEvent>
    ) = object : EventSourceListener() {
        
        override fun onOpen(eventSource: EventSource, response: Response) {
            // Connection established, stream is ready
            // No event emitted, just internal state
        }
        
        override fun onEvent(
            eventSource: EventSource,
            id: String?,
            type: String?,
            data: String
        ) {
            // Parse and emit event
            val event = SSEEventParser.parseEvent(type, data)
            
            // Track TTFT for first non-empty token
            if (event is SSEChatEvent.Token && event.text.isNotBlank()) {
                val currentMetrics = metrics
                if (currentMetrics != null && currentMetrics.firstTokenTime == null) {
                    metrics = currentMetrics.withFirstToken()
                    // Log or report TTFT
                    val ttft = metrics?.ttftMs
                    if (ttft != null && AppConfig.IS_DEBUG) {
                        println("TTFT: ${ttft}ms")
                    }
                } else if (currentMetrics != null) {
                    metrics = currentMetrics.withNewToken()
                }
            }
            
            // Send event to flow (ignore heartbeats by default)
            if (event !is SSEChatEvent.Heartbeat) {
                scope.trySend(event)
            }
        }
        
        override fun onClosed(eventSource: EventSource) {
            // Stream closed normally
            scope.trySend(SSEChatEvent.Done("connection_closed"))
            scope.close()
        }
        
        override fun onFailure(
            eventSource: EventSource,
            t: Throwable?,
            response: Response?
        ) {
            // Handle different error scenarios
            val error = when {
                response?.code == 401 -> {
                    SSEChatEvent.Error("Authentication required. Please login again.", "AUTH_REQUIRED")
                }
                response?.code == 429 -> {
                    SSEChatEvent.Error("Rate limit exceeded. Please try again later.", "RATE_LIMIT")
                }
                response?.code in 500..599 -> {
                    SSEChatEvent.Error("Server error. Please try again.", "SERVER_ERROR")
                }
                t?.message?.contains("timeout", ignoreCase = true) == true -> {
                    SSEChatEvent.Error("Connection timeout. Please check your network.", "TIMEOUT")
                }
                else -> {
                    SSEChatEvent.Error(
                        t?.message ?: "Unknown error occurred",
                        "UNKNOWN_ERROR"
                    )
                }
            }
            
            scope.trySend(error)
            scope.close()
        }
    }
    
    /**
     * Disconnect and cleanup current SSE connection
     */
    fun disconnect() {
        currentEventSource?.cancel()
        currentEventSource = null
        metrics = null
    }
    
    /**
     * Get current streaming metrics (TTFT, token count, etc.)
     */
    fun getMetrics(): StreamingMetrics? = metrics
    
    /**
     * Check if currently connected
     */
    fun isConnected(): Boolean = currentEventSource != null
}