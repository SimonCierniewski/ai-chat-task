import { FastifyRequest } from 'fastify';

export interface UserContext {
  id: string;
  email?: string;
  role: 'user' | 'admin';
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: UserContext;
}

export interface JWTPayload {
  sub: string;
  email?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  role?: string;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
  user_metadata?: Record<string, any>;
}

export interface ProfileRow {
  user_id: string;
  email?: string;
  role: 'user' | 'admin';
  display_name?: string | null;
  created_at: string;
  updated_at: string;
}