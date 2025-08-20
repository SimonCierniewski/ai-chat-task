/**
 * Environment Variable Validation for Admin Panel
 * Ensures all required configuration is present
 */

export function validateAdminEnvironment(): void {
  const errors: string[] = [];

  // Check client-side variables (NEXT_PUBLIC_*)
  if (typeof window !== 'undefined') {
    const clientRequired = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };

    for (const [key, value] of Object.entries(clientRequired)) {
      if (!value) {
        errors.push(`${key} is not configured`);
      } else if (value.includes('xxxx') || value.includes('placeholder')) {
        errors.push(`${key} contains placeholder value`);
      }
    }
  }

  // If there are any errors, fail fast
  if (errors.length > 0) {
    const side = typeof window === 'undefined' ? 'Server' : 'Client';
    console.error(`\n❌ ${side} Configuration Errors:\n`);
    errors.forEach(error => console.error(`   • ${error}`));

    throw new Error(`Missing required ${side.toLowerCase()} environment variables`);
  }
}
