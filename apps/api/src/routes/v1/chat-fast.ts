/**
 * Fast Chat Route - Optimized for minimal TTFT
 *
 * This endpoint prioritizes speed:
 * 1. Gets context block from Zep (no processing)
 * 2. Starts OpenAI streaming immediately
 * 3. Handles telemetry and memory storage AFTER streaming starts
 */

import {FastifyPluginAsync, FastifyReply} from 'fastify';
import {ChatRequest, ChatEventType, chatRequestSchema, MemoryEventData, UserMessage, AssistantMessage, MemoryMessage, MemoryContextWithStatus, needsRefresh} from '@prototype/shared';
import {logger} from '../../utils/logger';
import {OpenAIProvider} from '../../providers/openai-provider';
import {UsageService} from '../../services/usage-service';
import {TelemetryService} from '../../services/telemetry-service';
import {zepAdapter} from './memory';
import {config} from '../../config';
import {getSupabaseAdmin} from '../../services/supabase-admin';

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
        saveToZep = true
      } = req.body;
      const userId = req.user!.id;
      const reqId = req.id;

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
          const supabaseAdmin = getSupabaseAdmin();

          // Try to get context from DB cache first
          try {
            const { data: cachedContext, error } = await supabaseAdmin
              .rpc('get_or_create_memory_context', {
                p_user_id: userId
              });

            if (!error && cachedContext && cachedContext.length > 0) {
              const context = cachedContext[0] as MemoryContextWithStatus;

              // Check if we can use the cached context
              if (!needsRefresh(context)) {
                contextBlock = context.context_block;
                contextFromCache = true;
                logger.info({
                  req_id: req.id,
                  user_id: userId,
                  cache_version: context.version,
                  cached: true
                }, 'Using cached memory context');
              }
            }
          } catch (cacheError) {
            logger.warn({
              req_id: req.id,
              error: cacheError
            }, 'Failed to check memory context cache');
          }

          // If no valid cache, fetch from Zep
          if (!contextBlock) {
            contextBlock = await zepAdapter.getContextBlock(userId, sessionId!!, contextMode);
            contextFromCache = false;
          }
        }
        const memoryMs = Date.now() - memoryStartMs;

        // Step 3: Load past messages if requested
        let pastMessages = '';
        if (pastMessagesCount > 0 && sessionId) {
          try {
            const supabaseAdmin = getSupabaseAdmin();
            const { data: messages, error } = await supabaseAdmin
              .from('messages')
              .select('role, content, created_at')
              .eq('thread_id', sessionId)
              .eq('user_id', userId)
              .in('role', ['user', 'assistant'])
              .order('created_at', { ascending: false })
              .limit(pastMessagesCount * 2); // Get both user and assistant messages
            
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
            logger.warn({
              req_id: reqId,
              error,
              session_id: sessionId
            }, 'Failed to load past messages');
          }
        }

        // Step 4: Build prompt (no complex assembly, just concatenation)
        const messages: any[] = [];

        // System prompt
        const finalSystemPrompt = systemPrompt ||
          'You are a helpful AI assistant. Use any provided context to give accurate and relevant responses.';

        // Add context and past messages if available
        let systemContent = finalSystemPrompt;
        if (contextBlock) {
          systemContent += `\n\nContext:\n${contextBlock}`;
        }
        if (pastMessages) {
          systemContent += pastMessages;
        }
        
        messages.push({
          role: 'system',
          content: systemContent
        });

        // Add user message
        messages.push({
          role: 'user',
          content: message
        });

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
          outputText = req.body.assistantOutput;
          ttftMs = Date.now() - startTime;
          totalMs = ttftMs + 10;
          openAIDoneTime = Date.now();
          
          logger.info({
            req_id: reqId,
            userId,
            usingAssistantOutput: true,
            outputLength: outputText.length
          }, 'Fast chat: Using provided assistant output');

          // Send the pre-defined output
          stream.sendEvent(ChatEventType.TOKEN, { text: outputText });
          
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
            ttft_ms: ttftMs,
            openai_ms: 0
          });
          
          stream.close();
          
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
                    contextBlock?.length
                  )
                }

              } catch (error: any) {
                logger.error({
                  req_id: reqId,
                  error: error.message,
                  stack: error.stack
                }, 'Fast chat: Saving telemetry error');
              }

              // Step 6: Store conversation in Zep if successful and session exists (skip in testing mode or if saveToZep is false)
              if (testingMode || !saveToZep) {
                logger.info({
                  req_id: req.id,
                  user_id: userId,
                  session_id: sessionId,
                  testing_mode: testingMode,
                  save_to_zep: saveToZep
                }, 'Skipping message storage (testing mode or saveToZep disabled)');
              } else if (reason === 'stop' && sessionId && outputText) {
                try {
                  const memoryUpsertStartMs = Date.now()
                  const stored = await zepAdapter.storeConversationTurn(
                    userId,
                    sessionId,
                    message,
                    outputText
                  );
                  const memoryUpsertMs = Date.now() - memoryUpsertStartMs;

                  await telemetryService.logZepUpsert(
                    userId,
                    sessionId,
                    memoryUpsertMs,
                    stored
                  )

                  if (stored) {
                    logger.info({
                      req_id: req.id,
                      user_id: userId,
                      session_id: sessionId
                    }, 'Conversation stored in Zep');

                    // Step 8: Update memory context cache after successful Zep storage
                    // Only update if we didn't use cache or if contextMode might have changed
                    if (!contextFromCache || contextBlock) {
                      try {
                        // Fetch fresh context from Zep
                        const freshContext = await zepAdapter.getContextBlock(userId, sessionId, contextMode);

                        if (freshContext) {
                          // Store in database cache
                          const supabaseAdmin = getSupabaseAdmin();
                          const { error: updateError } = await supabaseAdmin
                            .rpc('update_memory_context', {
                              p_user_id: userId,
                              p_context_block: freshContext,
                              p_zep_parameters: { mode: contextMode },
                              p_session_id: sessionId
                            });

                          if (updateError) {
                            logger.warn({
                              req_id: req.id,
                              user_id: userId,
                              error: updateError.message
                            }, 'Failed to update memory context cache');
                          } else {
                            logger.info({
                              req_id: req.id,
                              user_id: userId,
                              session_id: sessionId,
                              context_length: freshContext.length
                            }, 'Memory context cache updated');
                          }
                        }
                      } catch (cacheUpdateError) {
                        // Don't fail if cache update fails
                        logger.warn({
                          req_id: req.id,
                          user_id: userId,
                          error: cacheUpdateError
                        }, 'Failed to refresh memory context cache');
                      }
                    }
                  }

                  // Step 7: Store messages in database (skip in testing mode or if saveToZep is false)
                  if (!testingMode && saveToZep) {
                    try {
                    const supabaseAdmin = getSupabaseAdmin();

                    // Store user message with startTime as created_at
                    const userMessage: UserMessage = {
                      thread_id: sessionId,
                      role: 'user',
                      content: message,
                      user_id: userId,
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
                        start_ms: memoryStartMs,
                        total_ms: memoryMs,
                        created_at: new Date(memoryStartMs).toISOString()
                      };
                      messagesToInsert.push(memoryContextMessage);
                    }

                    // Store assistant message with metrics
                    const assistantMessage: AssistantMessage = {
                      thread_id: sessionId,
                      role: 'assistant',
                      content: outputText,
                      user_id: userId,
                      start_ms: openAIStartTime,
                      ttft_ms: openAIMetrics?.ttftMs,
                      total_ms: openAIMetrics?.openAiMs || 0,
                      tokens_in: usageCalc?.tokens_in || 0,
                      tokens_out: usageCalc?.tokens_out || 0,
                      price: usageCalc?.cost_usd || 0,
                      model: model,
                      created_at: new Date(openAIDoneTime).toISOString()
                    };
                    messagesToInsert.push(assistantMessage);

                    // Insert all messages
                    const { error: insertError } = await supabaseAdmin
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
                  } // End of testingMode check
                } catch (error) {
                  // Don't fail the request if Zep storage fails
                  logger.error({
                    req_id: req.id,
                    error: error instanceof Error ? error.message : String(error)
                  }, 'Failed to store conversation in Zep');
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
              stream.sendEvent(ChatEventType.TOKEN, {text: errorCode + ": " + userMessage});

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
