import { FastifyPluginAsync } from 'fastify';
import { FastifyRequest, FastifyReply } from 'fastify';

interface MetricsQuery {
  Querystring: {
    from?: string;
    to?: string;
    userId?: string;
  };
}

interface PricingUpdate {
  Body: {
    model: string;
    input_per_mtok: number;
    output_per_mtok: number;
    cached_input_per_mtok?: number;
  };
}

export const adminRoutes: FastifyPluginAsync = async (server) => {
  server.get('/users', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  role: { type: 'string' },
                  created_at: { type: 'string' },
                },
              },
            },
            total: { type: 'number' },
          },
        },
      },
    },
  }, async (request, reply) => {
    request.log.info({
      req_id: request.id,
      adminId: request.user?.id,
    }, 'Admin users list requested');
    
    return {
      users: [
        {
          id: 'test-user-id',
          email: 'user@example.com',
          role: 'user',
          created_at: new Date().toISOString(),
        },
        {
          id: 'test-admin-id',
          email: 'admin@example.com',
          role: 'admin',
          created_at: new Date().toISOString(),
        },
      ],
      total: 2,
    };
  });
  
  server.get<MetricsQuery>('/metrics', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date' },
          to: { type: 'string', format: 'date' },
          userId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            metrics: {
              type: 'object',
              properties: {
                totalMessages: { type: 'number' },
                totalUsers: { type: 'number' },
                avgResponseTime: { type: 'number' },
                avgTTFT: { type: 'number' },
                totalCost: { type: 'number' },
              },
            },
            period: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { from, to, userId } = request.query;
    
    request.log.info({
      req_id: request.id,
      adminId: request.user?.id,
      from,
      to,
      userId,
    }, 'Admin metrics requested');
    
    return {
      metrics: {
        totalMessages: 0,
        totalUsers: 2,
        avgResponseTime: 0,
        avgTTFT: 0,
        totalCost: 0,
      },
      period: {
        from: from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: to || new Date().toISOString(),
      },
    };
  });
  
  server.post<PricingUpdate>('/models/pricing', {
    schema: {
      body: {
        type: 'object',
        required: ['model', 'input_per_mtok', 'output_per_mtok'],
        properties: {
          model: { type: 'string' },
          input_per_mtok: { type: 'number', minimum: 0 },
          output_per_mtok: { type: 'number', minimum: 0 },
          cached_input_per_mtok: { type: 'number', minimum: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            model: { type: 'string' },
            pricing: {
              type: 'object',
              properties: {
                input_per_mtok: { type: 'number' },
                output_per_mtok: { type: 'number' },
                cached_input_per_mtok: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { model, input_per_mtok, output_per_mtok, cached_input_per_mtok } = request.body;
    
    request.log.info({
      req_id: request.id,
      adminId: request.user?.id,
      model,
      pricing: { input_per_mtok, output_per_mtok, cached_input_per_mtok },
    }, 'Admin pricing update requested');
    
    return {
      success: true,
      model,
      pricing: {
        input_per_mtok,
        output_per_mtok,
        cached_input_per_mtok: cached_input_per_mtok || input_per_mtok * 0.5,
      },
    };
  });
};