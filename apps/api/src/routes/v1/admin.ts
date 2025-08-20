/**
 * Admin API Routes
 * Admin-only endpoints for user management, metrics, and pricing configuration
 */

import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { requireAuth, requireAdmin } from '../../utils/guards';
import { createValidator } from '../../utils/validator';
import { logger } from '../../utils/logger';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config';
import { ModelRegistry } from '../../services/model-registry';

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
  cached_input_per_mtok: number | null;
}
interface ModelPricingBatchRequest { models: ModelPricingRequest[] }

interface UpdateUserRoleParams {
  userId: string;
}

interface UpdateUserRoleBody {
  role: 'user' | 'admin';
}

// Validation schemas
const metricsQuerySchema = {
  type: 'object',
  properties: {
    from: { type: 'string', format: 'date' },
    to: { type: 'string', format: 'date' },
    userId: { type: 'string', format: 'uuid' },
    model: { type: 'string', minLength: 1, maxLength: 100 },
  },
  additionalProperties: true,
} as const;

const pricingRequestSchema = {
  type: 'object',
  required: ['model', 'input_per_mtok', 'output_per_mtok'],
  properties: {
    model: { type: 'string', minLength: 1, maxLength: 100 },
    input_per_mtok: { type: 'number', minimum: 0, maximum: 1000 },
    output_per_mtok: { type: 'number', minimum: 0, maximum: 1000 },
    cached_input_per_mtok: { type: 'number', minimum: 0, maximum: 1000 },
  },
  additionalProperties: false,
} as const;

const validateMetricsQuery = createValidator(metricsQuerySchema);
const validatePricingRequest = createValidator(pricingRequestSchema);

// Initialize services
const modelRegistry = new ModelRegistry();

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
    // Parse pagination and search
    const query: any = (req as any).query || {};
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const search = (query.search || '').toString().trim().toLowerCase();

    logger.info('Admin users list requested', {
      req_id: req.id,
      admin_id: (req as any).user.id
    });

    // List users from auth (service role required)
    const { data: listResult, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: limit,
    });

    if (listError) {
      logger.error('Failed to list auth users', {
        req_id: req.id,
        error: listError.message,
      });
      throw listError;
    }

    let authUsers = listResult?.users || [];

    // Optional search by email (client-side filter as API lacks search param)
    if (search) {
      authUsers = authUsers.filter(u => (u.email || '').toLowerCase().includes(search));
    }

    // Fetch profiles to get roles
    const userIds = authUsers.map(u => u.id);
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, role, created_at')
      .in('user_id', userIds);

    if (profilesError) {
      logger.error('Failed to fetch profiles for users', {
        req_id: req.id,
        error: profilesError.message,
      });
      throw profilesError;
    }

    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

    // Fetch usage stats (sum of calls and cost across all time)
    const usageByUser = new Map<string, { message_count: number; total_cost_usd: number }>();
    if (userIds.length > 0) {
      const { data: usageRows, error: usageError } = await supabaseAdmin
        .from('daily_usage_view')
        .select('user_id, calls, cost_usd')
        .in('user_id', userIds);

      if (usageError) {
        logger.warn('Failed to fetch usage stats for users', {
          req_id: req.id,
          error: usageError.message,
        });
      } else if (usageRows) {
        for (const row of usageRows as any[]) {
          const uid = row.user_id as string;
          const calls = Number(row.calls || 0);
          const cost = typeof row.cost_usd === 'string' ? parseFloat(row.cost_usd) : Number(row.cost_usd || 0);
          const acc = usageByUser.get(uid) || { message_count: 0, total_cost_usd: 0 };
          acc.message_count += calls;
          acc.total_cost_usd += cost;
          usageByUser.set(uid, acc);
        }
      }
    }

    // TODO: Get usage stats from daily_usage table
    // const { data: usageStats } = await supabaseAdmin
    //   .from('daily_usage')
    //   .select('user_id, count(*) as message_count, sum(cost_usd) as total_cost_usd')
    //   .in('user_id', userIds);

    // Combine data and redact sensitive fields
    const adminUsers: AdminUser[] = authUsers.map(u => {
      const p = profileMap.get(u.id);
      const usage = usageByUser.get(u.id);
      return {
        id: u.id,
        email: u.email || '',
        role: (p?.role as 'user' | 'admin') || 'user',
        created_at: (u.created_at as string) || new Date().toISOString(),
        last_sign_in_at: (u.last_sign_in_at as string) || undefined,
        message_count: usage?.message_count || 0,
        total_cost_usd: usage ? Number(usage.total_cost_usd.toFixed(6)) : 0,
      };
    });

    const totalMs = Date.now() - startTime;

    logger.info('Admin users list completed', {
      req_id: req.id,
      user_count: adminUsers.length,
      total_ms: totalMs
    });

    // Build simple/estimated pagination info
    const rawCount = listResult?.users?.length || 0;
    const hasNextPage = rawCount === limit && !search;
    const estimatedTotal = (page - 1) * limit + adminUsers.length + (hasNextPage ? 1 : 0);
    const totalPages = hasNextPage ? page + 1 : page;

    return reply.status(200).send({
      users: adminUsers,
      pagination: {
        page,
        limit,
        total: estimatedTotal,
        totalPages,
      },
      fetched_at: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Admin users handler error', {
      req_id: req.id,
      error: error instanceof Error ? error.message : String(error)
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
      error: error instanceof Error ? error.message : String(error)
    });

    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch metrics'
    });
  }
}

/**
 * GET /api/v1/admin/models
 * List available models with pricing
 */
async function listModelsHandler(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const models = await modelRegistry.getAllModels();

    logger.info('Admin listed models', {
      req_id: req.id,
      user_id: (req as any).user.id,
      models_count: models.length
    });

    return reply.send({models});
  } catch (error) {
    logger.error('Failed to list models', {
      req_id: req.id,
      error: error instanceof Error ? error.message : String(error)
    });

    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Failed to list models'
    });
  }
}

/**
 * POST /api/v1/admin/models/pricing
 * Upsert model pricing configuration
 */
async function updateModelPricingHandler(
  req: FastifyRequest<{ Body: ModelPricingRequest | ModelPricingBatchRequest }>,
  reply: FastifyReply
) {
  const startTime = Date.now();

  try {
    // Normalize to array
    const body = req.body as ModelPricingRequest | ModelPricingBatchRequest;
    const items: ModelPricingRequest[] = Array.isArray((body as any).models)
      ? (body as ModelPricingBatchRequest).models
      : [body as ModelPricingRequest];

    // Validate each item
    const errors: any[] = [];
    const validItems: ModelPricingRequest[] = [];
    for (const item of items) {
      const v = validatePricingRequest(item);
      if (!v.valid) {
        errors.push(...(v.errors || []));
      } else {
        validItems.push(item);
      }
    }
    if (errors.length > 0) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: errors,
      });
    }

    logger.info('Admin pricing update requested', {
      req_id: req.id,
      admin_id: (req as any).user.id,
      count: items.length,
    });

    const updatedAt = new Date().toISOString();

    for (const { model, input_per_mtok, output_per_mtok, cached_input_per_mtok } of validItems) {
      const pricingData = {
        model,
        input_per_mtok,
        output_per_mtok,
        cached_input_per_mtok: cached_input_per_mtok > 0 ? cached_input_per_mtok : null,
        updated_at: updatedAt,
      };

      const { error } = await supabaseAdmin
        .from('models_pricing')
        .upsert(pricingData, { onConflict: 'model' })
        .select();

      if (error) {
        logger.error('Failed to upsert model pricing', { req_id: req.id, model, error: error.message });
        throw error;
      }
    }

    await modelRegistry.invalidateCache();

    logger.info('Admin pricing update completed', {
      req_id: req.id,
      total_ms: Date.now() - startTime,
    });

    return reply.status(200).send({ success: true, updated_at: updatedAt, models: validItems });

  } catch (error) {
    logger.error('Admin pricing handler error', {
      req_id: req.id,
      error: error instanceof Error ? error.message : String(error)
    });

    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Failed to update model pricing'
    });
  }
}

/**
 * PUT /api/v1/admin/users/:userId/role
 * Update a user's role in the profiles table
 */
async function updateUserRoleHandler(
  req: FastifyRequest<{ Params: UpdateUserRoleParams; Body: UpdateUserRoleBody }>,
  reply: FastifyReply
) {
  try {
    const { userId } = req.params as UpdateUserRoleParams;
    const { role } = req.body as UpdateUserRoleBody;

    if (!userId) {
      return reply.status(400).send({ error: 'Missing userId' });
    }

    if (role !== 'user' && role !== 'admin') {
      return reply.status(400).send({ error: 'Invalid role' });
    }

    logger.info('Admin updating user role', {
      req_id: req.id,
      admin_id: (req as any).user.id,
      target_user: userId,
      role,
    });

    // Try update; do not create profile if missing
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('user_id, role')
      .maybeSingle();

    if (updateError) {
      logger.error('Failed to update user role', {
        req_id: req.id,
        error: updateError.message,
      });
      return reply.status(500).send({ error: 'Failed to update user role' });
    }

    if (!updated) {
      return reply.status(404).send({
        error: 'PROFILE_NOT_FOUND',
        message: 'User profile not found. It should be created by the signup trigger.',
      });
    }

    return reply.send({ success: true, user_id: updated.user_id, role: updated.role });
  } catch (error) {
    logger.error('Admin update user role handler error', {
      req_id: req.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return reply.status(500).send({ error: 'Failed to update user role' });
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
  fastify.get('/users', getUsersHandler);

  // GET /api/v1/admin/metrics - Get metrics
  fastify.get('/metrics', getMetricsHandler);

  // GET /api/v1/admin/models - List available models
  fastify.get('/models', listModelsHandler);

  // POST /api/v1/admin/models/pricing - Update model pricing
  fastify.post('/models/pricing', updateModelPricingHandler);

  // PUT /api/v1/admin/users/:userId/role - Update user role
  fastify.put('/users/:userId/role', updateUserRoleHandler);
};
