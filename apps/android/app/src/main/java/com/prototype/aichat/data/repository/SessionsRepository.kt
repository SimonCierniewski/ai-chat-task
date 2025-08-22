package com.prototype.aichat.data.repository

import android.content.Context
import com.prototype.aichat.core.config.AppConfig
import com.prototype.aichat.data.api.ApiClient
import com.prototype.aichat.data.auth.SupabaseAuthClient
import com.prototype.aichat.data.local.ChatDatabase
import com.prototype.aichat.data.local.entities.MessageEntity
import com.prototype.aichat.data.local.entities.SessionEntity
import com.prototype.aichat.domain.models.ChatMessage
import com.prototype.aichat.domain.models.ChatSession
import com.prototype.aichat.domain.models.MessageMetadata
import com.prototype.aichat.domain.models.MessageRole
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Repository for managing sessions with caching and API sync
 */
class SessionsRepository(
    private val context: Context
) {
    private val database = ChatDatabase.getInstance(context)
    private val sessionDao = database.sessionDao()
    private val apiClient = ApiClient(context)
    
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }
    
    // Cache TTL: 5 minutes
    private val CACHE_TTL = TimeUnit.MINUTES.toMillis(5)
    
    /**
     * Get all sessions with caching
     */
    fun getAllSessions(): Flow<List<ChatSession>> {
        return sessionDao.getAllSessions()
            .map { entities ->
                entities.map { it.toDomainModel() }
            }
            .onStart {
                // Check if cache is stale and refresh if needed
                checkAndRefreshCache()
            }
    }
    
    /**
     * Get session by ID
     */
    suspend fun getSession(sessionId: String): ChatSession? {
        return withContext(Dispatchers.IO) {
            sessionDao.getSession(sessionId)?.toDomainModel()
        }
    }
    
    /**
     * Get messages for a session with caching
     */
    fun getSessionMessages(sessionId: String): Flow<List<ChatMessage>> {
        return sessionDao.getSessionMessages(sessionId)
            .map { entities ->
                entities.map { it.toDomainModel() }
            }
            .onStart {
                // Try to fetch fresh data from API
                fetchSessionMessagesFromApi(sessionId)
            }
    }
    
    /**
     * Create a new session
     */
    suspend fun createSession(userId: String, title: String? = null): ChatSession {
        return withContext(Dispatchers.IO) {
            val session = ChatSession(
                userId = userId,
                title = title ?: "Session ${System.currentTimeMillis()}"
            )
            
            // Save to local database
            sessionDao.insertSession(SessionEntity.fromDomainModel(session))
            
            // Create on server (if API available)
            try {
                createSessionOnServer(session)
            } catch (e: Exception) {
                // Continue with local session if server fails
            }
            
            session
        }
    }
    
    /**
     * Update session (title, etc.)
     */
    suspend fun updateSession(session: ChatSession) {
        withContext(Dispatchers.IO) {
            sessionDao.updateSession(SessionEntity.fromDomainModel(session))
        }
    }
    
    /**
     * Delete a session
     */
    suspend fun deleteSession(sessionId: String) {
        withContext(Dispatchers.IO) {
            sessionDao.getSession(sessionId)?.let {
                sessionDao.deleteSession(it)
            }
        }
    }
    
    /**
     * Add message to session
     */
    suspend fun addMessage(message: ChatMessage) {
        withContext(Dispatchers.IO) {
            // Get current message count for sequence number
            val count = sessionDao.getMessageCount(message.sessionId)
            
            // Insert message
            sessionDao.insertMessage(
                MessageEntity.fromDomainModel(message, count)
            )
            
            // Update session stats
            sessionDao.updateSessionStats(
                sessionId = message.sessionId,
                count = count + 1,
                lastMessageAt = message.timestamp
            )
        }
    }
    
    /**
     * Force refresh from server
     */
    suspend fun refreshSessions() {
        withContext(Dispatchers.IO) {
            try {
                val sessions = fetchSessionsFromApi()
                
                // Update local cache
                sessionDao.insertSessions(
                    sessions.map { SessionEntity.fromDomainModel(it) }
                )
            } catch (e: Exception) {
                // Handle error - cache remains valid
                throw e
            }
        }
    }
    
    /**
     * Refresh specific session messages
     */
    suspend fun refreshSessionMessages(sessionId: String) {
        withContext(Dispatchers.IO) {
            fetchSessionMessagesFromApi(sessionId)
        }
    }
    
    /**
     * Check if cache is stale and refresh if needed
     */
    private suspend fun checkAndRefreshCache() {
        withContext(Dispatchers.IO) {
            val sessions = sessionDao.getAllSessions().first()
            
            if (sessions.isEmpty()) {
                // No cache, fetch from server
                refreshSessions()
            } else {
                // Check if cache is stale
                val oldestSync = sessions.minOf { it.lastSyncedAt }
                if (System.currentTimeMillis() - oldestSync > CACHE_TTL) {
                    try {
                        refreshSessions()
                    } catch (e: Exception) {
                        // Use stale cache if refresh fails
                    }
                }
            }
        }
    }
    
    /**
     * Fetch sessions from API
     */
    private suspend fun fetchSessionsFromApi(): List<ChatSession> {
        return withContext(Dispatchers.IO) {
            try {
                val url = "${AppConfig.API_BASE_URL}/api/v1/sessions"
                val request = apiClient.buildGetRequest(url)
                val response: SessionsResponse = apiClient.executeRequest(request)
                
                // Get userId from the first existing session or use a default
                val userId = SupabaseAuthClient.getUserId()!!
                
                // Convert API models to domain models
                response.sessions.map { it.toDomainModel(userId) }
            } catch (e: Exception) {
                // Return empty list if API fails
                emptyList()
            }
        }
    }
    
    /**
     * Fetch session messages from API (via Zep proxy)
     */
    private suspend fun fetchSessionMessagesFromApi(sessionId: String) {
        withContext(Dispatchers.IO) {
            try {
                val url = "${AppConfig.API_BASE_URL}/api/v1/sessions/$sessionId/messages"
                val request = apiClient.buildGetRequest(url)
                val response: MessagesResponse = apiClient.executeRequest(request)
                
                // Convert API models to domain models
                val messages = response.messages.map { it.toDomainModel(sessionId) }
                
                // Update local cache
                val messageEntities = messages.mapIndexed { index, message ->
                    MessageEntity.fromDomainModel(message, index)
                }
                
                sessionDao.insertMessages(messageEntities)
                
                // Update session stats
                if (messageEntities.isNotEmpty()) {
                    sessionDao.updateSessionStats(
                        sessionId = sessionId,
                        count = messageEntities.size,
                        lastMessageAt = messageEntities.maxOf { it.timestamp }
                    )
                }
            } catch (e: Exception) {
                // Continue with cached data if API fails
            }
        }
    }
    
    /**
     * Create session on server
     */
    private suspend fun createSessionOnServer(session: ChatSession) {
        withContext(Dispatchers.IO) {
            try {
                val url = "${AppConfig.API_BASE_URL}/api/v1/sessions"
                val request = apiClient.buildJsonRequest(url, CreateSessionRequest(
                    userId = session.userId,
                    title = session.title
                ))
                apiClient.okHttpClient.newCall(request).execute()
            } catch (e: Exception) {
                // Ignore server errors for now
            }
        }
    }
    
    /**
     * Clear all cached data
     */
    suspend fun clearCache() {
        withContext(Dispatchers.IO) {
            sessionDao.clearAll()
        }
    }
    
    /**
     * Get session statistics
     */
    suspend fun getSessionStats(sessionId: String): SessionStats {
        return withContext(Dispatchers.IO) {
            val messageCount = sessionDao.getMessageCount(sessionId)
            val lastMessageTime = sessionDao.getLastMessageTime(sessionId)
            
            SessionStats(
                messageCount = messageCount,
                lastMessageTime = lastMessageTime
            )
        }
    }
}

/**
 * API response models
 */
@Serializable
private data class SessionsResponse(
    val sessions: List<SessionApiModel>,
    val total: Int
)

@Serializable
private data class SessionApiModel(
    val id: String,
    val createdAt: String,
    val lastMessageAt: String? = null,
    val messageCount: Int = 0,
    val title: String? = null
) {
    fun toDomainModel(userId: String): ChatSession {
        return ChatSession(
            id = id,
            userId = userId,
            createdAt = parseIsoDate(createdAt),
            lastMessageAt = lastMessageAt?.let { parseIsoDate(it) },
            messageCount = messageCount,
            title = title
        )
    }
    
    private fun parseIsoDate(dateString: String): Long {
        return try {
            java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.getDefault())
                .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                .parse(dateString.replace("Z", "").split(".")[0])?.time 
                ?: System.currentTimeMillis()
        } catch (e: Exception) {
            System.currentTimeMillis()
        }
    }
}

@Serializable
private data class MessagesResponse(
    val messages: List<MessageApiModel>,
    val sessionId: String
)

@Serializable
private data class MessageApiModel(
    val id: String,
    val content: String,
    val role: String,
    val timestamp: String,
    val metadata: MessageMetadata? = null
) {
    fun toDomainModel(sessionId: String): ChatMessage {
        return ChatMessage(
            id = id,
            sessionId = sessionId,
            content = content,
            role = when(role.lowercase()) {
                "user" -> MessageRole.USER
                "assistant" -> MessageRole.ASSISTANT
                "system" -> MessageRole.SYSTEM
                else -> MessageRole.USER
            },
            timestamp = parseIsoDate(timestamp),
            metadata = metadata
        )
    }
    
    private fun parseIsoDate(dateString: String): Long {
        return try {
            java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.getDefault())
                .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                .parse(dateString.replace("Z", "").split(".")[0])?.time 
                ?: System.currentTimeMillis()
        } catch (e: Exception) {
            System.currentTimeMillis()
        }
    }
}

@Serializable
private data class CreateSessionRequest(
    val userId: String,
    val title: String?
)

/**
 * Session statistics
 */
data class SessionStats(
    val messageCount: Int,
    val lastMessageTime: Long?
)
