import { FastifyPluginAsync } from 'fastify';
import { getUptime } from '../server';
import { readFileSync } from 'fs';
import { join } from 'path';

const getVersion = () => {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(__dirname, '../../package.json'), 'utf-8')
    );
    return packageJson.version || '0.0.1';
  } catch {
    return '0.0.1';
  }
};

export const healthRoutes: FastifyPluginAsync = async (server) => {
  server.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            version: { type: 'string' },
            uptime_s: { type: 'number' },
            timestamp: { type: 'string' },
            environment: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    request.log.info({ req_id: request.id }, 'Health check requested');
    
    return {
      ok: true,
      version: getVersion(),
      uptime_s: getUptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    };
  });
  
  server.get('/ready', {
    schema: {
      description: 'Readiness check endpoint',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            services: {
              type: 'object',
              properties: {
                database: { type: 'boolean' },
                auth: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const services = {
      database: !!process.env.SUPABASE_URL,
      auth: !!process.env.SUPABASE_JWT_SECRET || !!process.env.JWKS_URI,
    };
    
    const ready = Object.values(services).every(status => status);
    
    if (!ready) {
      reply.code(503);
    }
    
    return {
      ready,
      services,
    };
  });
};