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
import com.prototype.aichat.data.api.models.ThreadsResponse
import com.prototype.aichat.data.api.models.DatabaseMessagesResponse

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
                // Don't auto-refresh here, let the UI control when to refresh
                // This prevents stale data from persisting
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
            val sessionId = generateSessionId()
            val session = ChatSession(
                id = sessionId,
                userId = userId,
                title = title ?: "New Chat",
                createdAt = System.currentTimeMillis(),
                updatedAt = System.currentTimeMillis(),
                messageCount = 0
            )
            
            // Save locally first
            sessionDao.insertSession(SessionEntity.fromDomainModel(session))
            
            // Try to sync with server (fire and forget)
            createSessionOnServer(session)
            
            session
        }
    }
    
    /**
     * Add a message to a session
     */
    suspend fun addMessage(message: ChatMessage) {
        withContext(Dispatchers.IO) {
            // Get current max order for this session
            val maxOrder = sessionDao.getMaxMessageOrder(message.sessionId) ?: -1
            
            // Insert message with next order
            sessionDao.insertMessage(
                MessageEntity.fromDomainModel(message, maxOrder + 1)
            )
            
            // Update session timestamp and count
            sessionDao.updateSessionStats(
                sessionId = message.sessionId,
                count = sessionDao.getMessageCount(message.sessionId),
                lastMessageAt = message.timestamp
            )
        }
    }
    
    /**
     * Update session title
     */
    suspend fun updateSessionTitle(sessionId: String, title: String) {
        withContext(Dispatchers.IO) {
            sessionDao.updateSessionTitle(sessionId, title)
        }
    }
    
    /**
     * Delete a session and all its messages
     */
    suspend fun deleteSession(sessionId: String) {
        withContext(Dispatchers.IO) {
            sessionDao.deleteSession(sessionId)
        }
    }
    
    /**
     * Check if cache needs refresh
     */
    suspend fun shouldRefreshSessions(): Boolean {
        return withContext(Dispatchers.IO) {
            val lastSync = sessionDao.getLastSyncTime()
            val now = System.currentTimeMillis()
            
            lastSync == null || (now - lastSync) > CACHE_TTL
        }
    }
    
    /**
     * Force refresh from server
     */
    suspend fun refreshSessions() {
        withContext(Dispatchers.IO) {
            try {
                val sessions = fetchSessionsFromApi()
                
                // Clear old sessions first to ensure fresh data
                sessionDao.clearAllSessions()
                
                // Insert new sessions
                if (sessions.isNotEmpty()) {
                    sessionDao.insertSessions(
                        sessions.map { SessionEntity.fromDomainModel(it) }
                    )
                }
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
        fetchSessionMessagesFromApi(sessionId)
    }
    
    /**
     * Generate a unique session ID
     */
    private fun generateSessionId(): String {
        val timestamp = java.text.SimpleDateFormat("yyyyMMdd-HHmmss", java.util.Locale.getDefault())
            .format(java.util.Date())
        val random = (1000..9999).random()
        return "session-$timestamp-$random"
    }
    
    /**
     * Check if a session exists locally
     */
    suspend fun sessionExists(sessionId: String): Boolean {
        return withContext(Dispatchers.IO) {
            sessionDao.sessionExists(sessionId)
        }
    }
    
    /**
     * Get the most recent session
     */
    suspend fun getMostRecentSession(): ChatSession? {
        return withContext(Dispatchers.IO) {
            sessionDao.getMostRecentSession()?.toDomainModel()
        }
    }
    
    /**
     * Fetch sessions from API (now using database)
     */
    private suspend fun fetchSessionsFromApi(): List<ChatSession> {
        return withContext(Dispatchers.IO) {
            try {
                val url = "${AppConfig.API_BASE_URL}/api/v1/messages/threads"
                val request = apiClient.buildGetRequest(url)
                val response: ThreadsResponse = 
                    apiClient.executeRequest(request)
                
                // Get userId from current auth session
                val userId = SupabaseAuthClient.getUserId() 
                    ?: throw Exception("User not authenticated")
                
                // Convert API models to domain models
                response.threads.map { it.toDomainModel(userId) }
            } catch (e: Exception) {
                // Propagate the error so UI can handle it
                throw e
            }
        }
    }
    
    /**
     * Fetch session messages from API (now using database)
     */
    private suspend fun fetchSessionMessagesFromApi(sessionId: String) {
        withContext(Dispatchers.IO) {
            try {
                val url = "${AppConfig.API_BASE_URL}/api/v1/messages/$sessionId"
                val request = apiClient.buildGetRequest(url)
                val response: DatabaseMessagesResponse = 
                    apiClient.executeRequest(request)
                
                // Convert API models to domain models
                val messages = response.messages.map { it.toDomainModel() }
                
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
 * API request models
 */
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