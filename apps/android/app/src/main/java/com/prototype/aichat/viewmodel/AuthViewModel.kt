package com.prototype.aichat.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.prototype.aichat.data.AuthRepository
import com.prototype.aichat.data.AuthState
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class AuthViewModel(application: Application) : AndroidViewModel(application) {
    
    private val authRepository = AuthRepository(application.applicationContext)
    
    val authState: StateFlow<AuthState> = authRepository.authState
    
    suspend fun signInWithEmail(email: String) {
        authRepository.signInWithEmail(email)
    }
    
    suspend fun handleDeepLink(url: String) {
        authRepository.handleDeepLink(url)
    }
    
    suspend fun signOut() {
        authRepository.signOut()
    }
    
    fun getAccessToken(): String? {
        return authRepository.getAccessToken()
    }
}