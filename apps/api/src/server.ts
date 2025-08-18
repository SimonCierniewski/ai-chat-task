import Fastify from 'fastify';
import { FastifyRequest, FastifyReply } from 'fastify';
import authPlugin from './plugins/auth';
import { requireAdmin, requireAuth } from './utils/guards';

/**
 * Build Fastify server instance
 */
export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register auth plugin
  await fastify.register(authPlugin, {
    // Options can be overridden via environment variables
    jwksUri: process.env.JWKS_URI,
    audience: process.env.SUPABASE_JWT_AUD,
    issuer: process.env.JWT_ISSUER,
  });

  // Health check endpoint (no auth required)
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Root endpoint (no auth required)
  fastify.get('/', async (request, reply) => {
    return {
      name: 'AI Chat Task API',
      version: '0.0.1',
      docs: '/docs',
    };
  });

  // Protected endpoint - requires authentication
  fastify.get(
    '/api/me',
    { preHandler: requireAuth },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return {
        user: request.user,
      };
    }
  );

  // Admin-only endpoint
  fastify.get(
    '/api/admin/users',
    { preHandler: requireAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // TODO: Implement actual user listing from database
      return {
        users: [
          { id: 'test-user-id', email: 'user@example.com', role: 'user' },
          { id: 'test-admin-id', email: 'admin@example.com', role: 'admin' },
        ],
        total: 2,
      };
    }
  );

  // Test endpoint to check auth status
  fastify.get('/api/auth/status', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return {
        authenticated: false,
        message: 'No valid token provided',
      };
    }

    return {
      authenticated: true,
      userId: request.user.id,
      role: request.user.role,
      email: request.user.email,
    };
  });

  // Example admin metrics endpoint
  fastify.get(
    '/api/admin/metrics',
    { preHandler: requireAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // TODO: Implement actual metrics from telemetry
      return {
        metrics: {
          totalUsers: 2,
          totalMessages: 0,
          avgResponseTime: 0,
        },
        timestamp: new Date().toISOString(),
      };
    }
  );

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);

    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production') {
      reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    } else {
      reply.status(error.statusCode || 500).send({
        error: error.name,
        message: error.message,
        stack: error.stack,
      });
    }
  });

  return fastify;
}

/**
 * Start the server
 */
export async function startServer() {
  const server = await buildServer();
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await server.listen({ port, host });
    console.log(`🚀 Server listening at http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  return server;
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}