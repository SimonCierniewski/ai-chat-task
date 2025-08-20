/**
 * Rate Limiter Plugin
 * In-memory rate limiting with per-user and per-IP buckets
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

interface RateLimitBucket {
  [key: string]: RateLimitEntry;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (req: FastifyRequest) => string;
  skip?: (req: FastifyRequest) => boolean;
  onLimit?: (req: FastifyRequest, key: string, current: number, limit: number) => void;
}

// ============================================================================
// Rate Limiter Class
// ============================================================================

class RateLimiter {
  private bucket: RateLimitBucket = {};
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Check if request should be rate limited
   */
  check(key: string, windowMs: number, maxRequests: number): {
    allowed: boolean;
    current: number;
    remaining: number;
    resetTime: number;
  } {
    const now = Date.now();
    const resetTime = now + windowMs;
    
    // Get or create entry
    let entry = this.bucket[key];
    if (!entry || now >= entry.resetTime) {
      // New window or expired entry
      entry = {
        count: 0,
        resetTime,
        firstRequest: now
      };
      this.bucket[key] = entry;
    }

    // Increment counter
    entry.count++;
    
    const allowed = entry.count <= maxRequests;
    const remaining = Math.max(0, maxRequests - entry.count);

    return {
      allowed,
      current: entry.count,
      remaining,
      resetTime: entry.resetTime
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of Object.entries(this.bucket)) {
      if (now >= entry.resetTime) {
        delete this.bucket[key];
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug('Rate limiter cleanup', { 
        cleaned_entries: cleaned,
        total_entries: Object.keys(this.bucket).length 
      });
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    const now = Date.now();
    const active = Object.values(this.bucket).filter(entry => now < entry.resetTime);
    
    return {
      total_keys: Object.keys(this.bucket).length,
      active_keys: active.length,
      memory_usage: JSON.stringify(this.bucket).length
    };
  }

  /**
   * Shutdown cleanup
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter();

// ============================================================================
// Key Generators
// ============================================================================

/**
 * Generate rate limit key based on user ID (preferred) or IP address
 */
function generateUserOrIPKey(req: FastifyRequest): string {
  // Use user ID if authenticated
  const user = (req as any).user;
  if (user?.id) {
    return `user:${user.id}`;
  }
  
  // Fall back to IP address
  const ip = req.ip || 
    req.headers['x-forwarded-for'] as string ||
    req.headers['x-real-ip'] as string ||
    'unknown';
  
  return `ip:${Array.isArray(ip) ? ip[0] : ip}`;
}

/**
 * Generate chat-specific rate limit key
 */
function generateChatKey(req: FastifyRequest): string {
  const baseKey = generateUserOrIPKey(req);
  return `chat:${baseKey}`;
}

// ============================================================================
// Telemetry Helper
// ============================================================================

/**
 * Emit telemetry for rate limit events
 */
function emitRateLimitTelemetry(
  req: FastifyRequest,
  key: string,
  current: number,
  limit: number,
  allowed: boolean
) {
  const user = (req as any).user;
  
  logger.info('Telemetry: rate_limit', {
    event_type: 'rate_limit',
    user_id: user?.id || null,
    req_id: req.id,
    rate_limit_key: key,
    current_requests: current,
    limit,
    allowed,
    endpoint: req.url,
    method: req.method,
    user_agent: req.headers['user-agent']
  });

  // TODO: Phase 4 - Store in telemetry_events table
  // await telemetryService.logEvent(user?.id || null, 'rate_limit', {
  //   rate_limit_key: key,
  //   current_requests: current,
  //   limit,
  //   allowed,
  //   endpoint: req.url,
  //   method: req.method,
  //   req_id: req.id
  // });
}

// ============================================================================
// Rate Limit Middleware
// ============================================================================

/**
 * Create rate limit handler
 */
function createRateLimitHandler(config: RateLimitConfig) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    // Skip if configured
    if (config.skip && config.skip(req)) {
      return;
    }

    const key = config.keyGenerator(req);
    const result = rateLimiter.check(key, config.windowMs, config.maxRequests);

    // Set rate limit headers
    reply.header('X-RateLimit-Limit', config.maxRequests);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
    reply.header('X-RateLimit-Window', Math.ceil(config.windowMs / 1000));

    // Log rate limit check
    logger.debug('Rate limit check', {
      req_id: req.id,
      key,
      current: result.current,
      limit: config.maxRequests,
      remaining: result.remaining,
      allowed: result.allowed
    });

    // Emit telemetry
    emitRateLimitTelemetry(req, key, result.current, config.maxRequests, result.allowed);

    if (!result.allowed) {
      // Call onLimit callback if provided
      if (config.onLimit) {
        config.onLimit(req, key, result.current, config.maxRequests);
      }

      logger.warn('Rate limit exceeded', {
        req_id: req.id,
        key,
        current: result.current,
        limit: config.maxRequests,
        endpoint: req.url
      });

      return reply.status(429).send({
        error: 'Too many requests',
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)} seconds.`,
        details: {
          limit: config.maxRequests,
          window_ms: config.windowMs,
          reset_time: result.resetTime
        }
      });
    }
  };
}

// ============================================================================
// Plugin Registration
// ============================================================================

/**
 * Rate limiter plugin
 */
async function rateLimiterPlugin(fastify: FastifyInstance) {
  // Global rate limiter for all endpoints except chat
  const globalRateLimit = createRateLimitHandler({
    windowMs: config.rateLimit.windowMs,
    maxRequests: config.rateLimit.maxRequests,
    keyGenerator: generateUserOrIPKey,
    skip: (req) => {
      // Skip chat endpoints (they have their own limiter)
      return req.url.startsWith('/api/v1/chat');
    },
    onLimit: (req, key, current, limit) => {
      logger.warn('Global rate limit hit', {
        req_id: req.id,
        key,
        current,
        limit,
        endpoint: req.url
      });
    }
  });

  // Chat-specific rate limiter (more restrictive)
  const chatRateLimit = createRateLimitHandler({
    windowMs: config.rateLimit.windowMs,
    maxRequests: config.rateLimit.maxRequestsChat,
    keyGenerator: generateChatKey,
    skip: (req) => {
      // Only apply to chat endpoints
      return !req.url.startsWith('/api/v1/chat');
    },
    onLimit: (req, key, current, limit) => {
      logger.warn('Chat rate limit hit', {
        req_id: req.id,
        key,
        current,
        limit,
        endpoint: req.url
      });
    }
  });

  // Register both rate limiters as preHandler hooks
  fastify.addHook('preHandler', globalRateLimit);
  fastify.addHook('preHandler', chatRateLimit);

  // Add stats endpoint for monitoring
  fastify.get('/api/v1/admin/rate-limit/stats', {
    schema: {
      tags: ['Admin'],
      summary: 'Get rate limiter statistics',
      response: {
        200: {
          type: 'object',
          properties: {
            stats: {
              type: 'object',
              properties: {
                total_keys: { type: 'number' },
                active_keys: { type: 'number' },
                memory_usage: { type: 'number' }
              }
            },
            config: {
              type: 'object',
              properties: {
                window_ms: { type: 'number' },
                max_requests: { type: 'number' },
                max_requests_chat: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (req, reply) => {
    // Require admin role
    const user = (req as any).user;
    if (!user || user.role !== 'admin') {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Admin role required'
      });
    }

    const stats = rateLimiter.getStats();
    
    return {
      stats,
      config: {
        window_ms: config.rateLimit.windowMs,
        max_requests: config.rateLimit.maxRequests,
        max_requests_chat: config.rateLimit.maxRequestsChat
      }
    };
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    rateLimiter.shutdown();
  });

  logger.info('Rate limiter plugin registered', {
    window_ms: config.rateLimit.windowMs,
    max_requests: config.rateLimit.maxRequests,
    max_requests_chat: config.rateLimit.maxRequestsChat
  });
}

export default fp(rateLimiterPlugin, {
  name: 'rate-limiter',
  dependencies: []
});