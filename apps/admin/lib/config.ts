/**
 * Centralized configuration for Admin app
 * Separates public (client-safe) and server-only environment variables
 */

// ============================================================================
// Public Configuration (client-safe)
// ============================================================================

export const publicConfig = {
  // API Configuration
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000',
  
  // Supabase Public Configuration
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  
  // Feature Flags
  features: {
    playground: process.env.NEXT_PUBLIC_FEATURE_PLAYGROUND !== 'false',
    telemetry: process.env.NEXT_PUBLIC_FEATURE_TELEMETRY !== 'false',
    pricing: process.env.NEXT_PUBLIC_FEATURE_PRICING !== 'false',
    settings: process.env.NEXT_PUBLIC_FEATURE_SETTINGS !== 'false',
  },
  
  // App Metadata
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'AI Chat Admin',
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  
  // EU Region Configuration
  region: process.env.NEXT_PUBLIC_REGION || 'eu-central-1',
} as const;

// ============================================================================
// Server Configuration (server-only - NEVER expose to client)
// ============================================================================

export const serverConfig = {
  // Supabase Service Role (SERVER ONLY - CRITICAL)
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  
  // Database Direct Connection (SERVER ONLY)
  databaseUrl: process.env.DATABASE_URL || '',
  
  // Internal API Configuration (SERVER ONLY)
  internalApiKey: process.env.INTERNAL_API_KEY || '',
  
  // Monitoring & Analytics (SERVER ONLY)
  sentryDsn: process.env.SENTRY_DSN || '',
  analyticsKey: process.env.ANALYTICS_KEY || '',
  
  // Admin Configuration (SERVER ONLY)
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean),
  
  // Rate Limiting (SERVER ONLY)
  rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
} as const;

// ============================================================================
// Runtime Validation
// ============================================================================

/**
 * Validates that required public config is present
 * Safe to run on client
 */
export function validatePublicConfig(): void {
  const required = ['supabaseUrl', 'supabaseAnonKey'] as const;
  const missing = required.filter(key => !publicConfig[key]);
  
  if (missing.length > 0) {
    console.warn(`Missing required public config: ${missing.join(', ')}`);
  }
}

/**
 * Validates that required server config is present
 * ONLY run on server
 */
export function validateServerConfig(): void {
  if (typeof window !== 'undefined') {
    throw new Error('validateServerConfig called on client - this is a security issue!');
  }
  
  const required = ['supabaseServiceKey'] as const;
  const missing = required.filter(key => !serverConfig[key]);
  
  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required server config: ${missing.join(', ')}`);
  }
}

// ============================================================================
// Type Exports
// ============================================================================

export type PublicConfig = typeof publicConfig;
export type ServerConfig = typeof serverConfig;