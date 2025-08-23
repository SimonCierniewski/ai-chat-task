package com.prototype.aichat.data.api

import android.content.Context
import com.prototype.aichat.core.config.AppConfig
import com.prototype.aichat.data.auth.SupabaseAuthClient
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Typed API client with automatic auth header injection and error handling
 */
class ApiClient(
    private val context: Context,
) {
    
    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        encodeDefaults = true
    }
    
    val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor())
            .addInterceptor(ErrorInterceptor())
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = if (AppConfig.IS_DEBUG) {
                    HttpLoggingInterceptor.Level.BODY
                } else {
                    HttpLoggingInterceptor.Level.NONE
                }
            })
            .build()
    }
    
    /**
     * Separate client for SSE streaming without body logging
     * Body logging buffers the entire response, preventing real-time streaming
     */
    val sseOkHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS) // Longer timeout for streaming
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor())
            .addInterceptor(ErrorInterceptor())
            .addInterceptor(HttpLoggingInterceptor().apply {
                // Only log headers for SSE, not body
                level = if (AppConfig.IS_DEBUG) {
                    HttpLoggingInterceptor.Level.HEADERS
                } else {
                    HttpLoggingInterceptor.Level.NONE
                }
            })
            .build()
    }
    
    /**
     * Interceptor to add Authorization header to all requests
     */
    private inner class AuthInterceptor : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val originalRequest = chain.request()
            
            // Get access token from session repository
            val accessToken = runBlocking {
                SupabaseAuthClient.getCurrentSession()?.accessToken
            }
            
            val request = if (accessToken != null) {
                originalRequest.newBuilder()
                    .header("Authorization", "Bearer $accessToken")
                    .build()
            } else {
                originalRequest
            }
            
            return chain.proceed(request)
        }
    }
    
    /**
     * Interceptor to handle API errors consistently
     */
    private inner class ErrorInterceptor : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val request = chain.request()
            val response = chain.proceed(request)
            
            when (response.code) {
                401 -> throw ApiException.UnauthorizedException("Authentication required")
                403 -> throw ApiException.ForbiddenException("Access denied")
                429 -> throw ApiException.RateLimitException("Too many requests. Please try again later.")
                in 500..599 -> throw ApiException.ServerException("Server error: ${response.code}")
            }
            
            return response
        }
    }
    
    /**
     * Build a POST request with JSON body
     */
    inline fun <reified T> buildJsonRequest(url: String, body: T): Request {
        val jsonBody = json.encodeToString(body)
        val requestBody = jsonBody.toRequestBody("application/json".toMediaType())
        
        return Request.Builder()
            .url(url)
            .post(requestBody)
            .build()
    }
    
    /**
     * Build a GET request
     */
    fun buildGetRequest(url: String): Request {
        return Request.Builder()
            .url(url)
            .get()
            .build()
    }
    
    /**
     * Execute request and parse JSON response
     */
    inline fun <reified T> executeRequest(request: Request): T {
        okHttpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw ApiException.HttpException("API call failed: ${response.code}")
            }
            
            val responseBody = response.body?.string() 
                ?: throw ApiException.HttpException("Empty response body")
                
            return json.decodeFromString(responseBody)
        }
    }
}

/**
 * Custom exception types for API errors
 */
sealed class ApiException(message: String) : IOException(message) {
    class HttpException(message: String) : ApiException(message)
    class NetworkException(message: String) : ApiException(message)
    class ParseException(message: String) : ApiException(message)
    class UnauthorizedException(message: String) : ApiException(message)
    class ForbiddenException(message: String) : ApiException(message)
    class RateLimitException(message: String) : ApiException(message)
    class ServerException(message: String) : ApiException(message)
}
