package com.prototype.aichat.domain.repository

import com.prototype.aichat.domain.models.ChatInitResponse
import com.prototype.aichat.domain.models.ChatMessage
import com.prototype.aichat.domain.models.ChatRequest
import com.prototype.aichat.domain.models.ChatSession
import com.prototype.aichat.domain.models.SSEChatEvent
import kotlinx.coroutines.flow.Flow

/**
 * Repository interface for chat operations
 */
interface ChatRepository {
    /**
     * Initialize a chat session on the backend
     */
    suspend fun initializeChat(sessionId: String): ChatInitResponse
    
    /**
     * Send a chat message and receive SSE stream
     */
    suspend fun sendMessage(request: ChatRequest): Flow<SSEChatEvent>
    
    /**
     * Save a message to local storage
     */
    suspend fun saveMessage(message: ChatMessage)
    
    /**
     * Get messages for a session from API
     */
    suspend fun getSessionMessages(sessionId: String): List<ChatMessage>
    
    /**
     * Get all chat sessions from API
     */
    suspend fun getAllSessions(): List<ChatSession>
    
    /**
     * Create a new session
     */
    suspend fun createSession(userId: String): ChatSession
    
    /**
     * Clear all local data
     */
    suspend fun clearAllData()
}