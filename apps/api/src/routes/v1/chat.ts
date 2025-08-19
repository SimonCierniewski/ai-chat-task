import { FastifyPluginAsync } from 'fastify';
import { FastifyRequest, FastifyReply } from 'fastify';
import { createError } from '../../utils/error-handler';
import {
  ChatRequest,
  chatRequestSchema,
  ChatEventType,
  formatSSEEvent,
  UsageEventData,
  DoneEventData
} from '@prototype/shared';

interface ChatRequestFastify {
  Body: ChatRequest;
}

export const chatRoutes: FastifyPluginAsync = async (server) => {
  server.post<ChatRequestFastify>('/', {
    schema: {
      body: chatRequestSchema,
      description: 'Stream chat response via Server-Sent Events',
      tags: ['Chat'],
    },
  }, async (request, reply) => {
    const { message, useMemory, sessionId, model } = request.body;
    
    request.log.info({
      req_id: request.id,
      userId: request.user?.id,
      useMemory,
      sessionId,
      model,
      messageLength: message.length,
    }, 'Chat request received');
    
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Request-Id': request.id,
    });
    
    // Send token events
    reply.raw.write(formatSSEEvent(ChatEventType.TOKEN, { text: "Chat endpoint coming soon!" }));
    
    // Send usage event
    const usage: UsageEventData = {
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      model: model || 'gpt-4-mini',
    };
    reply.raw.write(formatSSEEvent(ChatEventType.USAGE, usage));
    
    // Send done event
    const done: DoneEventData = { finish_reason: 'stop' };
    reply.raw.write(formatSSEEvent(ChatEventType.DONE, done));
    
    reply.raw.end();
  });
};