package com.prototype.aichat.data.sse

import com.prototype.aichat.core.config.AppConfig
import com.prototype.aichat.domain.models.SSEEvent
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import okhttp3.*
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.util.concurrent.TimeUnit

/**
 * SSE (Server-Sent Events) client for streaming chat responses
 */
class SSEClient(
    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(AppConfig.SSE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(AppConfig.SSE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()
) {
    
    private var eventSource: EventSource? = null
    private val eventChannel = Channel<SSEEvent>(Channel.BUFFERED)
    
    /**
     * Connect to SSE endpoint and return a flow of events
     */
    fun connectToSSE(
        url: String,
        headers: Map<String, String> = emptyMap(),
        body: RequestBody? = null
    ): Flow<SSEEvent> {
        val requestBuilder = Request.Builder()
            .url(url)
            .header("Accept", "text/event-stream")
            .header("Cache-Control", "no-cache")
        
        // Add custom headers
        headers.forEach { (key, value) ->
            requestBuilder.header(key, value)
        }
        
        // Add body for POST requests
        if (body != null) {
            requestBuilder.post(body)
        } else {
            requestBuilder.get()
        }
        
        val request = requestBuilder.build()
        
        val listener = object : EventSourceListener() {
            override fun onOpen(eventSource: EventSource, response: Response) {
                // Connection opened successfully
            }
            
            override fun onEvent(
                eventSource: EventSource,
                id: String?,
                type: String?,
                data: String
            ) {
                // Send event to channel
                eventChannel.trySend(SSEEvent(type ?: "message", data))
            }
            
            override fun onClosed(eventSource: EventSource) {
                eventChannel.close()
            }
            
            override fun onFailure(
                eventSource: EventSource,
                t: Throwable?,
                response: Response?
            ) {
                eventChannel.trySend(
                    SSEEvent("error", t?.message ?: "Unknown error")
                )
                eventChannel.close()
            }
        }
        
        eventSource = EventSources.createFactory(okHttpClient)
            .newEventSource(request, listener)
        
        return eventChannel.receiveAsFlow()
    }
    
    /**
     * Close the SSE connection
     */
    fun disconnect() {
        eventSource?.cancel()
        eventSource = null
        eventChannel.close()
    }
}