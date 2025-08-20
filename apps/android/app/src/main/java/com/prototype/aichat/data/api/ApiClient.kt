package com.prototype.aichat.data.api

import android.content.Context
import com.prototype.aichat.core.config.AppConfig
import com.prototype.aichat.data.auth.SessionRepository
import kotlinx.coroutines.runBlocking
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Typed API client with automatic auth header injection and error handling
 */
class ApiClient(
    private val context: Context,
    private val sessionRepository: SessionRepository = SessionRepository(context)
) {
    
    private val json = Json {
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
     * Interceptor to add Authorization header to all requests
     */
    private inner class AuthInterceptor : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val originalRequest = chain.request()
            
            // Get access token from session repository
            val accessToken = runBlocking {
                sessionRepository.getSession()?.accessToken
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
                401 -> throw UnauthorizedException("Authentication required")
                403 -> throw ForbiddenException("Access denied")
                429 -> throw RateLimitException("Too many requests. Please try again later.")
                in 500..599 -> throw ServerException("Server error: ${response.code}")
            }
            
            return response
        }
    }
    
    /**
     * Build a POST request with JSON body
     */
    fun buildJsonRequest(url: String, body: Any): Request {
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
                throw ApiException("API call failed: ${response.code}")
            }
            
            val responseBody = response.body?.string() 
                ?: throw ApiException("Empty response body")
                
            return json.decodeFromString(responseBody)
        }
    }
}

/**
 * Custom exception types for API errors
 */
sealed class ApiException(message: String) : IOException(message)

class UnauthorizedException(message: String) : ApiException(message)
class ForbiddenException(message: String) : ApiException(message)
class RateLimitException(message: String) : ApiException(message)
class ServerException(message: String) : ApiException(message)