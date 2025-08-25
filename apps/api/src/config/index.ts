import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '../../.env.local') });
dotenv.config({ path: join(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  version: process.env.API_VERSION || '0.0.1',
  
  corsOrigins: {
    admin: process.env.APP_ORIGIN_ADMIN,
    androidDev: process.env.APP_ORIGIN_ANDROID_DEV,
  },
  
  auth: {
    jwksUri: process.env.JWKS_URI || process.env.SUPABASE_URL 
      ? `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`
      : undefined,
    jwtSecret: process.env.SUPABASE_JWT_SECRET,
    audience: process.env.SUPABASE_JWT_AUD || 'authenticated',
    issuer: process.env.JWT_ISSUER,
  },
  
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
    connectTimeoutMs: parseInt(process.env.OPENAI_CONNECT_TIMEOUT_MS || '5000', 10),
    timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || '30000', 10),
    retryMax: parseInt(process.env.OPENAI_RETRY_MAX || '1', 10),
    sseHeartbeatMs: parseInt(process.env.OPENAI_SSE_HEARTBEAT_MS || '10000', 10),
  },
  
  zep: {
    apiKey: process.env.ZEP_API_KEY || '',
    baseUrl: process.env.ZEP_BASE_URL || 'https://api.getzep.com',
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_MAX_REQUESTS || '100', 10),
    maxRequestsChat: parseInt(process.env.RATE_MAX_REQUESTS_CHAT || '20', 10),
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.NODE_ENV === 'development',
  },
} as const;

export function validateConfig(): void {
  console.log('Validating configuration...');
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Port:', config.port);
  
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    console.error('Missing required environment variables:', missing);
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  if (!config.corsOrigins.admin && !config.corsOrigins.androidDev) {
    console.warn('Warning: No CORS origins configured. All cross-origin requests will be blocked.');
  }
  
  console.log('Configuration validated successfully');
}