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
     * Usage event (ignored in pure chat mode)
     */
    object Usage : SSEChatEvent()
    
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
                // Ignore usage events in pure chat mode
                SSEChatEvent.Usage
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

