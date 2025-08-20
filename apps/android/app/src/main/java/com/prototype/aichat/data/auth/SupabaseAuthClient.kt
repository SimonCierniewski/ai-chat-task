package com.prototype.aichat.data.auth

import com.prototype.aichat.core.config.AppConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.gotrue.SessionStatus
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.gotrue.providers.builtin.OTP
import io.github.jan.supabase.gotrue.user.UserSession
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.ktor.client.engine.android.Android
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json

/**
 * Singleton Supabase client for authentication
 */
object SupabaseAuthClient {
    
    private val supabaseClient: SupabaseClient by lazy {
        createSupabaseClient(
            supabaseUrl = AppConfig.SUPABASE_URL,
            supabaseKey = AppConfig.SUPABASE_ANON_KEY
        ) {
            defaultSerializer = Json {
                ignoreUnknownKeys = true
                isLenient = true
                coerceInputValues = true
            }
            
            install(Auth) {
                // Configure deep link for auth callback
                scheme = AppConfig.DEEPLINK_SCHEME
                host = AppConfig.DEEPLINK_HOST
                
                // Use Android Ktor engine
                httpEngine = Android.create()
                
                // Auto-refresh sessions
                alwaysAutoRefresh = true
                autoRefreshPeriod = 30 // seconds before expiry
            }
            
            install(Postgrest)
            install(Realtime)
        }
    }
    
    val auth: Auth get() = supabaseClient.auth
    
    /**
     * Send magic link to email
     */
    suspend fun sendMagicLink(email: String) {
        auth.signInWith(OTP) {
            this.email = email
            createUser = true // Create user if doesn't exist
        }
    }
    
    /**
     * Handle deep link from magic link email
     */
    suspend fun handleDeepLink(url: String): Boolean {
        return try {
            auth.handleDeeplinks(url)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
    
    /**
     * Sign out current user
     */
    suspend fun signOut() {
        auth.signOut()
    }
    
    /**
     * Get current session
     */
    fun getCurrentSession(): UserSession? {
        return auth.currentSessionOrNull()
    }
    
    /**
     * Observe session changes
     */
    fun observeSessionStatus(): Flow<SessionStatus> {
        return auth.sessionStatus
    }
    
    /**
     * Check if user is authenticated
     */
    fun isAuthenticated(): Boolean {
        return auth.currentSessionOrNull() != null
    }
    
    /**
     * Get current access token
     */
    fun getAccessToken(): String? {
        return auth.currentSessionOrNull()?.accessToken
    }
    
    /**
     * Get current user ID
     */
    fun getUserId(): String? {
        return auth.currentUserOrNull()?.id
    }
    
    /**
     * Get current user email
     */
    fun getUserEmail(): String? {
        return auth.currentUserOrNull()?.email
    }
    
    /**
     * Restore session from saved tokens
     */
    suspend fun restoreSession(accessToken: String, refreshToken: String) {
        try {
            auth.retrieveUser(accessToken)
            auth.refreshCurrentSession()
        } catch (e: Exception) {
            // Session invalid, user needs to login again
            e.printStackTrace()
        }
    }
}