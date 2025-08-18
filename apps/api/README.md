# API Service

Fastify-based backend API with Supabase JWT authentication via JWKS.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Start development server
pnpm dev
```

Server runs at `http://localhost:3000`

## 🔐 Authentication

The API uses Supabase JWTs verified via JWKS endpoint. All routes except health/docs require valid tokens.

### Token Verification Flow

1. Extract token from `Authorization: Bearer <token>` header
2. Verify signature using JWKS from Supabase
3. Load user role from profiles table (or stub)
4. Attach `req.user = { id, email, role }` to request

### Endpoints

| Endpoint | Auth Required | Admin Only | Description |
|----------|--------------|------------|-------------|
| `GET /` | No | No | API info |
| `GET /health` | No | No | Health check |
| `GET /api/me` | Yes | No | Current user info |
| `GET /api/auth/status` | No | No | Auth status check |
| `GET /api/admin/users` | Yes | Yes | List all users |
| `GET /api/admin/metrics` | Yes | Yes | System metrics |

## 🧪 Manual Testing

### 1. Get a Supabase Token

#### Option A: Use Supabase Dashboard
1. Go to your Supabase project
2. Navigate to Authentication → Users
3. Create a test user or use existing
4. Use SQL Editor to get a token:

```sql
-- Get user ID
SELECT id, email FROM auth.users;

-- Generate test token (development only!)
SELECT auth.jwt() as token;
```

#### Option B: Use Supabase Client (Recommended)

```javascript
// In browser console or Node.js script
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://pjktmicpanriimktvcam.supabase.co',
  'YOUR_ANON_KEY'
);

// Sign in with magic link
const { data, error } = await supabase.auth.signInWithOtp({
  email: 'test@example.com'
});

// After clicking magic link, get session
const { data: { session } } = await supabase.auth.getSession();
console.log('Token:', session.access_token);
```

### 2. Test Endpoints

```bash
# Set your token
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test health (no auth)
curl http://localhost:3000/health

# Test auth status (optional auth)
curl http://localhost:3000/api/auth/status \
  -H "Authorization: Bearer $TOKEN"

# Test protected endpoint
curl http://localhost:3000/api/me \
  -H "Authorization: Bearer $TOKEN"

# Test admin endpoint (requires admin role)
curl http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Expected Responses

#### Successful Authentication
```json
{
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "role": "user"
  }
}
```

#### 401 Unauthorized (Invalid/Missing Token)
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

#### 403 Forbidden (Not Admin)
```json
{
  "error": "Forbidden",
  "message": "Admin role required"
}
```

## 🔧 Development

### Environment Variables

```bash
# Required
SUPABASE_URL=https://pjktmicpanriimktvcam.supabase.co
SUPABASE_JWT_AUD=authenticated
JWKS_URI=https://pjktmicpanriimktvcam.supabase.co/auth/v1/.well-known/jwks.json

# Optional
PORT=3000
LOG_LEVEL=debug
NODE_ENV=development
```

### Database Stub

Currently using an in-memory stub for profiles. Replace `src/db/profiles.ts` with actual Supabase client when ready:

```typescript
// Replace stub with:
const { data } = await supabaseAdmin
  .from('profiles')
  .select('role')
  .eq('user_id', userId)
  .single();
```

### Testing with Different Roles

The stub includes two test users:
- `test-user-id`: Regular user
- `test-admin-id`: Admin user

To test with real users:
1. Create users in Supabase
2. Update their profile role in database
3. Get their JWT token
4. Test endpoints

## 🏗 Project Structure

```
src/
├── index.ts           # Entry point
├── server.ts          # Fastify server setup
├── plugins/
│   └── auth.ts        # JWKS auth plugin
├── utils/
│   └── guards.ts      # Auth guards (requireAdmin)
├── types/
│   └── auth.ts        # TypeScript types
└── db/
    └── profiles.ts    # Database client (stub)
```

## 📝 Adding Protected Routes

```typescript
import { requireAdmin, requireAuth } from './utils/guards';

// Protected route (any authenticated user)
fastify.get(
  '/api/protected',
  { preHandler: requireAuth },
  async (request, reply) => {
    return { userId: request.user.id };
  }
);

// Admin-only route
fastify.get(
  '/api/admin/data',
  { preHandler: requireAdmin },
  async (request, reply) => {
    return { secret: 'admin data' };
  }
);

// Check role in handler
fastify.get('/api/conditional', async (request, reply) => {
  if (request.user?.role === 'admin') {
    return { all: 'data' };
  }
  return { limited: 'data' };
});
```

## 🐛 Troubleshooting

### Token Expired
- Tokens expire after 1 hour by default
- Get a fresh token from Supabase

### JWKS Fetch Failed
- Check internet connection
- Verify JWKS_URI is correct
- Check Supabase project is active

### Role Not Loading
- Ensure profiles table exists
- Check user has a profile record
- Verify database connection

### CORS Issues
- CORS will be configured in later phase
- For now, test with curl or Postman

## 📚 Resources

- [Fastify Docs](https://www.fastify.io/docs/latest/)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [JWKS Explained](https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-key-sets)
- [JWT Debugger](https://jwt.io/)