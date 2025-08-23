/**
 * Messages Route - Fetch conversation history from database
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { Message, ThreadSummary } from '@prototype/shared';
import { logger } from '../../utils/logger';
import { getSupabaseAdmin } from '../../services/supabase-admin';

/**
 * Query params for fetching messages
 */
interface GetMessagesQuery {
  thread_id?: string;
  limit?: number;
  offset?: number;
}

/**
 * Query params for thread summaries
 */
interface GetThreadsQuery {
  limit?: number;
  offset?: number;
}

export const messagesRoute: FastifyPluginAsync = async (server) => {
  /**
   * GET /api/v1/messages
   * Get messages for a specific thread or all user's messages
   */
  server.get<{
    Querystring: GetMessagesQuery;
  }>(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            thread_id: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
            offset: { type: 'number', minimum: 0, default: 0 }
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
                    thread_id: { type: 'string' },
                    role: { type: 'string' },
                    content: { type: 'string' },
                    created_at: { type: 'string' },
                    start_ms: { type: 'number' },
                    ttft_ms: { type: 'number' },
                    total_ms: { type: 'number' },
                    tokens_in: { type: 'number' },
                    tokens_out: { type: 'number' },
                    price: { type: 'number' },
                    model: { type: 'string' }
                  }
                }
              },
              total: { type: 'number' }
            }
          }
        }
      }
    },
    async (req: FastifyRequest<{ Querystring: GetMessagesQuery }>, reply: FastifyReply) => {
      try {
        const userId = req.user!.id;
        const { thread_id, limit = 50, offset = 0 } = req.query;
        
        logger.info({
          req_id: req.id,
          user_id: userId,
          thread_id,
          limit,
          offset
        }, 'Fetching messages');

        const supabaseAdmin = getSupabaseAdmin();
        
        // Build query
        let query = supabaseAdmin
          .from('messages')
          .select('*', { count: 'exact' })
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        
        if (thread_id) {
          query = query.eq('thread_id', thread_id);
        }
        
        const { data: messages, error, count } = await query;
        
        if (error) {
          logger.error({
            req_id: req.id,
            error: error.message
          }, 'Failed to fetch messages');
          throw error;
        }
        
        // Reverse to show oldest first
        const orderedMessages = messages?.reverse() || [];
        
        logger.info({
          req_id: req.id,
          message_count: orderedMessages.length,
          total: count
        }, 'Messages fetched successfully');
        
        return reply.status(200).send({
          messages: orderedMessages,
          total: count || 0
        });
        
      } catch (error) {
        logger.error({
          req_id: req.id,
          error: error instanceof Error ? error.message : String(error)
        }, 'Messages fetch error');
        
        return reply.status(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to fetch messages'
        });
      }
    }
  );

  /**
   * GET /api/v1/messages/threads
   * Get thread summaries for the user
   */
  server.get<{
    Querystring: GetThreadsQuery;
  }>(
    '/threads',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'number', minimum: 0, default: 0 }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              threads: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    thread_id: { type: 'string' },
                    message_count: { type: 'number' },
                    last_message_at: { type: 'string' },
                    total_cost: { type: 'number' },
                    total_tokens_in: { type: 'number' },
                    total_tokens_out: { type: 'number' },
                    first_message: { type: 'string' },
                    last_message: { type: 'string' }
                  }
                }
              },
              total: { type: 'number' }
            }
          }
        }
      }
    },
    async (req: FastifyRequest<{ Querystring: GetThreadsQuery }>, reply: FastifyReply) => {
      try {
        const userId = req.user!.id;
        const { limit = 20, offset = 0 } = req.query;
        
        logger.info({
          req_id: req.id,
          user_id: userId,
          limit,
          offset
        }, 'Fetching thread summaries');

        const supabaseAdmin = getSupabaseAdmin();
        
        // Get thread summaries using raw SQL for aggregation
        const { data: threads, error } = await supabaseAdmin.rpc('get_thread_summary', {
          p_user_id: userId
        });
        
        if (error) {
          // Fallback to manual aggregation if RPC doesn't exist
          const { data: messages, error: msgError } = await supabaseAdmin
            .from('messages')
            .select('thread_id, role, content, created_at, price, tokens_in, tokens_out')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
          
          if (msgError) {
            throw msgError;
          }
          
          // Manual aggregation
          const threadMap = new Map<string, any>();
          
          for (const msg of messages || []) {
            const threadId = msg.thread_id;
            if (!threadMap.has(threadId)) {
              threadMap.set(threadId, {
                thread_id: threadId,
                message_count: 0,
                last_message_at: msg.created_at,
                total_cost: 0,
                total_tokens_in: 0,
                total_tokens_out: 0,
                first_message: '',
                last_message: '',
                messages: []
              });
            }
            
            const thread = threadMap.get(threadId);
            thread.message_count++;
            thread.total_cost += msg.price || 0;
            thread.total_tokens_in += msg.tokens_in || 0;
            thread.total_tokens_out += msg.tokens_out || 0;
            thread.messages.push(msg);
          }
          
          // Process each thread to get first/last user messages
          const threadList = Array.from(threadMap.values()).map(thread => {
            const userMessages = thread.messages.filter((m: any) => m.role === 'user');
            const sortedMessages = thread.messages.sort((a: any, b: any) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            
            return {
              thread_id: thread.thread_id,
              message_count: thread.message_count,
              last_message_at: thread.last_message_at,
              total_cost: thread.total_cost,
              total_tokens_in: thread.total_tokens_in,
              total_tokens_out: thread.total_tokens_out,
              first_message: userMessages[0]?.content?.substring(0, 100) || '',
              last_message: userMessages[userMessages.length - 1]?.content?.substring(0, 100) || ''
            };
          });
          
          // Sort by last message date
          threadList.sort((a, b) => 
            new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
          );
          
          // Apply pagination
          const paginatedThreads = threadList.slice(offset, offset + limit);
          
          logger.info({
            req_id: req.id,
            thread_count: paginatedThreads.length,
            total: threadList.length
          }, 'Thread summaries fetched successfully');
          
          return reply.status(200).send({
            threads: paginatedThreads,
            total: threadList.length
          });
        }
        
        // If RPC worked, format and return
        const paginatedThreads = (threads || []).slice(offset, offset + limit);
        
        logger.info({
          req_id: req.id,
          thread_count: paginatedThreads.length,
          total: threads?.length || 0
        }, 'Thread summaries fetched successfully');
        
        return reply.status(200).send({
          threads: paginatedThreads,
          total: threads?.length || 0
        });
        
      } catch (error) {
        logger.error({
          req_id: req.id,
          error: error instanceof Error ? error.message : String(error)
        }, 'Thread summaries fetch error');
        
        return reply.status(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to fetch thread summaries'
        });
      }
    }
  );

  /**
   * GET /api/v1/messages/:threadId
   * Get all messages for a specific thread
   */
  server.get<{
    Params: { threadId: string };
  }>(
    '/:threadId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            threadId: { type: 'string' }
          },
          required: ['threadId']
        },
        response: {
          200: {
            type: 'object',
            properties: {
              messages: {
                type: 'array',
                items: {
                  type: 'object'
                }
              }
            }
          }
        }
      }
    },
    async (req: FastifyRequest<{ Params: { threadId: string } }>, reply: FastifyReply) => {
      try {
        const userId = req.user!.id;
        const { threadId } = req.params;
        
        logger.info({
          req_id: req.id,
          user_id: userId,
          thread_id: threadId
        }, 'Fetching thread messages');

        const supabaseAdmin = getSupabaseAdmin();
        
        const { data: messages, error } = await supabaseAdmin
          .from('messages')
          .select('*')
          .eq('user_id', userId)
          .eq('thread_id', threadId)
          .order('created_at', { ascending: true });
        
        if (error) {
          logger.error({
            req_id: req.id,
            error: error.message
          }, 'Failed to fetch thread messages');
          throw error;
        }
        
        logger.info({
          req_id: req.id,
          message_count: messages?.length || 0
        }, 'Thread messages fetched successfully');
        
        return reply.status(200).send({
          messages: messages || []
        });
        
      } catch (error) {
        logger.error({
          req_id: req.id,
          error: error instanceof Error ? error.message : String(error)
        }, 'Thread messages fetch error');
        
        return reply.status(500).send({
          error: 'INTERNAL_ERROR',
          message: 'Failed to fetch thread messages'
        });
      }
    }
  );
};