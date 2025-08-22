package com.prototype.aichat.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.prototype.aichat.data.auth.SupabaseAuthClient
import io.github.jan.supabase.gotrue.SessionStatus
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

/**
 * ViewModel for authentication functionality with magic link support
 */
class AuthViewModel(application: Application) : AndroidViewModel(application) {
    
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
                        _uiState.update { 
                            it.copy(
                                isAuthenticated = true,
                                isLoading = false,
                                userEmail = SupabaseAuthClient.getUserEmail()
                            )
                        }
                    }
                    is SessionStatus.NotAuthenticated -> {
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
     * Sign out current user
     */
    fun signOut() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            
            try {
                SupabaseAuthClient.signOut()
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
