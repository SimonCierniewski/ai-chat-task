# Railway Deployment Guide for API

## Prerequisites

1. Railway account ([railway.app](https://railway.app))
2. Railway CLI installed (optional): `npm install -g @railway/cli`
3. GitHub repository connected (recommended) or Railway CLI authenticated

## Deployment Methods

### Method 1: GitHub Integration (Recommended)

1. **Connect GitHub Repository**
   - Go to [Railway Dashboard](https://railway.app/dashboard)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository: `SimonCierniewski/ai-chat-task`
   - Railway will auto-detect the monorepo structure

2. **Configure Service**
   - Service name: `ai-chat-api`
   - Root directory: `/` (keep as monorepo root)
   - Build command will be auto-detected from `railway.json`

3. **Set Environment Variables**
   ```
   Required variables (add in Railway dashboard):
   
   # Supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   DATABASE_URL=postgresql://...
   
   # OpenAI
   OPENAI_API_KEY=sk-...
   OPENAI_DEFAULT_MODEL=gpt-4o-mini
   
   # Zep Memory
   ZEP_API_KEY=your-zep-api-key
   
   # JWT (for dev mode)
   JWT_SECRET=your-secret-at-least-32-chars
   USE_DEV_JWT=false  # Set to true for development JWT
   
   # Optional
   LOG_LEVEL=info
   SSE_HEARTBEAT_MS=10000
   ```

4. **Deploy**
   - Click "Deploy" 
   - Railway will build and deploy automatically
   - Monitor logs in the dashboard

### Method 2: Railway CLI

1. **Install and Login**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Initialize Project**
   ```bash
   # From repository root
   railway link  # Link to existing project or create new
   ```

3. **Deploy Script**
   ```bash
   # Use the provided deploy script
   ./scripts/deploy-railway.sh
   ```

### Method 3: Docker Deployment

Railway also supports Docker. Create a `Dockerfile` in the API directory:

```dockerfile
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @prototype/shared build
RUN pnpm --filter @prototype/api build

FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=builder /app .
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["pnpm", "start"]
```

## Post-Deployment

### Health Check
Your API health endpoint will be available at:
```
https://your-app.railway.app/health
```

### Monitoring
- View logs: Railway Dashboard → Your Service → Logs
- Metrics: Railway Dashboard → Your Service → Metrics
- Restart: Railway Dashboard → Your Service → Settings → Restart

### Custom Domain (Optional)
1. Go to Settings → Domains
2. Add custom domain
3. Update DNS records as instructed

## Environment-Specific Settings

### Production Optimizations
Railway automatically sets:
- `NODE_ENV=production`
- `PORT` (use `process.env.PORT`)

### Database Connection
For Supabase connection pooling:
```
DATABASE_URL=postgresql://...?pgbouncer=true&connection_limit=1
```

### CORS Configuration
Update allowed origins for production:
```
CORS_ORIGINS=https://your-admin-app.vercel.app,https://your-domain.com
```

## Troubleshooting

### Build Failures
1. Check build logs in Railway dashboard
2. Ensure all dependencies are in `package.json`
3. Verify monorepo paths are correct

### Runtime Errors
1. Check all environment variables are set
2. Verify Supabase/OpenAI/Zep credentials
3. Check application logs for specific errors

### Memory Issues
- Default memory: 512MB
- Upgrade if needed: Settings → Resources

### Connection Issues
- Ensure health check endpoint responds
- Check SSL/TLS settings if using custom domain
- Verify CORS configuration

## Rollback

To rollback to a previous deployment:
1. Go to Railway Dashboard → Your Service
2. Click "Deployments" tab
3. Find previous successful deployment
4. Click "..." → "Rollback to this deployment"

## CI/CD Pipeline

Railway automatically deploys on:
- Push to main branch (production)
- Pull request (preview environments)

To disable auto-deploy:
Settings → Triggers → Disable "Deploy on push"

## Cost Optimization

- Use sleep/wake schedules for development environments
- Monitor usage in Railway dashboard
- Consider reserved instances for production

## Security Best Practices

1. **Never commit secrets** - Use Railway environment variables
2. **Enable 2FA** on Railway account
3. **Restrict deployment** to specific branches
4. **Use read-only database credentials** where possible
5. **Enable audit logs** in Railway dashboard

## Support

- Railway Discord: [discord.gg/railway](https://discord.gg/railway)
- Railway Docs: [docs.railway.app](https://docs.railway.app)
- Status Page: [status.railway.app](https://status.railway.app)