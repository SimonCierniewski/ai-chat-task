import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../utils/logger';
import { getSupabaseAdmin } from '../../services/supabase-admin';

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
        // Create user in memory_context table
        const supabaseAdmin = getSupabaseAdmin();
        const { data, error: memoryError } = await supabaseAdmin
          .from('memory_context')
          .insert({
            // Don't set user_id for playground users
            owner_id: adminId,
            user_name: userName?.trim() || null,
            experiment_title: experimentTitle.trim(),
            context_block: '',
            metadata: {}
          })
          .select('id, experiment_title, user_name')
          .single();

        if (memoryError || !data) {
          logger.error({
            req_id: reqId,
            adminId,
            error: memoryError?.message || 'No data returned'
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
          playgroundUserId: data.id,
          experimentTitle,
          userName
        }, 'Playground user created successfully');

        return reply.send({
          success: true,
          user: {
            id: data.id,
            experimentTitle: data.experiment_title,
            userName: data.user_name
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