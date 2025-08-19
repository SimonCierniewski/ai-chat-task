# Zep Collections Architecture

## Overview

This document defines the multi-tenant collection strategy for Zep v3, including naming conventions, lifecycle management, and data organization patterns.

## Collection Naming Convention

### User Collections

Each user gets a dedicated collection following this strict naming pattern:

```
user:{supabase_user_id}
```

**Examples**:
```
user:a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11
user:b1ffcd88-8d1c-5fg9-cc7e-7cc8ce491b22
```

**Rationale**:
- **Uniqueness**: Supabase UUID ensures no collisions
- **Security**: User ID validates ownership
- **Simplicity**: Direct mapping from auth to memory
- **Compliance**: Easy to identify for GDPR requests

### Reserved Prefixes

| Prefix | Purpose | Example |
|--------|---------|---------|
| `user:` | User conversation memory | `user:uuid` |
| `system:` | System-wide knowledge (future) | `system:global_facts` |
| `admin:` | Admin analytics (future) | `admin:usage_patterns` |
| `test:` | Testing and development | `test:integration_suite` |

## Session Management

### Session ID Strategy

Sessions represent conversation threads within a user's collection:

```typescript
interface SessionNaming {
  // Format: session-{timestamp}-{random}
  pattern: "session-YYYYMMDD-HHMMSS-XXXX";
  
  // Examples
  examples: [
    "session-20250119-143022-a3f2",  // Jan 19, 2025 at 14:30:22
    "session-20250119-091511-b7e9",  // Jan 19, 2025 at 09:15:11
  ];
}
```

**Session Stability**:
- Sessions persist across multiple messages in a conversation
- New session triggered by:
  - User explicitly starts new chat
  - Idle timeout (configurable, default 30 minutes)
  - Client app restart
  - User request for new context

### Session Metadata

```typescript
interface SessionMetadata {
  session_id: string;
  created_at: string;        // ISO timestamp
  last_message_at: string;   // ISO timestamp
  message_count: number;
  total_tokens: number;
  primary_model: string;      // Most used model
  topics?: string[];         // Extracted topics (future)
}
```

## Collection Lifecycle

### 1. Lazy Creation

Collections are created **on-demand** when the first message is stored:

```typescript
async function ensureUserCollection(userId: string): Promise<void> {
  const collectionName = `user:${userId}`;
  
  try {
    // Check if collection exists
    await zepClient.getCollection(collectionName);
  } catch (error) {
    if (error.code === 'COLLECTION_NOT_FOUND') {
      // Create collection on first use
      await zepClient.createCollection({
        name: collectionName,
        description: `Conversation memory for user ${userId}`,
        metadata: {
          created_at: new Date().toISOString(),
          user_id: userId,
          version: "1.0"
        }
      });
      
      // Log creation event
      await telemetry.recordEvent({
        type: 'zep_collection_created',
        user_id: userId,
        payload_json: { collection: collectionName }
      });
    }
  }
}
```

**Trigger Points**:
1. First message in a conversation
2. After user account creation (optional webhook)
3. On explicit memory initialization request

### 2. Collection Initialization

Optional initialization after creation:

```typescript
async function initializeCollection(userId: string): Promise<void> {
  const collectionName = `user:${userId}`;
  
  // Optional: Seed with user preferences from profile
  const profile = await getUserProfile(userId);
  
  if (profile.preferences) {
    await zepClient.addKnowledge(collectionName, {
      facts: [
        {
          subject: "user",
          predicate: "prefers_language",
          object: profile.language || "en",
          confidence: 1.0
        },
        {
          subject: "user",
          predicate: "timezone",
          object: profile.timezone || "UTC",
          confidence: 1.0
        }
      ]
    });
  }
}
```

### 3. Collection Updates

Regular operations during conversation:

```typescript
class CollectionManager {
  async addMessage(
    userId: string,
    sessionId: string,
    message: Message
  ): Promise<void> {
    const collectionName = `user:${userId}`;
    
    // Ensure collection exists
    await this.ensureUserCollection(userId);
    
    // Add message to session
    await zepClient.addMessage(collectionName, sessionId, {
      ...message,
      metadata: {
        timestamp: new Date().toISOString(),
        token_count: countTokens(message.content)
      }
    });
    
    // Update session metadata
    await this.updateSessionMetadata(collectionName, sessionId);
  }
  
  async extractKnowledge(
    userId: string,
    sessionId: string,
    messages: Message[]
  ): Promise<void> {
    // Extract facts from conversation (async, non-blocking)
    const facts = await this.extractFacts(messages);
    
    if (facts.length > 0) {
      await zepClient.addKnowledge(`user:${userId}`, { facts });
    }
  }
}
```

### 4. Collection Deletion

User-initiated or compliance-driven deletion:

```typescript
async function deleteUserCollection(
  userId: string,
  reason: 'user_request' | 'gdpr' | 'account_deletion'
): Promise<void> {
  const collectionName = `user:${userId}`;
  
  try {
    // Export data before deletion if required
    if (reason === 'gdpr') {
      await exportUserData(userId);
    }
    
    // Delete collection (cascades to all sessions and messages)
    await zepClient.deleteCollection(collectionName);
    
    // Log deletion
    await auditLog.record({
      action: 'collection_deleted',
      user_id: userId,
      collection: collectionName,
      reason,
      timestamp: new Date().toISOString()
    });
    
    // Clean up any cached data
    await cache.delete(`zep:${userId}:*`);
    
  } catch (error) {
    if (error.code !== 'COLLECTION_NOT_FOUND') {
      throw error;
    }
    // Collection already doesn't exist
  }
}
```

## Data Pruning Strategy

### Automatic Pruning Rules

To manage storage and maintain performance:

```typescript
interface PruningPolicy {
  // Message-level pruning
  message_retention_days: 90;        // Keep last 90 days
  max_messages_per_session: 1000;    // Limit per conversation
  max_sessions_per_user: 100;        // Limit active sessions
  
  // Knowledge graph pruning
  max_facts_per_user: 500;           // Limit facts
  fact_confidence_threshold: 0.3;    // Remove low-confidence facts
  fact_age_days: 180;                // Remove old facts
  
  // Storage limits
  max_collection_size_mb: 50;        // Per-user storage limit
}
```

### Pruning Implementation

```typescript
class PruningService {
  async pruneUserCollection(userId: string): Promise<PruneResult> {
    const collectionName = `user:${userId}`;
    const policy = this.getPruningPolicy();
    
    const result: PruneResult = {
      messages_deleted: 0,
      sessions_archived: 0,
      facts_removed: 0
    };
    
    // 1. Remove old messages
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.message_retention_days);
    
    result.messages_deleted = await zepClient.deleteMessagesBefore(
      collectionName,
      cutoffDate
    );
    
    // 2. Archive old sessions
    const sessions = await zepClient.getSessions(collectionName);
    const oldSessions = sessions
      .filter(s => new Date(s.last_message_at) < cutoffDate)
      .slice(policy.max_sessions_per_user);
    
    for (const session of oldSessions) {
      await this.archiveSession(collectionName, session.id);
      result.sessions_archived++;
    }
    
    // 3. Prune low-confidence facts
    const facts = await zepClient.getKnowledge(collectionName);
    const factsToRemove = facts.filter(f => 
      f.confidence < policy.fact_confidence_threshold ||
      this.isFactExpired(f, policy.fact_age_days)
    );
    
    for (const fact of factsToRemove) {
      await zepClient.deleteFact(collectionName, fact.id);
      result.facts_removed++;
    }
    
    // 4. Check storage limits
    const size = await zepClient.getCollectionSize(collectionName);
    if (size > policy.max_collection_size_mb * 1024 * 1024) {
      // Aggressive pruning needed
      await this.aggressivePrune(collectionName);
    }
    
    return result;
  }
  
  async scheduledPruning(): Promise<void> {
    // Run daily at 3 AM
    const users = await this.getUsersForPruning();
    
    for (const userId of users) {
      try {
        const result = await this.pruneUserCollection(userId);
        
        await telemetry.recordEvent({
          type: 'zep_pruning',
          user_id: userId,
          payload_json: result
        });
      } catch (error) {
        logger.error(`Pruning failed for user ${userId}`, error);
      }
    }
  }
}
```

### Manual Pruning Triggers

Users can request memory cleanup:

```typescript
// API endpoint for user-initiated cleanup
app.post('/api/memory/cleanup', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { option } = req.body;
  
  switch (option) {
    case 'clear_old':
      // Remove messages older than 30 days
      await pruningService.clearOldMessages(userId, 30);
      break;
      
    case 'clear_session':
      // Clear specific session
      await pruningService.clearSession(userId, req.body.sessionId);
      break;
      
    case 'reset_all':
      // Complete reset (delete and recreate collection)
      await collectionManager.resetCollection(userId);
      break;
      
    default:
      return res.status(400).json({ error: 'Invalid option' });
  }
  
  res.json({ success: true });
});
```

## Multi-Tenant Isolation

### Security Boundaries

```typescript
class TenantIsolation {
  // Validate collection ownership before any operation
  validateAccess(userId: string, collectionName: string): void {
    const expected = `user:${userId}`;
    if (collectionName !== expected) {
      throw new ForbiddenError('Collection access denied');
    }
  }
  
  // Prevent cross-user queries
  async search(userId: string, query: string): Promise<SearchResult> {
    // ALWAYS scope to user's collection
    const collectionName = `user:${userId}`;
    
    // Never allow searching other collections
    return await zepClient.search({
      collection: collectionName,  // Hardcoded to user's collection
      query,
      limit: 10
    });
  }
  
  // Sanitize results to prevent leakage
  sanitizeResults(results: any[]): any[] {
    return results.map(r => ({
      content: r.content,
      score: r.score,
      // Remove any system metadata
      metadata: this.filterMetadata(r.metadata)
    }));
  }
}
```

### Collection Access Matrix

| Operation | Own Collection | Other User Collection | System Collection |
|-----------|---------------|--------------------|-------------------|
| Read Messages | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |
| Write Messages | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |
| Search | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |
| Delete | ✅ Allowed* | ❌ Forbidden | ❌ Forbidden |
| Export | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |

*Delete requires additional confirmation

## Collection Monitoring

### Health Metrics

```typescript
interface CollectionMetrics {
  total_collections: number;
  active_collections_24h: number;
  average_collection_size_mb: number;
  largest_collection_mb: number;
  total_messages: number;
  total_facts: number;
  pruning_queue_size: number;
}

async function getCollectionHealth(): Promise<CollectionMetrics> {
  // Aggregate metrics across all collections
  const metrics = await zepClient.getSystemMetrics();
  
  // Alert thresholds
  if (metrics.largest_collection_mb > 100) {
    await alerting.send('Large collection detected', metrics);
  }
  
  if (metrics.pruning_queue_size > 1000) {
    await alerting.send('Pruning backlog detected', metrics);
  }
  
  return metrics;
}
```

### Usage Tracking

```sql
-- Track collection operations in telemetry
INSERT INTO telemetry_events (user_id, type, payload_json) VALUES
  (?, 'zep_collection_created', '{"collection": "user:..."}'::jsonb),
  (?, 'zep_session_started', '{"session_id": "session-..."}'::jsonb),
  (?, 'zep_messages_stored', '{"count": 5, "session_id": "..."}'::jsonb),
  (?, 'zep_collection_pruned', '{"messages_deleted": 100}'::jsonb);
```

## Migration Strategies

### From Previous Versions

```typescript
async function migrateToV3(userId: string): Promise<void> {
  // Get old format data
  const oldData = await legacyZep.getUserData(userId);
  
  // Create new collection
  const newCollection = `user:${userId}`;
  await zepClient.createCollection({
    name: newCollection,
    metadata: { migrated_from: 'v2', migrated_at: new Date() }
  });
  
  // Migrate messages
  for (const session of oldData.sessions) {
    for (const message of session.messages) {
      await zepClient.addMessage(
        newCollection,
        session.id,
        this.transformMessage(message)
      );
    }
  }
  
  // Migrate knowledge
  if (oldData.facts) {
    await zepClient.addKnowledge(
      newCollection,
      { facts: this.transformFacts(oldData.facts) }
    );
  }
  
  // Verify migration
  const newData = await zepClient.getCollection(newCollection);
  if (newData.message_count !== oldData.total_messages) {
    throw new Error('Migration verification failed');
  }
}
```

## Best Practices

### Do's
- ✅ Always use `user:{uuid}` naming pattern
- ✅ Create collections lazily on first use
- ✅ Implement pruning before hitting limits
- ✅ Handle Zep failures gracefully
- ✅ Track operations in telemetry
- ✅ Validate collection ownership

### Don'ts
- ❌ Don't create empty collections preemptively
- ❌ Don't allow cross-user collection access
- ❌ Don't store sensitive data (passwords, keys)
- ❌ Don't rely on Zep as primary data store
- ❌ Don't block on Zep operations
- ❌ Don't ignore pruning policies

## Appendix: Collection Schemas

### Message Schema
```typescript
interface ZepMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    timestamp: string;
    model?: string;
    tokens?: number;
    session_id: string;
    message_id?: string;
  };
}
```

### Knowledge Fact Schema
```typescript
interface ZepFact {
  subject: string;      // Usually "user" or entity name
  predicate: string;    // Relationship type
  object: string;       // Related entity or value
  confidence: number;   // 0.0 to 1.0
  metadata?: {
    source: 'extracted' | 'explicit' | 'inferred';
    session_id?: string;
    created_at: string;
  };
}
```

### Collection Metadata Schema
```typescript
interface ZepCollectionMetadata {
  name: string;                    // user:{uuid}
  description: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  session_count: number;
  fact_count: number;
  size_bytes: number;
  metadata: {
    user_id: string;
    version: string;
    last_pruned?: string;
    migration_info?: any;
  };
}
```