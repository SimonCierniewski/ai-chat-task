import { FastifyPluginAsync } from 'fastify';
import { authRoutes } from './auth';
import { chatRoutes } from './chat';
import { memoryRoutes } from './memory';
import { adminRoutes } from './admin';
import { requireAuth, requireAdmin } from '../../utils/guards';

export const v1Routes: FastifyPluginAsync = async (server) => {
  server.get('/', async (request, reply) => {
    return {
      version: 'v1',
      endpoints: {
        auth: {
          status: '/auth/status',
          onSignup: '/auth/on-signup',
        },
        chat: {
          stream: '/chat (POST)',
        },
        memory: {
          search: '/memory/search',
          upsert: '/memory/upsert',
        },
        admin: {
          users: '/admin/users',
          metrics: '/admin/metrics',
          pricing: '/admin/models/pricing',
        },
      },
    };
  });
  
  await server.register(authRoutes, { prefix: '/auth' });
  
  await server.register(async (protectedRoutes) => {
    protectedRoutes.addHook('preHandler', requireAuth);
    
    await protectedRoutes.register(chatRoutes, { prefix: '/chat' });
    await protectedRoutes.register(memoryRoutes, { prefix: '/memory' });
    
    protectedRoutes.get('/me', async (request, reply) => {
      return {
        user: request.user,
      };
    });
  });
  
  await server.register(async (adminOnlyRoutes) => {
    adminOnlyRoutes.addHook('preHandler', requireAdmin);
    await adminOnlyRoutes.register(adminRoutes, { prefix: '/admin' });
  });
};