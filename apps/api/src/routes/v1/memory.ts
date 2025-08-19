import { FastifyPluginAsync } from 'fastify';
import { FastifyRequest, FastifyReply } from 'fastify';

interface SearchQuery {
  Querystring: {
    q?: string;
    limit?: number;
  };
}

interface UpsertBody {
  Body: {
    facts: Array<{
      content: string;
      type?: string;
      metadata?: Record<string, any>;
    }>;
  };
}

export const memoryRoutes: FastifyPluginAsync = async (server) => {
  server.get<SearchQuery>('/search', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  content: { type: 'string' },
                  score: { type: 'number' },
                  metadata: { type: 'object' },
                },
              },
            },
            query: { type: 'string' },
            count: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { q, limit = 10 } = request.query;
    
    request.log.info({
      req_id: request.id,
      userId: request.user?.id,
      query: q,
      limit,
    }, 'Memory search request');
    
    return {
      results: [],
      query: q || '',
      count: 0,
    };
  });
  
  server.post<UpsertBody>('/upsert', {
    schema: {
      body: {
        type: 'object',
        required: ['facts'],
        properties: {
          facts: {
            type: 'array',
            items: {
              type: 'object',
              required: ['content'],
              properties: {
                content: { type: 'string', minLength: 1, maxLength: 500 },
                type: { type: 'string' },
                metadata: { type: 'object' },
              },
            },
            minItems: 1,
            maxItems: 100,
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            upserted: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { facts } = request.body;
    
    request.log.info({
      req_id: request.id,
      userId: request.user?.id,
      factCount: facts.length,
    }, 'Memory upsert request');
    
    return {
      success: true,
      upserted: facts.length,
    };
  });
};