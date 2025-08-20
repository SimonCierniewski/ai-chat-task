/**
 * Environment Variable Validation
 * Ensures all required configuration is present at startup
 */

export interface RequiredEnvVars {
  // Supabase Configuration
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET?: string;
  SUPABASE_JWT_AUD?: string;
  
  // OpenAI Configuration  
  OPENAI_API_KEY: string;
  OPENAI_DEFAULT_MODEL?: string;
  
  // Zep Configuration
  ZEP_API_KEY: string;
  ZEP_BASE_URL?: string;
  
  // App Configuration
  APP_ORIGIN_ADMIN?: string;
  APP_ORIGIN_ANDROID_DEV?: string;
}

export function validateEnvironment(): void {
  const errors: string[] = [];
  
  // Critical variables that must be present
  const required = {
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ZEP_API_KEY: process.env.ZEP_API_KEY,
  };
  
  // Check each required variable
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      errors.push(`${key} is not configured`);
    } else if (value.includes('xxxx') || value.includes('placeholder')) {
      errors.push(`${key} contains placeholder value`);
    }
  }
  
  // Check for JWT configuration (need either JWKS or secret)
  const hasJwks = process.env.JWKS_URI;
  const hasSecret = process.env.SUPABASE_JWT_SECRET;
  
  if (!hasJwks && !hasSecret) {
    errors.push('Either JWKS_URI or SUPABASE_JWT_SECRET must be configured for JWT verification');
  }
  
  // Check CORS origins
  if (!process.env.APP_ORIGIN_ADMIN && !process.env.APP_ORIGIN_ANDROID_DEV) {
    console.warn('⚠️  No CORS origins configured - API will reject all cross-origin requests');
  }
  
  // If there are any errors, fail fast
  if (errors.length > 0) {
    console.error('\n❌ CRITICAL CONFIGURATION ERRORS:\n');
    errors.forEach(error => console.error(`   • ${error}`));
    console.error('\n📝 Required environment variables:');
    console.error('   • SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
    console.error('   • SUPABASE_SERVICE_ROLE_KEY');
    console.error('   • OPENAI_API_KEY');
    console.error('   • ZEP_API_KEY');
    console.error('   • JWKS_URI or SUPABASE_JWT_SECRET');
    console.error('\n💡 Set these in your .env.local file and restart the server.\n');
    
    throw new Error('Missing required environment variables. Server cannot start.');
  }
  
  // Log successful validation
  console.log('✅ Environment validation passed');
  console.log('   • Supabase: Configured');
  console.log('   • OpenAI: Configured');
  console.log('   • Zep: Configured');
  console.log('   • JWT: ' + (hasJwks ? 'JWKS' : 'Secret') + ' configured');
}