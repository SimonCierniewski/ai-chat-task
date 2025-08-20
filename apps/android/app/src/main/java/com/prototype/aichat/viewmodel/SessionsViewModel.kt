package com.prototype.aichat.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.prototype.aichat.data.repository.SessionsRepository
import com.prototype.aichat.domain.models.ChatMessage
import com.prototype.aichat.domain.models.ChatSession
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * ViewModel for Sessions and History screens
 */
class SessionsViewModel(application: Application) : AndroidViewModel(application) {
    
    private val sessionsRepository = SessionsRepository(application)
    
    // UI State
    private val _uiState = MutableStateFlow(SessionsUiState())
    val uiState: StateFlow<SessionsUiState> = _uiState.asStateFlow()
    
    // Sessions list
    val sessions: StateFlow<List<ChatSession>> = sessionsRepository.getAllSessions()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )
    
    // Current session messages for history view
    private val _currentSessionMessages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val currentSessionMessages: StateFlow<List<ChatMessage>> = _currentSessionMessages.asStateFlow()
    
    // Current session info
    private val _currentSession = MutableStateFlow<ChatSession?>(null)
    val currentSession: StateFlow<ChatSession?> = _currentSession.asStateFlow()
    
    /**
     * Create a new session
     */
    fun createNewSession(userId: String, title: String? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            
            try {
                val session = sessionsRepository.createSession(userId, title)
                _currentSession.value = session
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        selectedSessionId = session.id
                    )
                }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "Failed to create session"
                    )
                }
            }
        }
    }
    
    /**
     * Load session for continuation or history view
     */
    fun loadSession(sessionId: String) {
        viewModelScope.launch {
            _uiState.update { 
                it.copy(
                    isLoadingMessages = true,
                    selectedSessionId = sessionId,
                    error = null
                )
            }
            
            try {
                // Get session info
                val session = sessionsRepository.getSession(sessionId)
                _currentSession.value = session
                
                // Load messages
                sessionsRepository.getSessionMessages(sessionId)
                    .catch { e ->
                        _uiState.update { 
                            it.copy(
                                isLoadingMessages = false,
                                error = e.message ?: "Failed to load messages"
                            )
                        }
                    }
                    .collect { messages ->
                        _currentSessionMessages.value = messages
                        _uiState.update { 
                            it.copy(isLoadingMessages = false)
                        }
                    }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isLoadingMessages = false,
                        error = e.message ?: "Failed to load session"
                    )
                }
            }
        }
    }
    
    /**
     * Refresh sessions from server
     */
    fun refreshSessions() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, error = null) }
            
            try {
                sessionsRepository.refreshSessions()
                _uiState.update { it.copy(isRefreshing = false) }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isRefreshing = false,
                        error = e.message ?: "Failed to refresh sessions"
                    )
                }
            }
        }
    }
    
    /**
     * Refresh messages for current session
     */
    fun refreshCurrentSessionMessages() {
        val sessionId = _uiState.value.selectedSessionId ?: return
        
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, error = null) }
            
            try {
                sessionsRepository.refreshSessionMessages(sessionId)
                _uiState.update { it.copy(isRefreshing = false) }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isRefreshing = false,
                        error = e.message ?: "Failed to refresh messages"
                    )
                }
            }
        }
    }
    
    /**
     * Delete a session
     */
    fun deleteSession(sessionId: String) {
        viewModelScope.launch {
            try {
                sessionsRepository.deleteSession(sessionId)
                
                // Clear current session if it was deleted
                if (_currentSession.value?.id == sessionId) {
                    _currentSession.value = null
                    _currentSessionMessages.value = emptyList()
                }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        error = e.message ?: "Failed to delete session"
                    )
                }
            }
        }
    }
    
    /**
     * Update session title
     */
    fun updateSessionTitle(sessionId: String, newTitle: String) {
        viewModelScope.launch {
            try {
                val session = sessionsRepository.getSession(sessionId)
                if (session != null) {
                    val updated = session.copy(title = newTitle)
                    sessionsRepository.updateSession(updated)
                    
                    // Update current session if it's the one being edited
                    if (_currentSession.value?.id == sessionId) {
                        _currentSession.value = updated
                    }
                }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        error = e.message ?: "Failed to update session"
                    )
                }
            }
        }
    }
    
    /**
     * Clear error state
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
    
    /**
     * Get formatted session info
     */
    fun getSessionInfo(session: ChatSession): SessionInfo {
        return SessionInfo(
            id = session.id,
            displayName = session.title ?: "Session ${session.id.take(8)}",
            messageCount = session.messageCount,
            lastActivity = formatLastActivity(session.lastMessageAt ?: session.createdAt),
            createdAt = formatDate(session.createdAt)
        )
    }
    
    /**
     * Format last activity time
     */
    private fun formatLastActivity(timestamp: Long): String {
        val now = System.currentTimeMillis()
        val diff = now - timestamp
        
        return when {
            diff < 60_000 -> "Just now"
            diff < 3_600_000 -> "${diff / 60_000} minutes ago"
            diff < 86_400_000 -> "${diff / 3_600_000} hours ago"
            diff < 604_800_000 -> "${diff / 86_400_000} days ago"
            else -> formatDate(timestamp)
        }
    }
    
    /**
     * Format date
     */
    private fun formatDate(timestamp: Long): String {
        val formatter = java.text.SimpleDateFormat("MMM dd, yyyy", java.util.Locale.getDefault())
        return formatter.format(java.util.Date(timestamp))
    }
}

/**
 * UI state for sessions screen
 */
data class SessionsUiState(
    val isLoading: Boolean = false,
    val isLoadingMessages: Boolean = false,
    val isRefreshing: Boolean = false,
    val selectedSessionId: String? = null,
    val error: String? = null
)

/**
 * Formatted session information for display
 */
data class SessionInfo(
    val id: String,
    val displayName: String,
    val messageCount: Int,
    val lastActivity: String,
    val createdAt: String
)