package com.prototype.aichat.data.metrics

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Repository for tracking performance metrics
 * Used for diagnostics and monitoring
 */
class MetricsRepository private constructor(context: Context) {
    
    companion object {
        private const val PREFS_NAME = "metrics_prefs"
        private const val KEY_LAST_TTFT = "last_ttft"
        private const val KEY_LAST_SSE_STATUS = "last_sse_status"
        private const val KEY_TOTAL_MESSAGES = "total_messages"
        
        @Volatile
        private var INSTANCE: MetricsRepository? = null
        
        fun getInstance(context: Context): MetricsRepository {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: MetricsRepository(context.applicationContext).also { INSTANCE = it }
            }
        }
    }
    
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    private val _metricsFlow = MutableStateFlow(loadMetrics())
    val metricsFlow: StateFlow<Metrics> = _metricsFlow.asStateFlow()
    
    /**
     * Update TTFT (Time To First Token) metric
     */
    fun updateTTFT(ttftMs: Long) {
        prefs.edit().putLong(KEY_LAST_TTFT, ttftMs).apply()
        _metricsFlow.value = _metricsFlow.value.copy(lastTTFT = ttftMs)
    }
    
    /**
     * Update SSE connection status
     */
    fun updateSSEStatus(status: String) {
        prefs.edit().putString(KEY_LAST_SSE_STATUS, status).apply()
        _metricsFlow.value = _metricsFlow.value.copy(lastSSEStatus = status)
    }
    
    /**
     * Update active connection count
     */
    fun updateActiveConnections(count: Int) {
        _metricsFlow.value = _metricsFlow.value.copy(activeConnections = count)
    }
    
    /**
     * Increment total message count
     */
    fun incrementMessageCount() {
        val newCount = prefs.getInt(KEY_TOTAL_MESSAGES, 0) + 1
        prefs.edit().putInt(KEY_TOTAL_MESSAGES, newCount).apply()
        _metricsFlow.value = _metricsFlow.value.copy(totalMessages = newCount)
    }
    
    /**
     * Update memory usage
     */
    fun updateMemoryUsage() {
        val runtime = Runtime.getRuntime()
        val usedMemory = runtime.totalMemory() - runtime.freeMemory()
        _metricsFlow.value = _metricsFlow.value.copy(memoryUsedBytes = usedMemory)
    }
    
    /**
     * Refresh all metrics
     */
    fun refreshMetrics() {
        updateMemoryUsage()
        _metricsFlow.value = loadMetrics()
    }
    
    /**
     * Load metrics from storage
     */
    private fun loadMetrics(): Metrics {
        val runtime = Runtime.getRuntime()
        val usedMemory = runtime.totalMemory() - runtime.freeMemory()
        
        return Metrics(
            lastTTFT = prefs.getLong(KEY_LAST_TTFT, 0).takeIf { it > 0 },
            lastSSEStatus = prefs.getString(KEY_LAST_SSE_STATUS, null),
            totalMessages = prefs.getInt(KEY_TOTAL_MESSAGES, 0),
            memoryUsedBytes = usedMemory,
            activeConnections = 0 // This would be tracked in real-time
        )
    }
}

/**
 * Metrics data class
 */
data class Metrics(
    val lastTTFT: Long? = null,
    val lastSSEStatus: String? = null,
    val totalMessages: Int = 0,
    val memoryUsedBytes: Long = 0,
    val activeConnections: Int = 0
)