package com.prototype.aichat.core.utils

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

/**
 * Generates session IDs in the format: session-YYYYMMDD-HHMMSS-XXXX
 * where XXXX is a random 4-character alphanumeric string
 */
object SessionIdGenerator {
    
    private val dateFormat = SimpleDateFormat("yyyyMMdd", Locale.US)
    private val timeFormat = SimpleDateFormat("HHmmss", Locale.US)
    private val alphanumeric = "abcdefghijklmnopqrstuvwxyz0123456789"
    
    /**
     * Generate a new session ID following the API format requirements
     * Format: session-YYYYMMDD-HHMMSS-XXXX
     */
    fun generate(): String {
        val now = Date()
        val dateStr = dateFormat.format(now)
        val timeStr = timeFormat.format(now)
        val randomStr = generateRandomString(4)
        
        return "session-$dateStr-$timeStr-$randomStr"
    }
    
    /**
     * Generate a random alphanumeric string of specified length
     */
    private fun generateRandomString(length: Int): String {
        return (1..length)
            .map { alphanumeric[Random.nextInt(alphanumeric.length)] }
            .joinToString("")
    }
    
    /**
     * Validate if a string matches the session ID format
     */
    fun isValid(sessionId: String): Boolean {
        val pattern = Regex("^session-\\d{8}-\\d{6}-[a-z0-9]{4}$")
        return pattern.matches(sessionId)
    }
}