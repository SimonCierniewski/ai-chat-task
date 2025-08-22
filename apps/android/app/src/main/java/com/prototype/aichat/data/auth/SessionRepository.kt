package com.prototype.aichat.data.auth

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import io.github.jan.supabase.gotrue.user.UserSession
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Repository for managing user session persistence using DataStore
 */
class SessionRepository(private val context: Context) {
    
    private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(
        name = "auth_session"
    )
    
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }
    
    companion object {
        private val ACCESS_TOKEN_KEY = stringPreferencesKey("access_token")
        private val REFRESH_TOKEN_KEY = stringPreferencesKey("refresh_token")
        private val EXPIRES_AT_KEY = longPreferencesKey("expires_at")
        private val USER_ID_KEY = stringPreferencesKey("user_id")
        private val USER_EMAIL_KEY = stringPreferencesKey("user_email")
        private val USER_ROLE_KEY = stringPreferencesKey("user_role")
    }
    
    /**
     * Save session to persistent storage
     */
    suspend fun saveSession(session: UserSession) {
        context.dataStore.edit { preferences ->
            preferences[ACCESS_TOKEN_KEY] = session.accessToken
            preferences[REFRESH_TOKEN_KEY] = session.refreshToken ?: ""
            preferences[EXPIRES_AT_KEY] = session.expiresIn?.toLong() ?: 0L
            session.user?.let { user ->
                preferences[USER_ID_KEY] = user.id
                preferences[USER_EMAIL_KEY] = user.email ?: ""
                // Extract role from user metadata if available
                val role = user.userMetadata?.get("role")?.toString() ?: "user"
                preferences[USER_ROLE_KEY] = role
            }
        }
    }
    
    /**
     * Clear session from persistent storage
     */
    suspend fun clearSession() {
        context.dataStore.edit { preferences ->
            preferences.clear()
        }
    }
    
    /**
     * Get current session from storage
     */
    suspend fun getSession(): SavedSession? {
        return context.dataStore.data.map { preferences ->
            val accessToken = preferences[ACCESS_TOKEN_KEY]
            val refreshToken = preferences[REFRESH_TOKEN_KEY]
            val expiresAt = preferences[EXPIRES_AT_KEY] ?: 0L
            val userId = preferences[USER_ID_KEY]
            val userEmail = preferences[USER_EMAIL_KEY]
            val userRole = preferences[USER_ROLE_KEY]
            
            if (accessToken != null && userId != null) {
                SavedSession(
                    accessToken = accessToken,
                    refreshToken = refreshToken ?: "",
                    expiresAt = if (expiresAt > 0) expiresAt else null,
                    userId = userId,
                    userEmail = userEmail ?: "",
                    userRole = userRole ?: "user"
                )
            } else {
                null
            }
        }.first()
    }
    
    /**
     * Observe session changes
     */
    fun observeSession(): Flow<SavedSession?> {
        return context.dataStore.data.map { preferences ->
            val accessToken = preferences[ACCESS_TOKEN_KEY]
            val refreshToken = preferences[REFRESH_TOKEN_KEY]
            val expiresAt = preferences[EXPIRES_AT_KEY] ?: 0L
            val userId = preferences[USER_ID_KEY]
            val userEmail = preferences[USER_EMAIL_KEY]
            val userRole = preferences[USER_ROLE_KEY]
            
            if (accessToken != null && userId != null) {
                SavedSession(
                    accessToken = accessToken,
                    refreshToken = refreshToken ?: "",
                    expiresAt = if (expiresAt > 0) expiresAt else null,
                    userId = userId,
                    userEmail = userEmail ?: "",
                    userRole = userRole ?: "user"
                )
            } else {
                null
            }
        }
    }
    
    /**
     * Check if session is valid (not expired)
     */
    fun isSessionValid(session: SavedSession): Boolean {
        val now = System.currentTimeMillis()
        return session.expiresAt?.let { it > now } ?: false
    }
}

/**
 * Data class representing a saved session
 */
@Serializable
data class SavedSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: Long? = null,  // Changed from Date to Long
    val userId: String,
    val userEmail: String,
    val userRole: String = "user"
)
