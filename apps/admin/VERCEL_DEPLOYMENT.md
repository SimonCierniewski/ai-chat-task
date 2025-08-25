# Vercel Deployment Guide for Admin Dashboard

## Prerequisites

1. Vercel account ([vercel.com](https://vercel.com))
2. GitHub repository connected
3. Vercel CLI (optional): `npm install -g vercel`

## Deployment Methods

### Method 1: Vercel Dashboard (Recommended)

#### Step 1: Import Project

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Import Git Repository:
   - Select **GitHub**
   - Choose `SimonCierniewski/ai-chat-task`
   - Click **"Import"**

#### Step 2: Configure Project

1. **Project Name**: `ai-chat-admin`

2. **Framework Preset**: Next.js (auto-detected)

3. **Root Directory**: Click "Edit" and set to:
   ```
   apps/admin
   ```

4. **Build and Output Settings**:
   - Build Command: `pnpm build` (or leave auto-detected)
   - Output Directory: `.next` (auto-detected)
   - Install Command: `pnpm install --frozen-lockfile`

5. **Node.js Version**: 20.x

#### Step 3: Environment Variables

Click **"Environment Variables"** and add:

```bash
# Required - Client Side (visible in browser)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_BASE_URL=https://your-api.railway.app

# Required - Server Side (secret)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional - Configuration
NEXT_PUBLIC_APP_NAME=AI Chat Admin
NEXT_PUBLIC_APP_VERSION=1.0.0
NEXT_PUBLIC_REGION=EU

# Optional - Feature Flags
NEXT_PUBLIC_FEATURES_PLAYGROUND=true
NEXT_PUBLIC_FEATURES_TELEMETRY=true
NEXT_PUBLIC_FEATURES_PRICING=true
NEXT_PUBLIC_FEATURES_SETTINGS=true
```

**Important**: 
- Variables starting with `NEXT_PUBLIC_` are exposed to the client
- Other variables are server-side only (more secure)

#### Step 4: Deploy

1. Click **"Deploy"**
2. Wait for build to complete (3-5 minutes)
3. Your app will be available at: `https://[project-name].vercel.app`

### Method 2: Vercel CLI

#### Step 1: Install and Login

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login
```

#### Step 2: Deploy from Repository Root

```bash
# From repository root
cd apps/admin

# Deploy
vercel

# Follow prompts:
# - Set up and deploy: Y
# - Which scope: Select your account
# - Link to existing project?: N (first time) or Y
# - Project name: ai-chat-admin
# - Directory: ./
# - Build Command: pnpm build
# - Output Directory: .next
# - Development Command: pnpm dev
```

#### Step 3: Set Environment Variables

```bash
# Set production variables
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add NEXT_PUBLIC_API_BASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production

# Or import from .env file
vercel env pull .env.vercel.example
```

### Method 3: Deploy Script

Create `scripts/deploy-vercel.sh`:

```bash
#!/bin/bash
cd apps/admin
vercel --prod --yes
```

## Configuration

### Custom Domain

1. Go to **Settings** → **Domains**
2. Add your domain: `admin.yourdomain.com`
3. Configure DNS:
   - Add CNAME record: `admin` → `cname.vercel-dns.com`
   - Or A record to Vercel's IPs

### Environment Variables by Environment

Vercel supports different variables for:
- **Production**: Main branch deployments
- **Preview**: PR deployments  
- **Development**: Local development

Set environment-specific variables:
```bash
vercel env add MY_VAR production
vercel env add MY_VAR preview  
vercel env add MY_VAR development
```

### Build Settings

The `vercel.json` file configures:
- Monorepo build commands
- Security headers
- Function timeouts
- Redirects

### Function Configuration

API routes have configurable timeouts:
```json
{
  "functions": {
    "app/api/*/route.ts": {
      "maxDuration": 30
    }
  }
}
```

## Production Optimizations

### 1. Edge Functions

Convert API routes to Edge Runtime for better performance:

```typescript
export const runtime = 'edge'; // Add to route.ts files
```

### 2. Image Optimization

Use Next.js Image component:
```tsx
import Image from 'next/image';
```

### 3. Static Generation

Pre-render pages at build time:
```typescript
export const dynamic = 'force-static';
```

### 4. Caching

Configure caching headers:
```typescript
export const revalidate = 3600; // Revalidate every hour
```

## Monitoring

### Analytics

1. Enable Vercel Analytics:
   - Go to **Analytics** tab
   - Click **Enable**

2. Add to app:
```bash
pnpm add @vercel/analytics
```

### Speed Insights

1. Enable Speed Insights:
   - Go to **Speed Insights** tab
   - Click **Enable**

2. Add to app:
```bash
pnpm add @vercel/speed-insights
```

### Logs

View logs in Vercel Dashboard:
- **Functions** tab: API route logs
- **Runtime Logs**: Application logs
- **Build Logs**: Deployment logs

## Troubleshooting

### Build Failures

1. **Monorepo not detected**:
   - Ensure `pnpm-workspace.yaml` is in root
   - Set root directory to `apps/admin`

2. **Dependencies not found**:
   - Check `pnpm install --frozen-lockfile` works locally
   - Ensure shared package builds first

3. **Environment variables missing**:
   - Check all `NEXT_PUBLIC_*` variables are set
   - Verify server-side variables for API routes

### Runtime Errors

1. **API routes failing**:
   - Check function logs in Vercel dashboard
   - Verify `SUPABASE_SERVICE_ROLE_KEY` is set
   - Check CORS settings

2. **Authentication issues**:
   - Verify Supabase project is running
   - Check redirect URLs in Supabase dashboard
   - Ensure cookies are enabled

3. **SSE not working**:
   - Vercel has 25-second timeout for functions
   - Consider using Edge Functions or external API

### Performance Issues

1. **Slow initial load**:
   - Enable Edge Functions
   - Optimize bundle size
   - Use dynamic imports

2. **High latency**:
   - Choose region close to users
   - Use Vercel Edge Network
   - Enable caching

## CI/CD Integration

### GitHub Integration

Automatic deployments on:
- Push to `main` → Production
- Pull Request → Preview deployment
- Comments on PR with preview URL

### Deployment Protection

1. Go to **Settings** → **Git**
2. Enable **Deployment Protection**
3. Require approval for production

### Environment Variable Encryption

All environment variables are encrypted at rest and in transit.

## Rollback

To rollback to previous deployment:

1. Go to **Deployments** tab
2. Find previous successful deployment
3. Click **...** → **Promote to Production**

Or via CLI:
```bash
vercel rollback
```

## Cost Optimization

### Free Tier Limits
- 100GB bandwidth
- 100GB-hours for Functions
- Unlimited deployments

### Pro Tips
- Use ISR (Incremental Static Regeneration)
- Optimize images with Next.js Image
- Enable Edge Functions for API routes
- Monitor usage in dashboard

## Security Best Practices

1. **Environment Variables**:
   - Never commit `.env` files
   - Use `NEXT_PUBLIC_` only for non-sensitive data
   - Rotate keys regularly

2. **Headers**:
   - Security headers configured in `vercel.json`
   - Enable CORS for specific origins only

3. **Authentication**:
   - Verify JWT tokens in middleware
   - Use Supabase RLS for data access

4. **Monitoring**:
   - Enable attack challenge mode if needed
   - Monitor function invocations
   - Set up alerts for errors

## Support

- Vercel Docs: [vercel.com/docs](https://vercel.com/docs)
- Next.js Docs: [nextjs.org/docs](https://nextjs.org/docs)
- Support: [vercel.com/support](https://vercel.com/support)
- Status: [vercel-status.com](https://vercel-status.com)