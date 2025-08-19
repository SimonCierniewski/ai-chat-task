# API Contracts

## Overview

This document defines the complete API contracts for all Phase 4 endpoints. All contracts are enforced using JSON Schema validation with Ajv and TypeScript types from `@prototype/shared`.

## Base URL

```
https://api.example.com/api/v1
```

## Authentication

All endpoints require JWT authentication via Bearer token except where noted.

```http
Authorization: Bearer <jwt-token>
```

## Endpoints

### 1. Chat Streaming

Stream AI responses via Server-Sent Events (SSE) with memory context and token budget enforcement.

#### `POST /api/v1/chat`

**Request Body:**

```typescript
interface ChatRequest {
  message: string;         // Required, 1-4000 chars
  useMemory?: boolean;     // Default: false
  sessionId?: string;      // Format: session-YYYYMMDD-HHMMSS-XXXX
  model?: string;          // Enum: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo']
}

// Internal Context Budget (Phase 5)
interface TokenBudget {
  total: 4000;       // Total prompt budget
  memory: 1500;      // Max tokens for memory context
  system: 200;       // Max tokens for system prompt
  user: 2000;        // Max tokens for user message
}
```

**Example Request:**

```json
{
  "message": "Tell me about quantum computing",
  "useMemory": true,
  "sessionId": "session-20240101-120000-a1b2",
  "model": "gpt-4-mini"
}
```

**Response:** SSE stream (see [SSE_CONTRACT.md](./SSE_CONTRACT.md))

**Validation Schema:**

```json
{
  "type": "object",
  "required": ["message"],
  "properties": {
    "message": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4000
    },
    "useMemory": {
      "type": "boolean",
      "default": false
    },
    "sessionId": {
      "type": "string",
      "pattern": "^session-[0-9]{8}-[0-9]{6}-[A-Za-z0-9]{4}$"
    },
    "model": {
      "type": "string",
      "enum": ["gpt-4-mini", "gpt-4", "gpt-3.5-turbo"],
      "default": "gpt-4-mini"
    }
  },
  "additionalProperties": false
}
```

---

### 2. Memory Management

#### `POST /api/v1/memory/upsert`

Upsert facts/edges to the knowledge graph.

**Request Body:**

```typescript
interface MemoryUpsertRequest {
  facts: CreateGraphEdge[];
}

interface CreateGraphEdge {
  subject: string;                    // 1-200 chars
  predicate: GraphPredicate;          // See predicate enum below
  object: string;                     // 1-500 chars
  confidence?: number;                // 0-1, default: 0.5
  source_message_id?: string | null;
  metadata?: GraphEdgeMetadata;
}

type GraphPredicate = 
  | 'likes' | 'dislikes' | 'prefers'
  | 'works_at' | 'worked_at'
  | 'located_in' | 'lives_in'
  | 'knows' | 'uses' | 'owns'
  | 'interested_in' | 'expert_in' | 'learning'
  | 'speaks_language' | 'has_role'
  | 'manages' | 'reports_to' | 'collaborates_with';
```

**Example Request:**

```json
{
  "facts": [
    {
      "subject": "user",
      "predicate": "works_at",
      "object": "OpenAI",
      "confidence": 0.9,
      "metadata": {
        "session_id": "session-20240101-120000-a1b2",
        "extraction_method": "explicit"
      }
    },
    {
      "subject": "user",
      "predicate": "interested_in",
      "object": "quantum computing",
      "confidence": 0.7
    }
  ]
}
```

**Response:**

```typescript
interface MemoryUpsertResponse {
  success: boolean;
  upserted: number;
  errors?: string[];
}
```

**Example Response:**

```json
{
  "success": true,
  "upserted": 2
}
```

#### `GET /api/v1/memory/search`

Search memory for relevant context.

**Query Parameters:**

```typescript
interface MemorySearchQuery {
  q?: string;      // Search query, 1-500 chars
  limit?: number;  // 1-50, default: 10
}
```

**Example Request:**

```http
GET /api/v1/memory/search?q=quantum%20computing&limit=5
```

**Response:**

```typescript
interface MemorySearchResponse {
  results: RetrievalResult[];
  query: string;
  count: number;
  total_available?: number;
  search_time_ms?: number;
}

interface RetrievalResult {
  content: string;
  score: number;  // 0-1 relevance score
  metadata?: {
    source?: string;
    timestamp?: string;
    session_id?: string;
    message_id?: string;
    fact_type?: 'message' | 'fact' | 'summary';
    [key: string]: any;
  };
}
```

**Example Response:**

```json
{
  "results": [
    {
      "content": "User is interested in quantum computing",
      "score": 0.92,
      "metadata": {
        "fact_type": "fact",
        "session_id": "session-20240101-120000-a1b2"
      }
    },
    {
      "content": "Discussed quantum entanglement and superposition principles",
      "score": 0.85,
      "metadata": {
        "fact_type": "message",
        "timestamp": "2024-01-01T12:00:00Z"
      }
    }
  ],
  "query": "quantum computing",
  "count": 2,
  "total_available": 15,
  "search_time_ms": 42
}
```

---

### 3. Admin Endpoints

All admin endpoints require `role: 'admin'`.

#### `GET /api/v1/admin/users`

List all users with redacted sensitive information and usage statistics.

**Response:**

```typescript
interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  fetched_at: string;
}

interface AdminUser {
  id: string;                    // User UUID
  email: string;                 // Email address (from auth.users)
  role: 'user' | 'admin';        // User role
  created_at: string;            // User creation timestamp
  last_sign_in_at?: string;      // Last sign-in time (if available)
  message_count?: number;        // Total messages sent
  total_cost_usd?: number;       // Total API usage cost
}
```

**Example Response:**

```json
{
  "users": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "role": "user",
      "created_at": "2024-01-01T00:00:00Z",
      "last_sign_in_at": "2024-01-15T14:30:00Z",
      "message_count": 142,
      "total_cost_usd": 0.042156
    },
    {
      "id": "admin-550e8400-e29b-41d4-a716",
      "email": "admin@example.com",
      "role": "admin", 
      "created_at": "2024-01-01T00:00:00Z",
      "last_sign_in_at": "2024-01-19T09:15:00Z",
      "message_count": 23,
      "total_cost_usd": 0.008934
    }
  ],
  "total": 2,
  "fetched_at": "2024-01-19T16:00:00Z"
}
```

#### `GET /api/v1/admin/metrics`

Get aggregated usage metrics, KPIs, and time series data from the `daily_usage_view`.

**Query Parameters:**

```typescript
interface AdminMetricsQuery {
  from?: string;      // ISO date (YYYY-MM-DD), defaults to 30 days ago
  to?: string;        // ISO date (YYYY-MM-DD), defaults to today
  userId?: string;    // UUID - filter by specific user
  model?: string;     // Filter by specific AI model
}
```

**Example Request:**

```http
GET /api/v1/admin/metrics?from=2024-01-01&to=2024-01-31&userId=550e8400-e29b-41d4-a716-446655440000
```

**Response:**

```typescript
interface AdminMetricsResponse {
  period: {
    from: string;                 // Date range queried
    to: string;
  };
  kpis: {
    total_messages: number;       // Total API calls
    unique_users: number;         // Number of unique users
    total_cost_usd: number;       // Total cost (6 decimal precision)
    avg_ttft_ms: number;          // Average time to first token
    avg_duration_ms: number;      // Average request duration
  };
  time_series: Array<{
    day: string;                  // YYYY-MM-DD
    messages: number;             // API calls for this day
    users: number;                // Active users (approximate)
    cost_usd: number;             // Total cost for day
    avg_ttft_ms: number;          // Average TTFT for day
  }>;
}
```

**Example Response:**

```json
{
  "period": {
    "from": "2024-01-01",
    "to": "2024-01-31"
  },
  "kpis": {
    "total_messages": 1523,
    "unique_users": 42,
    "total_cost_usd": 2.456789,
    "avg_ttft_ms": 320.45,
    "avg_duration_ms": 1250.80
  },
  "time_series": [
    {
      "day": "2024-01-01",
      "messages": 48,
      "users": 1,
      "cost_usd": 0.078234,
      "avg_ttft_ms": 310.2
    },
    {
      "day": "2024-01-02", 
      "messages": 67,
      "users": 1,
      "cost_usd": 0.112456,
      "avg_ttft_ms": 295.8
    }
  ]
}
```

#### `POST /api/v1/admin/models/pricing`

Upsert pricing information for AI models used in cost calculations. Updates the `models_pricing` table.

**Request Body:**

```typescript
interface ModelPricingUpdateRequest {
  model: string;                    // Required, 1-100 chars
  input_per_mtok: number;           // Cost per million input tokens (0-1000)
  output_per_mtok: number;          // Cost per million output tokens (0-1000)
  cached_input_per_mtok?: number;   // Optional: cost for cached tokens (0-1000)
}
```

**Example Request:**

```json
{
  "model": "gpt-4o-mini",
  "input_per_mtok": 0.15,
  "output_per_mtok": 0.60,
  "cached_input_per_mtok": 0.075
}
```

**Response:**

```typescript
interface ModelPricingUpdateResponse {
  success: boolean;
  model: string;
  pricing: {
    input_per_mtok: number;
    output_per_mtok: number;
    cached_input_per_mtok: number | null;
  };
  updated_at: string;             // ISO timestamp
}
```

**Example Response:**

```json
{
  "success": true,
  "model": "gpt-4o-mini",
  "pricing": {
    "input_per_mtok": 0.15,
    "output_per_mtok": 0.60,
    "cached_input_per_mtok": 0.075
  },
  "updated_at": "2024-01-19T16:00:00.000Z"
}
```

## Error Responses

All errors follow this format:

```typescript
interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  req_id: string;
  validation?: any;  // For validation errors
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHENTICATED` | 401 | Missing or invalid authentication |
| `TOKEN_EXPIRED` | 401 | JWT token has expired |
| `INVALID_TOKEN` | 401 | Malformed JWT |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

### Example Error Response

```json
{
  "error": "Validation Error",
  "message": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "req_id": "abc123def456",
  "validation": [
    {
      "instancePath": "/message",
      "schemaPath": "#/properties/message/minLength",
      "keyword": "minLength",
      "params": { "limit": 1 },
      "message": "must NOT have fewer than 1 characters"
    }
  ]
}
```

## Rate Limiting

Rate limits are applied per user (if authenticated) or per IP address using in-memory buckets:

- **Default endpoints:** 100 requests per 60 seconds (`RATE_MAX_REQUESTS`)
- **Chat endpoint (`/api/v1/chat`):** 20 requests per 60 seconds (`RATE_MAX_REQUESTS_CHAT`)

### Rate Limit Headers

All responses include rate limit information:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1642678234
X-RateLimit-Window: 60
```

### Rate Limit Exceeded Response

When rate limit is exceeded, returns HTTP 429:

```json
{
  "error": "Too many requests",
  "code": "RATE_LIMITED",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "details": {
    "limit": 100,
    "window_ms": 60000,
    "reset_time": 1642678234000
  }
}
```

### Configuration

Rate limits are configurable via environment variables:

- `RATE_WINDOW_MS`: Time window in milliseconds (default: 60000)
- `RATE_MAX_REQUESTS`: Max requests per window for regular endpoints (default: 100)
- `RATE_MAX_REQUESTS_CHAT`: Max requests per window for chat endpoint (default: 20)

Rate limit headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704123660
```

## CORS

Allowed origins are configured via environment variables:

- `APP_ORIGIN_ADMIN`: Admin dashboard origin
- `APP_ORIGIN_ANDROID_DEV`: Android development origin

Blocked origins receive `403 Forbidden` with code `FORBIDDEN`.

## Versioning

API version is included in the URL path: `/api/v1/...`

Breaking changes will increment the version number.

## TypeScript Integration

All DTOs and schemas are available in the shared package:

```typescript
import {
  ChatRequest,
  MemoryUpsertRequest,
  AdminMetricsQuery,
  // ... other types
  chatRequestSchema,
  memoryUpsertRequestSchema,
  adminMetricsQuerySchema,
  // ... other schemas
} from '@prototype/shared';
```

## Validation

All request validation is performed using Ajv with JSON Schema. Schemas are:

1. Defined in TypeScript in `@prototype/shared`
2. Compiled at server startup for performance
3. Applied to all incoming requests
4. Return detailed validation errors

## Notes

- All timestamps are ISO 8601 format in UTC
- All UUIDs are lowercase, hyphenated format
- Costs are in USD with 6 decimal precision
- Token counts are integers
- Confidence scores are 0-1 floating point