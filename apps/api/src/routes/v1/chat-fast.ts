/**
 * Fast Chat Route - Optimized for minimal TTFT
 *
 * This endpoint prioritizes speed:
 * 1. Gets context block from Zep (no processing)
 * 2. Starts OpenAI streaming immediately
 * 3. Handles telemetry and memory storage AFTER streaming starts
 */

import {
  FastifyBaseLogger,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
  FastifyTypeProviderDefault
} from 'fastify';
import {
  ChatRequest,
  ChatEventType,
  chatRequestSchema,
  MemoryEventData,
  UserMessage,
  AssistantMessage,
  MemoryMessage,
  MemoryContextWithStatus,
  needsRefresh
} from '@prototype/shared';
import {logger} from '../../utils/logger';
import {OpenAIProvider} from '../../providers/openai-provider';
import {UsageService} from '../../services/usage-service';
import {TelemetryService} from '../../services/telemetry-service';
import {zepAdapter} from './memory';
import {config} from '../../config';
import {getSupabaseAdmin} from '../../services/supabase-admin';
import {IncomingMessage, ServerResponse} from "node:http";

// Initialize services
const openAIProvider = new OpenAIProvider();
const usageService = new UsageService();
const telemetryService = new TelemetryService();

/**
 * Format SSE event
 */
function formatSSEEvent(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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
      logger.warn('SSE stream error', {error: error.message});
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

async function loadCachedContextFromDB(
  userId: String,
  reqId: String
): Promise<string | undefined> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const {data: cachedContext, error} = await supabaseAdmin
      .rpc('get_or_create_memory_context', {
        p_user_id: userId
      });

    if (error) {
      logger.error({
        req_id: reqId,
        error: error
      }, 'Failed to check memory context cache');
    }

    const context = cachedContext[0] as MemoryContextWithStatus;

    if (context?.context_block) {
      logger.info({
        req_id: reqId,
        user_id: userId,
        cache_version: context.version,
        cached: true
      }, 'Using cached memory context');
    }

    return context?.context_block;

  } catch (cacheError) {
    logger.error({
      req_id: reqId,
      error: cacheError
    }, 'Failed to check memory context cache');
    return undefined;
  }
}

async function loadPastMessages(sessionId: string, userId: string, pastMessagesCount: number, reqId: string): Promise<string> {
  let pastMessages = '';
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const {data: messages, error} = await supabaseAdmin
      .from('messages')
      .select('role, content, created_at')
      .eq('thread_id', sessionId)
      .eq('user_id', userId)
      .in('role', ['user', 'assistant'])
      .order('created_at', {ascending: false})
      .limit(pastMessagesCount); // Get exactly the requested number of messages

    if (!error && messages && messages.length > 0) {
      // Reverse to get chronological order
      const orderedMessages = messages.reverse();
      pastMessages = '\n\nPrevious conversation:\n' +
        orderedMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');

      logger.info({
        req_id: reqId,
        loaded_messages: orderedMessages.length,
        session_id: sessionId
      }, 'Loaded past messages for context');
    }

  } catch (error) {
    logger.error({
      req_id: reqId,
      error,
      session_id: sessionId
    }, 'Failed to load past messages');
  }

  return pastMessages;
}

function buildPrompt(systemPrompt: string | undefined, contextBlock: string | undefined, pastMessages: string, message: string) {
  // System prompt
  const finalSystemPrompt = systemPrompt ||
    'You are a helpful AI assistant. Use any provided context to give accurate and relevant responses.';

  // Add context and past messages if available
  let systemContent = finalSystemPrompt;
  if (contextBlock) {
    systemContent += `\n\nContext:\n${contextBlock}`;
  }
  if (pastMessages) {
    systemContent += `\n\nLast messages:\n${pastMessages}`;
  }

  const messages: any[] = [];
  messages.push({
    role: 'system',
    content: systemContent
  });

  // Add user message
  messages.push({
    role: 'user',
    content: message
  });
  return messages;
}

async function simulateStreamFromOpenAI(stream: SSEStream, userId: string, reqId: string, body: ChatRequest, messages: any[], contextBlock: string | undefined, returnMemory: boolean, usageCalc: any, model: string, memoryMs: number)
  : Promise<string> {
  let outputText = body.assistantOutput!!;

  logger.info({
    req_id: reqId,
    userId,
    usingAssistantOutput: true,
    outputLength: outputText?.length
  }, 'Fast chat: Using provided assistant output');

  // Send the pre-defined output
  stream.sendEvent(ChatEventType.TOKEN, {text: outputText});

  // Estimate usage
  usageCalc = await usageService.estimateUsage(
    messages.map((m: any) => m.content).join('\n'),
    outputText,
    model
  );

  stream.sendEvent(ChatEventType.USAGE, {
    tokens_in: usageCalc.tokens_in,
    tokens_out: usageCalc.tokens_out,
    cost_usd: usageCalc.cost_usd,
    model
  });

  if (returnMemory) {
    const memoryData: MemoryEventData = {
      results: contextBlock,
      memoryMs: memoryMs
    };
    stream.sendEvent(ChatEventType.MEMORY, memoryData);
  }

  stream.sendEvent(ChatEventType.DONE, {
    finish_reason: 'stop',
    ttft_ms: 0,
    openai_ms: 0
  });

  stream.close();

  return outputText;
}

async function loadUserNameFromDB(userId: string, reqId: string): Promise<string | undefined> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const {data: context, error} = await supabaseAdmin
      .from('memory_context')
      .select('user_name')
      .eq('user_id', userId)
      .single();

    if (!error && context?.user_name) {
      return context.user_name;
    }
  } catch (error) {
    logger.error({
      req_id: reqId,
      error
    }, 'Failed to load user name from DB');
  }
  return undefined;
}

async function storeConversationInZep(userId: string, sessionId: string, message: string, outputText: string, reqId: string) {
  try {
    const memoryUpsertStartMs = Date.now()
    
    // Load user name from DB
    const userName = await loadUserNameFromDB(userId, reqId);
    
    const stored = await zepAdapter.storeConversationTurn(
      userId,
      sessionId,
      message,
      outputText,
      userName  // Pass user name to Zep adapter
    );

    if (stored) {
      logger.info({
        req_id: reqId,
        user_id: userId,
        session_id: sessionId
      }, 'Conversation stored in Zep');
      const memoryUpsertMs = Date.now() - memoryUpsertStartMs;

      await telemetryService.logZepUpsert(
        userId,
        sessionId,
        memoryUpsertMs,
        stored
      )
    }
  } catch (error) {
    // Don't fail the request if Zep storage fails
    logger.error({
      req_id: reqId,
      error: error instanceof Error ? error.message : String(error)
    }, 'Failed to store conversation in Zep');
  }
}

async function storeConversationInDB(sessionId: string, message: string, userId: string, startTime: number, contextBlock: string | undefined, memoryStartMs: number, memoryMs: number, outputText: string, openAIStartTime: number, openAIMetrics: any, usageCalc: any, model: string, openAIDoneTime: number, ttftMs: number | undefined, totalMs: number | undefined, reqId: string, prompt?: any[]) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Store user message with startTime as created_at
    const userMessage: UserMessage = {
      thread_id: sessionId,
      role: 'user',
      content: message,
      user_id: userId,
      ttft_ms: ttftMs,
      total_ms: totalMs,
      created_at: new Date(startTime).toISOString()
    };

    // Build messages array
    const messagesToInsert: any[] = [userMessage];

    // Store memory context if available
    if (contextBlock) {
      const memoryContextMessage: MemoryMessage = {
        thread_id: sessionId,
        role: 'memory',
        content: contextBlock,
        user_id: userId,
        start_ms: memoryStartMs - startTime,
        total_ms: memoryMs,
        created_at: new Date(memoryStartMs).toISOString()
      };
      messagesToInsert.push(memoryContextMessage);
    }

    // Store assistant message with metrics and prompt
    const assistantMessage: AssistantMessage & { prompt?: any } = {
      thread_id: sessionId,
      role: 'assistant',
      content: outputText,
      user_id: userId,
      start_ms: openAIStartTime - startTime,
      ttft_ms: openAIMetrics?.ttftMs,
      total_ms: openAIMetrics?.openAiMs || 0,
      tokens_in: usageCalc?.tokens_in || 0,
      tokens_out: usageCalc?.tokens_out || 0,
      price: usageCalc?.cost_usd || 0,
      model: model,
      created_at: new Date(openAIDoneTime).toISOString(),
      prompt: prompt // Store the full prompt sent to OpenAI
    };
    messagesToInsert.push(assistantMessage);

    // Insert all messages
    const {error: insertError} = await supabaseAdmin
      .from('messages')
      .insert(messagesToInsert);

    if (insertError) {
      logger.warn({
        req_id: reqId,
        error: insertError.message,
        thread_id: sessionId
      }, 'Failed to store messages in database');
    } else {
      logger.info({
        req_id: reqId,
        thread_id: sessionId,
        user_id: userId
      }, 'Messages stored in database');
    }
  } catch (dbError: any) {
    // Don't fail the request if database storage fails
    logger.error({
      req_id: reqId,
      error: dbError.message,
      thread_id: sessionId
    }, 'Failed to store messages in database');
  }
}

async function loadContextAndStoreInDB(userId: string, sessionId: string, contextMode: string, reqId: string) {
  try {
    // Fetch fresh context from Zep
    const freshContext = await zepAdapter.getContextBlock(userId, sessionId, contextMode);

    if (freshContext) {
      // Store in database cache
      const supabaseAdmin = getSupabaseAdmin();
      const {error: updateError} = await supabaseAdmin
        .rpc('update_memory_context', {
          p_user_id: userId,
          p_context_block: freshContext,
          p_zep_parameters: {mode: contextMode},
          p_session_id: sessionId
        });

      if (updateError) {
        logger.warn({
          req_id: reqId,
          user_id: userId,
          error: updateError.message
        }, 'Failed to update memory context cache');
      } else {
        logger.info({
          req_id: reqId,
          user_id: userId,
          session_id: sessionId,
          context_length: freshContext.length
        }, 'Memory context cache updated');
      }
    }
  } catch (cacheUpdateError) {
    // Don't fail if cache update fails
    logger.warn({
      req_id: reqId,
      user_id: userId,
      error: cacheUpdateError
    }, 'Failed to refresh memory context cache');
  }
}

async function sendTelemetryEvents(userId: string, sessionId: string | undefined, totalMs: number, message: string, usageCalc: any, model: string, openAIMetrics: any, hasProviderUsage: boolean, contextBlock: string | undefined, memoryMs: number, reqId: string, contextFromCache: boolean) {
  try {
    // Log telemetry
    await telemetryService.logMessageSent(userId, sessionId, totalMs!!, message.length);

    if (usageCalc) {
      await telemetryService.logOpenAICall(userId, sessionId || '', {
        model,
        tokens_in: usageCalc.tokens_in,
        tokens_out: usageCalc.tokens_out,
        cost_usd: usageCalc.cost_usd,
        ttft_ms: openAIMetrics?.ttftMs,
        openai_ms: openAIMetrics?.openAiMs,
        has_provider_usage: hasProviderUsage
      });
    }

    if (contextBlock) {
      await telemetryService.logZepSearch(
        userId,
        sessionId,
        memoryMs,
        contextBlock?.length,
        contextFromCache
      )
    }

  } catch (error: any) {
    logger.error({
      req_id: reqId,
      error: error.message,
      stack: error.stack
    }, 'Fast chat: Saving telemetry error');
  }
}

export const chatFastRoute: FastifyPluginAsync = async (server) => {
  server.post<{
    Body: ChatRequest;
  }>(
    '/',
    {
      schema: {
        body: chatRequestSchema,
        response: {
          200: {
            description: 'SSE stream of chat response',
            type: 'string',
            contentType: 'text/event-stream'
          }
        }
      },
    },
    async (req, reply) => {
      const startTime = Date.now();
      const {
        message,
        useMemory = false,
        sessionId,
        model: requestedModel,
        systemPrompt,
        returnMemory = false,
        contextMode = 'basic',
        testingMode = false,
        pastMessagesCount = 4,
        graphSearchParams,
        minRating
      } = req.body;
      let userId: string = req.user!.id;
      const reqId = req.id;
      
      // Check if this is a playground user by looking for it in memory_context
      // For playground users, the sessionId IS the user ID
      if (sessionId) {
        try {
          const supabaseAdmin = getSupabaseAdmin();
          const { data: memoryContext } = await supabaseAdmin
            .from('memory_context')
            .select('user_id, user_name, experiment_title')
            .eq('user_id', sessionId)
            .single();
          
          if (memoryContext) {
            // This is a playground user, use their ID instead
            userId = sessionId;
            logger.info({
              req_id: reqId,
              authenticatedUserId: req.user!.id,
              playgroundUserId: userId,
              userName: memoryContext.user_name,
              experimentTitle: memoryContext.experiment_title
            }, 'Using playground user ID for memory context');
          }
        } catch (error) {
          // Not a playground user, continue with authenticated user ID
          logger.debug({
            req_id: reqId,
            sessionId,
            error
          }, 'Session ID is not a playground user, using authenticated user ID');
        }
      }

      // Initialize SSE stream
      const stream = new SSEStream(reply, req.id);

      try {
        // Step 1: Use admin-configured default model if no model specified
        const model = requestedModel || config.openai.defaultModel;

        // Step 2: Get context block if memory is enabled
        const memoryStartMs = Date.now()
        let contextBlock: string | undefined = undefined;
        let contextFromCache = false;

        if (useMemory) {
          // For query-based context modes, always build fresh context (no cache)
          if (['node_search', 'edge_search', 'node_edge_search', 'bfs'].includes(contextMode)) {
            contextBlock = await zepAdapter.buildCustomContext(
              userId, 
              sessionId!!, 
              message, // Use the user's message as the query
              contextMode as any,
              graphSearchParams
            );
          } else {
            // For basic/summarized modes, try cache first
            contextBlock = await loadCachedContextFromDB(userId, reqId);

            // If no valid cache, fetch from Zep
            if (!contextBlock) {
              contextBlock = await zepAdapter.getContextBlock(userId, sessionId!!, contextMode as 'basic' | 'summarized', minRating);
              contextFromCache = true;
            }
          }
        }
        const memoryMs = Date.now() - memoryStartMs;

        // Step 3: Load past messages if requested
        let pastMessages = '';
        if (pastMessagesCount > 0 && sessionId) {
          pastMessages = await loadPastMessages(sessionId, userId, pastMessagesCount, reqId);
        }

        // Step 4: Build prompt (no complex assembly, just concatenation)
        const messages = buildPrompt(systemPrompt, contextBlock, pastMessages, message);

        // Step 4: Check if we should skip OpenAI (assistantOutput provided)
        let ttftMs: number | undefined;
        let totalMs: number | undefined;
        let outputText = '';
        let hasProviderUsage = false;
        let usageCalc: any = null;
        const openAIStartTime = Date.now();
        let openAIDoneTime: number | undefined;
        let openAIMetrics: any = null;

        // If assistantOutput is provided, use it instead of calling OpenAI
        if (req.body.assistantOutput) {
          outputText = await simulateStreamFromOpenAI(stream, userId, reqId, req.body, messages, contextBlock, returnMemory, usageCalc, model, memoryMs)

        } else {
          // Normal OpenAI streaming path
          // Log that we're starting
          logger.info({
            req_id: reqId,
            userId,
            model,
            hasContext: !!contextBlock,
            memoryMs: memoryMs,
            prepTime: openAIStartTime - startTime
          }, 'Fast chat: Starting OpenAI stream');

          // Start streaming with minimal setup
          openAIMetrics = await openAIProvider.streamCompletion({
            message,
            model,
            messages,
            signal: stream.getAbortSignal(),
            onFirstToken: () => {
              ttftMs = Date.now() - startTime;
              logger.info({
                req_id: reqId,
                ttft_ms: ttftMs
              }, 'Fast chat: First token');
            },
            onToken: (text: string) => {
              if (!stream.isClosed()) {
                outputText += text;
                stream.sendEvent(ChatEventType.TOKEN, {text});
              }
            },
            onUsage: async (usage) => {
              if (!stream.isClosed()) {
                hasProviderUsage = true;
                usageCalc = await usageService.calculateFromProvider(usage, model);
                stream.sendEvent(ChatEventType.USAGE, {
                  tokens_in: usageCalc.tokens_in,
                  tokens_out: usageCalc.tokens_out,
                  cost_usd: usageCalc.cost_usd,
                  model
                });
                logger.debug({
                  tokens_in: usageCalc.tokens_in,
                  tokens_out: usageCalc.tokens_out,
                  cost_usd: usageCalc.cost_usd,
                }, 'Streaming provider USAGE');
              }
            },
            onDone: async (reason: 'stop' | 'length' | 'content_filter' | 'error') => {
              logger.debug({
                req_id: req.id,
                user_id: userId,
                reason: reason
              }, 'Streaming provider DONE');
              if (!stream.isClosed()) {
                openAIDoneTime = Date.now()
                totalMs = Date.now() - startTime;

                if (returnMemory) {
                  // Send memory context to client
                  const memoryData: MemoryEventData = {
                    results: contextBlock,
                    memoryMs: memoryMs
                  };
                  stream.sendEvent(ChatEventType.MEMORY, memoryData);
                }

                stream.sendEvent(ChatEventType.DONE, {
                  finish_reason: reason,
                  ttft_ms: openAIMetrics?.ttftMs,
                  openai_ms: openAIMetrics?.openAiMs
                });
                stream.close();

                // Step 5: Handle telemetry and memory AFTER streaming (non-blocking)
                // This happens after the response is sent to the client
                await sendTelemetryEvents(userId, sessionId, totalMs, message, usageCalc, model, openAIMetrics, hasProviderUsage, contextBlock, memoryMs, reqId, contextFromCache);

                if (reason === 'stop' && sessionId && outputText) {
                  if (!testingMode) {
                    // Step 6: Store conversation in Zep if successful and session exists (skip in testing mode)
                    await storeConversationInZep(userId, sessionId, message, outputText, reqId);

                    // Step 7: Store messages in database (skip in testing mode)
                    await storeConversationInDB(sessionId, message, userId, startTime, contextBlock, memoryStartMs, memoryMs, outputText, openAIStartTime, openAIMetrics, usageCalc, model, openAIDoneTime, ttftMs, totalMs, reqId, messages);

                    // Step 8: Update memory context cache after successful Zep storage
                    loadContextAndStoreInDB(userId, sessionId, contextMode, reqId)

                  } else {
                    logger.info({
                      req_id: req.id,
                      user_id: userId,
                      session_id: sessionId,
                      testing_mode: testingMode
                    }, 'Skipping message storage (testing mode)');
                  }
                }
              }
            },
            onError: async (error: Error, statusCode?: number) => {
              if (!stream.isClosed()) {

                if (returnMemory) {
                  // Send memory context to client
                  const memoryData: MemoryEventData = {
                    results: contextBlock,
                    memoryMs: memoryMs
                  };
                  stream.sendEvent(ChatEventType.MEMORY, memoryData);
                }

                logger.error({
                  req_id: req.id,
                  user_id: userId,
                  error: error.message
                }, 'Streaming provider error');

                // Log error telemetry
                await telemetryService.logError(
                  userId,
                  sessionId,
                  error,
                  {model, request_id: req.id, status_code: statusCode}
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
                stream.sendEvent(ChatEventType.TOKEN, {text: errorCode + ": " + userMessage + "\n\n" + error.message});

                stream.sendEvent(ChatEventType.DONE, {finish_reason: 'error'});
                stream.close();
              }
            }
          });
        } // End of else block (normal OpenAI path)
      } catch (error: any) {
        logger.error({
          req_id: reqId,
          error: error.message,
          stack: error.stack
        }, 'Fast chat error');

        if (!stream.isClosed()) {
          stream.sendEvent(ChatEventType.ERROR, {
            error: 'An error occurred while processing your request'
          });
          stream.close();
        }
      }
    }
  );
};
