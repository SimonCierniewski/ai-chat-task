package com.prototype.aichat.data.local.entities

import androidx.room.*
import com.prototype.aichat.domain.models.ChatMessage
import com.prototype.aichat.domain.models.ChatSession
import com.prototype.aichat.domain.models.MessageMetadata
import com.prototype.aichat.domain.models.MessageRole
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Room entity for chat sessions
 */
@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey
    val id: String,
    val userId: String,
    val title: String?,
    val createdAt: Long,
    val updatedAt: Long,
    val lastMessageAt: Long?,
    val messageCount: Int,
    val lastSyncedAt: Long = System.currentTimeMillis()
) {
    /**
     * Convert to domain model
     */
    fun toDomainModel(): ChatSession {
        return ChatSession(
            id = id,
            userId = userId,
            title = title,
            createdAt = createdAt,
            updatedAt = updatedAt,
            lastMessageAt = lastMessageAt,
            messageCount = messageCount
        )
    }
    
    companion object {
        /**
         * Create from domain model
         */
        fun fromDomainModel(session: ChatSession): SessionEntity {
            return SessionEntity(
                id = session.id,
                userId = session.userId,
                title = session.title,
                createdAt = session.createdAt,
                updatedAt = session.updatedAt,
                lastMessageAt = session.lastMessageAt,
                messageCount = session.messageCount
            )
        }
    }
}

/**
 * Room entity for chat messages
 */
@Entity(
    tableName = "messages",
    foreignKeys = [
        ForeignKey(
            entity = SessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("sessionId")]
)
data class MessageEntity(
    @PrimaryKey
    val id: String,
    val sessionId: String,
    val content: String,
    val role: String,
    val timestamp: Long,
    val metadata: String? = null, // JSON string
    val sequenceNumber: Int = 0 // For ordering messages
) {
    /**
     * Convert to domain model
     */
    fun toDomainModel(): ChatMessage {
        val metadataObj = metadata?.let {
            try {
                Json.decodeFromString<MessageMetadata>(it)
            } catch (e: Exception) {
                null
            }
        }
        
        return ChatMessage(
            id = id,
            sessionId = sessionId,
            content = content,
            role = MessageRole.valueOf(role),
            timestamp = timestamp,
            metadata = metadataObj
        )
    }
    
    companion object {
        private val json = Json { ignoreUnknownKeys = true }
        
        /**
         * Create from domain model
         */
        fun fromDomainModel(message: ChatMessage, sequenceNumber: Int = 0): MessageEntity {
            val metadataJson = message.metadata?.let {
                json.encodeToString(it)
            }
            
            return MessageEntity(
                id = message.id,
                sessionId = message.sessionId,
                content = message.content,
                role = message.role.name,
                timestamp = message.timestamp,
                metadata = metadataJson,
                sequenceNumber = sequenceNumber
            )
        }
    }
}

/**
 * Data class for session with last message preview
 */
data class SessionWithLastMessage(
    @Embedded val session: SessionEntity,
    @Relation(
        parentColumn = "id",
        entityColumn = "sessionId"
    )
    val messages: List<MessageEntity>
) {
    val lastMessage: MessageEntity?
        get() = messages.maxByOrNull { it.timestamp }
}