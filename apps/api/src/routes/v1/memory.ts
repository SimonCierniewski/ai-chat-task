/**
 * Memory API Routes
 * Zep memory system integration with telemetry and validation
 */

import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireAuth } from '../../utils/guards';
import { createValidator } from '../../utils/validator';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { ZepClient } from '@getzep/zep-cloud';
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
// Zep v3 Adapter - Real Implementation
// ============================================================================

/**
 * Zep v3 adapter for memory storage and retrieval using official SDK
 */
class ZepAdapter {
  private client: ZepClient;

  constructor() {
    const apiKey = config.zep.apiKey;

    if (!apiKey) {
      logger.error('ZEP_API_KEY is not configured');
      throw new Error('Zep API key is required');
    }

    // Initialize Zep SDK client
    this.client = new ZepClient({
      apiKey
    });

    logger.info('Zep v3 SDK adapter initialized', {
      apiKeyPrefix: apiKey.substring(0, 10) + '...'
    });
  }

  /**
   * Get or create user in Zep v3 using SDK
   */
  private async ensureUser(userId: string, metadata?: Record<string, any>): Promise<void> {
    try {
      // Try to get the user first
      try {
        logger.debug('Checking if Zep user exists', { userId });
        const user = await this.client.user.get(userId);
        logger.debug('Zep user exists', { userId, user: JSON.stringify(user) });
      } catch (error: any) {
        // If user doesn't exist, create it
        logger.debug('User get error', {
          userId,
          errorMessage: error.message,
          errorStatus: error.statusCode,
          errorDetails: JSON.stringify(error)
        });

        if (error.statusCode === 404 || error.message?.includes('not found')) {
          logger.info('Creating new Zep user', { userId, metadata });
          const newUser = await this.client.user.add({
            userId: userId,
            metadata: metadata || {}
          });
          logger.info('Created new Zep user', { userId, newUser: JSON.stringify(newUser) });
        } else {
          logger.error('Unexpected error checking Zep user', {
            userId,
            error: error.message,
            statusCode: error.statusCode,
            fullError: JSON.stringify(error)
          });
          throw error;
        }
      }
    } catch (error: any) {
      logger.error('Error ensuring Zep user', {
        error: error.message,
        statusCode: error.statusCode,
        stack: error.stack,
        userId
      });
      throw error;
    }
  }

  async upsertFacts(
    userId: string,
    edges: CreateGraphEdge[],
    sessionId?: string
  ): Promise<{ success: boolean; upserted: number }> {
    try {
      await this.ensureUser(userId);

      // Convert edges to Zep graph format
      const graphData = {
        nodes: edges.map(edge => ({
          id: edge.subject,
          type: 'entity',
          properties: {
            name: edge.subject
          }
        })),
        relationships: edges.map(edge => ({
          source: edge.subject,
          target: edge.object,
          type: edge.predicate,
          properties: {
            confidence: edge.confidence || 1.0,
            session_id: sessionId,
            source_message_id: edge.source_message_id
          }
        }))
      };

      // Add to Zep graph
      await this.client.graph.add(userId, graphData);

      logger.info('Facts upserted to Zep via SDK', {
        userId,
        upserted: edges.length,
        sessionId
      });

      return {
        success: true,
        upserted: edges.length
      };
    } catch (error) {
      logger.error('Error upserting facts to Zep', { error, userId });
      return { success: false, upserted: 0 };
    }
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
    try {
      logger.info('Starting memory search', {
        userId,
        queryLength: query.length,
        queryPreview: query.substring(0, 100),
        options
      });

      await this.ensureUser(userId);
      const limit = options.limit || CONFIG_PRESETS.DEFAULT.top_k;
      const minScore = options.minScore || 0.7;

      // If we have a specific session, get context from that thread
      // Otherwise, get user context across all threads
      let contextData: any;

      if (options.sessionId) {
        // Get context for specific thread
        try {
          logger.debug('Getting context for specific thread', { sessionId: options.sessionId });
          await this.ensureThread(options.sessionId, userId);

          const contextRequest = {
            mode: 'messages',
            limit
          };
          logger.debug('Calling thread.getUserContext', {
            sessionId: options.sessionId,
            request: JSON.stringify(contextRequest)
          });

          contextData = await this.client.thread.getUserContext(options.sessionId, contextRequest);
          logger.debug('Thread context retrieved', {
            sessionId: options.sessionId,
            messageCount: contextData?.messages?.length || 0,
            contextData: JSON.stringify(contextData)
          });
        } catch (error: any) {
          logger.warn('Failed to get thread context, falling back to user threads', {
            sessionId: options.sessionId,
            error: error.message,
            statusCode: error.statusCode,
            fullError: JSON.stringify(error)
          });
          contextData = { messages: [] };
        }
      } else {
        // Get user's threads and extract recent messages
        logger.debug('Getting user threads for general search', { userId });
        const threads = await this.client.user.getThreads(userId, {
          limit: 10 // Get recent threads
        });
        logger.debug('User threads retrieved', {
          userId,
          threadCount: threads?.threads?.length || 0
        });

        // Collect messages from threads
        const allMessages: any[] = [];
        for (const thread of (threads.threads || [])) {
          try {
            logger.debug('Getting messages from thread', { threadId: thread.threadId });
            const threadData = await this.client.thread.get(thread.threadId);
            if (threadData.messages) {
              allMessages.push(...threadData.messages);
              logger.debug('Added messages from thread', {
                threadId: thread.threadId,
                messageCount: threadData.messages.length
              });
            }
          } catch (error: any) {
            logger.debug('Failed to get thread messages', {
              threadId: thread.threadId,
              error: error.message
            });
          }
        }
        contextData = { messages: allMessages };
        logger.debug('Collected messages from all threads', {
          totalMessages: allMessages.length
        });
      }

      // Convert messages to TelemetryRetrievalResult format
      const results: TelemetryRetrievalResult[] = (contextData.messages || []).map((message: any) => {
        const content = message.content || '';
        const resultId = message.uuid || message.id || `result-${Date.now()}-${Math.random()}`;

        // Calculate basic relevance score based on query match
        let score = 0.5; // Default score
        if (query && content.toLowerCase().includes(query.toLowerCase())) {
          score = 0.8; // Higher score for direct matches
        }

        return {
          id: resultId,
          session_id: message.threadId || options.sessionId || null,
          text: content,
          score,
          source_type: 'message',
          tokens_estimate: estimateTokens(content),
          metadata: {
            ...message.metadata,
            role: message.roleType,
            timestamp: message.createdAt,
            confidence: score
          }
        };
      });

      // Apply additional filtering and sorting
      const filtered = filterByScore(results, minScore);
      const sorted = sortByRelevance(filtered);
      const limited = sorted.slice(0, limit);

      // Apply token budget trimming if specified
      if (options.tokenBudget) {
        return trimToTokenBudget(limited, options.tokenBudget);
      }

      logger.info('Zep SDK memory retrieval completed', {
        userId,
        query: query.substring(0, 50),
        resultsCount: limited.length,
        sessionId: options.sessionId,
        rawMessageCount: contextData?.messages?.length || 0,
        filteredCount: filtered.length,
        finalCount: limited.length
      });

      return limited;
    } catch (error: any) {
      logger.error('Error retrieving Zep memory via SDK', {
        error: error.message,
        statusCode: error.statusCode,
        stack: error.stack,
        fullError: JSON.stringify(error),
        userId,
        query: query.substring(0, 100)
      });
      return [];
    }
  }

  /**
   * Ensure thread exists for session
   */
  private async ensureThread(sessionId: string, userId: string): Promise<void> {
    try {
      // Try to get the thread
      logger.debug('Checking if thread exists', { sessionId, userId });
      const thread = await this.client.thread.get(sessionId);
      logger.debug('Thread exists', {
        sessionId,
        thread: JSON.stringify(thread)
      });
    } catch (error: any) {
      logger.debug('Thread get error', {
        sessionId,
        userId,
        errorMessage: error.message,
        errorStatus: error.statusCode,
        errorDetails: JSON.stringify(error)
      });

      // If thread doesn't exist, create it
      if (error.statusCode === 404 || error.message?.includes('not found')) {
        logger.info('Creating new Zep thread', { sessionId, userId });

        const threadData = {
          threadId: sessionId,
          userId: userId,
          metadata: {
            created_at: new Date().toISOString()
          }
        };
        logger.debug('Thread creation request', { threadData: JSON.stringify(threadData) });

        const newThread = await this.client.thread.create(threadData);
        logger.info('Created new Zep thread', {
          sessionId,
          userId,
          newThread: JSON.stringify(newThread)
        });
      } else {
        logger.error('Unexpected error checking thread', {
          sessionId,
          userId,
          error: error.message,
          statusCode: error.statusCode,
          fullError: JSON.stringify(error)
        });
        throw error;
      }
    }
  }

  /**
   * Store a message in Zep memory using SDK
   */
  async storeMessage(
    userId: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    try {
      logger.info('Starting to store message in Zep', {
        userId,
        sessionId,
        role,
        contentLength: content.length,
        hasMetadata: !!metadata
      });

      // Ensure user and thread exist
      await this.ensureUser(userId);
      await this.ensureThread(sessionId, userId);

      // Prepare message data
      const messageData = {
        role: role === 'user' ? 'user' : 'assistant',
        content,
        name: role,
        createdAt: new Date().toISOString()
      };

      const requestBody = {
        messages: [messageData]
      };

      logger.debug('Calling thread.addMessages', {
        sessionId,
        requestBody: JSON.stringify(requestBody)
      });

      // Store message in thread - addMessages takes threadId and request object
      const result = await this.client.thread.addMessages(sessionId, requestBody);

      logger.info('Message stored successfully in Zep', {
        userId,
        sessionId,
        role,
        contentLength: content.length,
        result: JSON.stringify(result)
      });

      return true;
    } catch (error: any) {
      logger.error('Error storing message in Zep via SDK', {
        error: error.message,
        errorCode: error.code,
        statusCode: error.statusCode,
        stack: error.stack,
        fullError: JSON.stringify(error),
        userId,
        sessionId,
        role,
        contentPreview: content.substring(0, 100)
      });
      return false;
    }
  }

  /**
   * Store a conversation turn (user message + assistant response)
   */
  async storeConversationTurn(
    userId: string,
    sessionId: string,
    userMessage: string,
    assistantMessage: string,
    metadata?: {
      model?: string;
      tokensIn?: number;
      tokensOut?: number;
      costUsd?: number;
    }
  ): Promise<boolean> {
    try {
      logger.info('Starting to store conversation turn', {
        userId,
        sessionId,
        userMessageLength: userMessage.length,
        assistantMessageLength: assistantMessage.length,
        metadata
      });

      // Store user message
      const userStored = await this.storeMessage(
        userId,
        sessionId,
        'user',
        userMessage,
        { type: 'user_input' }
      );

      if (!userStored) {
        logger.error('Failed to store user message', { userId, sessionId });
        return false;
      }

      logger.info('User message stored, storing assistant response', { userId, sessionId });

      // Store assistant response
      const assistantStored = await this.storeMessage(
        userId,
        sessionId,
        'assistant',
        assistantMessage,
        {
          type: 'ai_response',
          ...metadata
        }
      );

      if (!assistantStored) {
        logger.error('Failed to store assistant message', { userId, sessionId });
      } else {
        logger.info('Conversation turn stored successfully', { userId, sessionId });
      }

      return assistantStored;
    } catch (error: any) {
      logger.error('Error storing conversation turn', {
        error: error.message,
        stack: error.stack,
        fullError: JSON.stringify(error),
        userId,
        sessionId
      });
      return false;
    }
  }
}

// Global adapter instance
const zepAdapter = new ZepAdapter();

// Export for use in other modules
export { zepAdapter };

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
