import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { UserContext } from '../types/auth';

/**
 * Guard to require authenticated user
 * Returns 401 if user is not authenticated
 */
export function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
) {
  if (!request.user) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }
  done();
}

/**
 * Guard to require admin role
 * Returns 403 if user is not an admin
 */
export function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
) {
  if (!request.user) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  if (request.user.role !== 'admin') {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Admin role required',
    });
  }

  done();
}

/**
 * Async version of requireAuth for route handlers
 */
export async function requireAuthAsync(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    throw reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }
}

/**
 * Async version of requireAdmin for route handlers
 */
export async function requireAdminAsync(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    throw reply.code(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  if (request.user.role !== 'admin') {
    throw reply.code(403).send({
      error: 'Forbidden',
      message: 'Admin role required',
    });
  }
}

/**
 * Helper to check if request has admin role
 */
export function isAdmin(request: FastifyRequest): boolean {
  return request.user?.role === 'admin';
}

/**
 * Helper to get user from request
 * Throws if user is not authenticated
 */
export function getUser(request: FastifyRequest): UserContext {
  if (!request.user) {
    throw new Error('User not authenticated');
  }
  return request.user;
}

/**
 * Guard generator for custom role checks
 */
export function requireRole(allowedRoles: string[]) {
  return function (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ) {
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `One of these roles required: ${allowedRoles.join(', ')}`,
      });
    }

    done();
  };
}