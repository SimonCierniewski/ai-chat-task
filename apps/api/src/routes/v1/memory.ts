/**
 * Memory API Routes
 * Zep memory system integration with telemetry and validation
 */

import {FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync} from 'fastify';
import {Type} from '@sinclair/typebox';
import {requireAuth} from '../../utils/guards';
import {createValidator} from '../../utils/validator';
import {logger} from '../../utils/logger';
import {config} from '../../config';
import {ZepClient} from '@getzep/zep-cloud';
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
import {CONFIG_PRESETS} from '@prototype/shared';
import {Message} from "@getzep/zep-cloud/serialization";

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
    subject: Type.String({minLength: 1, maxLength: 200}),
    predicate: Type.String(),
    object: Type.String({minLength: 1, maxLength: 500}),
    confidence: Type.Optional(Type.Number({minimum: 0, maximum: 1})),
    source_message_id: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    metadata: Type.Optional(Type.Object({}, {additionalProperties: true}))
  }), {minItems: 1, maxItems: 50}),
  sessionId: Type.Optional(Type.String({pattern: '^session-\\d{8}-\\d{6}-[a-z0-9]{4}$'}))
});

const searchQuerySchema = Type.Object({
  query: Type.String({minLength: 1, maxLength: 1000}),
  sessionId: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({minimum: 1, maximum: 100})),
  min_score: Type.Optional(Type.Number({minimum: 0, maximum: 1}))
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
  client: ZepClient;

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
   * Initialize a new user in Zep memory system using SDK
   * This creates a user in Zep for storing chat history and memory
   *
   * @param userId - The user's ID from Supabase auth
   * @param email - The user's email address
   * @returns Success status and timing metrics
   */
  async initializeUser(userId: string, email?: string): Promise<{
    success: boolean;
    error?: string;
    timings?: {
      createUser?: number;
      total: number;
    };
  }> {
    const startTime = Date.now();

    try {
      logger.info({userId, email}, 'Initializing Zep user via SDK');

      // Create or update user using SDK
      const userStartTime = Date.now();

      try {
        // Check if user exists
        await this.client.user.get(userId);

        // User exists, update metadata if email provided
        if (email) {
          await this.client.user.update(userId, {
            email,
            metadata: {
              updated_at: new Date().toISOString(),
              source: 'signup_hook',
            },
          });
        }

        logger.info({userId}, 'Zep user already exists, updated metadata');
      } catch (error: any) {
        // User doesn't exist, create new one
        if (error.statusCode === 404 || error.message?.includes('not found')) {
          await this.client.user.add({
            userId,
            email,
            firstName: email?.split('@')[0], // Use email prefix as firstName if not provided
            metadata: {
              created_at: new Date().toISOString(),
              source: 'signup_hook',
            },
          });

          logger.info({userId}, 'Created new Zep user');
        } else {
          throw error;
        }
      }

      const userTime = Date.now() - userStartTime;
      const totalTime = Date.now() - startTime;

      logger.info(
        {
          userId,
          timings: {
            createUser: userTime,
            total: totalTime,
          },
        },
        'Zep user initialized successfully via SDK'
      );

      return {
        success: true,
        timings: {
          createUser: userTime,
          total: totalTime,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const totalTime = Date.now() - startTime;

      logger.error(
        {
          userId,
          error: errorMessage,
          duration: totalTime,
        },
        'Failed to initialize Zep user via SDK'
      );

      return {
        success: false,
        error: errorMessage,
        timings: {
          total: totalTime,
        },
      };
    }
  }

  /**
   * Ensure user exists in Zep (create if not exists)
   * @returns true if user exists or was created
   */
  async ensureUser(userId: string, email?: string, firstName?: string): Promise<boolean> {
    try {
      logger.debug('Ensuring Zep user exists', { userId, email, firstName });
      
      // Try to get the user first
      try {
        const existingUser = await this.client.user.get(userId);
        logger.debug('Zep user already exists', { userId, existingUser });
        return true; // User exists
      } catch (error: any) {
        // User doesn't exist, create it
        if (error.statusCode === 404 || error.message?.includes('not found')) {
          logger.info('Creating new Zep user', { userId, email, firstName });
          
          const userData = {
            userId,
            email: email || `${userId}@zep.local`, // Provide default email if none given
            firstName: firstName, 
            metadata: {
              created_at: new Date().toISOString(),
              source: 'playground'
            }
          };
          
          await this.client.user.add(userData);
          logger.info('Created new Zep user successfully', { userId, userData });
          return true;
        }
        logger.error('Unexpected error checking Zep user', { 
          userId, 
          error: error.message,
          statusCode: error.statusCode 
        });
        throw error; // Re-throw other errors
      }
    } catch (error: any) {
      logger.error('Failed to ensure Zep user', {
        userId,
        email,
        firstName,
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Ensure thread exists in Zep (create if not exists)
   * @returns true if thread exists or was created
   */
  async ensureThread(userId: string, threadId: string): Promise<boolean> {
    try {
      // Try to get the thread first
      let result = await this.client.thread.get(threadId);
      if (result.totalCount > 0) {
        return true
      }

      // Thread doesn't exist, create it
      await this.client.thread.create({
        threadId: threadId,
        userId: userId
      });
      logger.info('Created new Zep thread', {userId, sessionId: threadId});
      return true
      
    } catch (error: any) {
      logger.error('Failed to ensure Zep thread', {
        userId,
        sessionId: threadId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get context block from Zep (for fast chat endpoint)
   * This retrieves the context in either basic or summarized mode
   */
  async getContextBlock(userId: string, sessionId: string, mode: 'basic' | 'summarized' = 'basic', minRating?: number): Promise<string | undefined> {
    try {
      // Build options
      const options: any = {
        mode: mode === 'basic' ? 'basic' : undefined // Default mode is summarized
      };
      
      // Add min_rating if provided
      if (minRating !== undefined && minRating > 0) {
        options.min_rating = minRating;
      }
      
      // Get thread context which includes facts and summaries
      const context = await this.client.thread.getUserContext(sessionId, options);
      return context.context;
    } catch (error: any) {
      logger.warn('Failed to get context block', {
        userId,
        sessionId,
        mode,
        minRating,
        error: error.message
      });
      return undefined;
    }
  }

  /**
   * Build custom context using graph search for query-based context modes
   */
  async buildCustomContext(
    userId: string, 
    sessionId: string, 
    query: string,
    contextMode: 'node_search' | 'edge_search' | 'node_edge_search' | 'bfs',
    graphSearchParams?: any
  ): Promise<string | undefined> {
    try {
      const searchQuery = query.substring(0, 400); // Limit query to 400 chars
      let contextParts: string[] = [];
      
      // For BFS mode, get recent episodes to seed the search
      let bfsNodeUuids: string[] | undefined;
      if (contextMode === 'bfs') {
        try {
          const episodeLimit = graphSearchParams?.episodes?.limit || 10;
          const episodes = await this.client.graph.episode.getByGroup(userId, {
            limit: episodeLimit
          });
          
          if (episodes && episodes.length > 0) {
            // Extract node UUIDs from episodes for BFS
            bfsNodeUuids = episodes.map((ep: any) => ep.uuid).filter((id: any) => id);
          }
        } catch (error) {
          logger.warn('Failed to get episodes for BFS', { error, userId });
        }
      }

      // Build search options based on context mode
      const searchOptions: any = {
        limit: 30, // Default limit
        reranker: 'cross_encoder' // Default reranker
      };

      // Search nodes if needed
      if (['node_search', 'node_edge_search', 'bfs'].includes(contextMode)) {
        const nodeParams = graphSearchParams?.nodes || {};
        const nodeSearchOptions = {
          ...searchOptions,
          limit: nodeParams.limit || 10,
          reranker: nodeParams.reranker || 'cross_encoder',
          scope: 'nodes' as const,
          ...(nodeParams.mmrLambda !== undefined && { mmr_lambda: nodeParams.mmrLambda }),
          ...(nodeParams.centerNodeUuid && { center_node_uuid: nodeParams.centerNodeUuid }),
          ...(bfsNodeUuids && { bfs_origin_node_uuids: bfsNodeUuids })
        };

        try {
          const nodeResults = await this.client.graph.search(userId, searchQuery, nodeSearchOptions);
          
          if (nodeResults?.nodes && nodeResults.nodes.length > 0) {
            const nodeContext = nodeResults.nodes
              .map((node: any) => `Entity: ${node.name || node.id}`)
              .join('\n');
            
            if (nodeContext) {
              contextParts.push('## Relevant Entities\n' + nodeContext);
            }
          }
        } catch (error) {
          logger.warn('Failed to search nodes', { error, userId, contextMode });
        }
      }

      // Search edges if needed  
      if (['edge_search', 'node_edge_search'].includes(contextMode)) {
        const edgeParams = graphSearchParams?.edges || {};
        const edgeSearchOptions = {
          ...searchOptions,
          limit: edgeParams.limit || 10,
          reranker: edgeParams.reranker || 'cross_encoder',
          scope: 'edges' as const,
          ...(edgeParams.minFactRating !== undefined && { min_fact_rating: edgeParams.minFactRating }),
          ...(edgeParams.mmrLambda !== undefined && { mmr_lambda: edgeParams.mmrLambda }),
          ...(edgeParams.centerNodeUuid && { center_node_uuid: edgeParams.centerNodeUuid })
        };

        try {
          const edgeResults = await this.client.graph.search(userId, searchQuery, edgeSearchOptions);
          
          if (edgeResults?.edges && edgeResults.edges.length > 0) {
            const edgeContext = edgeResults.edges
              .map((edge: any) => edge.fact || `${edge.source} ${edge.type} ${edge.target}`)
              .join('\n');
            
            if (edgeContext) {
              contextParts.push('## Relevant Facts\n' + edgeContext);
            }
          }
        } catch (error) {
          logger.warn('Failed to search edges', { error, userId, contextMode });
        }
      }

      // Combine all context parts
      if (contextParts.length > 0) {
        return contextParts.join('\n\n');
      }

      return undefined;
    } catch (error: any) {
      logger.error('Failed to build custom context', {
        userId,
        sessionId,
        contextMode,
        error: error.message
      });
      return undefined;
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
      logger.error('Error upserting facts to Zep', {error, userId});
      return {success: false, upserted: 0};
    }
  }

  /**
   * Set graph ontology for a user
   */
  async setOntology(
    userId: string,
    entities: Record<string, any>,
    relations: Record<string, any>
  ): Promise<boolean> {
    try {
      // Transform the entities and relations into Zep format
      const formattedEntities: Record<string, any> = {};
      const formattedRelations: Record<string, any> = {};
      
      // Format entities
      for (const [name, config] of Object.entries(entities)) {
        formattedEntities[name] = config;
      }
      
      // Format relations with source/target constraints
      for (const [name, config] of Object.entries(relations)) {
        const relationConfig: any = config;
        const constraints: any[] = [];
        
        // Add source/target type constraints if specified
        if (relationConfig.source_types || relationConfig.target_types) {
          constraints.push({
            source: relationConfig.source_types || null,
            target: relationConfig.target_types || null
          });
        }
        
        formattedRelations[name] = [
          {
            description: relationConfig.description
          },
          constraints.length > 0 ? constraints : undefined
        ].filter(Boolean);
      }
      
      // Set ontology for the specific user
      await this.client.graph.setOntology({
        entities: formattedEntities,
        relations: formattedRelations,
        user_ids: [userId]
      });
      
      logger.info('Set graph ontology for user', {
        userId,
        entityCount: Object.keys(entities).length,
        relationCount: Object.keys(relations).length
      });
      
      return true;
    } catch (error: any) {
      logger.error('Failed to set graph ontology', {
        userId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Update user fact rating instructions
   */
  async updateFactRatingInstructions(
    userId: string,
    instruction: string,
    examples: { high: string; medium: string; low: string }
  ): Promise<boolean> {
    try {
      await this.ensureUser(userId);
      
      // Update user with fact rating instructions
      await this.client.user.update(userId, {
        fact_rating_instruction: {
          instruction,
          examples: [
            { rating: 'high', example: examples.high },
            { rating: 'medium', example: examples.medium },
            { rating: 'low', example: examples.low }
          ]
        }
      });
      
      logger.info('Updated fact rating instructions', {
        userId,
        instruction: instruction.substring(0, 50) + '...'
      });
      
      return true;
    } catch (error: any) {
      logger.error('Failed to update fact rating instructions', {
        userId,
        error: error.message
      });
      return false;
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
          logger.debug('Getting context for specific thread', {sessionId: options.sessionId});
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
          contextData = {messages: []};
        }
      } else {
        // Get user's threads and extract recent messages
        logger.debug({userId}, 'Getting user threads for general search');
        const threads = await this.client.user.getThreads(userId, {
          limit: 10 // Get recent threads
        });
        logger.debug({
          userId,
          threadCount: threads?.threads?.length || 0
        }, 'User threads retrieved');

        // Collect messages from threads
        const allMessages: any[] = [];
        for (const thread of (threads.threads || [])) {
          try {
            logger.debug({threadId: thread.threadId}, 'Getting messages from thread');
            const threadData = await this.client.thread.get(thread.threadId);
            if (threadData.messages) {
              allMessages.push(...threadData.messages);
              logger.debug({
                threadId: thread.threadId,
                messageCount: threadData.messages.length
              }, 'Added messages from thread');
            }
          } catch (error: any) {
            logger.debug({
              threadId: thread.threadId,
              error: error.message
            }, 'Failed to get thread messages');
          }
        }
        contextData = {messages: allMessages};
        logger.debug({
          totalMessages: allMessages.length
        }, 'Collected messages from all threads');
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

      logger.info({
        userId,
        query: query.substring(0, 50),
        resultsCount: limited.length,
        sessionId: options.sessionId,
        rawMessageCount: contextData?.messages?.length || 0,
        filteredCount: filtered.length,
        finalCount: limited.length
      }, 'Zep SDK memory retrieval completed');

      return limited;
    } catch (error: any) {
      logger.error({
        error: error.message,
        statusCode: error.statusCode,
        stack: error.stack,
        fullError: JSON.stringify(error),
        userId,
        query: query.substring(0, 100)
      }, 'Error retrieving Zep memory via SDK');
      return [];
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
    userName?: string
  ): Promise<boolean> {
    
    try {
      logger.info({
        userId,
        sessionId,
        userMessageLength: userMessage.length,
        assistantMessageLength: assistantMessage.length,
        userName
      }, 'Starting to store conversation turn');

      const messages: Message[] = [
        {
          content: userMessage,
          role: "user",
          ...(userName && { name: userName }) // Only add name if userName is provided
        },
        {
          content: assistantMessage,
          role: "assistant",
          ...(userName && { name: "AI Assistant" }) // Only add assistant name if userName exists
        }
      ];

      const result = await this.client.thread.addMessages(sessionId, {messages});

      if (!result) {
        logger.error({userId, sessionId}, 'Failed to store conversation turn');
        return false;
      }
      return true;

    } catch (error: any) {
      logger.error({
        error: error.message,
        stack: error.stack,
        fullError: JSON.stringify(error),
        userId,
        sessionId
      }, 'Error storing conversation turn');
      return false;
    }
  }
}

// Global adapter instance
const zepAdapter = new ZepAdapter();

// Export for use in other modules
export {zepAdapter};

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
  payload: any,
  actualUserId?: string
) {
  // Use the actual user ID if provided (for playground users), otherwise use the authenticated user
  const userId = actualUserId || req.user.id;
  
  // Skip telemetry for playground users (handled by telemetry service)
  if (userId.startsWith('playground_')) {
    return;
  }
  
  const basePayload = {
    user_id: userId,
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

    const {query, sessionId, limit, min_score} = queryParams;
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
      }, userId);

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
      }, userId);

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
            metadata: Type.Optional(Type.Object({}, {additionalProperties: true}))
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

  // POST /api/v1/memory/graph-status - Check graph build completion status
  fastify.post('/graph-status', {
    schema: {
      summary: 'Check graph build completion status',
      description: 'Check if Zep has finished processing the knowledge graph for a user',
      tags: ['Memory'],
      body: Type.Object({
        userId: Type.String({minLength: 1})
      }),
      response: {
        200: Type.Object({
          episodeStatus: Type.String(),
          episodeCount: Type.Optional(Type.Number()),
          lastEpisodeId: Type.Optional(Type.String()),
          message: Type.Optional(Type.String()),
          episodes: Type.Optional(Type.Array(Type.Object({
            id: Type.String(),
            status: Type.String()
          })))
        }),
        400: Type.Object({
          error: Type.String(),
          message: Type.String()
        }),
        500: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, async (request: FastifyRequest<{ Body: { userId: string } }>, reply: FastifyReply) => {
    const { userId } = request.body;
    
    try {
      logger.info(`Checking graph status for user ${userId}`);
      
      // Use the existing Zep adapter instance
      
      try {
        // Get episodes for the user
        const episodes = await zepAdapter.client.graph.episode.getByUserId(userId);
        
        logger.info(`Found episodes for user ${userId}`, { 
          count: episodes?.episodes?.length,
          firstEpisode: episodes?.episodes?.[0]
        });
        
        if (!episodes || episodes.episodes.length === 0) {
          return reply.send({
            episodeStatus: 'no_episodes',
            episodeCount: 0,
            message: 'No episodes found for this user'
          });
        }
        
        // Check status of all episodes
        const allComplete = episodes.episodes.every((ep: any) => 
          ep.processed
        );
        
        const episodeStatus = allComplete ? 'complete' : 'incomplete';
        
        return reply.send({
          episodeStatus,
          episodeCount: episodes.episodes.length,
          message: allComplete 
            ? 'All episodes have been processed successfully' 
            : `Processing in progress. ${episodes.episodes.filter((ep: any) => ep.processed).length}/${episodes.episodes.length} episodes complete`,
          episodes: episodes.episodes.map((ep: any) => ({
            id: ep.episodeId || ep.episode_id || ep.id || '',
            status: ep.status || 'unknown'
          }))
        });
        
      } catch (error: any) {
        // Handle case where user doesn't exist or has no graph data
        if (error.statusCode === 404 || error.message?.includes('not found')) {
          return reply.send({
            episodeStatus: 'no_data',
            episodeCount: 0,
            message: 'No graph data found for this user. Import some conversations first.'
          });
        }
        throw error;
      }
      
    } catch (error) {
      logger.error('Error checking graph status:', error);
      return reply.status(500).send({
        error: 'GRAPH_STATUS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to check graph status'
      });
    }
  });

  // POST /api/v1/memory/upsert - Add data directly to the graph
  fastify.post('/upsert', {
    schema: {
      summary: 'Add data directly to the graph',
      description: 'Add a message or data directly to the user\'s knowledge graph',
      tags: ['Memory'],
      body: Type.Object({
        userId: Type.String({minLength: 1}),
        type: Type.String({enum: ['message']}),
        data: Type.String({minLength: 1, maxLength: 10000})
      }),
      response: {
        200: Type.Object({
          ok: Type.Literal(true),
          episodeId: Type.Optional(Type.String()),
          message: Type.String()
        }),
        400: Type.Object({
          error: Type.String(),
          message: Type.String()
        }),
        500: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, async (request: FastifyRequest<{ Body: { userId: string; type: string; data: string } }>, reply: FastifyReply) => {
    const { userId, type, data } = request.body;
    const reqId = request.id;
    const startTime = Date.now();
    const authReq = request as FastifyRequest & { user: { id: string; role: string } };
    let zapStartTime = Date.now();
    
    try {
      logger.info({
        req_id: reqId,
        userId,
        type,
        dataLength: data.length
      }, 'Adding data directly to graph');
      
      // Ensure user exists in Zep
      await zepAdapter.ensureUser(userId);
      
      // Measure Zep operation time
      zapStartTime = Date.now();
      
      // Add data to the graph
      const episode = await zepAdapter.client.graph.add({
        userId,
        type,
        data
      });
      
      const zepMs = Date.now() - zapStartTime;
      const totalMs = Date.now() - startTime;
      
      // Emit successful telemetry
      emitZepTelemetry(authReq, 'zep_upsert', {
        session_id: null,
        data_length: data.length,
        type: type,
        episode_id: episode?.episodeId,
        zep_ms: zepMs,
        total_ms: totalMs,
        success: true
      }, userId);
      
      logger.info({
        req_id: reqId,
        userId,
        episodeId: episode?.episodeId,
        success: true,
        zep_ms: zepMs,
        total_ms: totalMs
      }, 'Data added to graph successfully');
      
      return reply.send({
        ok: true,
        episodeId: episode?.episodeId,
        message: 'Data successfully added to the graph'
      });
      
    } catch (error: any) {
      const zepMs = Date.now() - zapStartTime;
      const totalMs = Date.now() - startTime;
      const mappedError = mapZepError(error);
      
      // Emit error telemetry
      emitZepTelemetry(authReq, 'zep_error', {
        session_id: null,
        operation: 'upsert',
        data_length: data.length,
        type: type,
        zep_ms: zepMs,
        total_ms: totalMs,
        error_status: mappedError.status,
        error_message: mappedError.message,
        original_error: error.message
      }, userId);
      
      logger.error({
        req_id: reqId,
        userId,
        error: error.message,
        stack: error.stack,
        zep_ms: zepMs,
        total_ms: totalMs
      }, 'Failed to add data to graph');
      
      if (error.statusCode === 404) {
        return reply.status(400).send({
          error: 'USER_NOT_FOUND',
          message: 'User not found in Zep. Please initialize the user first.'
        });
      }
      
      return reply.status(mappedError.status).send({
        error: 'GRAPH_ADD_ERROR',
        message: mappedError.message || 'Failed to add data to graph'
      });
    }
  });

  // PUT /api/v1/memory/ontology - Update graph ontology
  fastify.put('/ontology', {
    schema: {
      summary: 'Update graph ontology',
      description: 'Set custom entity and relation types for the knowledge graph',
      tags: ['Memory'],
      body: Type.Object({
        userId: Type.String({minLength: 1}),
        entities: Type.Object({}, {additionalProperties: true}),
        relations: Type.Object({}, {additionalProperties: true})
      }),
      response: {
        200: Type.Object({
          ok: Type.Literal(true),
          message: Type.String()
        }),
        400: Type.Object({
          error: Type.String(),
          message: Type.String()
        }),
        500: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, async (request: FastifyRequest<{ Body: { userId: string; entities: Record<string, any>; relations: Record<string, any> } }>, reply: FastifyReply) => {
    const { userId, entities, relations } = request.body;
    const reqId = request.id;
    const startTime = Date.now();
    
    try {
      // Ensure user is initialized
      await zepAdapter.ensureUser(userId);
      
      // Set ontology
      const success = await zepAdapter.setOntology(userId, entities, relations);
      
      if (!success) {
        throw new Error('Failed to set graph ontology');
      }
      
      const totalMs = Date.now() - startTime;
      
      logger.info({
        req_id: reqId,
        userId,
        entityCount: Object.keys(entities).length,
        relationCount: Object.keys(relations).length,
        total_ms: totalMs
      }, 'Graph ontology updated');
      
      return reply.send({
        ok: true,
        message: 'Graph ontology updated successfully'
      });
      
    } catch (error: any) {
      const totalMs = Date.now() - startTime;
      
      logger.error({
        req_id: reqId,
        userId,
        error: error.message,
        stack: error.stack,
        total_ms: totalMs
      }, 'Failed to update graph ontology');
      
      if (error.statusCode === 404) {
        return reply.status(400).send({
          error: 'USER_NOT_FOUND',
          message: 'User not found. Please initialize the user first.'
        });
      }
      
      return reply.status(500).send({
        error: 'ONTOLOGY_UPDATE_ERROR',
        message: error.message || 'Failed to update graph ontology'
      });
    }
  });

  // PUT /api/v1/memory/fact-ratings - Update fact rating instructions
  fastify.put('/fact-ratings', {
    schema: {
      summary: 'Update fact rating instructions',
      description: 'Update the fact rating instructions for a user',
      tags: ['Memory'],
      body: Type.Object({
        userId: Type.String({minLength: 1}),
        instruction: Type.String({minLength: 1}),
        examples: Type.Object({
          high: Type.String({minLength: 1}),
          medium: Type.String({minLength: 1}),
          low: Type.String({minLength: 1})
        })
      }),
      response: {
        200: Type.Object({
          ok: Type.Literal(true),
          message: Type.String()
        }),
        400: Type.Object({
          error: Type.String(),
          message: Type.String()
        }),
        500: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, async (request: FastifyRequest<{ Body: { userId: string; instruction: string; examples: { high: string; medium: string; low: string } } }>, reply: FastifyReply) => {
    const { userId, instruction, examples } = request.body;
    const reqId = request.id;
    const startTime = Date.now();
    
    try {
      // Ensure user is initialized
      await zepAdapter.ensureUser(userId);
      
      // Update fact rating instructions
      const success = await zepAdapter.updateFactRatingInstructions(userId, instruction, examples);
      
      if (!success) {
        throw new Error('Failed to update fact rating instructions');
      }
      
      const totalMs = Date.now() - startTime;
      
      logger.info({
        req_id: reqId,
        userId,
        total_ms: totalMs
      }, 'Fact rating instructions updated');
      
      return reply.send({
        ok: true,
        message: 'Fact rating instructions updated successfully'
      });
      
    } catch (error: any) {
      const totalMs = Date.now() - startTime;
      
      logger.error({
        req_id: reqId,
        userId,
        error: error.message,
        stack: error.stack,
        total_ms: totalMs
      }, 'Failed to update fact rating instructions');
      
      if (error.statusCode === 404) {
        return reply.status(400).send({
          error: 'USER_NOT_FOUND',
          message: 'User not found. Please initialize the user first.'
        });
      }
      
      return reply.status(500).send({
        error: 'FACT_RATING_UPDATE_ERROR',
        message: error.message || 'Failed to update fact rating instructions'
      });
    }
  });

  // POST /api/v1/memory/init - Initialize user and thread in Zep
  fastify.post('/init', {
    schema: {
      summary: 'Initialize user and thread in Zep',
      description: 'Create a new user and thread in Zep memory system',
      tags: ['Memory'],
      body: Type.Object({
        userId: Type.String({minLength: 1}),
        sessionId: Type.String({minLength: 1})
      }),
      response: {
        200: Type.Object({
          ok: Type.Literal(true),
          userId: Type.String(),
          sessionId: Type.String()
        }),
        400: Type.Object({
          error: Type.String(),
          message: Type.String()
        }),
        500: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, async (request: FastifyRequest<{ Body: { userId: string; sessionId: string } }>, reply: FastifyReply) => {
    const startTime = Date.now();
    const { userId, sessionId } = request.body;
    
    try {
      logger.info(`Initializing Zep for user ${userId} with session ${sessionId}`);
      
      // Initialize Zep client
      const zepClient = new ZepClient({
        apiKey: config.zep.apiKey
      });
      
      // Create or get user
      try {
        await zepClient.user.add({
          user_id: userId
        });
        logger.info(`Created/verified user ${userId} in Zep`);
      } catch (userError: any) {
        // User might already exist, which is fine
        if (!userError.message?.includes('already exists')) {
          logger.error('Error creating user in Zep:', userError);
          throw userError;
        }
      }
      
      // Create thread/session
      try {
        await zepClient.thread.create({
          thread_id: sessionId,
          user_id: userId
        });
        logger.info(`Created thread ${sessionId} for user ${userId} in Zep`);
      } catch (threadError: any) {
        // Thread might already exist, which is fine
        if (!threadError.message?.includes('already exists')) {
          logger.error('Error creating thread in Zep:', threadError);
          throw threadError;
        }
      }
      
      const totalMs = Date.now() - startTime;
      logger.info(`Zep initialization completed in ${totalMs}ms`);
      
      return reply.send({
        ok: true,
        userId,
        sessionId
      });
    } catch (error) {
      logger.error('Error initializing Zep:', error);
      return reply.status(500).send({
        error: 'ZEP_INIT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to initialize Zep'
      });
    }
  });
};

// Export ZepAdapter and instance for use in chat.ts
