import {FastifyPluginAsync} from 'fastify';
import {logger} from '../../utils/logger';
import {getSupabaseAdmin} from '../../services/supabase-admin';
import {ZepClient} from '@getzep/zep-cloud';

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
      minLength: 1
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
              success: {type: 'boolean'},
              user: {
                type: 'object',
                properties: {
                  id: {type: 'string'},
                  experimentTitle: {type: 'string'},
                  userName: {type: 'string', nullable: true}
                }
              }
            }
          }
        }
      },
    },
    async (req, reply) => {
      const {userId, experimentTitle, userName} = req.body;
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
        
        // First, get the current user data to check existing userName
        const {data: existingUser, error: fetchError} = await supabaseAdmin
          .from('memory_context')
          .select('user_id, experiment_title, user_name')
          .eq('user_id', userId)
          .eq('owner_id', adminId)
          .single();
          
        if (fetchError || !existingUser) {
          logger.error({
            req_id: reqId,
            adminId,
            userId,
            error: fetchError?.message
          }, 'Failed to fetch existing user data');
          
          return reply.status(404).send({
            success: false,
            user: {
              id: userId,
              experimentTitle: '',
              userName: undefined
            }
          });
        }
        
        // Check if trying to remove an existing userName
        if (userName !== undefined && 
            existingUser.user_name && 
            existingUser.user_name.trim() !== '' && 
            (!userName || userName.trim() === '')) {
          logger.warn({
            req_id: reqId,
            userId,
            existingUserName: existingUser.user_name,
            attemptedUserName: userName
          }, 'Attempted to remove existing user name');
          
          return reply.status(400).send({
            success: false,
            error: 'Cannot remove user name once it has been set',
            user: {
              id: userId,
              experimentTitle: existingUser.experiment_title,
              userName: existingUser.user_name
            }
          });
        }

        // Build update object
        const updateData: any = {};
        if (experimentTitle !== undefined) {
          updateData.experiment_title = experimentTitle.trim();
        }
        if (userName !== undefined) {
          // Only update if not trying to remove existing name
          const newUserName = userName.trim() || null;
          if (existingUser.user_name && !newUserName) {
            // Skip updating userName if it would remove existing one
            logger.info({
              req_id: reqId,
              userId
            }, 'Skipping userName update to preserve existing value');
          } else {
            updateData.user_name = newUserName;
          }
        }

        // Update user in memory_context table
        // Use user_id to identify the user
        const {data, error: updateError} = await supabaseAdmin
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

        // Update user in Zep if userName or experimentTitle changed
        if (userName !== undefined || experimentTitle !== undefined) {
          try {
            const zepApiKey = process.env.ZEP_API_KEY;
            if (!zepApiKey) {
              logger.warn({
                req_id: reqId,
                userId
              }, 'ZEP_API_KEY not configured, skipping Zep update');
            } else {
              const zepClient = new ZepClient({apiKey: zepApiKey});

              // Build Zep update data
              const zepUpdateData: any = {};

              // Update firstName in Zep (use userName or experimentTitle)
              zepUpdateData.firstName = userName?.trim() || '';
              
              // Update metadata to track the source
              zepUpdateData.metadata = {
                updated_at: new Date().toISOString(),
                experiment_title: data.experiment_title,
                user_name: data.user_name || null,
                source: 'playground_update'
              };

              logger.info({
                req_id: reqId,
                userId,
                zepUpdateData
              }, 'Updating Zep user');

              await zepClient.user.update(userId, zepUpdateData);

              logger.info({
                req_id: reqId,
                userId
              }, 'Zep user updated successfully');
            }
          } catch (zepError: any) {
            // Log error but don't fail the request
            logger.error({
              req_id: reqId,
              userId,
              error: zepError.message,
              stack: zepError.stack
            }, 'Failed to update Zep user, but continuing anyway');
          }
        }

        logger.info({
          req_id: reqId,
          adminId,
          playgroundUserId: data.user_id,
          data
        }, 'Playground user update completed');

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
