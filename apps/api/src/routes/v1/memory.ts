/**
 * Memory API Routes
 * Zep memory system integration with telemetry and validation
 */

import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireAuth } from '../../utils/guards';
import { createValidator } from '../../utils/validator';
import { logger } from '../../utils/logger';
import {
  CreateGraphEdge,
  createGraphEdgeSchema,
  TelemetryRetrievalResult,
  MemorySearchQuery,
  memorySearchQuerySchema,
  estimateTokens,
  sortByRelevance,
  filterByScore,
  trimToTokenBudget
} from '@prototype/shared';
import { CONFIG_PRESETS } from '@prototype/shared';

// ============================================================================
// Types & Schemas
// ============================================================================

/**
 * Memory upsert request body
 */
interface MemoryUpsertRequest {
  facts: CreateGraphEdge[];
  sessionId?: string;
}

/**
 * Memory upsert response
 */
interface MemoryUpsertResponse {
  ok: true;
  upserted: number;
  session_id?: string;
  timing: {
    zep_ms: number;
    total_ms: number;
  };
}

/**
 * Memory search response
 */
interface MemorySearchResponse {
  results: TelemetryRetrievalResult[];
  total_tokens: number;
  timing: {
    zep_ms: number;
    total_ms: number;
  };
  metadata: {
    query: string;
    results_count: number;
    truncated: boolean;
  };
}

/**
 * Zep error response structure
 */
interface ZepError {
  status: number;
  message: string;
  details?: string;
  request_id?: string;
}

// Request/Response Schemas for validation
const upsertRequestSchema = Type.Object({
  facts: Type.Array(Type.Object({
    subject: Type.String({ minLength: 1, maxLength: 200 }),
    predicate: Type.String(),
    object: Type.String({ minLength: 1, maxLength: 500 }),
    confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    source_message_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    metadata: Type.Optional(Type.Object({}, { additionalProperties: true }))
  }), { minItems: 1, maxItems: 50 }),
  sessionId: Type.Optional(Type.String({ pattern: '^session-\\d{8}-\\d{6}-[a-z0-9]{4}$' }))
});

const searchQuerySchema = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 1000 }),
  sessionId: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  min_score: Type.Optional(Type.Number({ minimum: 0, maximum: 1 }))
});

// Validators
const validateUpsertRequest = createValidator(upsertRequestSchema);
const validateSearchQuery = createValidator(searchQuerySchema);

// ============================================================================
// Stub Zep Adapter (Phase 4 implementation)
// ============================================================================

/**
 * Stub Zep adapter for Phase 4 - to be replaced with real implementation
 */
class ZepAdapter {
  async upsertFacts(
    userId: string,
    edges: CreateGraphEdge[],
    sessionId?: string
  ): Promise<{ success: boolean; upserted: number }> {
    // Simulate Zep API call latency
    const delay = Math.random() * 100 + 50; // 50-150ms
    await new Promise(resolve => setTimeout(resolve, delay));

    logger.info('Zep upsert (stub)', {
      userId,
      edgeCount: edges.length,
      sessionId,
      edges: edges.map(e => ({ subject: e.subject, predicate: e.predicate, object: e.object }))
    });

    return {
      success: true,
      upserted: edges.length
    };
  }

  async searchMemory(
    userId: string,
    query: string,
    options: {
      sessionId?: string;
      limit?: number;
      minScore?: number;
      topK?: number;
      tokenBudget?: number;
      clipSentences?: number;
    } = {}
  ): Promise<TelemetryRetrievalResult[]> {
    // Simulate Zep API call latency
    const delay = Math.random() * 100 + 100; // 100-200ms
    await new Promise(resolve => setTimeout(resolve, delay));

    const limit = options.limit || CONFIG_PRESETS.DEFAULT.top_k;
    const minScore = options.minScore || 0.7;

    logger.info('Zep search (stub)', {
      userId,
      query: query.substring(0, 100),
      sessionId: options.sessionId,
      limit,
      minScore
    });

    // Generate mock retrieval results
    const mockResults: TelemetryRetrievalResult[] = [
      {
        id: `result-1-${Date.now()}`,
        session_id: options.sessionId || null,
        text: `User mentioned: "${query.substring(0, 50)}..." in previous conversation.`,
        score: 0.9,
        source_type: 'message',
        tokens_estimate: estimateTokens(`User mentioned: "${query.substring(0, 50)}..." in previous conversation.`),
        metadata: {
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          confidence: 0.9
        }
      },
      {
        id: `result-2-${Date.now()}`,
        session_id: null,
        text: `User likes programming and works at tech company.`,
        score: 0.8,
        source_type: 'fact',
        tokens_estimate: estimateTokens('User likes programming and works at tech company.'),
        metadata: {
          fact_id: 'fact-123',
          confidence: 0.8
        }
      }
    ];

    // Apply filtering and sorting
    const filtered = filterByScore(mockResults, minScore);
    const sorted = sortByRelevance(filtered);
    const limited = sorted.slice(0, limit);

    // Apply token budget trimming
    if (options.tokenBudget) {
      return trimToTokenBudget(limited, options.tokenBudget);
    }

    return limited;
  }
}

// Global adapter instance
const zepAdapter = new ZepAdapter();

// ============================================================================
// Error Handling Utilities
// ============================================================================

/**
 * Map Zep API errors to HTTP status codes
 */
function mapZepError(error: any): { status: number; message: string } {
  // Check if it's a Zep API error with status
  if (error.status || error.statusCode || error.response?.status) {
    const status = error.status || error.statusCode || error.response.status;

    if (status >= 400 && status < 500) {
      // Client errors (4xx) -> 400 Bad Request
      return {
        status: 400,
        message: error.message || 'Invalid request to memory service'
      };
    } else if (status >= 500 || status === 0) {
      // Server errors (5xx) or network errors -> 502 Bad Gateway
      return {
        status: 502,
        message: 'Memory service temporarily unavailable'
      };
    }
  }

  // Network/timeout errors -> 502 Bad Gateway
  if (error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.message?.includes('timeout')) {
    return {
      status: 502,
      message: 'Memory service temporarily unavailable'
    };
  }

  // Unknown errors -> 502 Bad Gateway
  return {
    status: 502,
    message: 'Memory service error'
  };
}

/**
 * Emit telemetry for Zep operations
 */
function emitZepTelemetry(
  req: FastifyRequest & { user: { id: string } },
  eventType: 'zep_upsert' | 'zep_search' | 'zep_error',
  payload: any
) {
  const basePayload = {
    user_id: req.user.id,
    session_id: payload.session_id || null,
    req_id: req.id
  };

  logger.info(`Telemetry: ${eventType}`, {
    ...basePayload,
    event_type: eventType,
    payload
  });

  // TODO: Phase 4 - Store in telemetry_events table
  // await telemetryService.logEvent(req.user.id, eventType, {
  //   ...basePayload,
  //   ...payload
  // });
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/v1/memory/upsert
 * Store facts/edges in user's Zep collection
 */
async function upsertMemoryHandler(
  req: FastifyRequest<{ Body: MemoryUpsertRequest }>,
  reply: FastifyReply
) {
  const startTime = Date.now();
  const authReq = req as FastifyRequest & { user: { id: string; role: string } };

  try {
    // Validate request body
    const validation = validateUpsertRequest(req.body);
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: validation.errors
      });
    }

    const { facts, sessionId } = req.body;
    const userId = authReq.user.id;

    logger.info('Memory upsert request', {
      req_id: req.id,
      user_id: userId,
      session_id: sessionId,
      fact_count: facts.length
    });

    // Measure Zep operation time
    const zapStartTime = Date.now();

    try {
      const result = await zepAdapter.upsertFacts(userId, facts, sessionId);
      const zepMs = Date.now() - zapStartTime;
      const totalMs = Date.now() - startTime;

      // Emit successful telemetry
      emitZepTelemetry(authReq, 'zep_upsert', {
        session_id: sessionId,
        edge_count: facts.length,
        zep_ms: zepMs,
        total_ms: totalMs,
        success: true
      });

      const response: MemoryUpsertResponse = {
        ok: true,
        upserted: result.upserted,
        session_id: sessionId,
        timing: {
          zep_ms: zepMs,
          total_ms: totalMs
        }
      };

      return reply.status(200).send(response);

    } catch (zepError) {
      const zepMs = Date.now() - zapStartTime;
      const mappedError = mapZepError(zepError);

      // Emit error telemetry
      emitZepTelemetry(authReq, 'zep_error', {
        session_id: sessionId,
        operation: 'upsert',
        edge_count: facts.length,
        zep_ms: zepMs,
        error_status: mappedError.status,
        error_message: mappedError.message,
        original_error: zepError.message
      });

      logger.error('Zep upsert error', {
        req_id: req.id,
        user_id: userId,
        error: zepError.message,
        zep_ms: zepMs
      });

      return reply.status(mappedError.status).send({
        error: 'ZEP_ERROR',
        message: mappedError.message
      });
    }

  } catch (error) {
    const totalMs = Date.now() - startTime;

    logger.error('Memory upsert handler error', {
      req_id: req.id,
      error: error.message,
      total_ms: totalMs
    });

    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Failed to process memory upsert request'
    });
  }
}

/**
 * GET /api/v1/memory/search
 * Search user's memory with query
 */
async function searchMemoryHandler(
  req: FastifyRequest<{ Querystring: { query: string; sessionId?: string; limit?: string; min_score?: string } }>,
  reply: FastifyReply
) {
  const startTime = Date.now();
  const authReq = req as FastifyRequest & { user: { id: string; role: string } };

  try {
    // Validate query parameters
    const queryParams = {
      query: req.query.query,
      sessionId: req.query.sessionId,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      min_score: req.query.min_score ? parseFloat(req.query.min_score) : undefined
    };

    const validation = validateSearchQuery(queryParams);
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: validation.errors
      });
    }

    const { query, sessionId, limit, min_score } = queryParams;
    const userId = authReq.user.id;

    // Apply admin defaults from memory config
    const memoryConfig = CONFIG_PRESETS.DEFAULT;
    const searchOptions = {
      sessionId,
      limit: limit || memoryConfig.top_k,
      minScore: min_score || memoryConfig.min_relevance_score || 0.7,
      topK: memoryConfig.top_k,
      tokenBudget: memoryConfig.memory_token_budget,
      clipSentences: memoryConfig.clip_sentences
    };

    logger.info('Memory search request', {
      req_id: req.id,
      user_id: userId,
      query: query.substring(0, 100), // Truncate for logging
      session_id: sessionId,
      search_options: searchOptions
    });

    // Measure Zep operation time
    const zapStartTime = Date.now();

    try {
      const results = await zepAdapter.searchMemory(userId, query, searchOptions);
      const zepMs = Date.now() - zapStartTime;
      const totalMs = Date.now() - startTime;

      // Calculate response metadata
      const totalTokens = results.reduce((sum, r) => sum + r.tokens_estimate, 0);
      const truncated = results.length === searchOptions.limit;

      // Emit successful telemetry
      emitZepTelemetry(authReq, 'zep_search', {
        session_id: sessionId,
        query_length: query.length,
        results_count: results.length,
        total_tokens: totalTokens,
        zep_ms: zepMs,
        total_ms: totalMs,
        success: true
      });

      const response: MemorySearchResponse = {
        results,
        total_tokens: totalTokens,
        timing: {
          zep_ms: zepMs,
          total_ms: totalMs
        },
        metadata: {
          query,
          results_count: results.length,
          truncated
        }
      };

      return reply.status(200).send(response);

    } catch (zepError) {
      const zepMs = Date.now() - zapStartTime;
      const mappedError = mapZepError(zepError);

      // Emit error telemetry
      emitZepTelemetry(authReq, 'zep_error', {
        session_id: sessionId,
        operation: 'search',
        query_length: query.length,
        zep_ms: zepMs,
        error_status: mappedError.status,
        error_message: mappedError.message,
        original_error: zepError.message
      });

      logger.error('Zep search error', {
        req_id: req.id,
        user_id: userId,
        error: zepError.message,
        zep_ms: zepMs
      });

      return reply.status(mappedError.status).send({
        error: 'ZEP_ERROR',
        message: mappedError.message
      });
    }

  } catch (error) {
    const totalMs = Date.now() - startTime;

    logger.error('Memory search handler error', {
      req_id: req.id,
      error: error.message,
      total_ms: totalMs
    });

    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Failed to process memory search request'
    });
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

/**
 * Register memory routes
 */
export const memoryRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // All memory routes require authentication
  fastify.addHook('preHandler', requireAuth);

  // POST /api/v1/memory/upsert - Store facts/edges
  fastify.post('/upsert', {
    schema: {
      summary: 'Store knowledge graph facts',
      description: 'Store facts and relationships in user memory',
      tags: ['Memory'],
      body: upsertRequestSchema,
      response: {
        200: Type.Object({
          ok: Type.Literal(true),
          upserted: Type.Integer({ minimum: 0 }),
          session_id: Type.Optional(Type.String()),
          timing: Type.Object({
            zep_ms: Type.Number(),
            total_ms: Type.Number()
          })
        }),
        400: Type.Object({
          error: Type.String(),
          message: Type.String()
        }),
        502: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, upsertMemoryHandler);

  // GET /api/v1/memory/search - Search memory
  fastify.get('/search', {
    schema: {
      summary: 'Search user memory',
      description: 'Search for relevant memories and facts',
      tags: ['Memory'],
      querystring: searchQuerySchema,
      response: {
        200: Type.Object({
          results: Type.Array(Type.Object({
            id: Type.String(),
            session_id: Type.Union([Type.String(), Type.Null()]),
            text: Type.String(),
            score: Type.Number(),
            source_type: Type.String(),
            tokens_estimate: Type.Integer(),
            metadata: Type.Optional(Type.Object({}, { additionalProperties: true }))
          })),
          total_tokens: Type.Integer(),
          timing: Type.Object({
            zep_ms: Type.Number(),
            total_ms: Type.Number()
          }),
          metadata: Type.Object({
            query: Type.String(),
            results_count: Type.Integer(),
            truncated: Type.Boolean()
          })
        }),
        400: Type.Object({
          error: Type.String(),
          message: Type.String()
        }),
        502: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, searchMemoryHandler);
};

// Export ZepAdapter and instance for use in chat.ts
export { ZepAdapter, zepAdapter };
