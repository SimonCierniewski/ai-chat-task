package com.prototype.aichat.data.repository

import android.content.Context
import com.prototype.aichat.data.api.ApiClient
import com.prototype.aichat.data.api.ApiException
import com.prototype.aichat.data.sse.ChatSSEClient
import com.prototype.aichat.domain.models.*
import com.prototype.aichat.domain.repository.ChatRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Implementation of ChatRepository with SSE streaming and lifecycle management
 */
class ChatRepositoryImpl(
    context: Context
) : ChatRepository {
    
    private val apiClient = ApiClient(context)
    private val sseClient = ChatSSEClient(apiClient)
    
    // In-memory cache for current session (can be replaced with Room)
    private val messagesCache = mutableMapOf<String, MutableList<ChatMessage>>()
    private val sessionsCache = mutableListOf<ChatSession>()
    
    // Flow for active streaming state
    private val _streamingState = MutableStateFlow<StreamingState>(StreamingState.Idle)
    val streamingState: StateFlow<StreamingState> = _streamingState.asStateFlow()
    
    /**
     * Send a chat message and receive SSE stream
     * Handles lifecycle properly - cancellation stops upstream
     */
    override suspend fun sendMessage(request: ChatRequest): Flow<SSEEvent> {
        return withContext(Dispatchers.IO) {
            try {
                _streamingState.value = StreamingState.Connecting
                
                // Start SSE stream
                sseClient.streamChat(request)
                    .onStart {
                        _streamingState.value = StreamingState.Streaming(emptyList())
                    }
                    .onEach { event ->
                        // Update streaming state based on event
                        when (event) {
                            is SSEChatEvent.Token -> {
                                val currentState = _streamingState.value
                                if (currentState is StreamingState.Streaming) {
                                    _streamingState.value = StreamingState.Streaming(
                                        currentState.tokens + event.text
                                    )
                                }
                            }
                            is SSEChatEvent.Usage -> {
                                _streamingState.value = StreamingState.Complete(
                                    MessageMetadata(
                                        tokensIn = event.tokensIn,
                                        tokensOut = event.tokensOut,
                                        costUsd = event.costUsd,
                                        model = event.model,
                                        ttftMs = sseClient.getMetrics()?.ttftMs
                                    )
                                )
                            }
                            is SSEChatEvent.Done -> {
                                // Stream completed successfully
                                if (_streamingState.value !is StreamingState.Complete) {
                                    _streamingState.value = StreamingState.Complete(
                                        MessageMetadata(ttftMs = sseClient.getMetrics()?.ttftMs)
                                    )
                                }
                            }
                            is SSEChatEvent.Error -> {
                                _streamingState.value = StreamingState.Error(event.message)
                            }
                            else -> {
                                // Handle other events if needed
                            }
                        }
                    }
                    .onCompletion { throwable ->
                        // Stream completed or cancelled
                        if (throwable != null) {
                            _streamingState.value = StreamingState.Error(
                                throwable.message ?: "Stream interrupted"
                            )
                        }
                        // Disconnect SSE client on completion
                        sseClient.disconnect()
                    }
                    .catch { exception ->
                        // Handle exceptions and map to appropriate errors
                        val errorMessage = when (exception) {
                            is ApiException -> handleApiException(exception)
                            else -> exception.message ?: "Unknown error"
                        }
                        emit(SSEEvent("error", errorMessage))
                        _streamingState.value = StreamingState.Error(errorMessage)
                    }
                    .map { chatEvent ->
                        // Convert to legacy SSEEvent format if needed
                        when (chatEvent) {
                            is SSEChatEvent.Token -> SSEEvent("token", chatEvent.text)
                            is SSEChatEvent.Usage -> SSEEvent("usage", buildString {
                                append("{")
                                append("\"tokens_in\":${chatEvent.tokensIn},")
                                append("\"tokens_out\":${chatEvent.tokensOut},")
                                append("\"cost_usd\":${chatEvent.costUsd},")
                                append("\"model\":\"${chatEvent.model}\"")
                                append("}")
                            })
                            is SSEChatEvent.Done -> SSEEvent("done", chatEvent.finishReason)
                            is SSEChatEvent.Error -> SSEEvent("error", chatEvent.message)
                            else -> SSEEvent("unknown", "")
                        }
                    }
            } catch (e: Exception) {
                _streamingState.value = StreamingState.Error(e.message ?: "Failed to start stream")
                throw e
            }
        }
    }
    
    /**
     * Cancel current streaming operation
     */
    fun cancelStreaming() {
        sseClient.disconnect()
        _streamingState.value = StreamingState.Idle
    }
    
    /**
     * Handle API exceptions and provide user-friendly messages
     */
    private fun handleApiException(exception: ApiException): String {
        return when (exception) {
            is com.prototype.aichat.data.api.UnauthorizedException -> {
                // Trigger re-login flow
                "Session expired. Please login again."
            }
            is com.prototype.aichat.data.api.RateLimitException -> {
                "Too many requests. Please wait a moment."
            }
            is com.prototype.aichat.data.api.ServerException -> {
                "Server error. Please try again later."
            }
            else -> exception.message ?: "Connection error"
        }
    }
    
    /**
     * Save a message to local storage (in-memory for now)
     */
    override suspend fun saveMessage(message: ChatMessage) {
        withContext(Dispatchers.IO) {
            val sessionMessages = messagesCache.getOrPut(message.sessionId) { mutableListOf() }
            sessionMessages.add(message)
            
            // Update session metadata
            val session = sessionsCache.find { it.id == message.sessionId }
            if (session != null) {
                val index = sessionsCache.indexOf(session)
                sessionsCache[index] = session.copy(
                    lastMessageAt = message.timestamp,
                    messageCount = sessionMessages.size
                )
            }
        }
    }
    
    /**
     * Get messages for a session
     */
    override suspend fun getSessionMessages(sessionId: String): List<ChatMessage> {
        return withContext(Dispatchers.IO) {
            messagesCache[sessionId]?.toList() ?: emptyList()
        }
    }
    
    /**
     * Get all chat sessions
     */
    override suspend fun getAllSessions(): List<ChatSession> {
        return withContext(Dispatchers.IO) {
            sessionsCache.toList()
        }
    }
    
    /**
     * Create a new session
     */
    override suspend fun createSession(userId: String): ChatSession {
        return withContext(Dispatchers.IO) {
            val session = ChatSession(
                userId = userId,
                title = "Chat ${sessionsCache.size + 1}"
            )
            sessionsCache.add(session)
            session
        }
    }
    
    /**
     * Clear all local data
     */
    override suspend fun clearAllData() {
        withContext(Dispatchers.IO) {
            messagesCache.clear()
            sessionsCache.clear()
            _streamingState.value = StreamingState.Idle
        }
    }
    
    /**
     * Get current TTFT if available
     */
    fun getCurrentTTFT(): Long? = sseClient.getMetrics()?.ttftMs
    
    /**
     * Check if currently streaming
     */
    fun isStreaming(): Boolean = _streamingState.value is StreamingState.Streaming
}