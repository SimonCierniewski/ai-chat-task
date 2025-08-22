package com.prototype.aichat.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.prototype.aichat.data.api.ApiException
import com.prototype.aichat.data.auth.SupabaseAuthClient
import com.prototype.aichat.data.repository.ChatRepositoryImpl
import com.prototype.aichat.domain.models.ChatMessage
import com.prototype.aichat.domain.models.ChatRequest
import com.prototype.aichat.domain.models.MessageRole
import com.prototype.aichat.domain.models.SSEChatEvent
import com.prototype.aichat.domain.models.StreamingState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import com.prototype.aichat.core.utils.SessionIdGenerator

/**
 * ViewModel for Chat screen with SSE streaming support
 */
class ChatViewModel(application: Application) : AndroidViewModel(application) {
    
    private val chatRepository = ChatRepositoryImpl(application)
    
    // UI State
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()
    
    // Messages list
    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()
    
    // Streaming state
    val streamingState: StateFlow<StreamingState> = chatRepository.streamingState
    
    // Current streaming text accumulator
    private val streamingTextBuilder = StringBuilder()
    private var currentStreamingMessageId: String? = null
    private lateinit var currentSessionId: String
    
    init {
        // Session will be initialized via loadSession or startNewSession
    }
    
    /**
     * Check if we have an active session
     */
    fun hasActiveSession(): Boolean {
        return ::currentSessionId.isInitialized
    }
    
    /**
     * Start a new chat session
     */
    fun startNewSession() {
        viewModelScope.launch {
            val userId = SupabaseAuthClient.getUserId()!!
            val session = chatRepository.createSession(userId)
            currentSessionId = session.id
            _messages.value = emptyList()
            
            // Update UI to show initializing state
            _uiState.update { it.copy(
                currentInput = "",
                error = null,
                isInitialized = false,
                initError = null,
                sessionTitle = "New Chat",
                sessionId = session.id
            ) }
            
            // Initialize the chat on backend
            initializeChat()
        }
    }
    
    /**
     * Initialize chat session on backend
     */
    fun initializeChat() {
        if (!::currentSessionId.isInitialized) {
            startNewSession()
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(
                isInitialized = false,
                initError = null
            ) }
            
            val response = chatRepository.initializeChat(currentSessionId)
            
            if (response.success) {
                _uiState.update { it.copy(
                    isInitialized = true,
                    initError = null
                ) }
            } else {
                _uiState.update { it.copy(
                    isInitialized = false,
                    initError = "Failed to initialize chat. Please tap refresh to try again."
                ) }
            }
        }
    }
    
    /**
     * Load an existing session with its messages
     */
    fun loadSession(sessionId: String) {
        // Don't reload if it's the same session
        if (::currentSessionId.isInitialized && currentSessionId == sessionId) {
            return
        }
        
        viewModelScope.launch {
            currentSessionId = sessionId
            
            // Load messages for this session
            val sessionMessages = chatRepository.getSessionMessages(sessionId)
            _messages.value = sessionMessages
            
            // Update UI state
            _uiState.update { it.copy(
                currentInput = "",
                error = null,
                isInitialized = false,
                initError = null,
                sessionTitle = "Session ${sessionId.takeLast(4)}",
                sessionId = sessionId
            ) }
            
            // Initialize the chat on backend
            initializeChat()
        }
    }
    
    /**
     * Send a chat message and handle streaming response
     */
    fun sendMessage(text: String) {
        if (text.isBlank() || _uiState.value.isStreaming) return
        
        // Initialize session if not already done
        if (!::currentSessionId.isInitialized) {
            startNewSession()
            return
        }
        
        // Don't send if not initialized
        if (!_uiState.value.isInitialized) {
            _uiState.update { it.copy(
                initError = "Failed to initialize chat. Please tap refresh to try again."
            ) }
            return
        }
        
        viewModelScope.launch {
            // Add user message
            val userMessage = ChatMessage(
                content = text,
                role = MessageRole.USER,
                sessionId = currentSessionId
            )
            _messages.value = _messages.value + userMessage
            chatRepository.saveMessage(userMessage)
            
            // Clear input and start streaming
            _uiState.update { 
                it.copy(
                    currentInput = "",
                    isStreaming = true,
                    error = null
                )
            }
            
            // Prepare request
            val request = ChatRequest(
                message = text,
                useMemory = _uiState.value.useMemory,
                sessionId = currentSessionId
            )
            
            // Store request for retry
            _uiState.update { it.copy(lastRequest = request) }
            
            // Reset streaming state
            streamingTextBuilder.clear()
            currentStreamingMessageId = UUID.randomUUID().toString()
            
            // Add placeholder assistant message
            val assistantMessage = ChatMessage(
                id = currentStreamingMessageId!!,
                content = "",
                role = MessageRole.ASSISTANT,
                sessionId = currentSessionId
            )
            _messages.value = _messages.value + assistantMessage
            
            try {
                // Start SSE stream
                chatRepository.sendMessage(request)
                    .catch { exception ->
                        // Handle stream errors
                        handleStreamError(exception)
                    }
                    .collect { event ->
                        handleSSEEvent(event)
                    }
            } catch (e: Exception) {
                handleStreamError(e)
            } finally {
                _uiState.update { it.copy(isStreaming = false) }
            }
        }
    }
    
    /**
     * Handle incoming SSE events
     */
    private fun handleSSEEvent(event: SSEChatEvent) {
        when (event) {
            is SSEChatEvent.Token -> {
                // Append token to streaming text
                streamingTextBuilder.append(event.text)
                updateStreamingMessage(streamingTextBuilder.toString())
            }
            
            is SSEChatEvent.Usage -> {
                // Ignore usage events - we're not tracking costs/tokens
            }
            
            is SSEChatEvent.Done -> {
                // Stream completed
                finalizeStreamingMessage()
            }
            
            is SSEChatEvent.Error -> {
                // Show error in chat
                showErrorMessage(event.message)
                _uiState.update { it.copy(isStreaming = false) }
            }
            
            else -> {
                // Ignore other events like Heartbeat
            }
        }
    }
    
    /**
     * Update the streaming message content
     */
    private fun updateStreamingMessage(content: String) {
        val messageId = currentStreamingMessageId ?: return
        _messages.update { messages ->
            messages.map { message ->
                if (message.id == messageId) {
                    message.copy(content = content)
                } else {
                    message
                }
            }
        }
    }
    
    /**
     * Finalize streaming message
     */
    private fun finalizeStreamingMessage() {
        val messageId = currentStreamingMessageId ?: return
        val finalContent = streamingTextBuilder.toString()
        
        _messages.update { messages ->
            messages.map { message ->
                if (message.id == messageId) {
                    message.copy(
                        content = finalContent,
                        metadata = null  // No metadata tracking
                    )
                } else {
                    message
                }
            }
        }
        
        // Save to repository
        viewModelScope.launch {
            val finalMessage = _messages.value.find { it.id == messageId }
            finalMessage?.let { chatRepository.saveMessage(it) }
        }
    }
    
    /**
     * Handle stream errors
     */
    private fun handleStreamError(exception: Throwable) {
        val errorMessage = when (exception) {
            is ApiException.UnauthorizedException -> {
                "Session expired. Please login again."
            }
            is ApiException.RateLimitException -> {
                "Rate limit exceeded. Please wait a moment."
            }
            is ApiException.ServerException -> {
                "Server error. Please try again."
            }
            else -> {
                exception.message ?: "Connection error. Please try again."
            }
        }
        
        showErrorMessage(errorMessage)
        _uiState.update { 
            it.copy(
                isStreaming = false,
                error = errorMessage
            )
        }
    }
    
    /**
     * Show error message in chat
     */
    private fun showErrorMessage(error: String) {
        // Remove empty streaming message if exists
        currentStreamingMessageId?.let { messageId ->
            _messages.update { messages ->
                messages.filter { it.id != messageId }
            }
        }
        
        // Add error message
        val errorMessage = ChatMessage(
            content = "⚠️ $error",
            role = MessageRole.SYSTEM,
            sessionId = currentSessionId
        )
        _messages.value = _messages.value + errorMessage
    }
    
    /**
     * Retry last failed message
     */
    fun retryLastMessage() {
        _uiState.value.lastRequest?.let { request ->
            sendMessage(request.message)
        }
    }
    
    /**
     * Toggle memory usage
     */
    fun toggleMemory() {
        _uiState.update { it.copy(useMemory = !it.useMemory) }
    }
    
    
    /**
     * Update current input text
     */
    fun updateInput(text: String) {
        _uiState.update { it.copy(currentInput = text) }
    }
    
    /**
     * Clear error state
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
    
    /**
     * Cancel current streaming
     */
    fun cancelStreaming() {
        chatRepository.cancelStreaming()
        _uiState.update { it.copy(isStreaming = false) }
    }
    
    
    override fun onCleared() {
        super.onCleared()
        // Cancel any ongoing streaming
        chatRepository.cancelStreaming()
    }
}

/**
 * UI state for chat screen
 */
data class ChatUiState(
    val currentInput: String = "",
    val isStreaming: Boolean = false,
    val isInitialized: Boolean = false,
    val initError: String? = null,
    val useMemory: Boolean = true,
    val error: String? = null,
    val lastRequest: ChatRequest? = null,
    val sessionTitle: String = "New Chat",
    val sessionId: String? = null
)
