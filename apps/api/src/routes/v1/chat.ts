import { FastifyPluginAsync } from 'fastify';
import { FastifyRequest, FastifyReply } from 'fastify';
import { createError } from '../../utils/error-handler';

interface ChatRequest {
  Body: {
    message: string;
    useMemory?: boolean;
    sessionId?: string;
    model?: string;
  };
}

export const chatRoutes: FastifyPluginAsync = async (server) => {
  server.post<ChatRequest>('/', {
    schema: {
      body: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', minLength: 1, maxLength: 4000 },
          useMemory: { type: 'boolean', default: false },
          sessionId: { type: 'string' },
          model: { type: 'string', enum: ['gpt-4-mini', 'gpt-4', 'gpt-3.5-turbo'] },
        },
      },
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
    
    reply.raw.write(`event: token\ndata: ${JSON.stringify({ text: "Chat endpoint coming soon!" })}\n\n`);
    
    reply.raw.write(`event: usage\ndata: ${JSON.stringify({
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      model: model || 'gpt-4-mini',
    })}\n\n`);
    
    reply.raw.write(`event: done\ndata: ${JSON.stringify({ finish_reason: 'stop' })}\n\n`);
    
    reply.raw.end();
  });
};