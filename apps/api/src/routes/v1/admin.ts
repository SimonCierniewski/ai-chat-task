/**
 * Admin API Routes
 * Admin-only endpoints for user management, metrics, and pricing configuration
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireAuth, requireAdmin } from '../../utils/guards';
import { createValidator } from '../../utils/validator';
import { logger } from '../../config';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config';

// ============================================================================
// Types & Schemas
// ============================================================================

/**
 * Admin metrics query parameters
 */
interface AdminMetricsQuery {
  from?: string;      // ISO date string
  to?: string;        // ISO date string  
  userId?: string;    // Filter by specific user
  model?: string;     // Filter by AI model
}

/**
 * User response (sensitive fields redacted)
 */
interface AdminUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  created_at: string;
  last_sign_in_at?: string;
  message_count?: number;
  total_cost_usd?: number;
}

/**
 * Metrics KPIs response
 */
interface AdminMetrics {
  period: {
    from: string;
    to: string;
  };
  kpis: {
    total_messages: number;
    unique_users: number;
    total_cost_usd: number;
    avg_ttft_ms: number;
    avg_duration_ms: number;
  };
  time_series: Array<{
    day: string;
    messages: number;
    users: number;
    cost_usd: number;
    avg_ttft_ms: number;
  }>;
}

/**
 * Model pricing upsert request
 */
interface ModelPricingRequest {
  model: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cached_input_per_mtok?: number;
}

// Validation schemas
const metricsQuerySchema = Type.Object({
  from: Type.Optional(Type.String({ format: 'date' })),
  to: Type.Optional(Type.String({ format: 'date' })),
  userId: Type.Optional(Type.String({ format: 'uuid' })),
  model: Type.Optional(Type.String({ minLength: 1, maxLength: 100 }))
});

const pricingRequestSchema = Type.Object({
  model: Type.String({ minLength: 1, maxLength: 100 }),
  input_per_mtok: Type.Number({ minimum: 0, maximum: 1000 }),
  output_per_mtok: Type.Number({ minimum: 0, maximum: 1000 }),
  cached_input_per_mtok: Type.Optional(Type.Number({ minimum: 0, maximum: 1000 }))
});

const validateMetricsQuery = createValidator(metricsQuerySchema);
const validatePricingRequest = createValidator(pricingRequestSchema);

// ============================================================================
// Supabase Admin Client
// ============================================================================

/**
 * Supabase client with service role for admin operations
 */
const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/v1/admin/users
 * List all users with redacted sensitive information
 */
async function getUsersHandler(req: FastifyRequest, reply: FastifyReply) {
  const startTime = Date.now();
  
  try {
    logger.info('Admin users list requested', {
      req_id: req.id,
      admin_id: (req as any).user.id
    });

    // Query users from auth.users and profiles tables
    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select(`
        user_id,
        role,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch users from profiles', {
        req_id: req.id,
        error: error.message
      });
      throw error;
    }

    // Get additional auth data (email, last_sign_in) from auth.users
    // Note: This requires service role and careful handling
    const userIds = users?.map(u => u.user_id) || [];
    const authUsers: any[] = [];
    
    // In Phase 4, we'll use stub data for auth.users since it requires special permissions
    // In production, you'd query: SELECT id, email, last_sign_in_at, created_at FROM auth.users
    for (const userId of userIds) {
      authUsers.push({
        id: userId,
        email: userId.includes('admin') ? 'admin@example.com' : 'user@example.com',
        last_sign_in_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: users?.find(u => u.user_id === userId)?.created_at
      });
    }

    // TODO: Get usage stats from daily_usage table
    // const { data: usageStats } = await supabaseAdmin
    //   .from('daily_usage')
    //   .select('user_id, count(*) as message_count, sum(cost_usd) as total_cost_usd')
    //   .in('user_id', userIds);

    // Combine data and redact sensitive fields
    const adminUsers: AdminUser[] = users?.map(profile => {
      const authUser = authUsers.find(u => u.id === profile.user_id);
      // const usage = usageStats?.find(u => u.user_id === profile.user_id);
      
      return {
        id: profile.user_id,
        email: authUser?.email || '',
        role: profile.role,
        created_at: profile.created_at,
        last_sign_in_at: authUser?.last_sign_in_at,
        message_count: 0, // usage?.message_count || 0,
        total_cost_usd: 0  // usage?.total_cost_usd || 0
      };
    }) || [];

    const totalMs = Date.now() - startTime;
    
    logger.info('Admin users list completed', {
      req_id: req.id,
      user_count: adminUsers.length,
      total_ms: totalMs
    });

    return reply.status(200).send({
      users: adminUsers,
      total: adminUsers.length,
      fetched_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Admin users handler error', {
      req_id: req.id,
      error: error.message
    });

    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch users'
    });
  }
}

/**
 * GET /api/v1/admin/metrics
 * Get aggregated metrics and time series data
 */
async function getMetricsHandler(
  req: FastifyRequest<{ Querystring: AdminMetricsQuery }>,
  reply: FastifyReply
) {
  const startTime = Date.now();
  
  try {
    // Validate query parameters
    const validation = validateMetricsQuery(req.query);
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: validation.errors
      });
    }

    const { from, to, userId, model } = req.query;
    
    // Default date range: last 30 days
    const fromDate = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = to || new Date().toISOString().split('T')[0];

    logger.info('Admin metrics requested', {
      req_id: req.id,
      admin_id: (req as any).user.id,
      from: fromDate,
      to: toDate,
      user_id: userId,
      model
    });

    // Query daily_usage_view for time series and aggregations
    let query = supabaseAdmin
      .from('daily_usage_view')
      .select('*')
      .gte('day', fromDate)
      .lte('day', toDate);

    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    if (model) {
      query = query.eq('model', model);
    }

    const { data: dailyUsage, error } = await query.order('day', { ascending: true });

    if (error) {
      logger.error('Failed to fetch daily usage metrics', {
        req_id: req.id,
        error: error.message
      });
      throw error;
    }

    // Calculate KPIs from daily usage data
    const totalMessages = dailyUsage?.reduce((sum, d) => sum + (d.calls || 0), 0) || 0;
    const totalCostUsd = dailyUsage?.reduce((sum, d) => sum + (parseFloat(d.cost_usd || '0')), 0) || 0;
    const uniqueUsers = new Set(dailyUsage?.map(d => d.user_id) || []).size;
    
    // Calculate weighted averages for timing metrics
    let totalTtftWeighted = 0;
    let totalDurationWeighted = 0;
    let totalCallsForAvg = 0;
    
    dailyUsage?.forEach(d => {
      const calls = d.calls || 0;
      if (calls > 0) {
        totalTtftWeighted += (d.avg_ttft_ms || 0) * calls;
        totalDurationWeighted += (d.avg_duration_ms || 0) * calls;
        totalCallsForAvg += calls;
      }
    });

    const avgTtftMs = totalCallsForAvg > 0 ? totalTtftWeighted / totalCallsForAvg : 0;
    const avgDurationMs = totalCallsForAvg > 0 ? totalDurationWeighted / totalCallsForAvg : 0;

    // Prepare time series data
    const timeSeries = dailyUsage?.map(d => ({
      day: d.day,
      messages: d.calls || 0,
      users: 1, // This would need to be calculated differently for accurate count
      cost_usd: parseFloat(d.cost_usd || '0'),
      avg_ttft_ms: d.avg_ttft_ms || 0
    })) || [];

    const metrics: AdminMetrics = {
      period: {
        from: fromDate,
        to: toDate
      },
      kpis: {
        total_messages: totalMessages,
        unique_users: uniqueUsers,
        total_cost_usd: Number(totalCostUsd.toFixed(6)),
        avg_ttft_ms: Number(avgTtftMs.toFixed(2)),
        avg_duration_ms: Number(avgDurationMs.toFixed(2))
      },
      time_series: timeSeries
    };

    const totalMs = Date.now() - startTime;
    
    logger.info('Admin metrics completed', {
      req_id: req.id,
      total_messages: totalMessages,
      unique_users: uniqueUsers,
      days_queried: dailyUsage?.length || 0,
      total_ms: totalMs
    });

    return reply.status(200).send(metrics);

  } catch (error) {
    logger.error('Admin metrics handler error', {
      req_id: req.id,
      error: error.message
    });

    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch metrics'
    });
  }
}

/**
 * POST /api/v1/admin/models/pricing
 * Upsert model pricing configuration
 */
async function updateModelPricingHandler(
  req: FastifyRequest<{ Body: ModelPricingRequest }>,
  reply: FastifyReply
) {
  const startTime = Date.now();
  
  try {
    // Validate request body
    const validation = validatePricingRequest(req.body);
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: validation.errors
      });
    }

    const { model, input_per_mtok, output_per_mtok, cached_input_per_mtok } = req.body;

    logger.info('Admin pricing update requested', {
      req_id: req.id,
      admin_id: (req as any).user.id,
      model,
      input_per_mtok,
      output_per_mtok,
      cached_input_per_mtok
    });

    // Upsert into models_pricing table
    const pricingData = {
      model,
      input_per_mtok,
      output_per_mtok,
      cached_input_per_mtok: cached_input_per_mtok || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('models_pricing')
      .upsert(pricingData, {
        onConflict: 'model',
        returning: 'minimal'
      });

    if (error) {
      logger.error('Failed to upsert model pricing', {
        req_id: req.id,
        model,
        error: error.message
      });
      throw error;
    }

    const totalMs = Date.now() - startTime;
    
    logger.info('Admin pricing update completed', {
      req_id: req.id,
      model,
      total_ms: totalMs
    });

    return reply.status(200).send({
      success: true,
      model,
      pricing: {
        input_per_mtok,
        output_per_mtok,
        cached_input_per_mtok: cached_input_per_mtok || null
      },
      updated_at: pricingData.updated_at
    });

  } catch (error) {
    logger.error('Admin pricing handler error', {
      req_id: req.id,
      error: error.message
    });

    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Failed to update model pricing'
    });
  }
}

// ============================================================================
// Routes Registration
// ============================================================================

/**
 * Register admin routes
 */
export const adminRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // All admin routes require authentication and admin role
  fastify.addHook('preHandler', requireAuth);
  fastify.addHook('preHandler', requireAdmin);

  // GET /api/v1/admin/users - List users
  fastify.get('/users', {
    schema: {
      summary: 'List all users (admin only)',
      description: 'Get list of all users with usage statistics and redacted sensitive info',
      tags: ['Admin'],
      response: {
        200: Type.Object({
          users: Type.Array(Type.Object({
            id: Type.String(),
            email: Type.String(),
            role: Type.String(),
            created_at: Type.String(),
            last_sign_in_at: Type.Optional(Type.String()),
            message_count: Type.Optional(Type.Number()),
            total_cost_usd: Type.Optional(Type.Number())
          })),
          total: Type.Number(),
          fetched_at: Type.String()
        }),
        403: Type.Object({
          error: Type.String(),
          message: Type.String()
        }),
        500: Type.Object({
          error: Type.String(),
          message: Type.String()
        })
      }
    }
  }, getUsersHandler);

  // GET /api/v1/admin/metrics - Get metrics
  fastify.get('/metrics', {
    schema: {
      summary: 'Get usage metrics and analytics (admin only)',
      description: 'Retrieve aggregated metrics, KPIs, and time series data',
      tags: ['Admin'],
      querystring: metricsQuerySchema,
      response: {
        200: Type.Object({
          period: Type.Object({
            from: Type.String(),
            to: Type.String()
          }),
          kpis: Type.Object({
            total_messages: Type.Number(),
            unique_users: Type.Number(), 
            total_cost_usd: Type.Number(),
            avg_ttft_ms: Type.Number(),
            avg_duration_ms: Type.Number()
          }),
          time_series: Type.Array(Type.Object({
            day: Type.String(),
            messages: Type.Number(),
            users: Type.Number(),
            cost_usd: Type.Number(),
            avg_ttft_ms: Type.Number()
          }))
        })
      }
    }
  }, getMetricsHandler);

  // POST /api/v1/admin/models/pricing - Update model pricing  
  fastify.post('/models/pricing', {
    schema: {
      summary: 'Update model pricing configuration (admin only)',
      description: 'Upsert pricing information for AI models used in cost calculations',
      tags: ['Admin'],
      body: pricingRequestSchema,
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          model: Type.String(),
          pricing: Type.Object({
            input_per_mtok: Type.Number(),
            output_per_mtok: Type.Number(),
            cached_input_per_mtok: Type.Union([Type.Number(), Type.Null()])
          }),
          updated_at: Type.String()
        })
      }
    }
  }, updateModelPricingHandler);

  logger.info('Admin routes registered', { 
    routes: ['/users', '/metrics', '/models/pricing'],
    auth_required: true,
    admin_required: true
  });
};