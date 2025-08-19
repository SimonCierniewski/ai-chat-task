# API Service

## Overview

Fastify-based API service with JWT authentication via Supabase JWKS, role-based access control, and versioned endpoints.

## Authentication

The API uses JWT tokens for authentication, verified against Supabase JWKS endpoint. Tokens can be either:
- **RS256**: Verified using JWKS (recommended for production)
- **HS256**: Verified using shared secret (for development/testing)

### User Context

After successful authentication, `req.user` contains:
```typescript
{
  id: string;      // User ID from JWT 'sub' claim
  email?: string;  // User email from JWT
  role: string;    // Role from profiles table ('user' or 'admin')
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHENTICATED` | 401 | Missing or invalid authentication |
| `TOKEN_EXPIRED` | 401 | JWT token has expired |
| `INVALID_TOKEN` | 401 | Malformed or invalid JWT |
| `VERIFICATION_FAILED` | 401 | JWKS verification failed |
| `FORBIDDEN` | 403 | Insufficient permissions (e.g., non-admin accessing admin route) |

## Testing Authentication with curl

### 1. Get a JWT Token

First, you need a valid JWT token. You can get one by:

#### Option A: Using Supabase Auth (Recommended)
```bash
# Sign up or sign in with Supabase
curl -X POST https://your-project.supabase.co/auth/v1/signup \
  -H "Content-Type: application/json" \
  -H "apikey: your-anon-key" \
  -d '{
    "email": "test@example.com",
    "password": "your-password"
  }'

# The response will include an access_token
```

#### Option B: Generate a Test Token (Development Only)
```bash
# Using Node.js to generate a test HS256 token
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    sub: 'test-user-id',
    email: 'test@example.com',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600
  },
  'placeholder-jwt-secret-with-at-least-32-characters',
  { algorithm: 'HS256' }
);
console.log(token);
"

# Save the token to a variable
export TOKEN="<generated-token>"
```

### 2. Test Endpoints

#### Health Check (No Auth Required)
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "ok": true,
  "version": "0.0.1",
  "uptime_s": 42,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "environment": "development"
}
```

#### Auth Ping (Protected - Requires Valid Token)
```bash
# Test with valid token
curl http://localhost:3000/api/v1/auth/ping \
  -H "Authorization: Bearer $TOKEN"
```

Success Response (200):
```json
{
  "id": "test-user-id",
  "email": "test@example.com",
  "role": "user",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### Test Without Token (Should Return 401)
```bash
curl http://localhost:3000/api/v1/auth/ping
```

Error Response (401):
```json
{
  "error": "Unauthorized",
  "message": "Missing authorization header",
  "code": "UNAUTHENTICATED",
  "req_id": "abc123def456"
}
```

#### Test With Invalid Token (Should Return 401)
```bash
curl http://localhost:3000/api/v1/auth/ping \
  -H "Authorization: Bearer invalid-token"
```

Error Response (401):
```json
{
  "error": "Unauthorized",
  "message": "Invalid token",
  "code": "INVALID_TOKEN",
  "req_id": "xyz789ghi012"
}
```

#### Test Admin Endpoint (Requires Admin Role)
```bash
# As regular user (should return 403)
curl http://localhost:3000/api/v1/admin/users \
  -H "Authorization: Bearer $USER_TOKEN"
```

Error Response (403):
```json
{
  "error": "Forbidden",
  "message": "Admin role required",
  "code": "FORBIDDEN",
  "req_id": "mno345pqr678"
}
```

```bash
# As admin (should return 200)
curl http://localhost:3000/api/v1/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Success Response (200):
```json
{
  "users": [...],
  "total": 2
}
```

### 3. Test Expired Token
```bash
# Generate an expired token
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    sub: 'test-user-id',
    email: 'test@example.com',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) - 3600  // Expired 1 hour ago
  },
  'placeholder-jwt-secret-with-at-least-32-characters',
  { algorithm: 'HS256' }
);
console.log(token);
"

export EXPIRED_TOKEN="<expired-token>"

curl http://localhost:3000/api/v1/auth/ping \
  -H "Authorization: Bearer $EXPIRED_TOKEN"
```

Error Response (401):
```json
{
  "error": "Unauthorized",
  "message": "Token has expired",
  "code": "TOKEN_EXPIRED",
  "req_id": "stu901vwx234"
}
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Start development server
pnpm dev

# Server runs at http://localhost:3000
```

## Protected Routes

### Route Protection Levels

| Path Pattern | Auth Required | Description |
|-------------|---------------|-------------|
| `/health`, `/ready`, `/` | No | Public endpoints |
| `/api/v1/auth/on-signup` | No | Webhook endpoint |
| `/api/v1/auth/ping` | Yes | Test authentication |
| `/api/v1/auth/status` | Optional | Returns different data based on auth |
| `/api/v1/*` | Yes | All other v1 endpoints |
| `/api/v1/admin/*` | Yes + Admin | Admin-only endpoints |

### Using Guards in Routes

```typescript
import { requireAuth, requireAdmin } from './utils/guards';

// Protected route (any authenticated user)
fastify.get(
  '/api/v1/protected',
  { preHandler: requireAuth },
  async (request, reply) => {
    return { userId: request.user.id };
  }
);

// Admin-only route
fastify.get(
  '/api/v1/admin/data',
  { preHandler: requireAdmin },
  async (request, reply) => {
    return { secret: 'admin data' };
  }
);
```

## Setting Up Admin User

To create an admin user for testing:

### Via Supabase SQL Editor
```sql
-- After user signs up, update their role
UPDATE profiles 
SET role = 'admin' 
WHERE user_id = 'your-user-id';
```

### Via API Webhook
```bash
# Trigger the on-signup webhook
curl -X POST http://localhost:3000/api/v1/auth/on-signup \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-admin-id",
    "email": "admin@example.com"
  }'
```

## Environment Variables

Required for authentication:
```bash
# JWKS endpoint for RS256 tokens
JWKS_URI=https://your-project.supabase.co/auth/v1/.well-known/jwks.json

# OR for HS256 tokens (development)
SUPABASE_JWT_SECRET=your-jwt-secret-with-at-least-32-characters

# JWT validation
SUPABASE_JWT_AUD=authenticated
JWT_ISSUER=https://your-project.supabase.co/auth/v1

# Database for profiles
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# CORS Origins
APP_ORIGIN_ADMIN=http://localhost:3001
APP_ORIGIN_ANDROID_DEV=http://localhost:8081
```

## Request ID Tracking

Every request gets a unique ID for tracing:
- Logged with all auth events
- Returned in error responses as `req_id`
- Available in header `x-request-id`

Example:
```bash
curl -v http://localhost:3000/api/v1/auth/ping 2>&1 | grep -i x-request-id
< x-request-id: abc123def456
```

## Performance Optimizations

- **Request-level caching**: User context cached per request
- **JWKS caching**: Keys cached for 10 minutes
- **Profile lookup**: Single database query per request

## Troubleshooting

### "JWKS client not configured"
- Ensure `JWKS_URI` is set in environment
- Check the JWKS endpoint is accessible
- Verify Supabase project is active

### "Token verification failed"
- Verify the token's `kid` (key ID) matches JWKS
- Check token hasn't been tampered with
- Ensure clock sync between server and token issuer

### "Admin role required" for admin user
- Verify user's role in profiles table:
  ```sql
  SELECT * FROM profiles WHERE user_id = 'your-user-id';
  ```
- Check profile auto-creation worked
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set

### CORS Errors
- Verify `APP_ORIGIN_ADMIN` or `APP_ORIGIN_ANDROID_DEV` matches request origin
- Check exact origin match (including protocol and port)
- Look for "CORS: Blocked origin" in server logs

## Security Notes

1. **Never expose** `SUPABASE_SERVICE_ROLE_KEY` to clients
2. **Always use HTTPS** in production for token transmission
3. **Tokens expire** - default 1 hour, implement refresh flow for production
4. **Rate limiting** is applied per user/IP
5. **CORS is strict** - only configured origins allowed
6. **Audit logging** - all auth events logged with request IDs

## Project Structure

```
src/
├── index.ts              # Entry point
├── server.ts             # Fastify server setup
├── config/               # Configuration
│   └── index.ts
├── plugins/
│   ├── auth.ts          # JWKS auth plugin
│   └── cors.ts          # CORS plugin
├── routes/
│   ├── health.ts        # Health endpoints
│   └── v1/
│       ├── index.ts     # V1 route registration
│       ├── auth.ts      # Auth endpoints
│       ├── chat.ts      # Chat endpoints
│       ├── memory.ts    # Memory endpoints
│       └── admin.ts     # Admin endpoints
├── utils/
│   ├── guards.ts        # Auth guards
│   ├── error-handler.ts # Global error handler
│   └── validator.ts     # JSON Schema validation
├── types/
│   └── auth.ts          # TypeScript types
└── db/
    └── profiles.ts      # Database client
```

## Resources

- [Fastify Docs](https://www.fastify.io/docs/latest/)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [JWKS Explained](https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-key-sets)
- [JWT Debugger](https://jwt.io/)
- [Project Documentation](../../docs/)