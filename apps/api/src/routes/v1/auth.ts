import { FastifyPluginAsync } from 'fastify';
import { FastifyRequest, FastifyReply } from 'fastify';
import { profilesClient } from '../../db/profiles';
import { createError } from '../../utils/error-handler';

interface OnSignupBody {
  user_id?: string;
  email?: string;
  record?: {
    id?: string;
    email?: string;
  };
}

export const authRoutes: FastifyPluginAsync = async (server) => {
  server.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return {
        authenticated: false,
        message: 'No valid token provided',
      };
    }
    
    const dbProfile = await profilesClient.getProfile(request.user.id);
    
    return {
      authenticated: true,
      userId: request.user.id,
      role: request.user.role,
      email: request.user.email,
      profile: dbProfile ? {
        role: dbProfile.role,
        created_at: dbProfile.created_at,
        updated_at: dbProfile.updated_at,
      } : null,
    };
  });
  
  server.post<{ Body: OnSignupBody }>('/on-signup', {
    schema: {
      body: {
        type: 'object',
        properties: {
          user_id: { type: 'string' },
          email: { type: 'string' },
          record: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            profile_created: { type: 'boolean' },
            zep_initialized: { type: 'boolean' },
            user_id: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { user_id, email, record } = request.body;
    
    const userId = user_id || record?.id;
    const userEmail = email || record?.email;
    
    if (!userId) {
      throw createError('Missing user_id in webhook payload', 400);
    }
    
    request.log.info({
      req_id: request.id,
      userId,
      email: userEmail,
    }, 'Processing on-signup webhook');
    
    let profileCreated = false;
    let zepInitialized = false;
    
    try {
      const existingProfile = await profilesClient.getProfile(userId);
      
      if (!existingProfile) {
        await profilesClient.createProfile(userId, userEmail || '');
        profileCreated = true;
        
        request.log.info({
          req_id: request.id,
          userId,
        }, 'Created profile for new user');
      }
      
      try {
        const { zepClient } = await import('../../services/zep');
        await zepClient.initializeUser(userId);
        zepInitialized = true;
        
        request.log.info({
          req_id: request.id,
          userId,
        }, 'Initialized Zep collection for user');
      } catch (zepError) {
        request.log.warn({
          req_id: request.id,
          userId,
          error: zepError,
        }, 'Failed to initialize Zep (non-critical)');
      }
    } catch (error) {
      request.log.error({
        req_id: request.id,
        userId,
        error,
      }, 'Error in on-signup webhook');
      
      throw createError('Failed to process signup', 500);
    }
    
    return {
      success: true,
      profile_created: profileCreated,
      zep_initialized: zepInitialized,
      user_id: userId,
    };
  });
};