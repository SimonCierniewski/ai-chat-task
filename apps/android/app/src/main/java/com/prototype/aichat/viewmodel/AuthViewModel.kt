package com.prototype.aichat.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.prototype.aichat.data.auth.SessionRepository
import com.prototype.aichat.data.auth.SupabaseAuthClient
import io.github.jan.supabase.gotrue.SessionStatus
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * ViewModel for authentication functionality with magic link support
 */
class AuthViewModel(application: Application) : AndroidViewModel(application) {
    
    private val sessionRepository = SessionRepository.getInstance(application)
    
    // UI State
    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()
    
    // Session state
    val sessionStatus: Flow<SessionStatus> = SupabaseAuthClient.observeSessionStatus()
    
    init {
        // Observe session changes and persist them
        viewModelScope.launch {
            sessionStatus.collect { status ->
                when (status) {
                    is SessionStatus.Authenticated -> {
                        // Save session to persistent storage
                        sessionRepository.saveSession(status.session)
                        _uiState.update { 
                            it.copy(
                                isAuthenticated = true,
                                isLoading = false,
                                userEmail = SupabaseAuthClient.getUserEmail()
                            )
                        }
                    }
                    is SessionStatus.NotAuthenticated -> {
                        // Clear session from storage
                        sessionRepository.clearSession()
                        _uiState.update { 
                            it.copy(
                                isAuthenticated = false,
                                isLoading = false,
                                userEmail = null
                            )
                        }
                    }
                    is SessionStatus.LoadingFromStorage -> {
                        _uiState.update { it.copy(isLoading = true) }
                    }
                    is SessionStatus.NetworkError -> {
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                error = "Network error. Please check your connection."
                            )
                        }
                    }
                }
            }
        }
        
        // Try to restore session on app start
        restoreSession()
    }
    
    /**
     * Send magic link to email
     */
    fun sendMagicLink(email: String) {
        if (!isValidEmail(email)) {
            _uiState.update { it.copy(error = "Please enter a valid email address") }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { 
                it.copy(
                    isLoading = true, 
                    error = null,
                    emailSent = false
                )
            }
            
            try {
                SupabaseAuthClient.sendMagicLink(email)
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        emailSent = true,
                        emailSentTo = email,
                        error = null
                    )
                }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "Failed to send magic link"
                    )
                }
            }
        }
    }
    
    /**
     * Handle deep link from magic link
     */
    fun handleDeepLink(url: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            
            try {
                val success = SupabaseAuthClient.handleDeepLink(url)
                if (!success) {
                    _uiState.update { 
                        it.copy(
                            isLoading = false,
                            error = "Invalid or expired magic link"
                        )
                    }
                }
                // If successful, session observer will handle the rest
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "Failed to process magic link"
                    )
                }
            }
        }
    }
    
    /**
     * Sign out current user
     */
    fun signOut() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            
            try {
                SupabaseAuthClient.signOut()
                sessionRepository.clearSession()
                _uiState.update { 
                    AuthUiState() // Reset to initial state
                }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "Failed to sign out"
                    )
                }
            }
        }
    }
    
    /**
     * Restore session from persistent storage
     */
    private fun restoreSession() {
        viewModelScope.launch {
            try {
                val savedSession = sessionRepository.getSession()
                if (savedSession != null && sessionRepository.isSessionValid(savedSession)) {
                    SupabaseAuthClient.restoreSession(
                        savedSession.accessToken,
                        savedSession.refreshToken
                    )
                }
            } catch (e: Exception) {
                // Session restoration failed, user needs to login
                e.printStackTrace()
            }
        }
    }
    
    /**
     * Get current access token for API calls
     */
    fun getAccessToken(): String? {
        return SupabaseAuthClient.getAccessToken()
    }
    
    /**
     * Clear error message
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
    
    /**
     * Reset email sent state
     */
    fun resetEmailSentState() {
        _uiState.update { it.copy(emailSent = false, emailSentTo = null) }
    }
    
    /**
     * Validate email format
     */
    private fun isValidEmail(email: String): Boolean {
        return android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()
    }
}

/**
 * UI state for authentication screen
 */
data class AuthUiState(
    val isLoading: Boolean = false,
    val isAuthenticated: Boolean = false,
    val emailSent: Boolean = false,
    val emailSentTo: String? = null,
    val userEmail: String? = null,
    val error: String? = null
)