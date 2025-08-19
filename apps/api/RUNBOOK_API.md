# API Service Runbook

## Overview

The API service is a Fastify-based Node.js application providing versioned REST endpoints with SSE streaming support for AI chat functionality.

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your values

# Development mode
pnpm dev

# Production build
pnpm build
pnpm start
```

## Environment Variables

### Required

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for admin operations)

### CORS Configuration

- `APP_ORIGIN_ADMIN`: Admin dashboard origin (e.g., `https://admin.example.com`)
- `APP_ORIGIN_ANDROID_DEV`: Android development origin (e.g., `http://localhost:8081`)

**Important**: If neither CORS origin is configured, all cross-origin requests will be blocked with 403.

### Optional

- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: 0.0.0.0)
- `NODE_ENV`: Environment (development/production)
- `LOG_LEVEL`: Logging level (debug/info/warn/error)
- `OPENAI_API_KEY`: OpenAI API key for chat functionality
- `OPENAI_DEFAULT_MODEL`: Default model (default: gpt-4-mini)
- `ZEP_API_KEY`: Zep memory service API key
- `ZEP_BASE_URL`: Zep API base URL

## Boot Flags

### Development Mode

```bash
NODE_ENV=development pnpm dev
```

Features:
- Pretty logging with timestamps
- Stack traces in errors
- Auto-reload on file changes

### Production Mode

```bash
NODE_ENV=production pnpm start
```

Features:
- JSON structured logging
- Minimal error exposure
- Performance optimizations

### Debug Mode

```bash
LOG_LEVEL=debug pnpm dev
```

Enables verbose logging for troubleshooting.

## Health Checks

### Basic Health

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "ok": true,
  "version": "0.0.1",
  "uptime_s": 123,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "environment": "development"
}
```

### Readiness Check

```bash
curl http://localhost:3000/ready
```

Response (when ready):
```json
{
  "ready": true,
  "services": {
    "database": true,
    "auth": true
  }
}
```

Returns 503 if not ready.

## API Structure

All API endpoints are versioned under `/api/v1`:

### Public Endpoints

- `GET /health` - Health check (no auth)
- `GET /ready` - Readiness check (no auth)
- `GET /api/v1` - API version info

### Auth Endpoints

- `GET /api/v1/auth/status` - Check authentication status
- `POST /api/v1/auth/on-signup` - Webhook for new user signup

### Protected Endpoints (requires auth)

- `GET /api/v1/me` - Get current user info
- `POST /api/v1/chat` - SSE chat stream
- `GET /api/v1/memory/search` - Search memory
- `POST /api/v1/memory/upsert` - Update memory

### Admin Endpoints (requires admin role)

- `GET /api/v1/admin/users` - List all users
- `GET /api/v1/admin/metrics` - Get telemetry metrics
- `POST /api/v1/admin/models/pricing` - Update model pricing

## Request IDs

Every request is assigned a unique ID for tracing:

- Header: `x-request-id`
- Log field: `req_id`
- Response field (on error): `req_id`

Example:
```bash
curl -H "x-request-id: custom-123" http://localhost:3000/health
```

## Logging

### Log Format

Development:
```
[req_id] HH:MM:ss Z | INFO: Incoming request
```

Production:
```json
{
  "level": 30,
  "time": 1234567890,
  "req_id": "abc123",
  "msg": "Incoming request",
  "method": "GET",
  "url": "/health"
}
```

### Log Levels

- `debug`: Detailed debugging information
- `info`: General information (default)
- `warn`: Warning messages
- `error`: Error messages
- `fatal`: Fatal errors (causes shutdown)

## Error Handling

All errors return JSON with consistent structure:

```json
{
  "error": "Error Type",
  "message": "Human-readable message",
  "statusCode": 400,
  "req_id": "abc123"
}
```

### Common Error Codes

- `400`: Bad Request (validation failed)
- `401`: Unauthorized (missing/invalid auth)
- `403`: Forbidden (CORS violation or insufficient permissions)
- `404`: Not Found
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error
- `503`: Service Unavailable (not ready)

## CORS Handling

CORS is strictly enforced:

1. Only configured origins are allowed
2. Blocked origins receive 403 Forbidden
3. Credentials are supported
4. Custom headers: `x-request-id`, `Authorization`

Test CORS:
```bash
curl -H "Origin: https://evil.com" http://localhost:3000/health
# Returns 403 Forbidden
```

## JSON Schema Validation

Request bodies are validated using Ajv with:

- Type coercion enabled
- Default values applied
- Additional properties removed
- All errors reported

Example validation error:
```json
{
  "error": "Validation Error",
  "message": "Request validation failed",
  "statusCode": 400,
  "validation": [
    {
      "instancePath": "/message",
      "message": "must have required property 'message'"
    }
  ],
  "req_id": "abc123"
}
```

## SSE Streaming

The `/api/v1/chat` endpoint supports Server-Sent Events:

```bash
curl -N -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}' \
  http://localhost:3000/api/v1/chat
```

Event types:
- `token`: Streaming text chunks
- `usage`: Token usage and cost
- `done`: Stream complete

## Monitoring

### Key Metrics to Watch

1. **Response Times**: Logged for every request
2. **Error Rates**: Track 4xx and 5xx responses
3. **CORS Violations**: Monitor blocked origins
4. **Auth Failures**: Track 401 responses
5. **Uptime**: Available via `/health` endpoint

### Sample Monitoring Query

```bash
# Check server status
curl -s http://localhost:3000/health | jq .

# Monitor logs (development)
pnpm dev | grep "ERROR"

# Check readiness
while ! curl -sf http://localhost:3000/ready; do
  echo "Waiting for server..."
  sleep 1
done
```

## Troubleshooting

### Server Won't Start

1. Check port availability: `lsof -i :3000`
2. Verify environment variables are set
3. Check logs for fatal errors
4. Ensure database connection

### CORS Errors

1. Verify `APP_ORIGIN_ADMIN` or `APP_ORIGIN_ANDROID_DEV` is set
2. Check exact origin match (including protocol)
3. Look for "CORS: Blocked origin" in logs

### Auth Failures

1. Verify JWT token is valid
2. Check `SUPABASE_JWT_SECRET` or `JWKS_URI`
3. Ensure user has required role for endpoint
4. Check token expiration

### High Response Times

1. Check `/health` uptime for recent restart
2. Monitor memory usage: `ps aux | grep node`
3. Check external service latency (Supabase, OpenAI, Zep)
4. Review logs for slow queries

## Security Notes

1. **Never log sensitive data** (tokens, keys, passwords)
2. **CORS is enforced** - configure origins properly
3. **Rate limiting** is implemented per-user/IP
4. **All responses are JSON** - no HTML injection
5. **Request IDs** enable tracing without exposing internals

## Performance Tips

1. Use `NODE_ENV=production` in production
2. Set appropriate `LOG_LEVEL` (not debug in prod)
3. Monitor memory usage and restart if needed
4. Use connection pooling for database
5. Enable HTTP/2 if behind a proxy

## Deployment Checklist

- [ ] Set all required environment variables
- [ ] Configure CORS origins for production
- [ ] Set `NODE_ENV=production`
- [ ] Test health endpoint
- [ ] Verify auth is working
- [ ] Check CORS with production origins
- [ ] Monitor initial logs for errors
- [ ] Set up log aggregation
- [ ] Configure monitoring/alerts
- [ ] Document API endpoint URL