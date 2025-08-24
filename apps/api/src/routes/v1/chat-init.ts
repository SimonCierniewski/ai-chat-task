import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../utils/logger';
import { zepAdapter } from './memory';
import { getSupabaseAdmin } from '../../services/supabase-admin';

interface InitRequest {
  sessionId: string;
}

interface InitResponse {
  success: boolean;
  userId: string;
  sessionId: string;
  threadExists: boolean;
  userExists: boolean;
}

const initRequestSchema = {
  type: 'object',
  required: ['sessionId'],
  properties: {
    sessionId: {
      type: 'string'
    }
  },
  additionalProperties: false
};

export const chatInitRoute: FastifyPluginAsync = async (server) => {
  server.post<{
    Body: InitRequest;
    Reply: InitResponse;
  }>(
    '/init',
    {
      schema: {
        body: initRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              userId: { type: 'string' },
              sessionId: { type: 'string' },
              threadExists: { type: 'boolean' },
              userExists: { type: 'boolean' }
            }
          }
        }
      },
    },
    async (req, reply) => {
      const { sessionId } = req.body;
      const authenticatedUserId = req.user!.id;
      const reqId = req.id;
      
      // For Playground users, the sessionId IS the user ID
      // For regular users, use the authenticated user's ID
      let zepUserId = sessionId; // Default to sessionId (Playground case)
      let userEmail = req.user!.email;
      let userName: string | undefined;
      
      // Check if this is a Playground user by looking up memory_context
      const supabaseAdmin = getSupabaseAdmin();
      try {
        // First, try to find by sessionId (which is the playground user ID)
        const {data: memoryContext} = await supabaseAdmin
          .from('memory_context')
          .select('user_id, user_name, experiment_title')
          .eq('user_id', sessionId)
          .single();
          
        if (memoryContext) {
          // This is a Playground user
          zepUserId = sessionId; // Use the playground user's ID for Zep
          userName = memoryContext.user_name || memoryContext.experiment_title;
          userEmail = `${sessionId}@playground.local`; // Create a fake email for Zep
          
          logger.info({
            req_id: reqId,
            playgroundUserId: zepUserId,
            userName,
            sessionId
          }, 'Initializing Playground user in Zep');
        } else {
          // Not a playground user, try regular user lookup
          const {data: regularContext} = await supabaseAdmin
            .from('memory_context')
            .select('user_name')
            .eq('user_id', authenticatedUserId)
            .single();
            
          if (regularContext?.user_name) {
            userName = regularContext.user_name;
          }
          zepUserId = authenticatedUserId; // Use authenticated user's ID
        }
      } catch (error) {
        logger.debug({
          req_id: reqId,
          sessionId,
          error
        }, 'Could not load user context from DB');
        // Fall back to authenticated user ID
        zepUserId = authenticatedUserId;
      }

      logger.info({
        req_id: reqId,
        authenticatedUserId,
        zepUserId,
        sessionId,
        userName
      }, 'Chat initialization request');

      try {
        // Check/create user in Zep with the correct user ID
        logger.info({
          req_id: reqId,
          zepUserId,
          userEmail,
          userName
        }, 'About to ensure Zep user');
        
        const userExists = await zepAdapter.ensureUser(zepUserId, userEmail, userName);
        
        logger.info({
          req_id: reqId,
          zepUserId,
          userExists
        }, 'Zep user ensure result');
        
        // Check/create thread in Zep
        logger.info({
          req_id: reqId,
          zepUserId,
          sessionId
        }, 'About to ensure Zep thread');
        
        const threadExists = await zepAdapter.ensureThread(zepUserId, sessionId);
        
        logger.info({
          req_id: reqId,
          zepUserId,
          sessionId,
          threadExists
        }, 'Zep thread ensure result');

        logger.info({
          req_id: reqId,
          zepUserId,
          sessionId,
          userExists,
          threadExists
        }, 'Chat initialization completed');

        return reply.send({
          success: true,
          userId: zepUserId,
          sessionId,
          threadExists,
          userExists
        });
      } catch (error: any) {
        logger.error({
          req_id: reqId,
          zepUserId,
          sessionId,
          error: error.message,
          stack: error.stack
        }, 'Chat initialization failed');

        // Don't fail the request, just return the state
        return reply.send({
          success: false,
          userId: zepUserId,
          sessionId,
          threadExists: false,
          userExists: false
        });
      }
    }
  );
};