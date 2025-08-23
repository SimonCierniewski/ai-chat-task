package com.prototype.aichat.data.api.models

import com.prototype.aichat.domain.models.ChatMessage
import com.prototype.aichat.domain.models.ChatSession
import com.prototype.aichat.domain.models.MessageMetadata
import com.prototype.aichat.domain.models.MessageRole
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Database message model
 */
@Serializable
data class DatabaseMessage(
    val id: String,
    @SerialName("thread_id")
    val threadId: String,
    val role: String,
    val content: String,
    @SerialName("created_at")
    val createdAt: String,
    @SerialName("user_id")
    val userId: String,
    @SerialName("start_ms")
    val startMs: Long? = null,
    @SerialName("ttft_ms")
    val ttftMs: Long? = null,
    @SerialName("total_ms")
    val totalMs: Long? = null,
    @SerialName("tokens_in")
    val tokensIn: Int? = null,
    @SerialName("tokens_out")
    val tokensOut: Int? = null,
    val price: Double? = null,
    val model: String? = null
) {
    fun toDomainModel(): ChatMessage {
        val metadata = if (role == "assistant") {
            MessageMetadata(
                model = model,
                tokensIn = tokensIn,
                tokensOut = tokensOut,
                cost = price,
                ttftMs = ttftMs,
                totalMs = totalMs
            )
        } else null
        
        return ChatMessage(
            id = id,
            sessionId = threadId,
            role = when(role) {
                "user" -> MessageRole.USER
                "assistant" -> MessageRole.ASSISTANT
                "system" -> MessageRole.SYSTEM
                else -> MessageRole.USER
            },
            content = content,
            timestamp = System.currentTimeMillis(), // Parse createdAt if needed
            metadata = metadata
        )
    }
}

/**
 * Messages response from database API
 */
@Serializable
data class DatabaseMessagesResponse(
    val messages: List<DatabaseMessage>,
    val total: Int
)

/**
 * Thread summary from database
 */
@Serializable
data class ThreadSummary(
    @SerialName("thread_id")
    val threadId: String,
    @SerialName("message_count")
    val messageCount: Int,
    @SerialName("last_message_at")
    val lastMessageAt: String,
    @SerialName("total_cost")
    val totalCost: Double? = null,
    @SerialName("total_tokens_in")
    val totalTokensIn: Int? = null,
    @SerialName("total_tokens_out")
    val totalTokensOut: Int? = null,
    @SerialName("first_message")
    val firstMessage: String? = null,
    @SerialName("last_message")
    val lastMessage: String? = null
) {
    fun toDomainModel(userId: String): ChatSession {
        // Parse the ISO timestamp from the API (format: 2025-01-23T18:26:24.018Z)
        val lastMessageTimestamp = try {
            // Try parsing with milliseconds first
            val formats = listOf(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                "yyyy-MM-dd'T'HH:mm:ss'Z'",
                "yyyy-MM-dd'T'HH:mm:ss"
            )
            
            var timestamp: Long? = null
            for (format in formats) {
                try {
                    timestamp = java.text.SimpleDateFormat(format, java.util.Locale.US).apply {
                        timeZone = java.util.TimeZone.getTimeZone("UTC")
                    }.parse(lastMessageAt)?.time
                    if (timestamp != null) break
                } catch (e: Exception) {
                    // Try next format
                }
            }
            timestamp ?: System.currentTimeMillis()
        } catch (e: Exception) {
            System.currentTimeMillis()
        }
        
        return ChatSession(
            id = threadId,
            userId = userId,
            title = firstMessage?.take(50) ?: "Chat Session",
            createdAt = lastMessageTimestamp, // Use the actual last message time
            updatedAt = lastMessageTimestamp,
            lastMessageAt = lastMessageTimestamp,
            messageCount = messageCount
        )
    }
}

/**
 * Threads response from database API
 */
@Serializable
data class ThreadsResponse(
    val threads: List<ThreadSummary>,
    val total: Int
)