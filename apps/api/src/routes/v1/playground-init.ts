import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../utils/logger';
import { getSupabaseAdmin } from '../../services/supabase-admin';
import { zepAdapter } from './memory';

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
        // Generate a simple user ID for the playground user
        const playgroundUserId = `playground_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        // Create user in memory_context table
        const supabaseAdmin = getSupabaseAdmin();
        const { data, error: memoryError } = await supabaseAdmin
          .from('memory_context')
          .insert({
            user_id: playgroundUserId, // Simple text ID, not a foreign key
            owner_id: adminId,
            user_name: userName?.trim() || null,
            experiment_title: experimentTitle.trim(),
            context_block: '',
            metadata: {}
          })
          .select('id, user_id, experiment_title, user_name')
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

        // Create user in Zep
        try {
          const zepEmail = `${playgroundUserId}@playground.local`;
          const zepUserName = userName?.trim();
          
          logger.info({
            req_id: reqId,
            playgroundUserId,
            zepEmail,
            zepUserName
          }, 'Creating Zep user for playground user');
          
          const zepUserCreated = await zepAdapter.ensureUser(
            playgroundUserId,
            zepEmail,
            zepUserName
          );
          
          if (!zepUserCreated) {
            logger.warn({
              req_id: reqId,
              playgroundUserId
            }, 'Failed to create Zep user, but continuing anyway');
          } else {
            logger.info({
              req_id: reqId,
              playgroundUserId
            }, 'Zep user created successfully');
            
            // Create initial thread for the user
            // In playground, the user ID is used as the session/thread ID
            try {
              logger.info({
                req_id: reqId,
                playgroundUserId,
                threadId: playgroundUserId
              }, 'Creating initial Zep thread for playground user');
              
              const threadCreated = await zepAdapter.ensureThread(
                playgroundUserId,  // userId
                playgroundUserId   // threadId (same as userId for playground)
              );
              
              if (threadCreated) {
                logger.info({
                  req_id: reqId,
                  playgroundUserId,
                  threadId: playgroundUserId
                }, 'Zep thread created successfully');
              } else {
                logger.warn({
                  req_id: reqId,
                  playgroundUserId
                }, 'Failed to create Zep thread, but continuing anyway');
              }
            } catch (threadError: any) {
              logger.error({
                req_id: reqId,
                playgroundUserId,
                error: threadError.message
              }, 'Error creating Zep thread, but continuing anyway');
            }
          }
        } catch (zepError: any) {
          logger.error({
            req_id: reqId,
            playgroundUserId,
            error: zepError.message
          }, 'Error creating Zep user, but continuing anyway');
        }

        logger.info({
          req_id: reqId,
          adminId,
          playgroundUserId: data.user_id,
          experimentTitle,
          userName
        }, 'Playground user initialization completed');

        return reply.send({
          success: true,
          user: {
            id: data.user_id, // Return user_id as the identifier
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
