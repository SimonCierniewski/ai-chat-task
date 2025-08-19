# Zep Failure Handling Specification

## Overview

This document defines how the system handles Zep service failures, including timeouts, errors, retries, and fallback strategies. The primary goal is to **never block SSE streaming** to clients—memory is a enhancement, not a requirement.

## Core Principles

1. **Never Block SSE**: Chat must continue even if Zep is completely unavailable
2. **Fail Fast**: Use aggressive timeouts to minimize user-perceived latency
3. **Graceful Degradation**: Fallback to no-memory mode on failures
4. **Smart Retries**: Retry only on transient errors with exponential backoff
5. **Observability**: Log all failures for monitoring and debugging

## Timeout Configuration

### Timeout Values by Operation

| Operation | Base Timeout | With US Latency | Max Timeout | Rationale |
|-----------|-------------|-----------------|-------------|-----------|
| Collection Check | 300ms | 450ms | 500ms | Quick check, cached often |
| Memory Search | 500ms | 650ms | 700ms | Critical path, must be fast |
| Add Messages | 1000ms | 1150ms | 2000ms | Async, not blocking |
| Upsert Facts | 1000ms | 1150ms | 2000ms | Async, not blocking |
| Session History | 400ms | 550ms | 600ms | User-facing, needs speed |

### Timeout Implementation

```typescript
// apps/api/src/config/zep.config.ts

export const ZEP_TIMEOUTS = {
  // Base timeouts (for EU/same-region)
  base: {
    collection: 300,
    search: 500,
    messages: 1000,
    facts: 1000,
    history: 400
  },
  
  // Latency adjustment for US region
  latencyAdjustment: 150,
  
  // Maximum allowed timeouts
  max: {
    collection: 500,
    search: 700,
    messages: 2000,
    facts: 2000,
    history: 600
  },
  
  // Global timeout for any Zep operation
  global: 3000
} as const;

export function getTimeout(operation: keyof typeof ZEP_TIMEOUTS.base): number {
  const base = ZEP_TIMEOUTS.base[operation];
  const adjusted = base + ZEP_TIMEOUTS.latencyAdjustment;
  const max = ZEP_TIMEOUTS.max[operation];
  
  return Math.min(adjusted, max);
}
```

### Timeout Wrapper

```typescript
// apps/api/src/utils/timeout.ts

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(`${operation} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

export class TimeoutError extends Error {
  code = 'TIMEOUT';
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
```

## Retry Strategy

### Retry Decision Matrix

| HTTP Status | Error Type | Retry? | Strategy | Max Attempts |
|------------|------------|--------|----------|--------------|
| 429 | Rate Limited | Yes | Exponential backoff with jitter | 3 |
| 500-503 | Server Error | Yes | Exponential backoff with jitter | 1 |
| 504 | Gateway Timeout | Yes | Immediate retry once | 1 |
| 400-499 | Client Error | No | No retry | 0 |
| Network | Connection Error | Yes | Immediate retry once | 1 |
| Timeout | Operation Timeout | No | No retry (already slow) | 0 |

### Retry Implementation

```typescript
// apps/api/src/utils/retry.ts

interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  jitter: boolean;
}

export class RetryManager {
  private readonly configs: Map<string, RetryConfig> = new Map([
    ['rate_limit', { maxAttempts: 3, initialDelay: 1000, maxDelay: 10000, jitter: true }],
    ['server_error', { maxAttempts: 1, initialDelay: 500, maxDelay: 2000, jitter: true }],
    ['gateway_timeout', { maxAttempts: 1, initialDelay: 0, maxDelay: 0, jitter: false }],
    ['network_error', { maxAttempts: 1, initialDelay: 100, maxDelay: 500, jitter: true }]
  ]);
  
  async execute<T>(
    operation: () => Promise<T>,
    context: { operation: string; userId?: string }
  ): Promise<T> {
    let lastError: any;
    let attempt = 0;
    
    while (true) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        attempt++;
        
        const retryConfig = this.getRetryConfig(error);
        
        if (!retryConfig || attempt > retryConfig.maxAttempts) {
          throw error;
        }
        
        const delay = this.calculateDelay(attempt, retryConfig);
        
        logger.warn('Retrying Zep operation', {
          operation: context.operation,
          userId: context.userId,
          attempt,
          delay,
          error: error.message
        });
        
        await this.sleep(delay);
      }
    }
  }
  
  private getRetryConfig(error: any): RetryConfig | null {
    // Don't retry timeouts
    if (error.code === 'TIMEOUT') {
      return null;
    }
    
    // Don't retry 4xx errors (except 429)
    if (error.status >= 400 && error.status < 500 && error.status !== 429) {
      return null;
    }
    
    // Rate limit
    if (error.status === 429) {
      return this.configs.get('rate_limit')!;
    }
    
    // Server errors (5xx)
    if (error.status >= 500 && error.status < 504) {
      return this.configs.get('server_error')!;
    }
    
    // Gateway timeout
    if (error.status === 504) {
      return this.configs.get('gateway_timeout')!;
    }
    
    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return this.configs.get('network_error')!;
    }
    
    return null;
  }
  
  private calculateDelay(attempt: number, config: RetryConfig): number {
    if (config.initialDelay === 0) {
      return 0;
    }
    
    // Exponential backoff: delay = min(initialDelay * 2^(attempt-1), maxDelay)
    let delay = Math.min(
      config.initialDelay * Math.pow(2, attempt - 1),
      config.maxDelay
    );
    
    // Add jitter (±25%)
    if (config.jitter) {
      const jitter = delay * 0.25;
      delay = delay - jitter + (Math.random() * jitter * 2);
    }
    
    return Math.floor(delay);
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Fallback Strategies

### Fallback Hierarchy

1. **Primary**: Use Zep search results
2. **Cache**: Use cached results if available (< 60s old)
3. **No Memory**: Continue without context
4. **Skip**: Skip the operation entirely

### Fallback Implementation

```typescript
// apps/api/src/services/memory-fallback.ts

export class MemoryFallbackService {
  private cache: Map<string, CachedMemory> = new Map();
  
  async getMemoryWithFallback(
    userId: string,
    query: string,
    config: RetrievalConfig
  ): Promise<RetrievalPayload | null> {
    const cacheKey = this.getCacheKey(userId, query);
    
    try {
      // Try primary Zep search
      const results = await withTimeout(
        this.zepAdapter.searchMemory(userId, query, config),
        getTimeout('search'),
        'Zep search'
      );
      
      // Cache successful results
      this.cache.set(cacheKey, {
        data: results,
        timestamp: Date.now()
      });
      
      return results;
      
    } catch (error) {
      logger.warn('Zep search failed, attempting fallback', {
        userId,
        error: error.message
      });
      
      // Try cache fallback
      const cached = this.getCached(cacheKey);
      if (cached) {
        logger.info('Using cached memory results', {
          userId,
          age: Date.now() - cached.timestamp
        });
        return cached.data;
      }
      
      // Log fallback to no memory
      await this.telemetry.recordEvent({
        type: 'zep_error',
        user_id: userId,
        payload_json: {
          operation: 'memory_search',
          error_code: error.code || 'UNKNOWN',
          fallback: 'no_memory'
        }
      });
      
      // Return null to indicate no memory available
      return null;
    }
  }
  
  private getCached(key: string): CachedMemory | null {
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache is stale (> 60 seconds)
    const age = Date.now() - cached.timestamp;
    if (age > 60000) {
      this.cache.delete(key);
      return null;
    }
    
    return cached;
  }
  
  private getCacheKey(userId: string, query: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${userId}:${query}`)
      .digest('hex')
      .substring(0, 16);
    
    return `memory:${hash}`;
  }
}

interface CachedMemory {
  data: RetrievalPayload;
  timestamp: number;
}
```

## Error Handling Patterns

### Chat Request Handler

```typescript
// apps/api/src/handlers/chat.handler.ts

export class ChatHandler {
  async handle(request: ChatRequest): Promise<void> {
    const reqId = generateRequestId();
    const startTime = Date.now();
    
    // Initialize SSE stream immediately
    const stream = new SSEStream(response);
    
    try {
      // Get memory if requested (non-blocking)
      let memoryContext: string | null = null;
      
      if (request.useMemory) {
        const memoryStart = Date.now();
        
        try {
          const memories = await this.memoryFallback.getMemoryWithFallback(
            request.userId,
            request.message,
            this.config.retrieval
          );
          
          if (memories) {
            memoryContext = this.formatMemories(memories);
            
            // Log successful memory retrieval
            await this.telemetry.recordEvent({
              type: 'zep_search',
              user_id: request.userId,
              req_id: reqId,
              payload_json: {
                zep_ms: Date.now() - memoryStart,
                results_count: memories.memories.length
              }
            });
          }
        } catch (error) {
          // Memory failed but we continue
          logger.warn('Memory retrieval failed, continuing without context', {
            userId: request.userId,
            error: error.message,
            duration: Date.now() - memoryStart
          });
        }
      }
      
      // Build prompt with or without memory
      const prompt = this.buildPrompt(request.message, memoryContext);
      
      // Stream from OpenAI
      await this.openAIService.streamChat(prompt, stream);
      
      // Store message asynchronously (fire-and-forget)
      this.storeMessageAsync(request.userId, request.sessionId, request.message)
        .catch(error => {
          logger.error('Failed to store message', { error });
        });
      
    } catch (error) {
      // Critical error (OpenAI failed)
      stream.error({
        code: 'CHAT_ERROR',
        message: 'Failed to process chat request'
      });
      
      throw error;
    } finally {
      stream.close();
    }
  }
  
  private async storeMessageAsync(
    userId: string,
    sessionId: string,
    message: string
  ): Promise<void> {
    // Non-critical path - don't use strict timeout
    const timeout = getTimeout('messages');
    
    try {
      await withTimeout(
        this.retryManager.execute(
          () => this.zepAdapter.addMessages(userId, sessionId, [
            {
              role: 'user',
              content: message,
              timestamp: new Date().toISOString()
            }
          ]),
          { operation: 'add_messages', userId }
        ),
        timeout,
        'Store message'
      );
    } catch (error) {
      // Log but don't throw - this is fire-and-forget
      await this.telemetry.recordEvent({
        type: 'zep_error',
        user_id: userId,
        payload_json: {
          operation: 'add_messages',
          error_code: error.code || 'STORE_FAILED',
          fallback: 'skip'
        }
      });
    }
  }
}
```

## Circuit Breaker Pattern

### Implementation

```typescript
// apps/api/src/utils/circuit-breaker.ts

export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  
  constructor(
    private readonly threshold = 5,
    private readonly timeout = 60000,  // 1 minute
    private readonly halfOpenRequests = 3
  ) {}
  
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => T
  ): Promise<T> {
    // Check if circuit should be reset
    if (this.state === 'open' && this.shouldAttemptReset()) {
      this.state = 'half_open';
      this.successCount = 0;
    }
    
    // If open, use fallback immediately
    if (this.state === 'open') {
      if (fallback) {
        return fallback();
      }
      throw new Error('Circuit breaker is open');
    }
    
    try {
      const result = await operation();
      
      // Record success
      if (this.state === 'half_open') {
        this.successCount++;
        if (this.successCount >= this.halfOpenRequests) {
          this.reset();
        }
      } else {
        this.failures = Math.max(0, this.failures - 1);
      }
      
      return result;
      
    } catch (error) {
      this.recordFailure();
      
      if (this.failures >= this.threshold) {
        this.trip();
      }
      
      if (fallback) {
        return fallback();
      }
      
      throw error;
    }
  }
  
  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime > this.timeout;
  }
  
  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
  }
  
  private trip(): void {
    this.state = 'open';
    logger.warn('Circuit breaker tripped', {
      failures: this.failures,
      threshold: this.threshold
    });
  }
  
  private reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successCount = 0;
    logger.info('Circuit breaker reset');
  }
  
  getState(): string {
    return this.state;
  }
}
```

### Usage with Zep

```typescript
class ZepAdapter {
  private circuitBreaker = new CircuitBreaker(5, 60000, 3);
  
  async searchMemory(
    userId: string,
    query: string,
    config: RetrievalConfig
  ): Promise<RetrievalPayload | null> {
    return this.circuitBreaker.execute(
      async () => {
        // Actual Zep search
        return await this.performSearch(userId, query, config);
      },
      () => {
        // Fallback to empty results
        logger.info('Circuit breaker open, returning empty memories');
        return null;
      }
    );
  }
}
```

## Monitoring & Alerting

### Key Metrics

```typescript
// Metrics to track
interface ZepHealthMetrics {
  // Availability
  availability: number;           // Percentage uptime
  circuitBreakerState: string;   // closed/open/half_open
  
  // Performance
  p50Latency: number;            // Median latency
  p95Latency: number;            // 95th percentile
  p99Latency: number;            // 99th percentile
  timeoutRate: number;           // Percentage of timeouts
  
  // Errors
  errorRate: number;             // Overall error rate
  error4xxRate: number;          // Client error rate
  error5xxRate: number;          // Server error rate
  networkErrorRate: number;      // Connection failures
  
  // Fallbacks
  fallbackRate: number;          // How often we fallback
  cacheHitRate: number;          // Cache usage when primary fails
  noMemoryRate: number;          // How often we run without memory
  
  // Retries
  retryRate: number;             // Percentage of requests retried
  retrySuccessRate: number;      // Success rate of retries
}
```

### Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Error Rate | > 5% | > 10% | Check Zep health |
| Timeout Rate | > 10% | > 25% | Increase timeouts or check network |
| P95 Latency | > 1000ms | > 2000ms | Optimize queries or add caching |
| Circuit Breaker | half_open | open | Investigate root cause |
| Fallback Rate | > 20% | > 50% | Check Zep availability |

### Health Check Endpoint

```typescript
// GET /health/zep
app.get('/health/zep', async (req, res) => {
  const health = await zepHealthCheck();
  
  res.status(health.healthy ? 200 : 503).json({
    status: health.healthy ? 'healthy' : 'degraded',
    circuit_breaker: circuitBreaker.getState(),
    last_error: health.lastError,
    metrics: {
      error_rate: health.errorRate,
      avg_latency: health.avgLatency,
      timeout_rate: health.timeoutRate
    }
  });
});

async function zepHealthCheck(): Promise<HealthStatus> {
  try {
    const start = Date.now();
    const testUserId = 'health-check';
    
    // Try a simple operation with tight timeout
    await withTimeout(
      zepAdapter.ensureUserCollection(testUserId),
      300,
      'Health check'
    );
    
    return {
      healthy: true,
      latency: Date.now() - start,
      errorRate: getErrorRate(),
      avgLatency: getAvgLatency(),
      timeoutRate: getTimeoutRate()
    };
    
  } catch (error) {
    return {
      healthy: false,
      lastError: error.message,
      errorRate: getErrorRate(),
      avgLatency: getAvgLatency(),
      timeoutRate: getTimeoutRate()
    };
  }
}
```

## Testing Failure Scenarios

### Unit Tests

```typescript
describe('Zep Failure Handling', () => {
  describe('Timeouts', () => {
    it('should timeout after configured duration', async () => {
      // Mock slow Zep response
      mockZepClient.search.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );
      
      const promise = zepAdapter.searchMemory('user', 'query', config);
      
      await expect(promise).rejects.toThrow(TimeoutError);
      await expect(promise).rejects.toMatchObject({
        code: 'TIMEOUT',
        message: expect.stringContaining('700ms')  // Search timeout
      });
    });
    
    it('should not retry on timeout', async () => {
      mockZepClient.search.mockRejectedValue(new TimeoutError('Timeout'));
      
      await expect(
        retryManager.execute(() => zepAdapter.searchMemory('user', 'query', config))
      ).rejects.toThrow(TimeoutError);
      
      expect(mockZepClient.search).toHaveBeenCalledTimes(1);  // No retry
    });
  });
  
  describe('Retries', () => {
    it('should retry once on 5xx errors', async () => {
      mockZepClient.search
        .mockRejectedValueOnce({ status: 503, message: 'Service Unavailable' })
        .mockResolvedValueOnce(mockResults);
      
      const result = await retryManager.execute(
        () => zepAdapter.searchMemory('user', 'query', config)
      );
      
      expect(result).toBeDefined();
      expect(mockZepClient.search).toHaveBeenCalledTimes(2);
    });
    
    it('should not retry on 4xx errors', async () => {
      mockZepClient.search.mockRejectedValue({ status: 400, message: 'Bad Request' });
      
      await expect(
        retryManager.execute(() => zepAdapter.searchMemory('user', 'query', config))
      ).rejects.toMatchObject({ status: 400 });
      
      expect(mockZepClient.search).toHaveBeenCalledTimes(1);
    });
    
    it('should add jitter to retry delay', async () => {
      const delays: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        const delay = retryManager.calculateDelay(2, {
          initialDelay: 1000,
          maxDelay: 10000,
          jitter: true
        });
        delays.push(delay);
      }
      
      // All delays should be different due to jitter
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(5);
      
      // All should be within range
      delays.forEach(delay => {
        expect(delay).toBeGreaterThan(1500);  // 2000 - 25%
        expect(delay).toBeLessThan(2500);     // 2000 + 25%
      });
    });
  });
  
  describe('Fallbacks', () => {
    it('should use cached results on failure', async () => {
      // First call succeeds and caches
      mockZepClient.search.mockResolvedValueOnce(mockResults);
      await memoryFallback.getMemoryWithFallback('user', 'query', config);
      
      // Second call fails but uses cache
      mockZepClient.search.mockRejectedValueOnce(new Error('Network error'));
      const cached = await memoryFallback.getMemoryWithFallback('user', 'query', config);
      
      expect(cached).toEqual(mockResults);
    });
    
    it('should return null when no fallback available', async () => {
      mockZepClient.search.mockRejectedValue(new Error('Network error'));
      
      const result = await memoryFallback.getMemoryWithFallback('user', 'query', config);
      
      expect(result).toBeNull();
    });
  });
  
  describe('Circuit Breaker', () => {
    it('should trip after threshold failures', async () => {
      const breaker = new CircuitBreaker(3, 60000, 3);
      const operation = jest.fn().mockRejectedValue(new Error('Failed'));
      
      // Fail 3 times to trip breaker
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(operation)).rejects.toThrow();
      }
      
      expect(breaker.getState()).toBe('open');
      
      // Next call should not execute operation
      operation.mockClear();
      await expect(breaker.execute(operation)).rejects.toThrow('Circuit breaker is open');
      expect(operation).not.toHaveBeenCalled();
    });
  });
});
```

### Integration Tests

```typescript
describe('Zep Failure Integration', () => {
  it('should continue chat when Zep is unavailable', async () => {
    // Simulate Zep being down
    nock('https://api.getzep.com')
      .post(/.*/)
      .reply(503, 'Service Unavailable');
    
    const response = await request(app)
      .post('/api/chat')
      .send({
        message: 'Hello',
        useMemory: true
      })
      .expect(200);
    
    // Should still get response without memory
    expect(response.body).toHaveProperty('response');
    
    // Should have logged error
    const errors = await getRecentErrors();
    expect(errors).toContainEqual(
      expect.objectContaining({
        type: 'zep_error',
        payload_json: expect.objectContaining({
          fallback: 'no_memory'
        })
      })
    );
  });
});
```

## Failure Recovery Procedures

### Manual Recovery Steps

1. **Check Zep Health**
   ```bash
   curl https://api.getzep.com/health
   ```

2. **Reset Circuit Breaker**
   ```bash
   curl -X POST http://api/admin/circuit-breaker/reset
   ```

3. **Clear Error Cache**
   ```bash
   curl -X POST http://api/admin/cache/clear?type=errors
   ```

4. **Verify Recovery**
   ```bash
   curl http://api/health/zep
   ```

### Automated Recovery

```typescript
// Scheduled health check and recovery
setInterval(async () => {
  const health = await zepHealthCheck();
  
  if (!health.healthy) {
    logger.error('Zep unhealthy', health);
    
    // Auto-recovery attempts
    if (health.errorRate > 0.5) {
      // Reset circuit breaker after cooldown
      setTimeout(() => {
        circuitBreaker.reset();
        logger.info('Auto-reset circuit breaker');
      }, 30000);
    }
  }
}, 60000);  // Every minute
```

## Version History

- **v1.0.0** - Initial failure handling specification
- **v1.1.0** - Added circuit breaker pattern
- **v1.2.0** - Enhanced retry strategies (planned)