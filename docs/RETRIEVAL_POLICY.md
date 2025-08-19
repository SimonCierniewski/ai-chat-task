# Retrieval Policy Specification

## Overview

This document defines the deterministic retrieval policy for memory-augmented chat interactions. These rules ensure consistent, predictable memory retrieval behavior across all system components.

## When to Search

Memory retrieval is triggered when **ALL** of the following conditions are met:

1. `useMemory = true` in the request payload
2. `sessionId` is provided and valid
3. User has an existing Zep collection (`user:{userId}`)
4. No active rate limit violations

## Retrieval Parameters

### Core Settings

```typescript
interface RetrievalConfig {
  topK: number;           // 6-10 results (default: 8)
  clipSentences: number;  // 1-2 sentences per fact (default: 2)
  maxTokens: number;      // ≤1500 tokens total (default: 1500)
  searchType: 'hybrid' | 'semantic' | 'keyword'; // default: 'hybrid'
  minScore: number;       // 0.0-1.0 minimum relevance (default: 0.3)
}
```

### Default Configuration

```json
{
  "topK": 8,
  "clipSentences": 2,
  "maxTokens": 1500,
  "searchType": "hybrid",
  "minScore": 0.3
}
```

## Retrieval Process

### 1. Search Phase

```typescript
// Step 1: Query Zep
const rawResults = await zep.search({
  collection: `user:${userId}`,
  query: userMessage,
  limit: topK * 2,  // Fetch extra for filtering
  searchType: config.searchType
});
```

### 2. Deduplication

Deduplication uses normalized text hashing to eliminate redundant content:

```typescript
function deduplicateResults(results: MemoryResult[]): MemoryResult[] {
  const seen = new Set<string>();
  const deduped: MemoryResult[] = [];
  
  for (const result of results) {
    const hash = normalizeAndHash(result.content);
    if (!seen.has(hash)) {
      seen.add(hash);
      deduped.push(result);
    }
  }
  
  return deduped.slice(0, config.topK);
}

function normalizeAndHash(text: string): string {
  // 1. Convert to lowercase
  // 2. Apply NFKC normalization
  // 3. Remove extra whitespace
  // 4. Remove punctuation at boundaries
  // 5. Generate SHA256 hash
  const normalized = text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\w]+|[^\w]+$/g, '');
  
  return crypto.createHash('sha256')
    .update(normalized)
    .digest('hex')
    .substring(0, 16); // Use first 16 chars
}
```

### 3. Interleaving Strategy

Combine recency and relevance for optimal context:

```typescript
function interleaveResults(results: MemoryResult[]): MemoryResult[] {
  // Sort by score (descending)
  const byScore = [...results].sort((a, b) => b.score - a.score);
  
  // Sort by recency (newest first)
  const byRecency = [...results].sort((a, b) => 
    b.timestamp.getTime() - a.timestamp.getTime()
  );
  
  // Interleave: alternate between relevance and recency
  const interleaved: MemoryResult[] = [];
  const usedIds = new Set<string>();
  
  for (let i = 0; i < config.topK; i++) {
    const source = i % 2 === 0 ? byScore : byRecency;
    for (const item of source) {
      if (!usedIds.has(item.id)) {
        interleaved.push(item);
        usedIds.add(item.id);
        break;
      }
    }
  }
  
  return interleaved;
}
```

### 4. Content Clipping

Trim each memory to sentence boundaries:

```typescript
function clipContent(text: string, maxSentences: number): string {
  // Split on sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  // Take first N sentences
  const clipped = sentences
    .slice(0, maxSentences)
    .join(' ')
    .trim();
  
  // Add ellipsis if truncated
  if (sentences.length > maxSentences) {
    return clipped + '...';
  }
  
  return clipped;
}
```

### 5. Token Budget Management

Enforce strict token limits:

```typescript
function enforceTokenBudget(
  memories: ProcessedMemory[], 
  maxTokens: number
): ProcessedMemory[] {
  const result: ProcessedMemory[] = [];
  let totalTokens = 0;
  
  for (const memory of memories) {
    // Approximate: 1 token ≈ 4 characters
    const estimatedTokens = Math.ceil(memory.content.length / 4);
    
    if (totalTokens + estimatedTokens <= maxTokens) {
      result.push(memory);
      totalTokens += estimatedTokens;
    } else if (totalTokens < maxTokens) {
      // Partially include last item
      const remainingTokens = maxTokens - totalTokens;
      const maxChars = remainingTokens * 4;
      memory.content = memory.content.substring(0, maxChars) + '...';
      result.push(memory);
      break;
    } else {
      break;
    }
  }
  
  return result;
}
```

### 6. Optional Redaction Hook

Support for PII/sensitive data redaction:

```typescript
interface RedactionConfig {
  enabled: boolean;
  patterns: RegExp[];
  replacement: string;
}

function applyRedaction(
  content: string, 
  config: RedactionConfig
): string {
  if (!config.enabled) return content;
  
  let redacted = content;
  for (const pattern of config.patterns) {
    redacted = redacted.replace(pattern, config.replacement);
  }
  
  return redacted;
}

// Default redaction patterns
const DEFAULT_REDACTION: RedactionConfig = {
  enabled: false,
  patterns: [
    /\b\d{3}-\d{2}-\d{4}\b/g,  // SSN
    /\b\d{16}\b/g,              // Credit card
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi  // Email
  ],
  replacement: '[REDACTED]'
};
```

## Final Payload Shape

The retrieval process produces a structured payload ready for system prompt injection:

```typescript
interface RetrievalPayload {
  memories: MemoryEntry[];
  metadata: RetrievalMetadata;
}

interface MemoryEntry {
  id: string;                // Unique identifier
  content: string;           // Clipped, deduplicated content
  score: number;             // 0.0-1.0 relevance score
  timestamp: string;         // ISO 8601 timestamp
  sessionId: string;         // Source session
  messageId?: string;        // Source message (if applicable)
  type: 'message' | 'fact' | 'summary';
  role?: 'user' | 'assistant';
  provenance: {
    collection: string;      // e.g., "user:123"
    searchType: string;      // e.g., "hybrid"
    originalLength: number;  // Pre-clip character count
    wasRedacted: boolean;
  };
}

interface RetrievalMetadata {
  queryTime: number;         // Milliseconds
  totalResults: number;      // Before filtering
  includedResults: number;   // After filtering
  totalTokens: number;       // Estimated
  appliedFilters: string[];  // e.g., ["deduplication", "score_threshold"]
  config: RetrievalConfig;   // Active configuration
}
```

## System Prompt Integration

Format memories for LLM consumption:

```typescript
function formatForSystemPrompt(payload: RetrievalPayload): string {
  if (payload.memories.length === 0) {
    return '';
  }
  
  const sections: string[] = [
    '## Relevant Context from Previous Conversations\n'
  ];
  
  // Group by type
  const messages = payload.memories.filter(m => m.type === 'message');
  const facts = payload.memories.filter(m => m.type === 'fact');
  const summaries = payload.memories.filter(m => m.type === 'summary');
  
  if (messages.length > 0) {
    sections.push('### Previous Messages');
    messages.forEach(m => {
      const role = m.role || 'user';
      const time = new Date(m.timestamp).toLocaleString();
      sections.push(`[${time}] ${role}: ${m.content}`);
    });
    sections.push('');
  }
  
  if (facts.length > 0) {
    sections.push('### Known Facts');
    facts.forEach(f => {
      sections.push(`- ${f.content} (confidence: ${f.score.toFixed(2)})`);
    });
    sections.push('');
  }
  
  if (summaries.length > 0) {
    sections.push('### Conversation Summaries');
    summaries.forEach(s => {
      sections.push(`- ${s.content}`);
    });
    sections.push('');
  }
  
  sections.push(`_Retrieved ${payload.metadata.includedResults} memories in ${payload.metadata.queryTime}ms_\n`);
  
  return sections.join('\n');
}
```

## Error Handling

```typescript
interface RetrievalError {
  code: string;
  message: string;
  fallback: 'skip' | 'empty' | 'cache';
}

const ERROR_POLICIES: Record<string, RetrievalError> = {
  ZEP_UNAVAILABLE: {
    code: 'ZEP_UNAVAILABLE',
    message: 'Memory service temporarily unavailable',
    fallback: 'skip'  // Continue without memory
  },
  COLLECTION_NOT_FOUND: {
    code: 'COLLECTION_NOT_FOUND',
    message: 'User memory collection does not exist',
    fallback: 'empty'  // Return empty memories
  },
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    message: 'Memory retrieval rate limit exceeded',
    fallback: 'cache'  // Use cached results if available
  },
  INVALID_QUERY: {
    code: 'INVALID_QUERY',
    message: 'Query text invalid or too long',
    fallback: 'skip'
  }
};
```

## Performance Targets

- **Retrieval latency**: < 200ms (excluding Zep RTT)
- **Processing overhead**: < 50ms for dedup + clip + format
- **Memory overhead**: < 10MB per request
- **Cache TTL**: 60 seconds for identical queries

## Testing Guidelines

### Unit Tests

```typescript
describe('RetrievalPolicy', () => {
  test('deduplication removes exact matches', () => {
    const input = [
      { id: '1', content: 'Hello world' },
      { id: '2', content: 'Hello world' },
      { id: '3', content: 'HELLO WORLD' }
    ];
    const result = deduplicateResults(input);
    expect(result).toHaveLength(1);
  });
  
  test('token budget enforced strictly', () => {
    const memories = generateLargeMemories(10000);
    const result = enforceTokenBudget(memories, 1500);
    const tokens = estimateTokens(result);
    expect(tokens).toBeLessThanOrEqual(1500);
  });
  
  test('interleaving alternates score and recency', () => {
    const memories = generateTestMemories();
    const result = interleaveResults(memories);
    // Verify alternating pattern
    expect(result[0].score).toBeGreaterThan(0.8);
    expect(result[1].timestamp).toBeGreaterThan(recentCutoff);
  });
});
```

### Integration Tests

1. Verify Zep search returns within timeout
2. Confirm deduplication across session boundaries
3. Test token limits with various languages/scripts
4. Validate provenance tracking accuracy

## Configuration Overrides

Admin users can override defaults via `AdminMemorySettings`:

```typescript
interface AdminMemorySettings {
  retrieval: {
    topK: number;           // Range: 1-20
    clipSentences: number;  // Range: 1-5
    maxTokens: number;      // Range: 100-3000
    searchType: 'hybrid' | 'semantic' | 'keyword';
    minScore: number;       // Range: 0.0-1.0
    enableRedaction: boolean;
    customRedactionPatterns?: string[];
  };
  interleaving: {
    strategy: 'alternate' | 'score_first' | 'recency_first';
    ratio?: number;  // For weighted strategies
  };
}
```

## Monitoring & Metrics

Track these metrics for optimization:

- `retrieval.latency_ms` - End-to-end retrieval time
- `retrieval.results_count` - Number of results returned
- `retrieval.tokens_used` - Actual tokens consumed
- `retrieval.dedup_ratio` - Percentage of duplicates removed
- `retrieval.cache_hit_rate` - Percentage served from cache

## Version History

- **v1.0.0** - Initial specification
- **v1.1.0** - Added redaction hooks (planned)
- **v1.2.0** - Enhanced interleaving strategies (planned)