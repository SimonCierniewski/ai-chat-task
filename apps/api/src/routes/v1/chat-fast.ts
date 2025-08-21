/**
 * Fast Chat Route - Optimized for minimal TTFT
 *
 * This endpoint prioritizes speed:
 * 1. Gets context block from Zep (no processing)
 * 2. Starts OpenAI streaming immediately
 * 3. Handles telemetry and memory storage AFTER streaming starts
 */

import {FastifyPluginAsync, FastifyReply} from 'fastify';
import {ChatRequest, ChatEventType, chatRequestSchema, MemoryEventData} from '@prototype/shared';
import {logger} from '../../utils/logger';
import {OpenAIProvider} from '../../providers/openai-provider';
import {UsageService} from '../../services/usage-service';
import {TelemetryService} from '../../services/telemetry-service';
import {zepAdapter} from './memory';
import {config} from '../../config';

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
 * Minimal SSE Stream class for fast chat
 */
class SSEStream {
  private reply: FastifyReply;
  private closed = false;
  private abortController: AbortController;

  constructor(reply: FastifyReply) {
    this.reply = reply;
    this.abortController = new AbortController();
  }

  initialize() {
    // Set SSE headers and flush immediately
    this.reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Proxy-Buffering': 'off'
    });

    // Flush headers immediately
    this.reply.raw.write('');

    // Handle client disconnect
    this.reply.raw.on('close', () => {
      this.abortController.abort();
      this.closed = true;
    });
  }

  sendEvent(type: ChatEventType, data: any) {
    if (this.closed) return;
    this.reply.raw.write(formatSSEEvent(type, data));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.reply.raw.end();
  }

  isClosed(): boolean {
    return this.closed;
  }

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
        returnMemory = false
      } = req.body;
      const userId = req.user!.id;
      const reqId = req.id;

      // Initialize SSE stream
      const stream = new SSEStream(reply);
      stream.initialize();

      try {
        // Step 1: Validate model (fast lookup)
        const model = requestedModel || 'gpt-4o-mini';

        // Step 2: Get context block if memory is enabled (simple, no processing)
        let contextBlock: string | undefined = undefined;
        if (useMemory) {
          contextBlock = await zepAdapter.getContextBlock(userId, sessionId!!);
        }

        const memoryMs = Date.now() - startTime;

        // Step 3: Build prompt (no complex assembly, just concatenation)
        const messages: any[] = [];

        // System prompt
        const finalSystemPrompt = systemPrompt ||
          'You are a helpful AI assistant. Use any provided context to give accurate and relevant responses.';

        // Add context if available
        if (contextBlock) {
          messages.push({
            role: 'system',
            content: `${finalSystemPrompt}\n\nContext:\n${contextBlock}`
          });
        } else {
          messages.push({
            role: 'system',
            content: finalSystemPrompt
          });
        }

        // Add user message
        messages.push({
          role: 'user',
          content: message
        });

        // Step 4: Start OpenAI streaming IMMEDIATELY
        let ttftMs: number | undefined;
        let outputText = '';
        let hasProviderUsage = false;
        let usageCalc: any = null;
        const openAIStartTime = Date.now();

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
        const metrics = await openAIProvider.streamCompletion({
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
            }
          },
          onDone: async (reason: 'stop' | 'length' | 'content_filter' | 'error') => {
            logger.debug({
              req_id: req.id,
              user_id: userId,
              reason: reason
            }, 'Streaming provider DONE');
            if (!stream.isClosed()) {
              const openAIMs = Date.now() - openAIStartTime;
              const totalMs = Date.now() - startTime;

              if (returnMemory) {
                // Send memory context to client
                const memoryData: MemoryEventData = {
                  results: contextBlock,
                  memoryMs: memoryMs
                };
                stream.sendEvent(ChatEventType.MEMORY, memoryData);
              }

              // // Fallback: estimate usage if not provided by provider
              // if (!hasProviderUsage && reason !== 'error') {
              //   const promptText = promptPlan.messages.map(m => m.content).join('\n');
              //   usageCalc = await usageService.estimateUsage(
              //     promptText,
              //     outputText,
              //     model
              //   );
              //
              //   // Send estimated usage
              //   stream.sendEvent(ChatEventType.USAGE, {
              //     tokens_in: usageCalc.tokens_in,
              //     tokens_out: usageCalc.tokens_out,
              //     cost_usd: usageCalc.cost_usd,
              //     model
              //   });
              //
              //   // Log telemetry with fallback flag
              //
              //   await telemetryService.logMessageSent(
              //     userId,
              //     sessionId,
              //     totalMs,
              //     message.length
              //   );
              //
              //   await telemetryService.logOpenAICall(
              //     userId,
              //     sessionId,
              //     {
              //       model,
              //       tokens_in: usageCalc.tokens_in,
              //       tokens_out: usageCalc.tokens_out,
              //       cost_usd: usageCalc.cost_usd,
              //       ttft_ms: ttftMs || metrics?.ttftMs,
              //       openai_ms: openAIMs || metrics?.openAiMs,
              //       has_provider_usage: false,
              //       prompt_plan: promptAssembler.getPromptPlanSummary(promptPlan),
              //       provider_retry_count: metrics?.retryCount || 0,
              //       input_price_per_mtok: modelValidation.pricing?.input_per_mtok,
              //       output_price_per_mtok: modelValidation.pricing?.output_per_mtok
              //     }
              //   );
              //
              //   logger.info({
              //     req_id: req.id,
              //     user_id: userId,
              //     total_ms: totalMs,
              //     ttft_ms: ttftMs,
              //     openai_ms: openAIMs,
              //     tokens_in: usageCalc.tokens_in,
              //     tokens_out: usageCalc.tokens_out,
              //     cost_usd: usageCalc.cost_usd,
              //     has_provider_usage: false
              //   }, 'Chat completion finished (fallback usage)');
              // }
              //
              // // Store conversation in Zep if successful and session exists
              // if (reason === 'stop' && sessionId && outputText) {
              //   try {
              //     const stored = await zepAdapter.storeConversationTurn(
              //       userId,
              //       sessionId,
              //       message,
              //       outputText,
              //       {
              //         model,
              //         tokensIn: hasProviderUsage ? undefined : usageCalc?.tokens_in,
              //         tokensOut: hasProviderUsage ? undefined : usageCalc?.tokens_out,
              //         costUsd: hasProviderUsage ? undefined : usageCalc?.cost_usd
              //       }
              //     );
              //
              //     if (stored) {
              //       logger.info({
              //         req_id: req.id,
              //         user_id: userId,
              //         session_id: sessionId
              //       }, 'Conversation stored in Zep');
              //     }
              //   } catch (error) {
              //     // Don't fail the request if Zep storage fails
              //     logger.error({
              //       req_id: req.id,
              //       error: error instanceof Error ? error.message : String(error)
              //     }, 'Failed to store conversation in Zep');
              //   }
              // }


              stream.sendEvent(ChatEventType.DONE, { finish_reason: reason });
              stream.close();
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
              stream.sendEvent(ChatEventType.TOKEN, { text: errorCode + ": " + userMessage });

              stream.sendEvent(ChatEventType.DONE, { finish_reason: 'error' });
              stream.close();
            }
          }
        });


        // Step 5: Handle telemetry and memory AFTER streaming (non-blocking)
        // This happens after the response is sent to the client
        // setImmediate(async () => {
        //   try {
        //
        //     // Log telemetry
        //     await telemetryService.logMessageSent(userId, sessionId || '', totalMs, message.length);
        //
        //     if (usageCalc) {
        //       await telemetryService.logOpenAICall(userId, sessionId || '', {
        //         model,
        //         tokens_in: usageCalc.tokens_in,
        //         tokens_out: usageCalc.tokens_out,
        //         cost_usd: usageCalc.cost_usd,
        //         ttft_ms: ttftMs,
        //         openai_ms: metrics?.openAiMs,
        //         has_provider_usage: hasProviderUsage
        //       });
        //     }
        //
        //     // Store conversation in Zep if we have a session
        //     if (sessionId && outputText) {
        //       await zepAdapter.storeConversationTurn(
        //         userId,
        //         sessionId,
        //         message,
        //         outputText
        //       );
        //     }
        //
        //     logger.info({
        //       req_id: reqId,
        //       userId,
        //       sessionId,
        //       total_ms: totalMs,
        //       ttft_ms: ttftMs
        //     }, 'Fast chat: Background tasks completed');
        //   } catch (error: any) {
        //     logger.error({
        //       req_id: reqId,
        //       error: error.message,
        //       stack: error.stack
        //     }, 'Fast chat: Background task error');
        //   }
        // });

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
