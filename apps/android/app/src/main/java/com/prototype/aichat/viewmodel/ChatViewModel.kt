package com.prototype.aichat.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.prototype.aichat.data.repository.ChatRepositoryImpl
import com.prototype.aichat.domain.models.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID

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
    private var currentSessionId: String = UUID.randomUUID().toString()
    
    init {
        // Create initial session
        viewModelScope.launch {
            val session = chatRepository.createSession("user-id")
            currentSessionId = session.id
        }
    }
    
    /**
     * Send a chat message and handle streaming response
     */
    fun sendMessage(text: String) {
        if (text.isBlank() || _uiState.value.isStreaming) return
        
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
                sessionId = currentSessionId,
                model = _uiState.value.selectedModel
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
    private fun handleSSEEvent(event: SSEEvent) {
        when (event.event) {
            "token" -> {
                // Append token to streaming text
                streamingTextBuilder.append(event.data)
                updateStreamingMessage(streamingTextBuilder.toString())
            }
            
            "usage" -> {
                // Parse usage data and update message metadata
                try {
                    val usage = parseUsageData(event.data)
                    finalizeStreamingMessage(usage)
                } catch (e: Exception) {
                    // If parsing fails, just finalize without usage
                    finalizeStreamingMessage(null)
                }
            }
            
            "done" -> {
                // Stream completed
                if (!hasUsageData()) {
                    finalizeStreamingMessage(null)
                }
            }
            
            "error" -> {
                // Show error in chat
                showErrorMessage(event.data)
                _uiState.update { it.copy(isStreaming = false) }
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
     * Finalize streaming message with usage data
     */
    private fun finalizeStreamingMessage(metadata: MessageMetadata?) {
        val messageId = currentStreamingMessageId ?: return
        val finalContent = streamingTextBuilder.toString()
        
        _messages.update { messages ->
            messages.map { message ->
                if (message.id == messageId) {
                    message.copy(
                        content = finalContent,
                        metadata = metadata
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
        
        // Get TTFT if available
        val ttft = chatRepository.getCurrentTTFT()
        if (ttft != null) {
            _uiState.update { it.copy(lastTTFT = ttft) }
        }
    }
    
    /**
     * Handle stream errors
     */
    private fun handleStreamError(exception: Throwable) {
        val errorMessage = when (exception) {
            is com.prototype.aichat.data.api.UnauthorizedException -> {
                "Session expired. Please login again."
            }
            is com.prototype.aichat.data.api.RateLimitException -> {
                "Rate limit exceeded. Please wait a moment."
            }
            is com.prototype.aichat.data.api.ServerException -> {
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
     * Select model
     */
    fun selectModel(model: String) {
        _uiState.update { it.copy(selectedModel = model) }
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
    
    /**
     * Parse usage data from JSON string
     */
    private fun parseUsageData(data: String): MessageMetadata {
        // Simple parsing - in production use proper JSON parser
        val tokensInMatch = "\"tokens_in\":(\\d+)".toRegex().find(data)
        val tokensOutMatch = "\"tokens_out\":(\\d+)".toRegex().find(data)
        val costMatch = "\"cost_usd\":([0-9.]+)".toRegex().find(data)
        val modelMatch = "\"model\":\"([^\"]+)\"".toRegex().find(data)
        
        return MessageMetadata(
            tokensIn = tokensInMatch?.groupValues?.get(1)?.toIntOrNull(),
            tokensOut = tokensOutMatch?.groupValues?.get(1)?.toIntOrNull(),
            costUsd = costMatch?.groupValues?.get(1)?.toDoubleOrNull(),
            model = modelMatch?.groupValues?.get(1),
            ttftMs = chatRepository.getCurrentTTFT()
        )
    }
    
    /**
     * Check if current message has usage data
     */
    private fun hasUsageData(): Boolean {
        val messageId = currentStreamingMessageId ?: return false
        return _messages.value.find { it.id == messageId }?.metadata != null
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
    val useMemory: Boolean = true,
    val selectedModel: String = "gpt-4-mini",
    val availableModels: List<String> = listOf(
        "gpt-4-mini",
        "gpt-4",
        "gpt-4-turbo",
        "gpt-3.5-turbo"
    ),
    val error: String? = null,
    val lastRequest: ChatRequest? = null,
    val lastTTFT: Long? = null
)