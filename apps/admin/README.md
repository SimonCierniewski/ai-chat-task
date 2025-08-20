# Admin Dashboard

Next.js-based admin panel with Supabase Auth integration and role-based access control.

## Features

- 🔐 **Magic Link Authentication** via Supabase
- 👥 **Role-Based Access Control** (admin-only pages)
- 📊 **Admin Dashboard** with telemetry and user management
- 🔄 **Session Management** with automatic refresh
- 🛡️ **Protected Routes** with role gating

## Setup

### 1. Install Dependencies

```bash
cd apps/admin
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```env
# Required environment variables
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

### 3. Start Development Server

```bash
pnpm dev
```

The admin dashboard will be available at http://localhost:3001

## Testing Authentication Flow

### 1. Login Flow

1. Navigate to http://localhost:3001
2. You'll be redirected to `/login` if not authenticated
3. Enter your email address
4. Click "Send Magic Link"
5. Check your email for the magic link
6. Click the link to authenticate
7. You'll be redirected to `/admin` after successful authentication

### 2. Role Gating

#### Testing as Regular User

1. Sign in with a user account that has `role: 'user'` in the profiles table
2. Try to access `/admin`
3. You should be redirected to `/unauthorized`

#### Testing as Admin

1. Sign in with a user account that has `role: 'admin'` in the profiles table
2. Access `/admin`
3. You should see the admin dashboard with all features

### 3. Creating Test Users

#### Via Supabase Dashboard

1. Go to your Supabase Dashboard
2. Navigate to Authentication → Users
3. Click "Invite User" or create via email
4. After user creation, go to Table Editor → profiles
5. Update the user's role to 'admin' or 'user'

#### Via SQL (Supabase SQL Editor)

```sql
-- Create admin user profile (after user signs up)
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'admin@example.com';

-- Verify user roles
SELECT id, email, role, created_at 
FROM profiles 
ORDER BY created_at DESC;
```

## Auth Components

### Protected Routes

Use the `ProtectedRoute` component to protect pages:

```tsx
import { ProtectedRoute } from '@/components/auth/protected-route'

export default function AdminOnlyPage() {
  return (
    <ProtectedRoute requireAdmin={true}>
      {/* Admin-only content */}
    </ProtectedRoute>
  )
}
```

### Auth Status Display

Use the `AuthStatus` component to show current user info:

```tsx
import { AuthStatus } from '@/components/auth/auth-status'

export default function Header() {
  return (
    <header>
      <AuthStatus />
    </header>
  )
}
```

### Using Auth Hook

Access auth state in any client component:

```tsx
'use client'

import { useAuth } from '@/providers/auth-provider'

export default function MyComponent() {
  const { user, profile, loading, signOut } = useAuth()
  
  if (loading) return <div>Loading...</div>
  if (!user) return <div>Not authenticated</div>
  
  return (
    <div>
      <p>Email: {profile?.email}</p>
      <p>Role: {profile?.role}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  )
}
```

## API Routes

The admin panel provides server-side API routes for admin operations:

- `/api/users` - Get paginated list of users (admin only)
- `/api/users/[userId]/role` - Update user role (admin only)
- `/api/pricing` - Get/update model pricing (admin only)
- `/api/telemetry/metrics` - Get telemetry metrics (admin only)

## Project Structure

```
src/
├── app/
│   ├── admin/           # Admin dashboard (protected)
│   ├── api/            # API routes
│   │   └── auth/       # Auth-related endpoints
│   ├── auth/           # Auth callback
│   ├── login/          # Login page
│   └── unauthorized/   # Access denied page
├── components/
│   └── auth/           # Auth components
│       ├── auth-status.tsx       # User status display
│       └── protected-route.tsx   # Route protection wrapper
├── lib/
│   └── supabase/       # Supabase clients
│       ├── client.ts   # Browser client
│       ├── server.ts   # Server client
│       └── middleware.ts # Session middleware
└── providers/
    └── auth-provider.tsx # Auth context provider
```

## Security Notes

- **Never expose service keys** - Only use anon keys in client-side code
- **Server-side validation** - Always validate roles on the server
- **CORS protection** - API should only accept requests from allowed origins
- **Session management** - Sessions are automatically refreshed via middleware

## Troubleshooting

### Common Issues

1. **"Not authenticated" error**
   - Check if Supabase URL and anon key are correct
   - Verify cookies are being set properly
   - Check browser console for errors

2. **Role not updating**
   - Ensure profile exists in profiles table
   - Check if API is returning correct role
   - Try refreshing the profile: `refreshProfile()`

3. **Magic link not working**
   - Verify redirect URL in Supabase Dashboard
   - Check spam folder for email
   - Ensure email provider is configured in Supabase

4. **CORS errors**
   - Verify `APP_ORIGIN_ADMIN` is set correctly in API
   - Check that API allows `http://localhost:3001`

## Development Commands

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## Environment Variables

See `.env.example` for all available configuration options and [docs/ADMIN_ENV.md](./docs/ADMIN_ENV.md) for detailed documentation.

Key variables:
- `NEXT_PUBLIC_API_BASE_URL` - Backend API URL
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `NEXT_PUBLIC_APP_URL` - This app's URL for redirects

### 🔒 Security Warning

**NEVER expose `SUPABASE_SERVICE_ROLE_KEY` to the client!**

This key provides full admin access to your database and must only be used in:
- Server Components
- API Route Handlers  
- Server-side functions
- Middleware

If you accidentally expose this key:
1. Immediately rotate it in Supabase Dashboard
2. Check audit logs for unauthorized access
3. Review all environment variable usage

For more details on security best practices, see [docs/ADMIN_ENV.md](./docs/ADMIN_ENV.md#server-only-environment-variables-never-expose-to-client).