/**
 * Chat API Route - SSE Streaming
 * Validates requests, retrieves memory context, and streams responses via SSE
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireAuth } from '../../utils/guards';
import { createValidator } from '../../utils/validator';
import { logger } from '../../config';
import { 
  ChatRequest,
  ChatEventType,
  TokenEventData,
  UsageEventData,
  DoneEventData,
  ErrorEventData,
  formatSSEEvent
} from '@shared/api/chat';
import { 
  RetrievalResult,
  calculateTotalTokens 
} from '@shared/telemetry-memory';
import { CONFIG_PRESETS } from '@shared/memory-config';

// ============================================================================
// Types & Schemas  
// ============================================================================

/**
 * Chat request validation schema
 */
const chatRequestSchema = Type.Object({
  message: Type.String({ minLength: 1, maxLength: 4000 }),
  useMemory: Type.Optional(Type.Boolean()),
  sessionId: Type.Optional(Type.String({ pattern: '^session-\\d{8}-\\d{6}-[a-z0-9]{4}$' })),
  model: Type.Optional(Type.String({ enum: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'] }))
});

const validateChatRequest = createValidator(chatRequestSchema);

/**
 * Streaming provider interface for pluggable LLM backends
 */
interface StreamingProvider {
  /**
   * Stream completion from LLM provider
   */
  streamCompletion(options: {
    message: string;
    model?: string;
    context?: string; // Memory context if useMemory=true
    sessionId?: string;
    onToken: (text: string) => void;
    onUsage: (usage: UsageEventData) => void;
    onDone: (reason: 'stop' | 'length' | 'content_filter' | 'error') => void;
    onError: (error: Error) => void;
  }): Promise<void>;
}

/**
 * Memory context retrieved for the request
 */
interface MemoryContext {
  results: RetrievalResult[];
  total_tokens: number;
  context_text: string;
}

// ============================================================================
// Stub Provider (Phase 4 implementation)
// ============================================================================

/**
 * Stub streaming provider for Phase 4 - to be replaced with OpenAI in Phase 5
 */
class StubStreamingProvider implements StreamingProvider {
  async streamCompletion(options: {
    message: string;
    model?: string;
    context?: string;
    sessionId?: string;
    onToken: (text: string) => void;
    onUsage: (usage: UsageEventData) => void;
    onDone: (reason: 'stop' | 'length' | 'content_filter' | 'error') => void;
    onError: (error: Error) => void;
  }): Promise<void> {
    const { message, model = 'gpt-4o-mini', context, onToken, onUsage, onDone } = options;
    
    try {
      // Simulate streaming response
      const response = `I understand you said: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}". `;
      const contextResponse = context ? `Based on your history, I remember: ${context.substring(0, 100)}... ` : '';
      const fullResponse = response + contextResponse + 'This is a stub response for Phase 4.';
      
      // Stream tokens with realistic timing
      const words = fullResponse.split(' ');
      for (let i = 0; i < words.length; i++) {
        const token = i === words.length - 1 ? words[i] : words[i] + ' ';
        onToken(token);
        
        // Simulate realistic streaming delay (20-100ms per token)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 80 + 20));
      }
      
      // Send usage information
      const tokensIn = Math.ceil(message.length / 4) + (context ? Math.ceil(context.length / 4) : 0);
      const tokensOut = Math.ceil(fullResponse.length / 4);
      const costUsd = (tokensIn * 0.000015 + tokensOut * 0.00006); // Rough gpt-4o-mini pricing
      
      onUsage({
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: Number(costUsd.toFixed(8)),
        model
      });
      
      // Complete the stream
      onDone('stop');
      
    } catch (error) {
      onError(error as Error);
    }
  }
}

// Global provider instance
const streamingProvider = new StubStreamingProvider();

// ============================================================================
// Memory Integration (from memory routes)
// ============================================================================

/**
 * Search memory and prepare context string
 * Reuses the ZepAdapter from memory.ts
 */
async function retrieveMemoryContext(
  userId: string,
  message: string,
  sessionId?: string
): Promise<MemoryContext | null> {
  try {
    // Import the ZepAdapter class from memory.ts (would be better as shared service)
    const { ZepAdapter } = await import('./memory');
    const zepAdapter = new (ZepAdapter as any)();
    
    const memoryConfig = CONFIG_PRESETS.DEFAULT;
    const results = await zepAdapter.searchMemory(userId, message, {
      sessionId,
      limit: memoryConfig.top_k,
      minScore: memoryConfig.min_relevance_score || 0.7,
      tokenBudget: memoryConfig.memory_token_budget,
      clipSentences: memoryConfig.clip_sentences
    });
    
    if (results.length === 0) {
      return null;
    }
    
    const totalTokens = calculateTotalTokens(results);
    const contextText = results
      .map((result, index) => `${index + 1}. ${result.text}`)
      .join('\n');
    
    return {
      results,
      total_tokens: totalTokens,
      context_text: contextText
    };
    
  } catch (error) {
    logger.warn('Memory retrieval failed', {
      userId,
      error: error.message
    });
    return null;
  }
}

// ============================================================================
// SSE Stream Management
// ============================================================================

/**
 * SSE Stream handler with heartbeat and error recovery
 */
class SSEStream {
  private reply: FastifyReply;
  private heartbeatInterval?: NodeJS.Timeout;
  private closed = false;
  
  constructor(reply: FastifyReply, requestId: string) {
    this.reply = reply;
    
    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
      'X-Request-Id': requestId,
      // Disable proxy buffering
      'X-Accel-Buffering': 'no', // Nginx
      'Proxy-Buffering': 'off'   // Generic
    });
    
    // Start heartbeat to keep connection alive
    this.startHeartbeat();
    
    // Handle client disconnect
    reply.raw.on('close', () => {
      this.close();
    });
    
    reply.raw.on('error', (error) => {
      logger.warn('SSE stream error', { error: error.message });
      this.close();
    });
    
    // Send initial ping
    this.sendComment('Connected to chat stream');
    this.flush();
  }
  
  /**
   * Send SSE comment (keeps connection alive)
   */
  private sendComment(comment: string) {
    if (this.closed) return;
    this.reply.raw.write(`: ${comment}\n\n`);
  }
  
  /**
   * Send SSE event
   */
  sendEvent(type: ChatEventType, data: any) {
    if (this.closed) return;
    this.reply.raw.write(formatSSEEvent(type, data));
    this.flush();
  }
  
  /**
   * Flush the stream buffer
   */
  private flush() {
    if (this.closed) return;
    if (this.reply.raw.flushHeaders) {
      this.reply.raw.flushHeaders();
    }
  }
  
  /**
   * Start periodic heartbeat
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (!this.closed) {
        this.sendComment(`heartbeat ${Date.now()}`);
      }
    }, 30000); // 30 second heartbeat
  }
  
  /**
   * Close the stream
   */
  close() {
    if (this.closed) return;
    this.closed = true;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    try {
      this.reply.raw.end();
    } catch (error) {
      // Ignore errors when closing
    }
  }
  
  /**
   * Check if stream is closed
   */
  isClosed(): boolean {
    return this.closed;
  }
}

// ============================================================================
// Route Handler
// ============================================================================

/**
 * POST /api/v1/chat - Stream chat response via SSE
 */
async function chatHandler(
  req: FastifyRequest<{ Body: ChatRequest }>,
  reply: FastifyReply
) {
  const startTime = Date.now();
  const authReq = req as FastifyRequest & { user: { id: string; role: string } };
  
  try {
    // Validate request body
    const validation = validateChatRequest(req.body);
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: validation.errors
      });
    }

    const { message, useMemory = false, sessionId, model = 'gpt-4o-mini' } = req.body;
    const userId = authReq.user.id;

    logger.info('Chat request received', {
      req_id: req.id,
      user_id: userId,
      session_id: sessionId,
      use_memory: useMemory,
      model,
      message_length: message.length
    });

    // Initialize SSE stream
    const stream = new SSEStream(reply, req.id);
    
    try {
      let memoryContext: MemoryContext | null = null;
      
      // Retrieve memory context if requested
      if (useMemory) {
        logger.info('Retrieving memory context', {
          req_id: req.id,
          user_id: userId,
          session_id: sessionId
        });
        
        const memoryStartTime = Date.now();
        memoryContext = await retrieveMemoryContext(userId, message, sessionId);
        const memoryMs = Date.now() - memoryStartTime;
        
        logger.info('Memory retrieval completed', {
          req_id: req.id,
          user_id: userId,
          memory_ms: memoryMs,
          results_count: memoryContext?.results.length || 0,
          total_tokens: memoryContext?.total_tokens || 0
        });
        
        // TODO: Emit zep_search telemetry event
      }
      
      // Stream response via provider
      await streamingProvider.streamCompletion({
        message,
        model,
        context: memoryContext?.context_text,
        sessionId,
        onToken: (text: string) => {
          if (!stream.isClosed()) {
            stream.sendEvent(ChatEventType.TOKEN, { text });
          }
        },
        onUsage: (usage: UsageEventData) => {
          if (!stream.isClosed()) {
            stream.sendEvent(ChatEventType.USAGE, usage);
            
            // TODO: Emit message_sent and openai_call telemetry events
            const totalMs = Date.now() - startTime;
            logger.info('Chat completion finished', {
              req_id: req.id,
              user_id: userId,
              total_ms: totalMs,
              tokens_in: usage.tokens_in,
              tokens_out: usage.tokens_out,
              cost_usd: usage.cost_usd
            });
          }
        },
        onDone: (reason: 'stop' | 'length' | 'content_filter' | 'error') => {
          if (!stream.isClosed()) {
            stream.sendEvent(ChatEventType.DONE, { finish_reason: reason });
            stream.close();
          }
        },
        onError: (error: Error) => {
          if (!stream.isClosed()) {
            logger.error('Streaming provider error', {
              req_id: req.id,
              user_id: userId,
              error: error.message
            });
            
            stream.sendEvent(ChatEventType.ERROR, {
              error: 'Streaming service temporarily unavailable',
              code: 'PROVIDER_ERROR'
            });
            
            stream.sendEvent(ChatEventType.DONE, { finish_reason: 'error' });
            stream.close();
            
            // TODO: Emit error telemetry event
          }
        }
      });
      
    } catch (error) {
      // Handle errors during request processing
      if (!stream.isClosed()) {
        logger.error('Chat handler error', {
          req_id: req.id,
          user_id: userId,
          error: error.message
        });
        
        stream.sendEvent(ChatEventType.ERROR, {
          error: 'Internal server error',
          code: 'INTERNAL_ERROR'
        });
        
        stream.sendEvent(ChatEventType.DONE, { finish_reason: 'error' });
        stream.close();
      }
    }

  } catch (error) {
    // Handle validation errors and other early errors
    logger.error('Chat request error', {
      req_id: req.id,
      error: error.message
    });

    // If we haven't started streaming yet, send normal HTTP error
    if (!reply.sent) {
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Failed to process chat request'
      });
    }
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

/**
 * Register chat routes
 */
export const chatRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // All chat routes require authentication
  fastify.addHook('preHandler', requireAuth);

  // POST /api/v1/chat - Stream chat response
  fastify.post('/', {
    schema: {
      summary: 'Stream chat response via SSE',
      description: 'Send a message and receive streaming AI response with optional memory context',
      tags: ['Chat'],
      body: chatRequestSchema,
      response: {
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
  }, chatHandler);

  logger.info('Chat routes registered', { 
    routes: ['/'],
    auth_required: true,
    sse_enabled: true
  });
};