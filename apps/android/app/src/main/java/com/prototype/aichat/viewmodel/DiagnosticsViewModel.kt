package com.prototype.aichat.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.prototype.aichat.core.logging.LogCollector
import com.prototype.aichat.data.auth.SupabaseAuthClient
import com.prototype.aichat.data.metrics.MetricsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * ViewModel for the Diagnostics screen
 * Collects and manages diagnostic information for development builds
 */
class DiagnosticsViewModel(
    application: Application
) : AndroidViewModel(application) {
    
    private val metricsRepository = MetricsRepository.getInstance(application)
    private val logCollector = LogCollector.getInstance()
    
    private val _uiState = MutableStateFlow(DiagnosticsUiState())
    val uiState: StateFlow<DiagnosticsUiState> = _uiState.asStateFlow()
    
    init {
        loadDiagnosticData()
    }
    
    private fun loadDiagnosticData() {
        viewModelScope.launch {
            // Load user session info
            val session = SupabaseAuthClient.getCurrentSession()
            val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())

            _uiState.value = _uiState.value.copy(
                userId = session?.user?.id,
                userEmail = session?.user?.email,
                hasActiveSession = session != null,
                tokenExpiry = session?.expiresAt?.toString()
            )
        }
        
        viewModelScope.launch {
            // Load metrics
            metricsRepository.metricsFlow.collect { metrics ->
                _uiState.value = _uiState.value.copy(
                    lastTTFT = metrics.lastTTFT,
                    lastSSEStatus = metrics.lastSSEStatus,
                    activeConnections = metrics.activeConnections,
                    memoryUsed = formatMemoryUsage(metrics.memoryUsedBytes)
                )
            }
        }
        
        viewModelScope.launch {
            // Load recent logs (filtered to remove sensitive data)
            logCollector.logsFlow.collect { logs ->
                _uiState.value = _uiState.value.copy(
                    recentLogs = sanitizeLogs(logs)
                )
            }
        }
    }
    
    /**
     * Clear all collected logs
     */
    suspend fun clearLogs() {
        logCollector.clearLogs()
        _uiState.value = _uiState.value.copy(recentLogs = "")
    }
    
    /**
     * Refresh metrics from repositories
     */
    suspend fun refreshMetrics() {
        metricsRepository.refreshMetrics()
    }
    
    /**
     * Test SSE connection to the API
     */
    suspend fun testSSEConnection() {
        // This would trigger a test SSE connection
        // Implementation depends on your SSE client
        _uiState.value = _uiState.value.copy(
            lastSSEStatus = "Testing connection..."
        )
        
        // Simulate test (in real implementation, this would call the SSE client)
        kotlinx.coroutines.delay(1000)
        
        _uiState.value = _uiState.value.copy(
            lastSSEStatus = "Test completed at ${Date()}"
        )
    }
    
    /**
     * Format memory usage in human-readable format
     */
    private fun formatMemoryUsage(bytes: Long): String {
        return when {
            bytes < 1024 -> "$bytes B"
            bytes < 1024 * 1024 -> "${bytes / 1024} KB"
            else -> "${bytes / (1024 * 1024)} MB"
        }
    }
    
    /**
     * Remove sensitive information from logs
     */
    private fun sanitizeLogs(logs: String): String {
        return logs
            .replace(Regex("Bearer [A-Za-z0-9-._~+/]+=*"), "Bearer [REDACTED]")
            .replace(Regex("\"password\"\\s*:\\s*\"[^\"]*\""), "\"password\":\"[REDACTED]\"")
            .replace(Regex("\"token\"\\s*:\\s*\"[^\"]*\""), "\"token\":\"[REDACTED]\"")
            .replace(Regex("\"anon_key\"\\s*:\\s*\"[^\"]*\""), "\"anon_key\":\"[REDACTED]\"")
            .replace(Regex("\"service_role_key\"\\s*:\\s*\"[^\"]*\""), "\"service_role_key\":\"[REDACTED]\"")
    }
}

/**
 * UI state for the Diagnostics screen
 */
data class DiagnosticsUiState(
    val userId: String? = null,
    val userEmail: String? = null,
    val hasActiveSession: Boolean = false,
    val tokenExpiry: String? = null,
    val lastTTFT: Long? = null,
    val lastSSEStatus: String? = null,
    val activeConnections: Int = 0,
    val memoryUsed: String = "0 MB",
    val recentLogs: String = ""
)
