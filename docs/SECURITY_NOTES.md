# Security Notes

## Overview

This document outlines critical security considerations for the AI Chat API, with particular focus on Supabase service role usage, secrets management, and administrative access controls.

## Service Role Key Usage

### What is the Service Role Key?

The Supabase service role key is a **bypass key** that:
- Bypasses all Row Level Security (RLS) policies
- Has full read/write access to all tables
- Can access the `auth.users` table (normally restricted)
- Should **NEVER** be exposed to client applications

### Server-Only Usage

**✅ Approved Uses (Server-Side Only):**

1. **Admin Routes** (`/api/v1/admin/*`):
   - Listing users from `profiles` and `auth.users` tables
   - Querying aggregated metrics from `daily_usage_view`
   - Updating model pricing in `models_pricing` table

2. **System Operations**:
   - Writing telemetry events to `telemetry_events`
   - Running database migrations
   - Background jobs for data aggregation

3. **Profile Management**:
   - Auto-creating user profiles during authentication
   - Updating user roles (admin operations only)

**❌ Never Use For:**
- Client-side operations (web, mobile apps)
- User authentication/authorization flows
- Any operation where the anon key would suffice
- Exposing via environment variables to frontend applications

### Code Examples

#### ✅ Correct Usage (Server-Side Admin Route)

```typescript
// apps/api/src/routes/v1/admin.ts
import { createClient } from '@supabase/supabase-js';
import { config } from '../../config';

// Service role client for admin operations
const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey, // ✅ Server-side only
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// Admin endpoint using service role
export async function getUsersHandler(req: FastifyRequest, reply: FastifyReply) {
  // ✅ Only admins can access this endpoint (requireAdmin middleware)
  const { data: users } = await supabaseAdmin
    .from('profiles')
    .select('user_id, role, created_at');
    
  return { users };
}
```

#### ❌ Incorrect Usage (Client-Side)

```typescript
// ❌ NEVER DO THIS - Exposes service role key to clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // ❌ Service key in client!
);
```

## Environment Variables Security

### Server-Only Secrets

These variables should **NEVER** be prefixed with `NEXT_PUBLIC_` or exposed to clients:

```bash
# ❌ Server-only secrets (never expose)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_JWT_SECRET=your-super-secret-jwt-secret
ZEP_API_KEY=z_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Database connection strings
DATABASE_URL=postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres
```

### Client-Safe Variables

These can be safely exposed to client applications:

```bash
# ✅ Safe for client exposure (can use NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

### Production Deployment

**Never commit these to version control:**
- `.env.local` - Local development secrets
- `.env.production` - Production secrets
- Any file containing actual API keys

**Use secure secret management:**
- Railway: Environment variables in dashboard
- Vercel: Environment variables in project settings
- Supabase: Built-in secret management

## Admin Access Controls

### Role-Based Access Control

Admin endpoints implement multiple layers of protection:

1. **JWT Authentication**: Valid JWT token required
2. **Admin Role Check**: User must have `role: 'admin'` in profiles table
3. **Service Role Operations**: Server uses service role for database operations

```typescript
// Multi-layer protection example
export const adminRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Layer 1: Require valid JWT
  fastify.addHook('preHandler', requireAuth);
  
  // Layer 2: Require admin role
  fastify.addHook('preHandler', requireAdmin);
  
  // Layer 3: Server-side service role usage
  fastify.get('/users', async (req, reply) => {
    const { data } = await supabaseAdmin
      .from('profiles')  // Uses service role
      .select('*');
  });
};
```

### Admin Role Assignment

Admins can only be created/modified by:
1. Database migrations (initial setup)
2. Other admins via admin endpoints
3. Direct database access (emergency)

**Never allow self-service admin elevation:**

```sql
-- ✅ Safe: Admin assigns role to another user
UPDATE profiles 
SET role = 'admin' 
WHERE user_id = 'target-user-id';

-- ❌ Dangerous: User could elevate themselves
UPDATE profiles 
SET role = 'admin' 
WHERE user_id = auth.uid();
```

## Data Redaction & Privacy

### User Data Handling

Admin endpoints redact sensitive information:

```typescript
// ✅ Safe: Redacted user response
interface AdminUser {
  id: string;                    // UUID (safe)
  email: string;                 // Email (business need)
  role: 'user' | 'admin';        // Role (admin function)
  created_at: string;            // Timestamp (analytics)
  message_count?: number;        // Usage stats (billing)
  total_cost_usd?: number;       // Cost data (admin need)
  // ❌ Excluded: password_hash, phone, metadata, etc.
}
```

### Audit Logging

All admin operations are logged with:
- Admin user ID performing the action
- Target resources being accessed/modified
- Request IDs for tracing
- Timestamps for audit trails

```typescript
logger.info('Admin users list requested', {
  req_id: req.id,
  admin_id: req.user.id,        // Who made the request
  user_count: users.length,     // What data was accessed
  total_ms: totalMs            // Performance metrics
});
```

## Network Security

### CORS Configuration

Strict CORS policy limits admin endpoints to authorized origins:

```typescript
// Only allow admin dashboard origin
fastify.register(cors, {
  origin: [
    process.env.APP_ORIGIN_ADMIN,           // https://admin.yourdomain.com
    'http://localhost:3001'                 // Development only
  ],
  credentials: true
});
```

### Rate Limiting

Admin endpoints have appropriate rate limits:
- Separate buckets for admin vs regular operations
- Higher limits for admin users (but still capped)
- Request throttling for expensive operations (metrics, user lists)

## JWT Security

### Token Verification

JWT tokens are verified using JWKS (not shared secrets):

```typescript
// ✅ Secure: JWKS verification (no secret sharing)
const jwksClient = createJWKSClient({
  uri: config.auth.jwksUri,     // https://xxxx.supabase.co/auth/v1/.well-known/jwks.json
  cache: true,
  cacheMaxAge: 600000
});
```

### Token Scope & Expiration

- JWT tokens have limited lifetime (configurable)
- Tokens include user role in claims
- Admin operations verify role on each request
- No long-lived admin tokens (use session refresh)

## Database Security

### Row Level Security (RLS)

RLS policies are in place for all user-accessible tables:

```sql
-- Example: Users can only see their own profiles
CREATE POLICY "Users can view own profile" ON profiles
FOR SELECT USING (auth.uid() = user_id);

-- Admin operations bypass RLS using service role
```

### Service Role Boundaries

Service role usage is strictly contained:
- Only used in server-side admin routes
- Never exposed to client applications  
- Logged and monitored for abuse
- Limited to necessary operations only

## Monitoring & Alerting

### Security Events to Monitor

1. **Failed admin authentication attempts**
2. **Service role key usage patterns** 
3. **Unusual admin operations** (bulk user modifications)
4. **Rate limit violations**
5. **CORS violations** (blocked origins)

### Recommended Alerts

- Multiple failed admin logins
- Admin operations outside business hours
- High volume of admin API calls
- Service role key errors (misconfiguration)
- Unexpected admin user creation

## Incident Response

### If Service Role Key is Compromised

1. **Immediately rotate** the service role key in Supabase dashboard
2. **Update** all server environment variables
3. **Redeploy** API services with new key
4. **Audit** recent admin operations for unauthorized activity
5. **Review** access logs for suspicious patterns

### If Admin Account is Compromised

1. **Disable** the compromised admin account
2. **Audit** all admin operations performed by that account
3. **Reset** the admin user's authentication
4. **Review** any users/data modified by the compromised account
5. **Notify** other administrators of the incident

## Best Practices Summary

### Development

- ✅ Use `.env.local` for local development secrets
- ✅ Never commit real secrets to version control
- ✅ Use different keys for dev/staging/production
- ✅ Regularly rotate development keys

### Deployment

- ✅ Set secrets via platform UI (Railway, Vercel, etc.)
- ✅ Use EU regions for GDPR compliance when possible
- ✅ Enable logging for all admin operations
- ✅ Set up monitoring for security events

### Operations

- ✅ Regularly audit admin users and their activity
- ✅ Use principle of least privilege for admin roles
- ✅ Monitor service role key usage patterns
- ✅ Keep security documentation up to date

### Compliance

- ✅ Document all admin data access procedures
- ✅ Implement data retention policies
- ✅ Ensure audit logs meet compliance requirements
- ✅ Regularly review and update security measures

## Questions & Support

For security questions or concerns:

1. Review this document and related security policies
2. Check server logs for error details and request IDs
3. Verify environment variable configuration
4. Ensure proper role-based access controls are in place

**Remember: Service role keys are powerful tools that bypass all security policies. Use them carefully and only server-side.**