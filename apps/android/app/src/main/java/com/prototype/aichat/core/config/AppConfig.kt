package com.prototype.aichat.core.config

import com.prototype.aichat.BuildConfig

/**
 * Central configuration object for the app.
 * All environment-specific values are injected via BuildConfig.
 */
object AppConfig {
    // Supabase Configuration
    val SUPABASE_URL = BuildConfig.SUPABASE_URL
    val SUPABASE_ANON_KEY = BuildConfig.SUPABASE_ANON_KEY
    
    // API Configuration
    val API_BASE_URL = BuildConfig.API_BASE_URL
    
    // Deep Link Configuration
    val DEEPLINK_SCHEME = BuildConfig.APP_DEEPLINK_SCHEME
    val DEEPLINK_HOST = BuildConfig.APP_DEEPLINK_HOST
    
    // Feature Flags (can be expanded based on build variant)
    val IS_DEBUG = BuildConfig.DEBUG
    
    // SSE Configuration
    const val SSE_TIMEOUT_SECONDS = 30L
    const val SSE_RECONNECT_DELAY_MS = 1000L
    const val SSE_MAX_RECONNECT_ATTEMPTS = 3
    
    // Cache Configuration
    const val CACHE_SIZE_MB = 10L
    const val CACHE_EXPIRY_HOURS = 24L
    
    // UI Configuration
    const val MESSAGE_MAX_LENGTH = 2000
    const val TYPING_DEBOUNCE_MS = 300L
}