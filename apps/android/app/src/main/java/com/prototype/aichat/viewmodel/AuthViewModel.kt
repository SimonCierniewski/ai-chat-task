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
                android.util.Log.d("AuthViewModel", "Session status changed: ${status::class.simpleName}")
                
                when (status) {
                    is SessionStatus.Authenticated -> {
                        android.util.Log.d("AuthViewModel", "User authenticated! Email: ${status.session.user?.email}")
                        
                        // Save session to persistent storage
                        sessionRepository.saveSession(status.session)
                        _uiState.update { 
                            it.copy(
                                isAuthenticated = true,
                                isLoading = false,
                                userEmail = SupabaseAuthClient.getUserEmail(),
                                emailSent = false // Reset email sent state
                            )
                        }
                    }
                    is SessionStatus.NotAuthenticated -> {
                        android.util.Log.d("AuthViewModel", "User not authenticated")
                        
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
                        android.util.Log.d("AuthViewModel", "Loading session from storage...")
                        _uiState.update { it.copy(isLoading = true) }
                    }
                    is SessionStatus.NetworkError -> {
                        android.util.Log.e("AuthViewModel", "Network error in session status")
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
        android.util.Log.d("AuthViewModel", "handleDeepLink called with URL: $url")
        
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            android.util.Log.d("AuthViewModel", "Starting deep link processing...")
            
            try {
                val success = SupabaseAuthClient.handleDeepLink(url)
                android.util.Log.d("AuthViewModel", "Deep link processing result: $success")
                
                if (!success) {
                    android.util.Log.e("AuthViewModel", "Deep link processing failed")
                    _uiState.update { 
                        it.copy(
                            isLoading = false,
                            error = "Invalid or expired magic link"
                        )
                    }
                } else {
                    android.util.Log.d("AuthViewModel", "Deep link processed successfully")
                    
                    // Since the SDK can't create a proper session, we'll work with the tokens directly
                    // Update the UI to show we're authenticated
                    _uiState.update { 
                        it.copy(
                            isAuthenticated = true,
                            isLoading = false,
                            userEmail = SupabaseAuthClient.getUserEmail(),
                            emailSent = false
                        )
                    }
                    
                    // Save the tokens to persistent storage via a workaround
                    val tokens = SupabaseAuthClient.getTempTokens()
                    if (tokens != null) {
                        // Create a fake session for storage
                        // This is a workaround for SDK limitations
                        val fakeSession = io.github.jan.supabase.gotrue.user.UserSession(
                            accessToken = tokens.first!!,
                            refreshToken = tokens.second!!,
                            expiresIn = 3600,
                            tokenType = "bearer",
                            user = null
                        )
                        sessionRepository.saveSession(fakeSession)
                        android.util.Log.d("AuthViewModel", "Tokens saved to persistent storage")
                    }
                }
                // If successful, session observer will handle the rest
            } catch (e: Exception) {
                android.util.Log.e("AuthViewModel", "Exception in handleDeepLink", e)
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = e.message ?: "Failed to process magic link",
                        emailSent = false // Allow user to request new magic link
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