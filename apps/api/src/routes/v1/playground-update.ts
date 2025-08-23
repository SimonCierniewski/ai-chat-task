import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../utils/logger';
import { getSupabaseAdmin } from '../../services/supabase-admin';

interface PlaygroundUpdateRequest {
  userId: string;
  experimentTitle?: string;
  userName?: string;
}

interface PlaygroundUpdateResponse {
  success: boolean;
  user: {
    id: string;
    experimentTitle: string;
    userName?: string;
  };
}

const playgroundUpdateRequestSchema = {
  type: 'object',
  required: ['userId'],
  properties: {
    userId: {
      type: 'string',
      format: 'uuid'
    },
    experimentTitle: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      nullable: true
    },
    userName: {
      type: 'string',
      minLength: 0,
      maxLength: 100,
      nullable: true
    }
  },
  additionalProperties: false
};

export const playgroundUpdateRoute: FastifyPluginAsync = async (server) => {
  server.post<{
    Body: PlaygroundUpdateRequest;
    Reply: PlaygroundUpdateResponse;
  }>(
    '/playground/update',
    {
      schema: {
        body: playgroundUpdateRequestSchema,
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
      const { userId, experimentTitle, userName } = req.body;
      const adminId = req.user!.id;
      const reqId = req.id;

      logger.info({
        req_id: reqId,
        adminId,
        userId,
        experimentTitle,
        userName
      }, 'Playground user update request');

      try {
        const supabaseAdmin = getSupabaseAdmin();
        
        // Build update object
        const updateData: any = {};
        if (experimentTitle !== undefined) {
          updateData.experiment_title = experimentTitle.trim();
        }
        if (userName !== undefined) {
          updateData.user_name = userName.trim() || null;
        }

        // Update user in memory_context table
        // Use user_id to identify the user
        const { data, error: updateError } = await supabaseAdmin
          .from('memory_context')
          .update(updateData)
          .eq('user_id', userId)
          .eq('owner_id', adminId)
          .select('user_id, experiment_title, user_name')
          .single();

        if (updateError || !data) {
          logger.error({
            req_id: reqId,
            adminId,
            userId,
            error: updateError?.message
          }, 'Failed to update user in memory_context');
          
          return reply.status(500).send({
            success: false,
            user: {
              id: userId,
              experimentTitle: '',
              userName: undefined
            }
          });
        }

        logger.info({
          req_id: reqId,
          adminId,
          playgroundUserId: data.user_id,
          data
        }, 'Playground user updated successfully');

        return reply.send({
          success: true,
          user: {
            id: data.user_id, // Use user_id as the identifier
            experimentTitle: data.experiment_title,
            userName: data.user_name
          }
        });
      } catch (error: any) {
        logger.error({
          req_id: reqId,
          adminId,
          userId,
          error: error.message,
          stack: error.stack
        }, 'Playground user update failed');

        return reply.status(500).send({
          success: false,
          user: {
            id: userId,
            experimentTitle: '',
            userName: undefined
          }
        });
      }
    }
  );
};