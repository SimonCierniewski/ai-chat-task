# Zep Adapter Interface Specification

## Overview

This document defines the adapter interface that the API service uses to interact with Zep v3. The adapter provides a clean abstraction layer between our business logic and Zep's API, enabling testability, observability, and graceful failure handling.

## Interface Definition

```typescript
// apps/api/src/adapters/zep.adapter.ts

import { 
  MemoryConfig, 
  RetrievalConfig, 
  OntologySettings 
} from '@packages/shared/admin-settings';
import { 
  GraphEdge, 
  Entity 
} from '@packages/shared/graph';
import { 
  RetrievalPayload, 
  MemoryEntry 
} from '@packages/shared/telemetry-memory';

/**
 * Zep Adapter Interface
 * All methods are async and include telemetry tracking
 */
export interface IZepAdapter {
  /**
   * Ensure a user collection exists in Zep
   * Creates if not exists, validates if exists
   */
  ensureUserCollection(userId: string): Promise<CollectionResult>;
  
  /**
   * Add messages to a user's session
   * Batch operation for efficiency
   */
  addMessages(
    userId: string, 
    sessionId: string, 
    messages: Message[]
  ): Promise<AddMessagesResult>;
  
  /**
   * Search user's memory with retrieval policy
   * Applies deduplication, clipping, and token budget
   */
  searchMemory(
    userId: string, 
    query: string, 
    config: RetrievalConfig
  ): Promise<RetrievalPayload>;
  
  /**
   * Upsert knowledge graph edges
   * Handles deduplication and confidence updates
   */
  upsertFacts(
    userId: string, 
    edges: GraphEdge[]
  ): Promise<UpsertFactsResult>;
  
  /**
   * Get messages from a specific session
   * Supports pagination and filtering
   */
  getSessionMessages(
    userId: string, 
    sessionId: string, 
    limit?: number, 
    before?: string
  ): Promise<SessionMessagesResult>;
}
```

## Type Definitions

### Core Types

```typescript
/**
 * Message structure for Zep storage
 */
export interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;  // ISO 8601
  metadata?: {
    model?: string;
    tokens?: number;
    cost_usd?: number;
    ttft_ms?: number;
    [key: string]: any;
  };
}

/**
 * Collection operation result
 */
export interface CollectionResult {
  success: boolean;
  collection_name: string;
  created: boolean;  // true if newly created
  metadata?: {
    created_at?: string;
    message_count?: number;
    last_accessed?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Message addition result
 */
export interface AddMessagesResult {
  success: boolean;
  message_ids: string[];
  failed_count: number;
  error?: {
    code: string;
    message: string;
    failed_messages?: number[];  // Indices of failed messages
  };
}

/**
 * Fact upsert result
 */
export interface UpsertFactsResult {
  success: boolean;
  upserted_count: number;
  updated_count: number;
  failed_count: number;
  error?: {
    code: string;
    message: string;
    failed_edges?: string[];  // IDs of failed edges
  };
}

/**
 * Session messages result
 */
export interface SessionMessagesResult {
  success: boolean;
  messages: Message[];
  has_more: boolean;
  next_cursor?: string;
  total_count?: number;
  error?: {
    code: string;
    message: string;
  };
}
```

## Function Signatures

### 1. ensureUserCollection

```typescript
async ensureUserCollection(userId: string): Promise<CollectionResult>
```

**Purpose**: Ensures a user's Zep collection exists before any operations.

**Behavior**:
- Check if collection `user:{userId}` exists
- Create collection if not exists
- Return metadata about the collection
- Cache result for 5 minutes

**Example**:
```typescript
const result = await zepAdapter.ensureUserCollection('a0eebc99-9c0b-4ef8-bb6d');

if (!result.success) {
  logger.error('Failed to ensure collection', result.error);
  // Continue without memory
}
```

**Telemetry**: Emits `zep_upsert` event with `operation: 'ensure_collection'`

### 2. addMessages

```typescript
async addMessages(
  userId: string, 
  sessionId: string, 
  messages: Message[]
): Promise<AddMessagesResult>
```

**Purpose**: Store conversation messages in Zep for future retrieval.

**Behavior**:
- Validate message structure
- Batch messages for efficiency (max 100 per call)
- Add to session in user's collection
- Fire-and-forget pattern (don't block response)

**Example**:
```typescript
const messages: Message[] = [
  {
    role: 'user',
    content: 'What is TypeScript?',
    timestamp: new Date().toISOString(),
    metadata: { source: 'chat' }
  },
  {
    role: 'assistant',
    content: 'TypeScript is a typed superset of JavaScript...',
    timestamp: new Date().toISOString(),
    metadata: { 
      model: 'gpt-4o-mini',
      tokens: 150,
      cost_usd: 0.0001
    }
  }
];

// Non-blocking call
zepAdapter.addMessages(userId, sessionId, messages)
  .catch(error => logger.warn('Failed to store messages', error));
```

**Telemetry**: Emits `zep_upsert` event with message count

### 3. searchMemory

```typescript
async searchMemory(
  userId: string, 
  query: string, 
  config: RetrievalConfig
): Promise<RetrievalPayload>
```

**Purpose**: Search user's conversation history with policy-driven retrieval.

**Behavior**:
- Search with `topK * 2` for filtering headroom
- Apply retrieval policy (see [RETRIEVAL_POLICY.md](../../docs/RETRIEVAL_POLICY.md))
- Deduplicate results
- Clip content to sentence boundaries
- Enforce token budget
- Include provenance metadata

**Example**:
```typescript
const config: RetrievalConfig = {
  topK: 8,
  clipSentences: 2,
  maxTokens: 1500,
  searchType: 'hybrid',
  minScore: 0.3
};

const results = await zepAdapter.searchMemory(
  userId,
  'What did we discuss about authentication?',
  config
);

// Format for prompt
const context = results.memories
  .map(m => `[${m.timestamp}] ${m.content}`)
  .join('\n');
```

**Telemetry**: Emits `zep_search` event with timing and result count

**Error Handling**:
```typescript
try {
  const results = await zepAdapter.searchMemory(userId, query, config);
  return results;
} catch (error) {
  // Log but don't fail
  logger.warn('Memory search failed', { error, userId, query });
  
  // Return empty results
  return {
    memories: [],
    metadata: {
      queryTime: 0,
      totalResults: 0,
      includedResults: 0,
      totalTokens: 0,
      appliedFilters: ['error'],
      config
    }
  };
}
```

### 4. upsertFacts

```typescript
async upsertFacts(
  userId: string, 
  edges: GraphEdge[]
): Promise<UpsertFactsResult>
```

**Purpose**: Store or update knowledge graph facts extracted from conversations.

**Behavior**:
- Validate edges against ontology (see [ONTOLOGY.md](../../docs/ONTOLOGY.md))
- Deduplicate by `(subject, predicate, object)` tuple
- Update confidence for existing edges
- Batch upsert for efficiency
- Apply per-message limits

**Example**:
```typescript
const edges: GraphEdge[] = [
  {
    id: 'edge-001',
    subject: 'user',
    predicate: 'works_at',
    object: 'acme corp',
    confidence: 0.9,
    metadata: {
      sourceMessageId: 'msg-123',
      sourceSessionId: 'session-456',
      extractionMethod: 'explicit',
      negated: false
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'edge-002',
    subject: 'user',
    predicate: 'likes',
    object: 'typescript',
    confidence: 0.8,
    metadata: {
      sourceMessageId: 'msg-123',
      sourceSessionId: 'session-456',
      extractionMethod: 'inferred',
      negated: false
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Non-blocking upsert
zepAdapter.upsertFacts(userId, edges)
  .then(result => {
    if (result.success) {
      logger.info('Facts upserted', {
        upserted: result.upserted_count,
        updated: result.updated_count
      });
    }
  })
  .catch(error => logger.warn('Failed to upsert facts', error));
```

**Telemetry**: Emits `zep_upsert` event with edge count

### 5. getSessionMessages

```typescript
async getSessionMessages(
  userId: string, 
  sessionId: string, 
  limit?: number, 
  before?: string
): Promise<SessionMessagesResult>
```

**Purpose**: Retrieve conversation history for a specific session.

**Behavior**:
- Get messages in reverse chronological order
- Support pagination with cursor
- Default limit: 50 messages
- Include message metadata

**Example**:
```typescript
// Get latest 20 messages
const result = await zepAdapter.getSessionMessages(
  userId,
  sessionId,
  20
);

if (result.success) {
  const messages = result.messages;
  
  // Load more if needed
  if (result.has_more && result.next_cursor) {
    const moreResults = await zepAdapter.getSessionMessages(
      userId,
      sessionId,
      20,
      result.next_cursor
    );
  }
}
```

**Telemetry**: Emits `zep_search` event with `operation: 'get_session'`

## Implementation Pattern

### Adapter Implementation Structure

```typescript
// apps/api/src/adapters/zep.adapter.impl.ts

import { IZepAdapter } from './zep.adapter';
import { ZepClient } from '@getzep/zep-js';
import { TelemetryService } from '../services/telemetry';
import { Logger } from '../utils/logger';
import { applyRetrievalPolicy } from '../services/retrieval';
import { validateOntology } from '../services/ontology';

export class ZepAdapter implements IZepAdapter {
  private client: ZepClient;
  private telemetry: TelemetryService;
  private logger: Logger;
  private cache: Map<string, CacheEntry>;
  
  constructor(
    apiKey: string,
    baseUrl: string,
    telemetry: TelemetryService,
    logger: Logger
  ) {
    this.client = new ZepClient({ apiKey, baseUrl });
    this.telemetry = telemetry;
    this.logger = logger;
    this.cache = new Map();
  }
  
  async ensureUserCollection(userId: string): Promise<CollectionResult> {
    const startTime = Date.now();
    const collectionName = `user:${userId}`;
    const reqId = generateRequestId();
    
    try {
      // Check cache
      const cached = this.getCached(collectionName);
      if (cached) {
        return cached;
      }
      
      // Check if exists
      const exists = await this.client.collection.exists(collectionName);
      
      if (!exists) {
        // Create collection
        await this.client.collection.create({
          name: collectionName,
          description: `Memory collection for user ${userId}`,
          metadata: {
            created_at: new Date().toISOString(),
            user_id: userId
          }
        });
      }
      
      const result: CollectionResult = {
        success: true,
        collection_name: collectionName,
        created: !exists
      };
      
      // Cache result
      this.setCached(collectionName, result, 300); // 5 minutes
      
      // Telemetry
      await this.telemetry.recordEvent({
        type: 'zep_upsert',
        user_id: userId,
        req_id: reqId,
        payload_json: {
          operation: 'ensure_collection',
          zep_ms: Date.now() - startTime,
          collection_name: collectionName,
          created: !exists
        }
      });
      
      return result;
      
    } catch (error) {
      // Log error
      this.logger.error('Failed to ensure collection', {
        error,
        userId,
        collectionName,
        reqId
      });
      
      // Telemetry
      await this.telemetry.recordEvent({
        type: 'zep_error',
        user_id: userId,
        req_id: reqId,
        payload_json: {
          operation: 'ensure_collection',
          zep_ms: Date.now() - startTime,
          collection_name: collectionName,
          error_code: error.code || 'UNKNOWN',
          error_message: error.message
        }
      });
      
      return {
        success: false,
        collection_name: collectionName,
        created: false,
        error: {
          code: error.code || 'COLLECTION_ERROR',
          message: error.message || 'Failed to ensure collection'
        }
      };
    }
  }
  
  // ... implement other methods following same pattern
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('ZepAdapter', () => {
  let adapter: ZepAdapter;
  let mockClient: jest.Mocked<ZepClient>;
  let mockTelemetry: jest.Mocked<TelemetryService>;
  
  beforeEach(() => {
    mockClient = createMockZepClient();
    mockTelemetry = createMockTelemetry();
    adapter = new ZepAdapter('test-key', 'http://test', mockTelemetry, logger);
  });
  
  describe('ensureUserCollection', () => {
    it('should create collection if not exists', async () => {
      mockClient.collection.exists.mockResolvedValue(false);
      mockClient.collection.create.mockResolvedValue({ name: 'user:123' });
      
      const result = await adapter.ensureUserCollection('123');
      
      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(mockTelemetry.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'zep_upsert',
          user_id: '123'
        })
      );
    });
    
    it('should handle errors gracefully', async () => {
      mockClient.collection.exists.mockRejectedValue(new Error('Network error'));
      
      const result = await adapter.ensureUserCollection('123');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockTelemetry.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'zep_error'
        })
      );
    });
  });
  
  describe('searchMemory', () => {
    it('should apply retrieval policy', async () => {
      const mockResults = generateMockSearchResults(20);
      mockClient.search.mockResolvedValue(mockResults);
      
      const config: RetrievalConfig = {
        topK: 8,
        clipSentences: 2,
        maxTokens: 1500,
        searchType: 'hybrid',
        minScore: 0.3
      };
      
      const result = await adapter.searchMemory('123', 'test query', config);
      
      expect(result.memories).toHaveLength(8); // topK applied
      expect(result.metadata.appliedFilters).toContain('deduplication');
      expect(result.metadata.totalTokens).toBeLessThanOrEqual(1500);
    });
  });
});
```

### Integration Tests

```typescript
describe('ZepAdapter Integration', () => {
  it('should handle US region latency', async () => {
    const adapter = new ZepAdapter(
      process.env.ZEP_API_KEY!,
      process.env.ZEP_BASE_URL!,
      telemetry,
      logger
    );
    
    const start = Date.now();
    const result = await adapter.searchMemory('test-user', 'query', defaultConfig);
    const duration = Date.now() - start;
    
    // US region typically adds 100-150ms
    expect(duration).toBeLessThan(3000); // Within timeout
    expect(result.metadata.queryTime).toBeGreaterThan(100);
  });
});
```

## Mock Implementation

```typescript
// apps/api/src/adapters/zep.adapter.mock.ts

export class MockZepAdapter implements IZepAdapter {
  private storage: Map<string, any> = new Map();
  
  async ensureUserCollection(userId: string): Promise<CollectionResult> {
    return {
      success: true,
      collection_name: `user:${userId}`,
      created: !this.storage.has(`collection:${userId}`)
    };
  }
  
  async addMessages(
    userId: string, 
    sessionId: string, 
    messages: Message[]
  ): Promise<AddMessagesResult> {
    const key = `messages:${userId}:${sessionId}`;
    const existing = this.storage.get(key) || [];
    this.storage.set(key, [...existing, ...messages]);
    
    return {
      success: true,
      message_ids: messages.map((_, i) => `msg-${Date.now()}-${i}`),
      failed_count: 0
    };
  }
  
  async searchMemory(
    userId: string, 
    query: string, 
    config: RetrievalConfig
  ): Promise<RetrievalPayload> {
    // Return mock memories
    return {
      memories: [
        {
          id: 'mock-1',
          content: 'Mock memory content',
          score: 0.9,
          timestamp: new Date().toISOString(),
          sessionId: 'mock-session',
          type: 'message',
          role: 'user',
          provenance: {
            collection: `user:${userId}`,
            searchType: config.searchType || 'hybrid',
            originalLength: 100,
            wasRedacted: false
          }
        }
      ],
      metadata: {
        queryTime: 50,
        totalResults: 1,
        includedResults: 1,
        totalTokens: 20,
        appliedFilters: ['mock'],
        config
      }
    };
  }
  
  async upsertFacts(
    userId: string, 
    edges: GraphEdge[]
  ): Promise<UpsertFactsResult> {
    const key = `facts:${userId}`;
    const existing = this.storage.get(key) || [];
    this.storage.set(key, [...existing, ...edges]);
    
    return {
      success: true,
      upserted_count: edges.length,
      updated_count: 0,
      failed_count: 0
    };
  }
  
  async getSessionMessages(
    userId: string, 
    sessionId: string, 
    limit?: number, 
    before?: string
  ): Promise<SessionMessagesResult> {
    const key = `messages:${userId}:${sessionId}`;
    const messages = this.storage.get(key) || [];
    
    return {
      success: true,
      messages: messages.slice(0, limit || 50),
      has_more: messages.length > (limit || 50),
      total_count: messages.length
    };
  }
}
```

## Dependency Injection

```typescript
// apps/api/src/di/container.ts

import { IZepAdapter } from '../adapters/zep.adapter';
import { ZepAdapter } from '../adapters/zep.adapter.impl';
import { MockZepAdapter } from '../adapters/zep.adapter.mock';

export function createZepAdapter(
  config: AppConfig,
  telemetry: TelemetryService,
  logger: Logger
): IZepAdapter {
  if (config.environment === 'test' || config.useMockZep) {
    return new MockZepAdapter();
  }
  
  return new ZepAdapter(
    config.zepApiKey,
    config.zepBaseUrl,
    telemetry,
    logger
  );
}
```

## Performance Considerations

### Caching Strategy

```typescript
interface CacheEntry {
  data: any;
  expiry: number;
}

class ZepAdapter {
  private cache: Map<string, CacheEntry> = new Map();
  
  private getCached(key: string): any {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  private setCached(key: string, data: any, ttlSeconds: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + (ttlSeconds * 1000)
    });
  }
  
  // Periodic cleanup
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiry) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Every minute
  }
}
```

### Batching Operations

```typescript
class BatchProcessor {
  private queue: Map<string, QueueItem[]> = new Map();
  private timer: NodeJS.Timeout | null = null;
  
  add(userId: string, item: QueueItem): void {
    const userQueue = this.queue.get(userId) || [];
    userQueue.push(item);
    this.queue.set(userId, userQueue);
    
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 100); // 100ms batch window
    }
  }
  
  private async flush(): Promise<void> {
    const batches = Array.from(this.queue.entries());
    this.queue.clear();
    this.timer = null;
    
    for (const [userId, items] of batches) {
      try {
        await this.processBatch(userId, items);
      } catch (error) {
        logger.error('Batch processing failed', { userId, error });
      }
    }
  }
}
```

## Monitoring & Alerts

### Key Metrics

- `zep.adapter.latency` - Method execution time
- `zep.adapter.errors` - Error rate by operation
- `zep.adapter.cache.hits` - Cache hit rate
- `zep.adapter.batch.size` - Average batch size

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Latency (p95) | > 1000ms | > 3000ms |
| Error rate | > 1% | > 5% |
| Cache hit rate | < 50% | < 20% |

## Version History

- **v1.0.0** - Initial adapter interface specification
- **v1.1.0** - Added batching support (planned)
- **v1.2.0** - Enhanced caching strategy (planned)