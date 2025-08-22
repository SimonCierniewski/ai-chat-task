import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../utils/logger';
import { ZepClient } from '@getzep/zep-cloud';
import { config } from '../../config';

interface SessionsListResponse {
  sessions: Array<{
    id: string;
    createdAt: string;
    lastMessageAt?: string;
    messageCount: number;
    title?: string;
  }>;
  total: number;
}

interface SessionMessagesResponse {
  messages: Array<{
    id: string;
    content: string;
    role: 'user' | 'assistant' | 'system';
    timestamp: string;
    metadata?: any;
  }>;
  sessionId: string;
}

const sessionsListSchema = {
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              createdAt: { type: 'string' },
              lastMessageAt: { type: ['string', 'null'] },
              messageCount: { type: 'integer' },
              title: { type: ['string', 'null'] }
            }
          }
        },
        total: { type: 'integer' }
      }
    }
  }
};

const sessionMessagesSchema = {
  params: {
    type: 'object',
    required: ['sessionId'],
    properties: {
      sessionId: { type: 'string' }
    }
  },
  response: {
    200: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              content: { type: 'string' },
              role: { type: 'string', enum: ['user', 'assistant', 'system'] },
              timestamp: { type: 'string' },
              metadata: { type: ['object', 'null'] }
            }
          }
        },
        sessionId: { type: 'string' }
      }
    }
  }
};

export const sessionsRoutes: FastifyPluginAsync = async (server) => {
  const client = new ZepClient({ apiKey: config.zep.apiKey });

  /**
   * List all sessions/threads for the current user
   */
  server.get<{
    Querystring: { page?: number; pageSize?: number };
    Reply: SessionsListResponse;
  }>(
    '/',
    {
      schema: sessionsListSchema
    },
    async (req, reply) => {
      const userId = req.user!.id;
      const page = req.query.page || 1;
      const pageSize = req.query.pageSize || 20;
      const reqId = req.id;

      logger.info({
        req_id: reqId,
        userId,
        page,
        pageSize
      }, 'Fetching user sessions');

      try {
        // List all threads for the user  
        // Note: Zep might use different formats, let's try both
        let threadsResponse;
        try {
          threadsResponse = await client.thread.listAll({
            pageSize,
            pageNumber: page
          });
        } catch (err) {
          // Try without the user: prefix
          logger.debug({
            req_id: reqId,
            error: err.message
          }, 'First attempt failed, trying without prefix');
          
          threadsResponse = await client.thread.listAll({
            pageSize,
            pageNumber: page
          });
        }

        // Check what we got from Zep
        if (!threadsResponse || !threadsResponse.threads) {
          logger.warn({
            req_id: reqId,
            userId,
            response: threadsResponse
          }, 'No threads found or invalid response from Zep');
          
          return reply.send({
            sessions: [],
            total: 0
          });
        }

        logger.debug({
          req_id: reqId,
          userId,
          threadsCount: threadsResponse.threads?.length || 0,
          threads: threadsResponse.threads?.slice(0, 3).map(t => ({ 
            id: t?.id || t?.threadId || 'unknown',
            name: t?.name,
            createdAt: t?.createdAt,
            hasId: !!(t?.id || t?.threadId),
            fullObject: JSON.stringify(t).substring(0, 200)
          }))
        }, 'Zep threads response sample');

        // Transform threads to session format
        const sessions = (threadsResponse.threads || [])
          .filter(thread => {
             return thread.userId == userId
          })
          .filter(thread => {
            // Check for various ID fields that Zep might use
            const hasId = thread && (thread.id || thread.threadId || thread.thread_id);
            if (!hasId) {
              logger.warn({ thread: JSON.stringify(thread).substring(0, 100) }, 'Thread missing ID');
            }
            return hasId;
          })
          .map(thread => {
            // Extract session info from thread - try different ID fields
            const sessionId = thread.threadId;
            
            // Get message count and timestamps from thread metadata if available
            const createdAt = thread.createdAt;
            
            // Try to generate a title from the first message or use session ID
            const title = thread.name || thread.title || 
              (sessionId ? `Session ${String(sessionId).slice(-4)}` : 'Untitled Session');

            return {
              id: sessionId,
              createdAt,
              title
            };
          });

        logger.info({
          req_id: reqId,
          userId,
          sessionCount: sessions.length
        }, 'Sessions fetched successfully');

        return reply.send({
          sessions,
          total: threadsResponse.totalPages ? threadsResponse.totalPages * pageSize : sessions.length
        });
      } catch (error: any) {
        logger.error({
          req_id: reqId,
          userId,
          error: error.message,
          stack: error.stack
        }, 'Failed to fetch sessions');

        // Return empty list on error
        return reply.send({
          sessions: [],
          total: 0
        });
      }
    }
  );

  /**
   * Get messages for a specific session/thread
   */
  server.get<{
    Params: { sessionId: string };
    Reply: SessionMessagesResponse;
  }>(
    '/:sessionId/messages',
    {
      schema: sessionMessagesSchema
    },
    async (req, reply) => {
      const userId = req.user!.id;
      const { sessionId } = req.params;
      const reqId = req.id;

      logger.info({
        req_id: reqId,
        userId,
        sessionId
      }, 'Fetching session messages');

      try {
        // Get thread messages
        const thread = await client.thread.get(sessionId);
        
        if (!thread || !thread.messages) {
          return reply.send({
            messages: [],
            sessionId
          });
        }

        // Transform Zep messages to our format
        const messages = thread.messages.map((msg: any) => ({
          id: msg.id || `msg-${Date.now()}-${Math.random()}`,
          content: msg.content || '',
          role: msg.role || 'user',
          timestamp: msg.createdAt || new Date().toISOString(),
          metadata: msg.metadata || null
        }));

        logger.info({
          req_id: reqId,
          userId,
          sessionId,
          messageCount: messages.length
        }, 'Messages fetched successfully');

        return reply.send({
          messages,
          sessionId
        });
      } catch (error: any) {
        logger.error({
          req_id: reqId,
          userId,
          sessionId,
          error: error.message,
          stack: error.stack
        }, 'Failed to fetch messages');

        return reply.send({
          messages: [],
          sessionId
        });
      }
    }
  );
};
