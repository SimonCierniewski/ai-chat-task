/**
 * Fast Chat Route - Optimized for minimal TTFT
 * 
 * This endpoint prioritizes speed:
 * 1. Gets context block from Zep (no processing)
 * 2. Starts OpenAI streaming immediately
 * 3. Handles telemetry and memory storage AFTER streaming starts
 */

import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { ChatRequest, ChatEventType, chatRequestSchema } from '@prototype/shared';
import { logger } from '../../utils/logger';
import { openAIProvider } from '../../providers/openai-provider';
import { usageService } from '../../services/usage-service';
import { telemetryService } from '../../services/telemetry-service';
import { modelRegistry } from '../../services/model-registry';
import { zepAdapter } from './memory';
import { config } from '../../config';

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
      const { message, useMemory = false, sessionId, model: requestedModel, systemPrompt } = req.body;
      const userId = req.user!.id;
      const reqId = req.id;

      // Initialize SSE stream
      const stream = new SSEStream(reply);
      stream.initialize();

      try {
        // Step 1: Validate model (fast lookup)
        const model = modelRegistry.validateModel(requestedModel || 'gpt-4o-mini');

        // Step 2: Get context block if memory is enabled (simple, no processing)
        let contextBlock: string | null = null;
        if (useMemory && sessionId) {
          contextBlock = await zepAdapter.getContextBlock(userId, sessionId);
        }

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
        logger.info('Fast chat: Starting OpenAI stream', {
          req_id: reqId,
          userId,
          model,
          hasContext: !!contextBlock,
          prepTime: openAIStartTime - startTime
        });

        // Start streaming with minimal setup
        const metrics = await openAIProvider.streamCompletion({
          message,
          model,
          messages,
          signal: stream.getAbortSignal(),
          onFirstToken: () => {
            ttftMs = Date.now() - openAIStartTime;
            logger.info('Fast chat: First token', {
              req_id: reqId,
              ttft_ms: ttftMs
            });
          },
          onToken: (text: string) => {
            if (!stream.isClosed()) {
              outputText += text;
              stream.sendEvent(ChatEventType.TOKEN, { text });
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
          }
        });

        // Send done event
        stream.sendEvent(ChatEventType.DONE, { 
          finish_reason: metrics?.finishReason || 'stop' 
        });

        // Close the stream
        stream.close();

        // Step 5: Handle telemetry and memory AFTER streaming (non-blocking)
        // This happens after the response is sent to the client
        setImmediate(async () => {
          try {
            const totalMs = Date.now() - startTime;

            // Log telemetry
            await telemetryService.logMessageSent(userId, sessionId || '', totalMs, message.length);
            
            if (usageCalc) {
              await telemetryService.logOpenAICall(userId, sessionId || '', {
                model,
                tokens_in: usageCalc.tokens_in,
                tokens_out: usageCalc.tokens_out,
                cost_usd: usageCalc.cost_usd,
                ttft_ms: ttftMs,
                openai_ms: metrics?.openAiMs,
                has_provider_usage: hasProviderUsage
              });
            }

            // Store conversation in Zep if we have a session
            if (sessionId && outputText) {
              await zepAdapter.storeConversationTurn(
                userId,
                sessionId,
                message,
                outputText
              );
            }

            logger.info('Fast chat: Background tasks completed', {
              req_id: reqId,
              userId,
              sessionId,
              total_ms: totalMs,
              ttft_ms: ttftMs
            });
          } catch (error: any) {
            logger.error('Fast chat: Background task error', {
              req_id: reqId,
              error: error.message,
              stack: error.stack
            });
          }
        });

      } catch (error: any) {
        logger.error('Fast chat error', {
          req_id: reqId,
          error: error.message,
          stack: error.stack
        });

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