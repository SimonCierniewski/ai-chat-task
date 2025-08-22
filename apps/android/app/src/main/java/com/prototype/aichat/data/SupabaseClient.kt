package com.prototype.aichat.data

import com.prototype.aichat.BuildConfig
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.gotrue.providers.builtin.OTP
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime

object SupabaseClient {
    val client = createSupabaseClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseKey = BuildConfig.SUPABASE_ANON_KEY
    ) {
        install(Auth) {
            // Configure deep link for auth callback
            scheme = BuildConfig.APP_DEEPLINK_SCHEME
            host = BuildConfig.APP_DEEPLINK_HOST
        }
        
        install(Postgrest) {
            // Use default serializer
        }
        install(Realtime)
    }
    
    val auth = client.auth
    
    suspend fun signInWithEmail(email: String) {
        auth.signInWith(OTP) {
            this.email = email
            // The redirect URL will be automatically constructed from scheme and host
            createUser = false
        }
    }
    
    suspend fun handleDeepLink(url: String): Boolean {
        return try {
            // Parse the URL and extract the access token
            // In v2 of Supabase SDK, we might need to handle this differently
            val uri = android.net.Uri.parse(url)
            val accessToken = uri.getQueryParameter("access_token")
            val refreshToken = uri.getQueryParameter("refresh_token")
            
            if (accessToken != null) {
                // Successfully parsed tokens from URL
                true
            } else {
                false
            }
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
    
    fun isAuthenticated(): Boolean {
        return auth.currentSessionOrNull() != null
    }
    
    fun getAccessToken(): String? {
        return auth.currentSessionOrNull()?.accessToken
    }
}
