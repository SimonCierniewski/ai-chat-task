# Admin Panel Environment Variables

## Overview

This document describes all environment variables used by the Admin panel application. Variables are separated into **public** (client-safe) and **server-only** categories.

## Public Environment Variables (Client-Safe)

These variables are prefixed with `NEXT_PUBLIC_` and are safe to expose to the browser.

### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL for the API service | `http://localhost:3000` | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | - | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key | - | Yes |

### Feature Flags

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NEXT_PUBLIC_FEATURE_PLAYGROUND` | Enable playground feature | `true` | No |
| `NEXT_PUBLIC_FEATURE_TELEMETRY` | Enable telemetry dashboard | `true` | No |
| `NEXT_PUBLIC_FEATURE_PRICING` | Enable pricing management | `true` | No |
| `NEXT_PUBLIC_FEATURE_SETTINGS` | Enable settings page | `true` | No |

### Application Metadata

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NEXT_PUBLIC_APP_NAME` | Application display name | `AI Chat Admin` | No |
| `NEXT_PUBLIC_APP_VERSION` | Application version | `1.0.0` | No |
| `NEXT_PUBLIC_REGION` | Deployment region | `eu-central-1` | No |

## Server-Only Environment Variables (NEVER expose to client)

⚠️ **CRITICAL SECURITY WARNING**: These variables contain sensitive credentials and must NEVER be exposed to the client-side code. Only use them in:
- Server Components
- API Route Handlers
- Middleware
- Server-side functions

### Authentication & Security

| Variable | Description | Required | Security Level |
|----------|-------------|----------|----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key for admin operations | Yes | **CRITICAL** |
| `DATABASE_URL` | Direct database connection string | No | **HIGH** |
| `INTERNAL_API_KEY` | Internal API authentication key | No | **HIGH** |

### Monitoring & Analytics

| Variable | Description | Required | Security Level |
|----------|-------------|----------|----------------|
| `SENTRY_DSN` | Sentry error tracking DSN | No | **MEDIUM** |
| `ANALYTICS_KEY` | Analytics service API key | No | **MEDIUM** |

### Admin Configuration

| Variable | Description | Required | Security Level |
|----------|-------------|----------|----------------|
| `ADMIN_EMAILS` | Comma-separated list of admin emails | No | **LOW** |
| `RATE_LIMIT_WINDOW` | Rate limit window in milliseconds | No | **LOW** |
| `RATE_LIMIT_MAX` | Max requests per rate limit window | No | **LOW** |

## EU Region Deployment Notes

When deploying the Admin panel to production, ensure the following for EU compliance:

### Vercel Configuration

1. **Set Function Region**: In `vercel.json` or through the dashboard:
   ```json
   {
     "functions": {
       "app/api/*": {
         "runtime": "nodejs18.x",
         "regions": ["fra1"]  // Frankfurt, EU
       }
     }
   }
   ```

2. **Environment Variables**: Set region-specific variables:
   ```bash
   NEXT_PUBLIC_REGION=eu-central-1
   # Ensure all service URLs point to EU endpoints
   ```

3. **Edge Functions**: If using Edge Functions, configure EU regions:
   ```typescript
   export const config = {
     runtime: 'edge',
     regions: ['fra1', 'ams1']  // Frankfurt, Amsterdam
   };
   ```

### Data Residency

Ensure all data processing happens in EU regions:
- Supabase: Create project in EU region (Frankfurt/Amsterdam)
- API Service: Deploy to EU region (Railway Amsterdam)
- CDN: Configure edge locations to prioritize EU

### GDPR Compliance

When using server-only variables for user data:
1. Log access to personal data
2. Implement data retention policies
3. Ensure encryption in transit and at rest
4. Document data processing in privacy policy

## Development Setup

1. **Create `.env.local` file**:
   ```bash
   cp .env.example .env.local
   ```

2. **Add required variables**:
   ```env
   # Public (client-safe)
   NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
   
   # Server-only (NEVER commit these)
   SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
   ```

3. **Validate configuration**:
   ```bash
   npm run validate:env
   ```

## Production Deployment

### Security Checklist

- [ ] All server-only variables are set in deployment platform (not in code)
- [ ] `.env.local` is in `.gitignore`
- [ ] No console.log of sensitive variables
- [ ] Server-only config is only imported in server context
- [ ] Rate limiting is configured
- [ ] CORS is properly configured
- [ ] All external services use EU endpoints

### Monitoring

Monitor environment variable usage:
```typescript
// lib/config.ts includes validation
validatePublicConfig();  // Safe on client
validateServerConfig();  // Server-only, throws if called on client
```

## Troubleshooting

### Common Issues

1. **"Missing required config" warning**:
   - Ensure all required public variables are set
   - Check variable names match exactly (case-sensitive)

2. **"validateServerConfig called on client" error**:
   - Server config was imported in client component
   - Move logic to Server Component or API route

3. **Feature not showing in UI**:
   - Check feature flag is set to `true` (not `'false'` string)
   - Verify environment variable is loaded

### Debug Commands

```bash
# Check loaded environment variables
npm run env:check

# Validate configuration
npm run validate:env

# Test with specific config
NEXT_PUBLIC_FEATURE_PLAYGROUND=false npm run dev
```

## References

- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Vercel Environment Variables](https://vercel.com/docs/environment-variables)
- [EU Data Protection](https://gdpr.eu/)