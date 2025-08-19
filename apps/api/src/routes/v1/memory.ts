import { FastifyPluginAsync } from 'fastify';
import { FastifyRequest, FastifyReply } from 'fastify';
import {
  MemorySearchQuery,
  memorySearchQuerySchema,
  MemorySearchResponse,
  MemoryUpsertRequest,
  memoryUpsertRequestSchema,
  MemoryUpsertResponse
} from '@prototype/shared';

interface SearchQuery {
  Querystring: MemorySearchQuery;
}

interface UpsertBody {
  Body: MemoryUpsertRequest;
}

export const memoryRoutes: FastifyPluginAsync = async (server) => {
  server.get<SearchQuery>('/search', {
    schema: {
      querystring: memorySearchQuerySchema,
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
    
    const response: MemorySearchResponse = {
      results: [],
      query: q || '',
      count: 0,
      search_time_ms: 0
    };
    
    return response;
  });
  
  server.post<UpsertBody>('/upsert', {
    schema: {
      body: memoryUpsertRequestSchema,
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
    
    const response: MemoryUpsertResponse = {
      success: true,
      upserted: facts.length,
    };
    
    return response;
  });
};