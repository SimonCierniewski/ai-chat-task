package com.prototype.aichat.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.prototype.aichat.data.auth.SupabaseAuthClient
import io.github.jan.supabase.gotrue.SessionStatus
import io.github.jan.supabase.gotrue.user.UserSession
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

// Extension property to get DataStore instance
val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "auth_prefs")

class AuthRepository(private val context: Context) {
    
    private val _authState = MutableStateFlow<AuthState>(AuthState.Loading)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()
    
    private val sessionKey = stringPreferencesKey("session")
    
    init {
        // Initialize auth state from Supabase
        loadSession()
        
        // Listen to auth state changes
        GlobalScope.launch {
            SupabaseAuthClient.auth.sessionStatus.collect { status ->
                when (status) {
                    is SessionStatus.Authenticated -> {
                        _authState.value = AuthState.Authenticated(status.session)
                        saveSession(status.session)
                    }
                    is SessionStatus.NotAuthenticated -> {
                        _authState.value = AuthState.NotAuthenticated
                        clearSession()
                    }
                    SessionStatus.LoadingFromStorage -> {
                        _authState.value = AuthState.Loading
                    }
                    is SessionStatus.NetworkError -> {
                        _authState.value = AuthState.Error("Network error: ${status}")
                    }
                }
            }
        }
    }
    
    private fun loadSession() {
        // Session is automatically loaded by Supabase client
        val session = SupabaseAuthClient.auth.currentSessionOrNull()
        _authState.value = if (session != null) {
            AuthState.Authenticated(session)
        } else {
            AuthState.NotAuthenticated
        }
    }
    
    private suspend fun saveSession(session: UserSession) {
        context.dataStore.edit { preferences ->
            preferences[sessionKey] = Json.encodeToString(session)
        }
    }
    
    private suspend fun clearSession() {
        context.dataStore.edit { preferences ->
            preferences.remove(sessionKey)
        }
    }
}

sealed class AuthState {
    object Loading : AuthState()
    object NotAuthenticated : AuthState()
    data class MagicLinkSent(val email: String) : AuthState()
    data class Authenticated(val session: UserSession) : AuthState()
    data class Error(val message: String) : AuthState()
}
