import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { UserContext, JWTPayload } from '../types/auth';
import { profilesClient } from '../db/profiles';
import { config } from '../config';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserContext;
    userCache?: Map<string, UserContext>;
  }
}

export interface AuthPluginOptions {
  jwksUri?: string;
  jwtSecret?: string;
  audience?: string;
  issuer?: string;
  cacheMaxAge?: number;
  excludePaths?: string[];
}

const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  fastify,
  opts
) => {
  const options = {
    jwksUri: opts.jwksUri || config.auth.jwksUri,
    jwtSecret: opts.jwtSecret || config.auth.jwtSecret,
    audience: opts.audience || config.auth.audience || 'authenticated',
    issuer: opts.issuer || config.auth.issuer,
    cacheMaxAge: opts.cacheMaxAge || 600000, // 10 minutes
    excludePaths: opts.excludePaths || [
      '/health',
      '/ready',
      '/',
      '/docs',
      '/api/v1/auth/on-signup',
    ],
  };

  // Initialize JWKS client if URI is provided
  const client = options.jwksUri
    ? jwksClient({
        jwksUri: options.jwksUri,
        cache: true,
        cacheMaxAge: options.cacheMaxAge,
        timeout: 5000,
      })
    : null;

  const getKey = (header: any, callback: any) => {
    if (!client) {
      return callback(new Error('JWKS client not configured'));
    }
    client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        return callback(err);
      }
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    });
  };

  const verifyToken = (token: string): Promise<JWTPayload> => {
    return new Promise((resolve, reject) => {
      const decoded = jwt.decode(token, { complete: true }) as any;
      if (!decoded) {
        return reject(new Error('Invalid token format'));
      }

      const algorithm = decoded.header.alg;

      if (algorithm === 'HS256') {
        const secret = options.jwtSecret;
        if (!secret) {
          return reject(new Error('JWT secret not configured for HS256 tokens'));
        }

        jwt.verify(
          token,
          secret,
          {
            audience: options.audience,
            issuer: options.issuer,
            algorithms: ['HS256'],
          },
          (err, decoded) => {
            if (err) {
              reject(err);
            } else {
              resolve(decoded as JWTPayload);
            }
          }
        );
      } else if (algorithm === 'RS256') {
        if (!client) {
          return reject(new Error('JWKS client not configured for RS256 tokens'));
        }
        jwt.verify(
          token,
          getKey,
          {
            audience: options.audience,
            issuer: options.issuer,
            algorithms: ['RS256'],
          },
          (err, decoded) => {
            if (err) {
              reject(err);
            } else {
              resolve(decoded as JWTPayload);
            }
          }
        );
      } else {
        reject(new Error(`Unsupported algorithm: ${algorithm}`));
      }
    });
  };

  const loadUserContext = async (
    request: FastifyRequest,
    payload: JWTPayload
  ): Promise<UserContext> => {
    const userId = payload.sub;
    if (!userId) {
      throw new Error('Invalid JWT: missing sub claim');
    }

    // Check request-level cache first
    if (!request.userCache) {
      request.userCache = new Map();
    }

    const cached = request.userCache.get(userId);
    if (cached) {
      request.log.debug({ userId }, 'User context loaded from request cache');
      return cached;
    }

    // Load role from profiles table
    const role = await profilesClient.getUserRole(userId);

    const userContext: UserContext = {
      id: userId,
      email: payload.email,
      role,
    };

    // Cache for this request
    request.userCache.set(userId, userContext);

    // Log if profile was auto-created
    const profile = await profilesClient.getProfile(userId);
    if (profile) {
      const createdAt = new Date(profile.created_at);
      const updatedAt = new Date(profile.updated_at);
      if (Math.abs(createdAt.getTime() - updatedAt.getTime()) < 1000) {
        request.log.info({ userId, req_id: request.id }, 'Auto-created profile for new user');
      }
    }

    return userContext;
  };

  // Add hook to initialize user cache
  fastify.decorateRequest('userCache', null);

  // Add auth verification hook
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for excluded paths
    const isExcluded = options.excludePaths?.some(path =>
      request.url === path || request.url.startsWith(path + '?')
    );

    if (isExcluded) {
      return;
    }

    // Skip auth for OPTIONS requests (CORS preflight)
    if (request.method === 'OPTIONS') {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      request.log.debug({ req_id: request.id, url: request.url }, 'Missing authorization header');
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing authorization header',
        code: 'UNAUTHENTICATED',
        req_id: request.id,
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid authorization header format',
        code: 'UNAUTHENTICATED',
        req_id: request.id,
      });
    }

    try {
      const payload = await verifyToken(token);
      const user = await loadUserContext(request, payload);
      request.user = user;

      request.log.debug({
        req_id: request.id,
        userId: user.id,
        role: user.role,
      }, 'User authenticated');
    } catch (error) {
      request.log.warn({
        req_id: request.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Authentication failed');

      let message = 'Invalid or expired token';
      let code = 'UNAUTHENTICATED';

      if (error instanceof Error) {
        if (error.name === 'TokenExpiredError') {
          message = 'Token has expired';
          code = 'TOKEN_EXPIRED';
        } else if (error.name === 'JsonWebTokenError') {
          message = 'Invalid token';
          code = 'INVALID_TOKEN';
        } else if (error.message.includes('JWKS')) {
          message = 'Token verification failed';
          code = 'VERIFICATION_FAILED';
        }
      }

      return reply.code(401).send({
        error: 'Unauthorized',
        message,
        code,
        req_id: request.id,
      });
    }
  });

  fastify.log.info({
    jwksUri: options.jwksUri ? 'configured' : 'not configured',
    audience: options.audience,
    excludedPaths: options.excludePaths,
  }, 'Auth plugin registered');
};

export default fp(authPlugin, {
  name: 'auth',
  fastify: '4.x',
});
