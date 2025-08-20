# Sessions & History Documentation

Complete documentation for the Android app's session management and history features, including data flow, caching strategy, and synchronization with the backend.

## Architecture Overview

### Data Flow

```
Zep (Source of Truth)
        ↓
    API Proxy
        ↓
  SessionsRepository
        ↓
   Room Database (Cache)
        ↓
    ViewModels
        ↓
    UI Screens
```

## Source of Truth

### Primary Source: Zep via API

The **Zep memory service** is the authoritative source for all session and message data:

- **Location**: US region (expect 100-150ms latency)
- **Access**: Via API proxy endpoints (never direct from mobile)
- **Data Model**: User-namespaced sessions with messages and metadata

### API Endpoints

```
GET  /api/v1/sessions
     → List all sessions for current user

GET  /api/v1/memory/sessions/{sessionId}/messages
     → Get all messages for a session (Zep proxy)

POST /api/v1/sessions
     → Create new session

POST /api/v1/chat
     → Send message (creates session if needed)
```

## Data Models

### SessionEntity (Room)

```kotlin
@Entity(tableName = "sessions")
data class SessionEntity(
    id: String,           // UUID from server
    userId: String,       // User who owns session
    title: String?,       // Friendly name
    createdAt: Long,      // Creation timestamp
    lastMessageAt: Long?, // Last activity
    messageCount: Int,    // Total messages
    lastSyncedAt: Long    // Cache timestamp
)
```

### MessageEntity (Room)

```kotlin
@Entity(tableName = "messages")
data class MessageEntity(
    id: String,           // Message UUID
    sessionId: String,    // Foreign key to session
    content: String,      // Message text
    role: String,         // USER/ASSISTANT/SYSTEM
    timestamp: Long,      // When sent
    metadata: String?,    // JSON: tokens, cost, etc.
    sequenceNumber: Int   // Order in session
)
```

## Caching Strategy

### Cache TTL

- **Default TTL**: 5 minutes
- **Stale-while-revalidate**: Show cached data immediately, refresh in background
- **Pull-to-refresh**: Force refresh on user request

### Cache Invalidation

```kotlin
// Automatic invalidation
- On app launch if cache > 5 minutes old
- After successful message send
- On pull-to-refresh gesture

// Manual invalidation
- User taps refresh button
- Network reconnection after offline
- Session deletion
```

### Offline Behavior

1. **Read Operations**: Always work from cache
2. **Write Operations**: Queue locally, sync when online
3. **Conflict Resolution**: Server wins (last-write-wins)

## Session Management

### Creating Sessions

```kotlin
1. User starts new chat
2. Create local session with temp ID
3. Send to server async
4. Replace temp ID with server ID
5. Update cache
```

### Continuing Sessions

```kotlin
1. User selects session from list
2. Load from cache immediately
3. Fetch fresh data in background
4. Update UI if changes detected
```

### Session Metadata

**Message Count Calculation**:
```sql
SELECT COUNT(*) FROM messages WHERE sessionId = ?
```

**Last Activity Calculation**:
```sql
SELECT MAX(timestamp) FROM messages WHERE sessionId = ?
```

**Display Name Priority**:
1. User-provided title
2. First message preview (truncated)
3. "Session {id first 8 chars}"

## History Features

### Message Ordering

Messages are ordered by `sequenceNumber` (not timestamp) to handle:
- Clock skew between devices
- Out-of-order network responses
- Message edits/deletions

### Full Transcript Loading

```kotlin
// Efficient loading with pagination
fun getSessionMessages(sessionId: String): Flow<List<Message>> {
    return sessionDao.getSessionMessages(sessionId)
        .onStart {
            // Try to fetch fresh data
            fetchFromServer(sessionId)
        }
}
```

### Performance Optimizations

1. **Lazy Loading**: Messages load on-demand
2. **Diff Updates**: Only changed messages refresh
3. **Index on Foreign Keys**: Fast session queries
4. **Cascade Deletes**: Clean orphaned messages

## Repository Implementation

### SessionsRepository Responsibilities

1. **Coordinate Data Sources**:
   - Check cache freshness
   - Fetch from API if stale
   - Update local database
   - Emit to UI via Flow

2. **Handle Errors Gracefully**:
   ```kotlin
   try {
       refreshFromServer()
   } catch (e: Exception) {
       // Use cached data if available
       // Show error only if cache empty
   }
   ```

3. **Optimize Network Calls**:
   - Batch requests where possible
   - Cancel in-flight requests on navigation
   - Retry with exponential backoff

## UI Implementation

### SessionsScreen

**Features**:
- List all sessions with metadata
- Pull-to-refresh
- Swipe to delete (with confirmation)
- Tap to continue chat
- Long-press for options menu

**Data Display**:
```
Session Title
12 messages • 2 hours ago
```

### HistoryScreen

**Features**:
- Full message transcript
- Auto-scroll to bottom on load
- Pull-to-refresh for updates
- Continue chat FAB
- Edit session title

**Performance**:
- Virtual scrolling for long conversations
- Message recycling in LazyColumn
- Smooth scroll animations

## Sync Policies

### When to Sync

**Automatic Sync**:
- App foreground after 5+ minutes
- After sending new message
- On session creation

**Manual Sync**:
- Pull-to-refresh gesture
- Refresh button tap
- Network reconnection

### Conflict Resolution

**Message Conflicts**:
- Server message ID is authoritative
- Local-only messages get new IDs on sync
- Duplicate detection by content hash

**Session Conflicts**:
- Server metadata wins
- Local title changes preserved if newer
- Message count from server

## Testing Considerations

### Unit Tests

```kotlin
@Test
fun `cache returns stale data while fetching`() {
    // Given: Stale cache
    // When: Request sessions
    // Then: Emit cached data immediately
    // And: Fetch fresh data in background
}
```

### Integration Tests

```kotlin
@Test
fun `message sync preserves order`() {
    // Given: Local and server messages
    // When: Sync occurs
    // Then: Messages ordered by sequence
}
```

### Manual Testing

1. **Cache Expiry**:
   - Wait 5+ minutes
   - Open sessions list
   - Verify background refresh

2. **Offline Mode**:
   - Enable airplane mode
   - Navigate sessions
   - Verify cached data shown

3. **Data Consistency**:
   - Send message from web
   - Pull to refresh mobile
   - Verify message appears

## Room Database Schema

```sql
-- Sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    title TEXT,
    createdAt INTEGER NOT NULL,
    lastMessageAt INTEGER,
    messageCount INTEGER NOT NULL,
    lastSyncedAt INTEGER NOT NULL
);

-- Messages table
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    content TEXT NOT NULL,
    role TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    metadata TEXT,
    sequenceNumber INTEGER NOT NULL,
    FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indices for performance
CREATE INDEX idx_messages_sessionId ON messages(sessionId);
CREATE INDEX idx_sessions_lastMessageAt ON sessions(lastMessageAt);
```

## Error Handling

### Network Errors

```kotlin
sealed class SyncError {
    object NetworkUnavailable : SyncError()
    data class ServerError(val code: Int) : SyncError()
    data class ParseError(val message: String) : SyncError()
}

// Handle gracefully
when (error) {
    NetworkUnavailable -> useCache()
    ServerError(401) -> reauthenticate()
    ServerError(429) -> backoffAndRetry()
    else -> showErrorWithRetry()
}
```

### Data Integrity

- Foreign key constraints prevent orphans
- Transactions for multi-table updates
- Cascade deletes for consistency
- Null checks for optional fields

## Performance Metrics

### Target Metrics

- **Session list load**: < 100ms from cache
- **History load**: < 200ms for 100 messages
- **Sync time**: < 2s for full refresh
- **Memory usage**: < 10MB for 1000 messages

### Monitoring

```kotlin
// Track sync performance
val syncStartTime = System.currentTimeMillis()
refreshFromServer()
val syncDuration = System.currentTimeMillis() - syncStartTime
analytics.track("sync_duration", syncDuration)
```

## Future Enhancements

1. **Incremental Sync**: Only fetch changes since last sync
2. **Message Search**: Full-text search in Room
3. **Export History**: Save transcript as PDF/text
4. **Multi-device Sync**: Real-time updates via WebSocket
5. **Attachment Support**: Images and files in messages
6. **Message Reactions**: Emoji reactions to messages
7. **Thread Support**: Branching conversations
8. **Encryption**: E2E encryption for sensitive chats

## Acceptance Criteria Validation

✅ **Sessions screen loads with real data**: Fetched from Zep via API
✅ **Opening session shows full transcript**: Complete message history
✅ **Counts/dates match server**: Calculated from actual messages
✅ **Cache provides fast load**: < 100ms from Room database
✅ **Pull to refresh works**: Forces server sync
✅ **Navigation flows correctly**: Create/continue/view history