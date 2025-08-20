# Architecture Overview

## System Components

### 1. API Service (`/apps/api`)

**Purpose**: Backend service providing REST/GraphQL endpoints for data operations

**Responsibilities**:

- Authentication & authorization (Supabase JWT verification)
- Business logic execution
- Database operations (Supabase/PostgreSQL)
- External service integrations (OpenAI, Zep)
- WebSocket/SSE connections for streaming
- Telemetry event tracking

**Technology Stack**:

- Framework: Fastify (TypeScript)
- Database: PostgreSQL via Supabase
- Auth: Supabase with JWKS verification
- Memory: Zep v3 for conversation history
- AI: OpenAI with SSE streaming
- API Style: REST with SSE endpoints

**Key Integrations**:

- **Supabase**: Authentication, database, telemetry storage
- **Zep v3**: Conversation memory and knowledge graph ([details](./ZEP_INTEGRATION.md))
- **OpenAI**: LLM with streaming responses
- **Telemetry**: Event tracking and cost calculation ([details](./TELEMETRY.md))

**Environment Variables**:

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-only)
- `ZEP_API_KEY` - Zep API key (server-only)
- `ZEP_BASE_URL` - Zep API endpoint
- `OPENAI_API_KEY` - OpenAI API key
- `JWT_SECRET` - Authentication token secret
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

### 2. Admin Dashboard (`/apps/admin`)

**Purpose**: Web-based management interface for administrative operations

**Responsibilities**:

- User management
- Content management
- Analytics dashboard
- System configuration
- Monitoring & logs

**Technology Considerations**:

- Framework: Next.js, Vite + React, or Remix
- UI Library: Tailwind CSS, Material-UI, or Ant Design
- State Management: Zustand, Redux Toolkit, or Context API
- Data Fetching: TanStack Query, SWR, or native fetch

**Environment Variables**:

- `VITE_API_URL` / `NEXT_PUBLIC_API_URL` - API endpoint
- `VITE_APP_ENV` / `NEXT_PUBLIC_APP_ENV` - Environment identifier

### 3. Android Application (`/apps/android`)

**Purpose**: Mobile application for end users

**Responsibilities**:

- User authentication
- Core feature access
- Offline capabilities
- Push notifications
- Device-specific features (camera, location, etc.)

**Technology Considerations**:

- Approach: React Native, Flutter, or Native (Kotlin)
- Navigation: React Navigation or native solutions
- State: Redux/MobX for RN, Provider for Flutter
- Local Storage: AsyncStorage, SQLite, or Realm

**Environment Variables**:

- Stored in `local.properties` or environment-specific config files
- `API_BASE_URL` - Backend API endpoint
- `SENTRY_DSN` - Error tracking (if applicable)

### 4. Shared Package (`/packages/shared`)

**Purpose**: Centralized utilities, types, and business logic

**Contents**:

- TypeScript type definitions
- Validation schemas (Zod, Yup)
- Utility functions
- Constants and enums
- Shared business logic
- API client interfaces

**Export Structure**:

```typescript
// Types
export * from './types';
// Utils
export * from './utils';
// Constants
export * from './constants';
// Validators
export * from './validators';
```

### 5. Infrastructure (`/infra`)

**Purpose**: Deployment and infrastructure configuration

**Potential Contents**:

- Docker configurations
- Kubernetes manifests
- Terraform files
- CI/CD pipeline configs
- Environment-specific configs

## Data Flow

```
[Android App] ─────┐
                   ├──→ [API Service] ←→ [Supabase DB]
[Admin Dashboard] ─┘         ↑              ↑
                            │              │
                    [Shared Package]    [Telemetry]
                    (types, utils)
                            ↓
                      [Zep Memory] ←→ [OpenAI]
                      (US Region)     (Streaming)
```

### Memory & AI Integration

The system integrates with external AI services following these patterns:

1. **Zep Memory Management**: 
   - Multi-tenant collections using `user:{uuid}` naming ([details](./ZEP_COLLECTIONS.md))
   - Server-only access via API backend
   - US region deployment (latency considerations)

2. **OpenAI Integration**:
   - SSE streaming for real-time responses
   - Cost tracking via telemetry system
   - Model selection per request

3. **Telemetry & Monitoring**:
   - Event-based tracking in `telemetry_events` table
   - Cost calculation with precision rules ([details](./COSTS.md))
   - Daily aggregation for analytics ([details](./TELEMETRY.md))

## Environment Management

### Development

- Local `.env` files (never committed)
- Hot reloading enabled
- Debug logging active
- Local database instance

### Staging (if applicable)

- Environment variables from CI/CD secrets
- Similar to production with debug features
- Separate database instance

### Production

- Environment variables from secure vault
- Optimized builds
- Production database
- Error tracking enabled

## Security Considerations

1. **Authentication**: JWT tokens or session-based
2. **API Security**: Rate limiting, CORS configuration
3. **Data Validation**: Input sanitization at API boundary
4. **Secrets Management**: Environment variables, never hardcoded
5. **HTTPS**: Enforced in production
6. **Database**: Connection pooling, prepared statements

## Deployment Strategy

### Local Development

```bash
pnpm install
pnpm dev:api    # Terminal 1
pnpm dev:admin  # Terminal 2
# Android: Open in Android Studio
```

### Production Build

```bash
pnpm build:shared
pnpm build:api
pnpm build:admin
# Android: gradle build
```

### Deployment Options

- **API**: Docker container on Cloud Run, ECS, or VPS
- **Admin**: Static hosting on Vercel, Netlify, or S3+CloudFront
- **Android**: Google Play Store (AAB format)

## Monitoring & Observability

- **Logging**: Structured JSON logs
- **Error Tracking**: Sentry or similar
- **Metrics**: Basic health checks
- **APM**: Optional for production

## Scaling Considerations

For this prototype (1.5-3 day timeline):

- Monolithic API is sufficient
- Single database instance
- Client-side state management
- Basic caching strategy
- Horizontal scaling not required

Future considerations:

- Microservices split
- Redis for caching
- Message queue for async operations
- CDN for static assets
- Database read replicas
