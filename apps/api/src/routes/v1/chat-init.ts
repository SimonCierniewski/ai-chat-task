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
      type: 'string',
      pattern: '^session-[0-9]{8}-[0-9]{6}-[A-Za-z0-9]{4}$'
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
      const userId = req.user!.id;
      const reqId = req.id;

      logger.info({
        req_id: reqId,
        userId,
        sessionId
      }, 'Chat initialization request');

      try {
        // Load user name from DB if available
        let userName: string | undefined;
        try {
          const supabaseAdmin = getSupabaseAdmin();
          const {data: context} = await supabaseAdmin
            .from('memory_context')
            .select('user_name')
            .eq('user_id', userId)
            .single();
          
          if (context?.user_name) {
            userName = context.user_name;
          }
        } catch (error) {
          logger.debug({
            req_id: reqId,
            userId,
            error
          }, 'Could not load user name from DB');
        }
        
        // Check/create user in Zep
        const userExists = await zepAdapter.ensureUser(userId, req.user!.email, userName);
        
        // Check/create thread in Zep
        const threadExists = await zepAdapter.ensureThread(userId, sessionId);

        logger.info({
          req_id: reqId,
          userId,
          sessionId,
          userExists,
          threadExists
        }, 'Chat initialization completed');

        return reply.send({
          success: true,
          userId,
          sessionId,
          threadExists,
          userExists
        });
      } catch (error: any) {
        logger.error({
          req_id: reqId,
          userId,
          sessionId,
          error: error.message,
          stack: error.stack
        }, 'Chat initialization failed');

        // Don't fail the request, just return the state
        return reply.send({
          success: false,
          userId,
          sessionId,
          threadExists: false,
          userExists: false
        });
      }
    }
  );
};