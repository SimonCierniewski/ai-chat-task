package com.prototype.aichat.core.logging

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * Singleton log collector for development diagnostics
 * Maintains a circular buffer of recent log entries
 */
class LogCollector private constructor() {
    
    companion object {
        private const val MAX_LOG_LINES = 100
        private const val MAX_LOG_SIZE = 10000 // characters
        
        @Volatile
        private var INSTANCE: LogCollector? = null
        
        fun getInstance(): LogCollector {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: LogCollector().also { INSTANCE = it }
            }
        }
    }
    
    private val logBuffer = ConcurrentLinkedQueue<LogEntry>()
    private val dateFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault())
    
    private val _logsFlow = MutableStateFlow("")
    val logsFlow: StateFlow<String> = _logsFlow.asStateFlow()
    
    /**
     * Add a log entry
     */
    fun log(level: LogLevel, tag: String, message: String) {
        val entry = LogEntry(
            timestamp = System.currentTimeMillis(),
            level = level,
            tag = tag,
            message = message
        )
        
        logBuffer.offer(entry)
        
        // Maintain buffer size
        while (logBuffer.size > MAX_LOG_LINES) {
            logBuffer.poll()
        }
        
        updateLogsFlow()
    }
    
    /**
     * Get formatted logs as string
     */
    fun getFormattedLogs(): String {
        return logBuffer.joinToString("\n") { entry ->
            val time = dateFormat.format(Date(entry.timestamp))
            val levelChar = when (entry.level) {
                LogLevel.DEBUG -> "D"
                LogLevel.INFO -> "I"
                LogLevel.WARNING -> "W"
                LogLevel.ERROR -> "E"
            }
            "[$time] $levelChar/${entry.tag}: ${entry.message}"
        }.takeLast(MAX_LOG_SIZE)
    }
    
    private fun updateLogsFlow() {
        _logsFlow.value = getFormattedLogs()
    }
    
    /**
     * Clear all collected logs
     */
    fun clearLogs() {
        logBuffer.clear()
        _logsFlow.value = ""
    }
    
    // Helper functions for different log levels
    fun d(tag: String, message: String) = log(LogLevel.DEBUG, tag, message)
    fun i(tag: String, message: String) = log(LogLevel.INFO, tag, message)
    fun w(tag: String, message: String) = log(LogLevel.WARNING, tag, message)
    fun e(tag: String, message: String) = log(LogLevel.ERROR, tag, message)
}

/**
 * Log entry data class
 */
data class LogEntry(
    val timestamp: Long,
    val level: LogLevel,
    val tag: String,
    val message: String
)

/**
 * Log levels
 */
enum class LogLevel {
    DEBUG, INFO, WARNING, ERROR
}
