package com.prototype.aichat.domain.models

import kotlinx.serialization.Serializable
import java.util.UUID
import com.prototype.aichat.core.utils.SessionIdGenerator

/**
 * Domain models for the chat feature
 */

@Serializable
data class ChatMessage(
    val id: String = UUID.randomUUID().toString(),
    val content: String,
    val role: MessageRole,
    val timestamp: Long = System.currentTimeMillis(),
    val sessionId: String,
    val metadata: MessageMetadata? = null
)

@Serializable
enum class MessageRole {
    USER,
    ASSISTANT,
    SYSTEM
}

@Serializable
data class MessageMetadata(
    val model: String? = null,
    val durationMs: Long? = null,
    val tokensIn: Int? = null,
    val tokensOut: Int? = null,
    val cost: Double? = null,
    val ttftMs: Long? = null,
    val totalMs: Long? = null
)

@Serializable
data class ChatSession(
    val id: String = SessionIdGenerator.generate(),
    val userId: String,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val lastMessageAt: Long? = null,
    val title: String? = null,
    val messageCount: Int = 0
)

@Serializable
data class ChatRequest(
    val message: String,
    val useMemory: Boolean = true,
    val sessionId: String? = null
)

@Serializable
data class ChatInitRequest(
    val sessionId: String
)

@Serializable
data class ChatInitResponse(
    val success: Boolean,
    val userId: String,
    val sessionId: String,
    val threadExists: Boolean,
    val userExists: Boolean
)

@Serializable
data class SSEEvent(
    val event: String,
    val data: String
)

@Serializable
data class SessionsListResponse(
    val sessions: List<SessionInfo>,
    val total: Int
)

@Serializable
data class SessionInfo(
    val id: String,
    val createdAt: String,
    val lastMessageAt: String? = null,
    val messageCount: Int = 0,
    val title: String? = null
)

@Serializable
data class SessionMessagesResponse(
    val messages: List<MessageInfo>,
    val sessionId: String
)

@Serializable
data class MessageInfo(
    val id: String,
    val content: String,
    val role: String,
    val timestamp: String,
    val metadata: MessageMetadata? = null
)

sealed class StreamingState {
    object Idle : StreamingState()
    object Connecting : StreamingState()
    data class Streaming(val tokens: List<String>) : StreamingState()
    object Complete : StreamingState()
    data class Error(val message: String) : StreamingState()
}