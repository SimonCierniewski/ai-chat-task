import { FastifyPluginAsync } from 'fastify';
import { getZepClient } from '../services/zep';
import { logTelemetry } from '../services/telemetry';

interface OnSignupBody {
  user_id: string;
  email?: string;
  created_at?: string;
}

const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * On-signup hook endpoint
   * Called when a new user signs up to initialize their Zep memory collection
   * 
   * This endpoint is designed to be called by:
   * 1. Supabase Database Webhook (preferred for production)
   * 2. Client-side after successful signup (fallback)
   * 3. API-side on first request if user has no profile (auto-creation)
   * 
   * The endpoint is idempotent and will not fail if called multiple times.
   */
  fastify.post<{
    Body: OnSignupBody;
  }>('/auth/on-signup', {
    schema: {
      body: {
        type: 'object',
        required: ['user_id'],
        properties: {
          user_id: { type: 'string' },
          email: { type: 'string' },
          created_at: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            zep_initialized: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { user_id, email } = request.body;
    const startTime = Date.now();
    
    fastify.log.info({ user_id, email }, 'Processing on-signup hook');
    
    // Initialize Zep user/collection
    const zepClient = getZepClient(fastify.log);
    const zepResult = await zepClient.initializeUser(user_id, email);
    
    // Log telemetry for Zep operation
    await logTelemetry(fastify.log, {
      type: 'zep_upsert',
      user_id,
      payload: {
        operation: 'user_initialization',
        success: zepResult.success,
        zep_ms: zepResult.timings?.total || 0,
        error: zepResult.error,
      },
    });
    
    const totalTime = Date.now() - startTime;
    
    // Log successful signup
    if (zepResult.success) {
      fastify.log.info(
        {
          user_id,
          email,
          zep_enabled: zepClient.isEnabled(),
          timings: {
            ...zepResult.timings,
            total: totalTime,
          },
        },
        'User signup processing completed'
      );
    } else {
      // Log error but don't fail the signup
      fastify.log.warn(
        {
          user_id,
          email,
          error: zepResult.error,
          duration: totalTime,
        },
        'Zep initialization failed during signup (non-blocking)'
      );
    }
    
    // Always return success to avoid blocking signup
    return {
      success: true,
      message: 'User signup processed',
      zep_initialized: zepResult.success,
    };
  });

  /**
   * Check if user's Zep collection exists
   * Can be used by clients to verify initialization status
   */
  fastify.get<{
    Params: { userId: string };
  }>('/auth/zep-status/:userId', {
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            initialized: { type: 'boolean' },
            enabled: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { userId } = request.params;
    
    // Check if user is authenticated
    if (!request.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    
    // Check if requesting user matches or is admin
    if (request.user.id !== userId && request.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    
    const zepClient = getZepClient(fastify.log);
    
    // For Phase 1, just return if Zep is enabled
    // Phase 3 will check actual collection existence
    return {
      initialized: true, // Stub: assume initialized
      enabled: zepClient.isEnabled(),
    };
  });
};

export default authRoutes;