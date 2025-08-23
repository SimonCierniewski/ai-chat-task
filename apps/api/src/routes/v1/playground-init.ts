import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../utils/logger';
import { getSupabaseAdmin } from '../../services/supabase-admin';
import { v4 as uuidv4 } from 'uuid';

interface PlaygroundInitRequest {
  experimentTitle: string;
  userName?: string;
}

interface PlaygroundInitResponse {
  success: boolean;
  user: {
    id: string;
    experimentTitle: string;
    userName?: string;
  };
}

const playgroundInitRequestSchema = {
  type: 'object',
  required: ['experimentTitle'],
  properties: {
    experimentTitle: {
      type: 'string',
      minLength: 1,
      maxLength: 200
    },
    userName: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      nullable: true
    }
  },
  additionalProperties: false
};

export const playgroundInitRoute: FastifyPluginAsync = async (server) => {
  server.post<{
    Body: PlaygroundInitRequest;
    Reply: PlaygroundInitResponse;
  }>(
    '/playground/init',
    {
      schema: {
        body: playgroundInitRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  experimentTitle: { type: 'string' },
                  userName: { type: 'string', nullable: true }
                }
              }
            }
          }
        }
      },
    },
    async (req, reply) => {
      const { experimentTitle, userName } = req.body;
      const adminId = req.user!.id;
      const reqId = req.id;

      logger.info({
        req_id: reqId,
        adminId,
        experimentTitle,
        userName
      }, 'Playground user initialization request');

      try {
        // Generate new user ID
        const newUserId = uuidv4();

        // Create user in memory_context table
        const supabaseAdmin = getSupabaseAdmin();
        const { error: memoryError } = await supabaseAdmin
          .from('memory_context')
          .insert({
            user_id: newUserId,
            owner_id: adminId,
            user_name: userName?.trim() || null,
            experiment_title: experimentTitle.trim(),
            context_block: '',
            metadata: {}
          });

        if (memoryError) {
          logger.error({
            req_id: reqId,
            adminId,
            newUserId,
            error: memoryError.message
          }, 'Failed to create user in memory_context');
          
          return reply.status(500).send({
            success: false,
            user: {
              id: '',
              experimentTitle: '',
              userName: undefined
            }
          });
        }

        logger.info({
          req_id: reqId,
          adminId,
          newUserId,
          experimentTitle,
          userName
        }, 'Playground user created successfully');

        return reply.send({
          success: true,
          user: {
            id: newUserId,
            experimentTitle: experimentTitle.trim(),
            userName: userName?.trim()
          }
        });
      } catch (error: any) {
        logger.error({
          req_id: reqId,
          adminId,
          error: error.message,
          stack: error.stack
        }, 'Playground user initialization failed');

        return reply.status(500).send({
          success: false,
          user: {
            id: '',
            experimentTitle: '',
            userName: undefined
          }
        });
      }
    }
  );
};