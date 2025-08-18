package com.prototype.aichat.data

import com.prototype.aichat.BuildConfig
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.gotrue.providers.builtin.OTP
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.ktor.client.engine.android.Android
import kotlinx.serialization.json.Json

object SupabaseClient {
    val client = createSupabaseClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseKey = BuildConfig.SUPABASE_ANON_KEY
    ) {
        defaultSerializer = Json {
            ignoreUnknownKeys = true
            isLenient = true
        }
        
        install(Auth) {
            // Configure deep link for auth callback
            scheme = BuildConfig.APP_DEEPLINK_SCHEME
            host = BuildConfig.APP_DEEPLINK_HOST
            
            // Use Android Ktor engine
            httpEngine = Android.create()
        }
        
        install(Postgrest)
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
            auth.handleDeeplinks(url)
            true
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