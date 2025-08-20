# Admin Panel Authentication Flow

## Simplified Architecture

The admin panel uses a **single-check architecture** to verify admin access, eliminating redundant database queries.

## Authentication Flow

### 1. Middleware (Single Check Point)
**File**: `/src/middleware.ts`

For all `/admin/*` routes:
1. Updates Supabase session
2. Verifies user is authenticated
3. **Makes ONE database query** to check if user has `role = 'admin'` in profiles table
4. Redirects to `/unauthorized` if not admin
5. Allows request to proceed if admin

### 2. Admin Pages (No Checks)
**Files**: `/src/app/admin/*.tsx`

- **NO authentication checks** - middleware already verified
- **NO role checks** - middleware already verified
- **NO ProtectedRoute wrapper needed**
- Pages can safely assume user is admin

### 3. Auth Provider (Optimized)
**File**: `/src/providers/auth-provider.tsx`

- For `/admin/*` paths: Sets role as 'admin' without fetching (trusts middleware)
- For other paths: Fetches actual role from API
- Reduces unnecessary API calls for admin pages

## Benefits

1. **Single Database Query**: Role is checked once in middleware
2. **Simplified Components**: Admin pages don't need auth logic
3. **Better Performance**: No redundant checks or API calls
4. **Clear Separation**: Middleware handles security, pages handle UI

## Security

- Middleware runs on **every request** to `/admin/*`
- Session is validated server-side using Supabase
- Role check uses RLS-protected profiles table
- No client-side role assumptions

## Non-Admin Routes

For non-admin authenticated routes (if any):
- Use `ProtectedRoute` component only where needed
- Auth provider will fetch role from API
- Middleware doesn't interfere with non-admin routes