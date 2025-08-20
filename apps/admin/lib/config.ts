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
// Note: Server-only configuration has been removed from the admin app.
// The admin app should only use public configuration and rely on the API
// backend for all server-side operations. Service role keys and database
// connections should only exist in the API backend.
// ============================================================================

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

// ============================================================================
// Type Exports
// ============================================================================

export type PublicConfig = typeof publicConfig;