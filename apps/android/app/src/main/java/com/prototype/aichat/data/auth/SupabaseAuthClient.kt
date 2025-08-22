package com.prototype.aichat.data.auth

import android.net.Uri
import com.prototype.aichat.core.config.AppConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.gotrue.OtpType
import io.github.jan.supabase.gotrue.SessionStatus
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.gotrue.providers.builtin.OTP
import io.github.jan.supabase.gotrue.user.UserSession
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import kotlinx.coroutines.flow.Flow
import androidx.core.net.toUri

/**
 * Singleton Supabase client for authentication
 */
object SupabaseAuthClient {
    
    private val supabaseClient: SupabaseClient by lazy {
        createSupabaseClient(
            supabaseUrl = AppConfig.SUPABASE_URL,
            supabaseKey = AppConfig.SUPABASE_ANON_KEY
        ) {
            install(Auth) {
                // Configure deep link for auth callback
                scheme = AppConfig.DEEPLINK_SCHEME
                host = AppConfig.DEEPLINK_HOST
                
                // Auto-refresh sessions
                alwaysAutoRefresh = true
            }
            
            install(Postgrest) {
                // Use default serializer
            }
            install(Realtime)
        }
    }
    
    val auth: Auth get() = supabaseClient.auth

    private var magicLinkEmail: String? = null

    /**
     * Send magic link to email
     */
    suspend fun sendMagicLink(email: String) {
        magicLinkEmail = email
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
            // Parse the URL and extract tokens
            val uri = url.replaceFirst("#", "?").toUri()
            val accessToken = uri.getQueryParameter("access_token")
            val refreshToken = uri.getQueryParameter("refresh_token")
            
            if (magicLinkEmail != null && accessToken != null) {
                auth.verifyEmailOtp(type = OtpType.Email.EMAIL, email = magicLinkEmail!!, token = accessToken)
                true
            } else {
                false
            }
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
