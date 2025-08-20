package com.prototype.aichat.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.prototype.aichat.data.local.dao.SessionDao
import com.prototype.aichat.data.local.entities.MessageEntity
import com.prototype.aichat.data.local.entities.SessionEntity

/**
 * Room database for chat sessions and messages
 */
@Database(
    entities = [
        SessionEntity::class,
        MessageEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class ChatDatabase : RoomDatabase() {
    
    abstract fun sessionDao(): SessionDao
    
    companion object {
        @Volatile
        private var INSTANCE: ChatDatabase? = null
        
        fun getInstance(context: Context): ChatDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }
        
        private fun buildDatabase(context: Context): ChatDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                ChatDatabase::class.java,
                "chat_database"
            )
                .fallbackToDestructiveMigration() // For development, use migrations in production
                .build()
        }
    }
}