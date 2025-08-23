package com.prototype.aichat.data.local.dao

import androidx.room.*
import com.prototype.aichat.data.local.entities.MessageEntity
import com.prototype.aichat.data.local.entities.SessionEntity
import com.prototype.aichat.data.local.entities.SessionWithLastMessage
import kotlinx.coroutines.flow.Flow

/**
 * DAO for chat sessions and messages
 */
@Dao
interface SessionDao {
    
    // Session operations
    
    @Query("SELECT * FROM sessions ORDER BY lastMessageAt DESC")
    fun getAllSessions(): Flow<List<SessionEntity>>
    
    @Query("SELECT * FROM sessions WHERE id = :sessionId")
    suspend fun getSession(sessionId: String): SessionEntity?
    
    @Transaction
    @Query("SELECT * FROM sessions ORDER BY lastMessageAt DESC")
    fun getSessionsWithLastMessage(): Flow<List<SessionWithLastMessage>>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSession(session: SessionEntity)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSessions(sessions: List<SessionEntity>)
    
    @Update
    suspend fun updateSession(session: SessionEntity)
    
    @Delete
    suspend fun deleteSession(session: SessionEntity)
    
    @Query("DELETE FROM sessions WHERE lastSyncedAt < :timestamp")
    suspend fun deleteOldSessions(timestamp: Long)
    
    @Query("UPDATE sessions SET messageCount = :count, lastMessageAt = :lastMessageAt WHERE id = :sessionId")
    suspend fun updateSessionStats(sessionId: String, count: Int, lastMessageAt: Long)
    
    // Message operations
    
    @Query("SELECT * FROM messages WHERE sessionId = :sessionId ORDER BY sequenceNumber ASC")
    fun getSessionMessages(sessionId: String): Flow<List<MessageEntity>>
    
    @Query("SELECT * FROM messages WHERE sessionId = :sessionId ORDER BY sequenceNumber ASC")
    suspend fun getSessionMessagesOnce(sessionId: String): List<MessageEntity>
    
    @Query("SELECT * FROM messages WHERE id = :messageId")
    suspend fun getMessage(messageId: String): MessageEntity?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: MessageEntity)
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessages(messages: List<MessageEntity>)
    
    @Update
    suspend fun updateMessage(message: MessageEntity)
    
    @Delete
    suspend fun deleteMessage(message: MessageEntity)
    
    @Query("DELETE FROM messages WHERE sessionId = :sessionId")
    suspend fun deleteSessionMessages(sessionId: String)
    
    @Query("SELECT COUNT(*) FROM messages WHERE sessionId = :sessionId")
    suspend fun getMessageCount(sessionId: String): Int
    
    @Query("SELECT MAX(timestamp) FROM messages WHERE sessionId = :sessionId")
    suspend fun getLastMessageTime(sessionId: String): Long?
    
    @Query("SELECT MAX(sequenceNumber) FROM messages WHERE sessionId = :sessionId")
    suspend fun getMaxMessageOrder(sessionId: String): Int?
    
    @Query("UPDATE sessions SET title = :title WHERE id = :sessionId")
    suspend fun updateSessionTitle(sessionId: String, title: String)
    
    @Query("SELECT EXISTS(SELECT 1 FROM sessions WHERE id = :sessionId)")
    suspend fun sessionExists(sessionId: String): Boolean
    
    @Query("SELECT * FROM sessions ORDER BY lastMessageAt DESC LIMIT 1")
    suspend fun getMostRecentSession(): SessionEntity?
    
    @Query("SELECT MIN(lastSyncedAt) FROM sessions")
    suspend fun getLastSyncTime(): Long?
    
    @Query("DELETE FROM sessions WHERE id = :sessionId")
    suspend fun deleteSession(sessionId: String)
    
    // Combined operations
    
    @Transaction
    suspend fun insertSessionWithMessages(session: SessionEntity, messages: List<MessageEntity>) {
        insertSession(session)
        insertMessages(messages)
    }
    
    @Transaction
    suspend fun refreshSession(session: SessionEntity, messages: List<MessageEntity>) {
        // Delete old messages and insert new ones
        deleteSessionMessages(session.id)
        insertSession(session)
        insertMessages(messages)
    }
    
    @Query("DELETE FROM sessions")
    suspend fun clearAllSessions()
    
    @Query("DELETE FROM messages")
    suspend fun clearAllMessages()
    
    @Transaction
    suspend fun clearAll() {
        clearAllMessages()
        clearAllSessions()
    }
}