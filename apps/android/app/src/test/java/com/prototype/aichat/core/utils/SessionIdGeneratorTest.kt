package com.prototype.aichat.core.utils

import org.junit.Test
import org.junit.Assert.*

class SessionIdGeneratorTest {
    
    @Test
    fun testGenerateSessionId() {
        // Generate a session ID
        val sessionId = SessionIdGenerator.generate()
        
        // Verify format: session-YYYYMMDD-HHMMSS-XXXX
        val pattern = Regex("^session-\\d{8}-\\d{6}-[a-z0-9]{4}$")
        assertTrue("Session ID should match the required format", pattern.matches(sessionId))
        
        // Verify parts
        val parts = sessionId.split("-")
        assertEquals("Session ID should have 4 parts", 4, parts.size)
        assertEquals("First part should be 'session'", "session", parts[0])
        assertEquals("Date part should be 8 digits", 8, parts[1].length)
        assertEquals("Time part should be 6 digits", 6, parts[2].length)
        assertEquals("Random part should be 4 characters", 4, parts[3].length)
    }
    
    @Test
    fun testIsValidSessionId() {
        // Valid session IDs
        assertTrue(SessionIdGenerator.isValid("session-20250122-143022-ab3x"))
        assertTrue(SessionIdGenerator.isValid("session-19991231-235959-9999"))
        assertTrue(SessionIdGenerator.isValid("session-20240101-000000-a1b2"))
        
        // Invalid session IDs
        assertFalse(SessionIdGenerator.isValid(""))
        assertFalse(SessionIdGenerator.isValid("session"))
        assertFalse(SessionIdGenerator.isValid("session-123"))
        assertFalse(SessionIdGenerator.isValid("session-20250122-143022"))
        assertFalse(SessionIdGenerator.isValid("session-20250122-143022-ABCD")) // uppercase not allowed
        assertFalse(SessionIdGenerator.isValid("session-2025012-143022-ab3x")) // wrong date length
        assertFalse(SessionIdGenerator.isValid("session-20250122-14302-ab3x")) // wrong time length
        assertFalse(SessionIdGenerator.isValid("session-20250122-143022-ab3")) // wrong random length
        assertFalse(SessionIdGenerator.isValid("c4a9e5f3-7b2d-4e8a-9f1b-3c5d7e9a1f3b")) // UUID format
    }
    
    @Test
    fun testMultipleGenerationsAreUnique() {
        val sessions = mutableSetOf<String>()
        
        // Generate multiple session IDs
        repeat(100) {
            val sessionId = SessionIdGenerator.generate()
            assertTrue("All generated IDs should be valid", SessionIdGenerator.isValid(sessionId))
            sessions.add(sessionId)
        }
        
        // They should all be unique (at least the random part makes them unique)
        assertTrue("Generated session IDs should be unique", sessions.size >= 95) // Allow for some timing collisions
    }
}