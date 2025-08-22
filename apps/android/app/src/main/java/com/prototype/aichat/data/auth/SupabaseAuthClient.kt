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
import kotlinx.coroutines.flow.Flow

/**
 * Singleton Supabase client for authentication
 */
object SupabaseAuthClient {
    
    // Temporary storage for tokens from deep link
    // This is a workaround for SDK limitations
    private var tempAccessToken: String? = null
    private var tempRefreshToken: String? = null
    private var tempUserEmail: String? = null
    private var tempUserId: String? = null
    
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
        android.util.Log.d("SupabaseAuthClient", "handleDeepLink called with: $url")
        
        // The Supabase Kotlin SDK v2.x doesn't have a direct method to handle deep links
        // We need to parse and process the URL manually
        return handleDeepLinkManually(url)
    }
    
    /**
     * Manually parse and handle the deep link if SDK doesn't handle it
     */
    private suspend fun handleDeepLinkManually(url: String): Boolean {
        return try {
            val uri = android.net.Uri.parse(url)
            
            // Check if this is our app's deep link
            if (uri.scheme != AppConfig.DEEPLINK_SCHEME || uri.host != AppConfig.DEEPLINK_HOST) {
                android.util.Log.e("SupabaseAuthClient", "URL doesn't match our deep link pattern")
                return false
            }
            
            // Parse fragment for tokens or errors
            val fragment = uri.fragment ?: return false
            val params = fragment.split("&").associate {
                val parts = it.split("=")
                if (parts.size == 2) {
                    parts[0] to java.net.URLDecoder.decode(parts[1], "UTF-8")
                } else {
                    "" to ""
                }
            }
            
            // Check for errors
            val error = params["error"]
            if (error != null) {
                val errorCode = params["error_code"]
                val errorDescription = params["error_description"]
                
                val message = when (errorCode) {
                    "otp_expired" -> "Magic link has expired. Please request a new one."
                    "access_denied" -> errorDescription ?: "Access denied"
                    else -> errorDescription ?: "Authentication failed"
                }
                throw Exception(message)
            }
            
            // Extract tokens
            val accessToken = params["access_token"]
            val refreshToken = params["refresh_token"]
            
            if (accessToken != null && refreshToken != null) {
                android.util.Log.d("SupabaseAuthClient", "Tokens found, attempting to validate and save...")
                
                // Parse the JWT to get user info
                val tokenParts = accessToken.split(".")
                var userEmail = ""
                var userId = ""
                
                if (tokenParts.size == 3) {
                    try {
                        val payload = String(android.util.Base64.decode(tokenParts[1], android.util.Base64.URL_SAFE))
                        android.util.Log.d("SupabaseAuthClient", "Token payload: $payload")
                        
                        // Parse JSON manually to extract email and sub (user ID)
                        val emailMatch = """"email":"([^"]+)"""".toRegex().find(payload)
                        val subMatch = """"sub":"([^"]+)"""".toRegex().find(payload)
                        
                        userEmail = emailMatch?.groupValues?.get(1) ?: ""
                        userId = subMatch?.groupValues?.get(1) ?: ""
                        
                        android.util.Log.d("SupabaseAuthClient", "Extracted - Email: $userEmail, UserID: $userId")
                    } catch (e: Exception) {
                        android.util.Log.e("SupabaseAuthClient", "Error parsing JWT", e)
                    }
                }
                
                // Create a manual session for the app to use
                // The session repository will save these tokens
                if (userEmail.isNotEmpty() && userId.isNotEmpty()) {
                    // Create a UserSession manually (this is a workaround)
                    // The app will use these tokens for API calls
                    
                    // Store tokens in a global variable temporarily
                    // This is not ideal but necessary due to SDK limitations
                    tempAccessToken = accessToken
                    tempRefreshToken = refreshToken
                    tempUserEmail = userEmail
                    tempUserId = userId
                    
                    android.util.Log.d("SupabaseAuthClient", "Tokens saved temporarily for session creation")
                    return true
                }
                
                android.util.Log.e("SupabaseAuthClient", "Could not extract user info from token")
                return false
            }
            
            false
        } catch (e: Exception) {
            android.util.Log.e("SupabaseAuthClient", "Error in manual deep link handling", e)
            throw e
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
        return auth.currentSessionOrNull() != null || tempAccessToken != null
    }
    
    /**
     * Get current access token
     */
    fun getAccessToken(): String? {
        // First check if we have a proper session
        val sessionToken = auth.currentSessionOrNull()?.accessToken
        if (sessionToken != null) return sessionToken
        
        // Fall back to temporary token if available
        return tempAccessToken
    }
    
    /**
     * Get current user ID
     */
    fun getUserId(): String? {
        val sessionUserId = auth.currentUserOrNull()?.id
        if (sessionUserId != null) return sessionUserId
        
        return tempUserId
    }
    
    /**
     * Get current user email
     */
    fun getUserEmail(): String? {
        val sessionEmail = auth.currentUserOrNull()?.email
        if (sessionEmail != null) return sessionEmail
        
        return tempUserEmail
    }
    
    /**
     * Get temporary tokens for session creation
     * This is a workaround for SDK limitations
     */
    fun getTempTokens(): Pair<String?, String?>? {
        return if (tempAccessToken != null && tempRefreshToken != null) {
            Pair(tempAccessToken, tempRefreshToken)
        } else {
            null
        }
    }
    
    /**
     * Clear temporary tokens after they've been saved
     */
    fun clearTempTokens() {
        tempAccessToken = null
        tempRefreshToken = null
        tempUserEmail = null
        tempUserId = null
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
