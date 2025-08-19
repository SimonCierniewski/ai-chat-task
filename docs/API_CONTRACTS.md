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

Stream AI responses via Server-Sent Events (SSE).

#### `POST /api/v1/chat`

**Request Body:**

```typescript
interface ChatRequest {
  message: string;         // Required, 1-4000 chars
  useMemory?: boolean;     // Default: false
  sessionId?: string;      // Format: session-YYYYMMDD-HHMMSS-XXXX
  model?: string;          // Enum: ['gpt-4-mini', 'gpt-4', 'gpt-3.5-turbo']
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

List all users with statistics.

**Response:**

```typescript
interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  page?: number;
  per_page?: number;
}

interface AdminUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  created_at: string;
  updated_at?: string;
  last_active?: string;
  message_count?: number;
  session_count?: number;
  total_cost?: number;
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
      "last_active": "2024-01-15T14:30:00Z",
      "message_count": 142,
      "session_count": 8,
      "total_cost": 0.042156
    }
  ],
  "total": 1
}
```

#### `GET /api/v1/admin/metrics`

Get aggregated metrics and time series data.

**Query Parameters:**

```typescript
interface AdminMetricsQuery {
  from?: string;    // YYYY-MM-DD
  to?: string;      // YYYY-MM-DD
  userId?: string;  // UUID
  groupBy?: 'day' | 'week' | 'month';  // Default: 'day'
}
```

**Example Request:**

```http
GET /api/v1/admin/metrics?from=2024-01-01&to=2024-01-31&groupBy=day
```

**Response:**

```typescript
interface AdminMetricsResponse {
  metrics: {
    totalMessages: number;
    totalUsers: number;
    totalTokensIn: number;
    totalTokensOut: number;
    totalCost: number;
    avgResponseTime: number;  // milliseconds
    avgTTFT: number;          // milliseconds
    errorRate: number;        // 0-1
  };
  timeSeries?: MetricsDataPoint[];
  period: {
    from: string;
    to: string;
  };
  userId?: string;
}

interface MetricsDataPoint {
  date: string;
  messages: number;
  users: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  avg_response_time_ms?: number;
  avg_ttft_ms?: number;
  errors?: number;
}
```

**Example Response:**

```json
{
  "metrics": {
    "totalMessages": 1523,
    "totalUsers": 42,
    "totalTokensIn": 150234,
    "totalTokensOut": 320567,
    "totalCost": 2.456789,
    "avgResponseTime": 1250,
    "avgTTFT": 320,
    "errorRate": 0.012
  },
  "timeSeries": [
    {
      "date": "2024-01-01",
      "messages": 48,
      "users": 12,
      "tokens_in": 4523,
      "tokens_out": 9876,
      "cost_usd": 0.078234,
      "avg_response_time_ms": 1180,
      "avg_ttft_ms": 310
    }
  ],
  "period": {
    "from": "2024-01-01",
    "to": "2024-01-31"
  }
}
```

#### `POST /api/v1/admin/models/pricing`

Update model pricing (partial upsert).

**Request Body:**

```typescript
interface ModelPricingUpdateRequest {
  model: string;                  // Required, 1-50 chars, pattern: ^[a-z0-9-_.]+$
  input_per_mtok?: number;        // Cost per million input tokens
  output_per_mtok?: number;       // Cost per million output tokens
  cached_input_per_mtok?: number; // Cost per million cached tokens
}
```

**Example Request:**

```json
{
  "model": "gpt-4-mini",
  "input_per_mtok": 0.15,
  "output_per_mtok": 0.60
}
```

**Response:**

```typescript
interface ModelPricingUpdateResponse {
  success: boolean;
  model: string;
  pricing: ModelPricing;
  previous?: ModelPricing;
}

interface ModelPricing {
  model: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cached_input_per_mtok?: number;
  effective_date?: string;
  active: boolean;
}
```

**Example Response:**

```json
{
  "success": true,
  "model": "gpt-4-mini",
  "pricing": {
    "model": "gpt-4-mini",
    "input_per_mtok": 0.15,
    "output_per_mtok": 0.60,
    "cached_input_per_mtok": 0.075,
    "effective_date": "2024-01-15T12:00:00Z",
    "active": true
  },
  "previous": {
    "model": "gpt-4-mini",
    "input_per_mtok": 0.10,
    "output_per_mtok": 0.50,
    "cached_input_per_mtok": 0.05,
    "effective_date": "2024-01-01T00:00:00Z",
    "active": false
  }
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

Rate limits are applied per user/IP:

- **Default:** 100 requests per minute
- **Chat endpoint:** 10 requests per minute
- **Admin endpoints:** 1000 requests per minute

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