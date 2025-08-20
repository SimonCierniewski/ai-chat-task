package com.prototype.aichat.data.api

import com.prototype.aichat.core.config.AppConfig
import com.prototype.aichat.data.sse.SSEClient
import com.prototype.aichat.domain.models.ChatRequest
import com.prototype.aichat.domain.models.SSEEvent
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor

/**
 * API service for chat endpoints
 */
class ChatApiService(
    private val authToken: String? = null
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }
    
    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = if (AppConfig.IS_DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        })
        .build()
    
    private val sseClient = SSEClient(okHttpClient)
    
    /**
     * Send a chat message and receive SSE stream
     */
    fun sendChatMessage(request: ChatRequest): Flow<SSEEvent> {
        val url = "${AppConfig.API_BASE_URL}/api/v1/chat"
        
        val headers = mutableMapOf<String, String>()
        authToken?.let { headers["Authorization"] = "Bearer $it" }
        headers["Content-Type"] = "application/json"
        
        val body = json.encodeToString(request)
            .toRequestBody("application/json".toMediaType())
        
        return sseClient.connectToSSE(url, headers, body)
    }
    
    /**
     * Disconnect SSE connection
     */
    fun disconnect() {
        sseClient.disconnect()
    }
}