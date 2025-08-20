import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import cors from '@fastify/cors';
import authPlugin from './plugins/auth';
import { config } from './config';
import { errorHandler } from './utils/error-handler';
import { healthRoutes } from './routes/health';
import { v1Routes } from './routes/v1';
import { readFileSync } from 'fs';
import { join } from 'path';

const startTime = Date.now();

const getVersion = () => {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
    );
    return packageJson.version || '0.0.1';
  } catch {
    return '0.0.1';
  }
};

export function getUptime(): number {
  return Math.floor((Date.now() - startTime) / 1000);
}

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
                messageFormat: '[{req_id}] {msg}',
              },
            }
          : undefined,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            path: request.routerPath,
            parameters: request.params,
            headers: request.headers,
          };
        },
        res(reply) {
          return {
            statusCode: reply.statusCode,
          };
        },
      },
    },
    requestIdLogLabel: 'req_id',
    genReqId: () => nanoid(12),
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
    ajv: {
      customOptions: {
        removeAdditional: true,
        useDefaults: true,
        coerceTypes: true,
        allErrors: true,
        strict: false,
      },
    },
  });

  server.decorateRequest('startTime', null);

  server.addHook('onRequest', async (request: FastifyRequest) => {
    (request as any).startTime = Date.now();
    request.log.info({
      req_id: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    }, 'Incoming request');
  });

  server.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const responseTime = Date.now() - (request as any).startTime;
    request.log.info({
      req_id: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime,
    }, 'Request completed');
  });

  await server.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        return cb(null, true);
      }

      const allowedOrigins = [
        process.env.APP_ORIGIN_ADMIN,
        process.env.APP_ORIGIN_ANDROID_DEV,
      ].filter(Boolean);

      if (allowedOrigins.length === 0) {
        server.log.warn({ origin }, 'CORS: No allowed origins configured, blocking request');
        cb(new Error('CORS not configured'), false);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        server.log.warn({ origin, allowedOrigins, req_id: (server as any).id }, 'CORS: Blocked origin');
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
  });

  server.setErrorHandler(errorHandler);

  server.setNotFoundHandler((request, reply) => {
    request.log.warn({
      req_id: request.id,
      method: request.method,
      url: request.url,
    }, 'Route not found');
    
    reply.code(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
      req_id: request.id,
    });
  });

  await server.register(authPlugin, {
    jwksUri: process.env.JWKS_URI,
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
    audience: process.env.SUPABASE_JWT_AUD,
    issuer: process.env.JWT_ISSUER,
  });

  await server.register(healthRoutes);

  await server.register(v1Routes, { prefix: '/api/v1' });
  
  // Add non-versioned /api/me endpoint for backward compatibility
  server.get('/api/me', {
    schema: {
      description: 'Get current user profile (non-versioned route)',
      tags: ['Auth'],
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                role: { type: 'string' },
                created_at: { type: 'string' },
                updated_at: { type: 'string' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            code: { type: 'string' },
            req_id: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Forward to versioned endpoint
    return server.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: request.headers,
    }).then(response => {
      reply.code(response.statusCode);
      return response.json();
    });
  });

  server.get('/', async (request, reply) => {
    return {
      name: 'AI Chat Task API',
      version: getVersion(),
      docs: '/docs',
    };
  });

  server.addHook('onClose', async () => {
    server.log.info('Server is shutting down');
  });

  return server;
}

export async function startServer(): Promise<FastifyInstance> {
  const server = await buildServer();
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';
  
  try {
    await server.listen({ port, host });
    
    server.log.info({
      address: `http://${host}:${port}`,
      environment: process.env.NODE_ENV || 'development',
      version: getVersion(),
      corsOrigins: {
        admin: process.env.APP_ORIGIN_ADMIN || 'not configured',
        androidDev: process.env.APP_ORIGIN_ANDROID_DEV || 'not configured',
      },
    }, 'Server started successfully');
    
    return server;
  } catch (err) {
    server.log.fatal(err, 'Failed to start server');
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}