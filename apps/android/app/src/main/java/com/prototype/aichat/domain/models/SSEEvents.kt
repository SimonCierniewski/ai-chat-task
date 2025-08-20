package com.prototype.aichat.domain.models

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

/**
 * Sealed class hierarchy for SSE events from the chat API
 */
sealed class SSEChatEvent {
    /**
     * Token event containing a text chunk
     */
    data class Token(val text: String) : SSEChatEvent()
    
    /**
     * Usage event with token counts and cost information
     */
    data class Usage(
        val tokensIn: Int,
        val tokensOut: Int,
        val costUsd: Double,
        val model: String
    ) : SSEChatEvent()
    
    /**
     * Done event signaling stream completion
     */
    data class Done(val finishReason: String = "stop") : SSEChatEvent()
    
    /**
     * Error event for stream errors
     */
    data class Error(val message: String, val code: String? = null) : SSEChatEvent()
    
    /**
     * Heartbeat comment event (ignored but acknowledged)
     */
    object Heartbeat : SSEChatEvent()
    
    /**
     * Unknown event type (for forward compatibility)
     */
    data class Unknown(val type: String, val data: String) : SSEChatEvent()
}

/**
 * Data classes for SSE event payloads
 */
@Serializable
data class TokenEventData(
    val text: String
)

@Serializable
data class UsageEventData(
    val tokens_in: Int,
    val tokens_out: Int,
    val cost_usd: Double,
    val model: String
)

@Serializable
data class DoneEventData(
    val finish_reason: String = "stop"
)

@Serializable
data class ErrorEventData(
    val message: String,
    val code: String? = null
)

/**
 * Parser for SSE events
 */
object SSEEventParser {
    
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }
    
    /**
     * Parse SSE event type and data into typed event
     */
    fun parseEvent(eventType: String?, eventData: String): SSEChatEvent {
        // Handle comment heartbeats
        if (eventType == null && eventData.startsWith(":")) {
            return SSEChatEvent.Heartbeat
        }
        
        return when (eventType) {
            "token" -> {
                try {
                    val data = json.decodeFromString<TokenEventData>(eventData)
                    SSEChatEvent.Token(data.text)
                } catch (e: SerializationException) {
                    // Fallback for simple string format
                    SSEChatEvent.Token(eventData.trim('"'))
                }
            }
            
            "usage" -> {
                try {
                    val data = json.decodeFromString<UsageEventData>(eventData)
                    SSEChatEvent.Usage(
                        tokensIn = data.tokens_in,
                        tokensOut = data.tokens_out,
                        costUsd = data.cost_usd,
                        model = data.model
                    )
                } catch (e: SerializationException) {
                    SSEChatEvent.Error("Failed to parse usage data", "PARSE_ERROR")
                }
            }
            
            "done" -> {
                try {
                    val data = json.decodeFromString<DoneEventData>(eventData)
                    SSEChatEvent.Done(data.finish_reason)
                } catch (e: SerializationException) {
                    SSEChatEvent.Done()
                }
            }
            
            "error" -> {
                try {
                    val data = json.decodeFromString<ErrorEventData>(eventData)
                    SSEChatEvent.Error(data.message, data.code)
                } catch (e: SerializationException) {
                    SSEChatEvent.Error(eventData)
                }
            }
            
            else -> {
                // Unknown event type for forward compatibility
                SSEChatEvent.Unknown(eventType ?: "unknown", eventData)
            }
        }
    }
}

/**
 * Streaming state with TTFT tracking
 */
data class StreamingMetrics(
    val startTime: Long = System.currentTimeMillis(),
    val firstTokenTime: Long? = null,
    val lastTokenTime: Long? = null,
    val tokenCount: Int = 0,
    val ttftMs: Long? = null
) {
    /**
     * Calculate TTFT when first token arrives
     */
    fun withFirstToken(): StreamingMetrics {
        if (firstTokenTime != null) return this
        
        val now = System.currentTimeMillis()
        return copy(
            firstTokenTime = now,
            lastTokenTime = now,
            tokenCount = tokenCount + 1,
            ttftMs = now - startTime
        )
    }
    
    /**
     * Update metrics for subsequent tokens
     */
    fun withNewToken(): StreamingMetrics {
        val now = System.currentTimeMillis()
        return if (firstTokenTime == null) {
            withFirstToken()
        } else {
            copy(
                lastTokenTime = now,
                tokenCount = tokenCount + 1
            )
        }
    }
}