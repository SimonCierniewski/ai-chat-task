import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { UserContext, JWTPayload } from '../types/auth';
import { profilesClient } from '../db/profiles';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserContext;
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

const DEFAULT_OPTIONS: AuthPluginOptions = {
  jwksUri: 'https://pjktmicpanriimktvcam.supabase.co/auth/v1/.well-known/jwks.json',
  audience: 'authenticated',
  issuer: 'https://pjktmicpanriimktvcam.supabase.co/auth/v1',
  cacheMaxAge: 600000, // 10 minutes
  excludePaths: ['/health', '/metrics', '/', '/docs', '/auth/on-signup'],
};

/**
 * Fastify plugin for Supabase JWT authentication via JWKS
 */
const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  fastify,
  opts
) => {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  
  // Initialize JWKS client
  const client = jwksClient({
    jwksUri: options.jwksUri!,
    cache: true,
    cacheMaxAge: options.cacheMaxAge!,
    timeout: 5000,
  });

  /**
   * Get signing key from JWKS
   */
  const getKey = (header: any, callback: any) => {
    client.getSigningKey(header.kid, (err, key) => {
      if (err) {
        return callback(err);
      }
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    });
  };

  /**
   * Verify JWT token and return payload
   * Supports both HS256 (shared secret) and RS256 (JWKS) algorithms
   */
  const verifyToken = (token: string): Promise<JWTPayload> => {
    return new Promise((resolve, reject) => {
      // First, decode the token header to check the algorithm
      const decoded = jwt.decode(token, { complete: true }) as any;
      if (!decoded) {
        return reject(new Error('Invalid token format'));
      }

      const algorithm = decoded.header.alg;
      
      // If HS256, use shared secret
      if (algorithm === 'HS256') {
        const secret = options.jwtSecret || process.env.SUPABASE_JWT_SECRET;
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
      } 
      // If RS256, use JWKS
      else if (algorithm === 'RS256') {
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

  /**
   * Load user context from JWT and database
   */
  const loadUserContext = async (payload: JWTPayload): Promise<UserContext> => {
    const userId = payload.sub;
    if (!userId) {
      throw new Error('Invalid JWT: missing sub claim');
    }

    // Load role from profiles table
    // If profile doesn't exist, it will be created with default 'user' role
    const role = await profilesClient.getUserRole(userId);

    // Log if profile was auto-created
    const profile = await profilesClient.getProfile(userId);
    if (profile && profile.created_at.getTime() === profile.updated_at.getTime()) {
      fastify.log.info({ userId }, 'Auto-created profile for new user');
    }

    return {
      id: userId,
      email: payload.email,
      role,
    };
  };

  /**
   * Auth middleware hook
   */
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for excluded paths
    if (options.excludePaths?.includes(request.url)) {
      return;
    }

    // Extract token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing authorization header',
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid authorization header format',
      });
    }

    try {
      // Verify JWT token
      const payload = await verifyToken(token);
      
      // Load user context
      const user = await loadUserContext(payload);
      
      // Attach user to request
      request.user = user;
      
      // Log successful auth
      fastify.log.debug({ userId: user.id, role: user.role }, 'User authenticated');
    } catch (error) {
      fastify.log.warn({ error }, 'Authentication failed');
      
      // Determine error type and message
      let message = 'Invalid or expired token';
      if (error instanceof Error) {
        if (error.name === 'TokenExpiredError') {
          message = 'Token has expired';
        } else if (error.name === 'JsonWebTokenError') {
          message = 'Invalid token';
        } else if (error.message.includes('JWKS')) {
          message = 'Token verification failed';
        }
      }
      
      return reply.code(401).send({
        error: 'Unauthorized',
        message,
      });
    }
  });

  fastify.log.info('Auth plugin registered with JWKS verification');
};

export default fp(authPlugin, {
  name: 'auth',
  fastify: '4.x',
});