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
import { OpenAIProvider } from '../../providers/openai-provider';
import { UsageService } from '../../services/usage-service';
import { PromptAssembler } from '../../services/prompt-assembler';
import { TelemetryService } from '../../services/telemetry-service';
import { ModelRegistry } from '../../services/model-registry';
import { config } from '../../config';

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

// Initialize services
const openAIProvider = new OpenAIProvider();
const usageService = new UsageService();
const promptAssembler = new PromptAssembler();
const telemetryService = new TelemetryService();
const modelRegistry = new ModelRegistry();

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
  private abortController: AbortController;
  
  constructor(reply: FastifyReply, requestId: string) {
    this.reply = reply;
    this.abortController = new AbortController();
    
    // Set SSE headers and flush immediately
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
    
    // Flush headers immediately before any upstream calls
    this.flush();
    
    // Start heartbeat to keep connection alive
    this.startHeartbeat();
    
    // Handle client disconnect
    reply.raw.on('close', () => {
      this.abortController.abort();
      this.close();
    });
    
    reply.raw.on('error', (error) => {
      logger.warn('SSE stream error', { error: error.message });
      this.abortController.abort();
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
    const heartbeatMs = config.openai.sseHeartbeatMs || 10000; // Default 10s
    this.heartbeatInterval = setInterval(() => {
      if (!this.closed) {
        this.sendComment(`heartbeat ${Date.now()}`);
        this.flush();
      }
    }, heartbeatMs);
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
  
  /**
   * Get abort signal for upstream cancellation
   */
  getAbortSignal(): AbortSignal {
    return this.abortController.signal;
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

    const { message, useMemory = false, sessionId } = req.body;
    let { model } = req.body;
    const userId = authReq.user.id;

    // Validate and resolve model
    const modelValidation = await modelRegistry.validateModel(model);
    model = modelValidation.model; // Use validated/default model
    
    logger.info('Chat request received', {
      req_id: req.id,
      user_id: userId,
      session_id: sessionId,
      use_memory: useMemory,
      model,
      model_valid: modelValidation.valid,
      used_default: modelValidation.is_default,
      message_length: message.length
    });

    // Initialize SSE stream
    const stream = new SSEStream(reply, req.id);
    
    try {
      let memoryContext: MemoryContext | null = null;
      let memoryMs = 0;
      
      // Retrieve memory context if requested
      if (useMemory) {
        logger.info('Retrieving memory context', {
          req_id: req.id,
          user_id: userId,
          session_id: sessionId
        });
        
        const memoryStartTime = Date.now();
        memoryContext = await retrieveMemoryContext(userId, message, sessionId);
        memoryMs = Date.now() - memoryStartTime;
        
        logger.info('Memory retrieval completed', {
          req_id: req.id,
          user_id: userId,
          memory_ms: memoryMs,
          results_count: memoryContext?.results.length || 0,
          total_tokens: memoryContext?.total_tokens || 0
        });
        
        // Log zep_search telemetry event
        if (memoryContext) {
          await telemetryService.logZepSearch(
            userId,
            sessionId,
            memoryMs,
            memoryContext.results.length,
            memoryContext.total_tokens
          );
        }
      }
      
      // Assemble prompt with memory context
      const promptPlan = promptAssembler.assemblePrompt({
        userMessage: message,
        memoryBundle: memoryContext?.results,
        systemPrompt: 'You are a helpful AI assistant. Use any provided context to give accurate and relevant responses.'
      });
      
      // Track streaming metrics
      let ttftMs: number | undefined;
      let openAIStartTime = Date.now();
      let outputText = '';
      let hasProviderUsage = false;
      
      // Stream response via OpenAI provider
      const metrics = await openAIProvider.streamCompletion({
        message,
        model,
        messages: promptPlan.messages,
        signal: stream.getAbortSignal(), // Pass abort signal for disconnect handling
        onFirstToken: () => {
          ttftMs = Date.now() - openAIStartTime;
        },
        onToken: (text: string) => {
          if (!stream.isClosed()) {
            outputText += text;
            stream.sendEvent(ChatEventType.TOKEN, { text });
          }
        },
        onUsage: async (usage: UsageEventData) => {
          if (!stream.isClosed()) {
            hasProviderUsage = true;
            const openAIMs = Date.now() - openAIStartTime;
            
            // Calculate cost with UsageService
            const usageCalc = await usageService.calculateFromProvider(usage, model);
            
            // Send usage event to client
            stream.sendEvent(ChatEventType.USAGE, {
              tokens_in: usageCalc.tokens_in,
              tokens_out: usageCalc.tokens_out,
              cost_usd: usageCalc.cost_usd,
              model
            });
            
            // Log telemetry events
            const totalMs = Date.now() - startTime;
            
            await telemetryService.logMessageSent(
              userId,
              sessionId,
              totalMs,
              message.length
            );
            
            await telemetryService.logOpenAICall(
              userId,
              sessionId,
              {
                model,
                tokens_in: usageCalc.tokens_in,
                tokens_out: usageCalc.tokens_out,
                cost_usd: usageCalc.cost_usd,
                ttft_ms: ttftMs || metrics?.ttftMs,
                openai_ms: openAIMs || metrics?.openAiMs,
                has_provider_usage: true,
                prompt_plan: promptAssembler.getPromptPlanSummary(promptPlan),
                provider_retry_count: metrics?.retryCount || 0,
                input_price_per_mtok: modelValidation.pricing?.input_per_mtok,
                output_price_per_mtok: modelValidation.pricing?.output_per_mtok
              }
            );
            
            logger.info('Chat completion finished', {
              req_id: req.id,
              user_id: userId,
              total_ms: totalMs,
              ttft_ms: ttftMs,
              openai_ms: openAIMs,
              tokens_in: usageCalc.tokens_in,
              tokens_out: usageCalc.tokens_out,
              cost_usd: usageCalc.cost_usd,
              has_provider_usage: true
            });
          }
        },
        onDone: async (reason: 'stop' | 'length' | 'content_filter' | 'error') => {
          if (!stream.isClosed()) {
            const openAIMs = Date.now() - openAIStartTime;
            
            // Fallback: estimate usage if not provided by provider
            if (!hasProviderUsage && reason !== 'error') {
              const promptText = promptPlan.messages.map(m => m.content).join('\n');
              const usageCalc = await usageService.estimateUsage(
                promptText,
                outputText,
                model
              );
              
              // Send estimated usage
              stream.sendEvent(ChatEventType.USAGE, {
                tokens_in: usageCalc.tokens_in,
                tokens_out: usageCalc.tokens_out,
                cost_usd: usageCalc.cost_usd,
                model
              });
              
              // Log telemetry with fallback flag
              const totalMs = Date.now() - startTime;
              
              await telemetryService.logMessageSent(
                userId,
                sessionId,
                totalMs,
                message.length
              );
              
              await telemetryService.logOpenAICall(
                userId,
                sessionId,
                {
                  model,
                  tokens_in: usageCalc.tokens_in,
                  tokens_out: usageCalc.tokens_out,
                  cost_usd: usageCalc.cost_usd,
                  ttft_ms: ttftMs || metrics?.ttftMs,
                  openai_ms: openAIMs || metrics?.openAiMs,
                  has_provider_usage: false,
                  prompt_plan: promptAssembler.getPromptPlanSummary(promptPlan),
                  provider_retry_count: metrics?.retryCount || 0,
                  input_price_per_mtok: modelValidation.pricing?.input_per_mtok,
                  output_price_per_mtok: modelValidation.pricing?.output_per_mtok
                }
              );
              
              logger.info('Chat completion finished (fallback usage)', {
                req_id: req.id,
                user_id: userId,
                total_ms: totalMs,
                ttft_ms: ttftMs,
                openai_ms: openAIMs,
                tokens_in: usageCalc.tokens_in,
                tokens_out: usageCalc.tokens_out,
                cost_usd: usageCalc.cost_usd,
                has_provider_usage: false
              });
            }
            
            stream.sendEvent(ChatEventType.DONE, { finish_reason: reason });
            stream.close();
          }
        },
        onError: async (error: Error, statusCode?: number) => {
          if (!stream.isClosed()) {
            logger.error('Streaming provider error', {
              req_id: req.id,
              user_id: userId,
              error: error.message
            });
            
            // Log error telemetry
            await telemetryService.logError(
              userId,
              sessionId,
              error,
              { model, request_id: req.id, status_code: statusCode }
            );
            
            // Send user-friendly error message based on status
            let userMessage = 'Service temporarily unavailable. Please try again.';
            let errorCode = 'PROVIDER_ERROR';
            
            if (statusCode === 429) {
              userMessage = 'Overloaded, please try again soon.';
              errorCode = 'RATE_LIMIT';
            } else if (statusCode && statusCode >= 500) {
              userMessage = 'Server error, please try again later.';
              errorCode = 'SERVER_ERROR';
            } else if (error.message.includes('timeout')) {
              userMessage = 'Request timed out. Please try again with a shorter message.';
              errorCode = 'OPENAI_TIMEOUT';
            }
            
            // Send error as a token message for user visibility
            stream.sendEvent(ChatEventType.TOKEN, { text: userMessage });
            
            stream.sendEvent(ChatEventType.DONE, { finish_reason: 'error' });
            stream.close();
          }
        }
      });
      
      // Update telemetry with retry count
      if (metrics.retryCount > 0) {
        logger.info('Request completed with retries', {
          req_id: req.id,
          retry_count: metrics.retryCount,
          ttft_ms: metrics.ttftMs,
          openai_ms: metrics.openAiMs
        });
      }
      
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