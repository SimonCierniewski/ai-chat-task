/**
 * Telemetry Types and Schemas
 * Shared contracts for telemetry events across API and Admin
 */

import { JSONSchemaType } from 'ajv';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Supported telemetry event types
 */
export type TelemetryEventType = 
  | 'message_sent' 
  | 'openai_call' 
  | 'zep_upsert' 
  | 'zep_search' 
  | 'error';

/**
 * Telemetry event payload structure
 * All fields are optional to support different event types
 */
export interface TelemetryPayload {
  // Timing metrics (milliseconds)
  ttft_ms?: number;        // Time to first token
  openai_ms?: number;      // OpenAI API response time
  zep_ms?: number;         // Zep API response time
  duration_ms?: number;    // Total request duration
  
  // Model and token usage
  model?: string;          // AI model used (e.g., 'gpt-4o-mini')
  tokens_in?: number;      // Input token count
  tokens_out?: number;     // Output token count
  
  // Cost tracking
  cost_usd?: number;       // Calculated cost in USD
  
  // Error information
  error?: string | {       // Error message or details object
    message: string;
    code?: string;
    stack?: string;
  };
  
  // Additional context (extensible)
  [key: string]: unknown;
}

/**
 * Complete telemetry event structure as stored in database
 */
export interface TelemetryEvent {
  id: string;                    // UUID
  user_id: string;               // UUID
  session_id?: string | null;    // Optional session identifier
  type: TelemetryEventType;       // Event type
  payload_json: TelemetryPayload; // Event-specific data
  created_at: string | Date;      // ISO timestamp or Date object
}

/**
 * Telemetry event creation input (without auto-generated fields)
 */
export interface CreateTelemetryEvent {
  user_id: string;
  session_id?: string | null;
  type: TelemetryEventType;
  payload_json: TelemetryPayload;
}

// ============================================================================
// JSON Schemas (Ajv-compatible)
// ============================================================================

/**
 * JSON Schema for TelemetryPayload validation
 */
export const telemetryPayloadSchema: JSONSchemaType<TelemetryPayload> = {
  type: 'object',
  properties: {
    // Timing metrics
    ttft_ms: {
      type: 'number',
      nullable: true,
      minimum: 0,
      description: 'Time to first token in milliseconds'
    },
    openai_ms: {
      type: 'number',
      nullable: true,
      minimum: 0,
      description: 'OpenAI API response time in milliseconds'
    },
    zep_ms: {
      type: 'number',
      nullable: true,
      minimum: 0,
      description: 'Zep API response time in milliseconds'
    },
    duration_ms: {
      type: 'number',
      nullable: true,
      minimum: 0,
      description: 'Total request duration in milliseconds'
    },
    
    // Model and tokens
    model: {
      type: 'string',
      nullable: true,
      minLength: 1,
      description: 'AI model identifier'
    },
    tokens_in: {
      type: 'integer',
      nullable: true,
      minimum: 0,
      description: 'Input token count'
    },
    tokens_out: {
      type: 'integer',
      nullable: true,
      minimum: 0,
      description: 'Output token count'
    },
    
    // Cost
    cost_usd: {
      type: 'number',
      nullable: true,
      minimum: 0,
      description: 'Cost in USD'
    },
    
    // Error
    error: {
      nullable: true,
      oneOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {
            message: { type: 'string' },
            code: { type: 'string', nullable: true },
            stack: { type: 'string', nullable: true }
          },
          required: ['message'],
          additionalProperties: true
        }
      ],
      description: 'Error information'
    }
  },
  required: [],
  additionalProperties: true // Allow extension fields
};

/**
 * JSON Schema for complete TelemetryEvent validation
 */
export const telemetryEventSchema: JSONSchemaType<CreateTelemetryEvent> = {
  type: 'object',
  properties: {
    user_id: {
      type: 'string',
      format: 'uuid',
      description: 'User UUID'
    },
    session_id: {
      type: 'string',
      nullable: true,
      minLength: 1,
      description: 'Optional session identifier'
    },
    type: {
      type: 'string',
      enum: ['message_sent', 'openai_call', 'zep_upsert', 'zep_search', 'error'] as const,
      description: 'Event type'
    },
    payload_json: telemetryPayloadSchema
  },
  required: ['user_id', 'type', 'payload_json'],
  additionalProperties: false
};

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Type guard to check if a value is a valid TelemetryEventType
 */
export function isTelemetryEventType(type: unknown): type is TelemetryEventType {
  return typeof type === 'string' && 
    ['message_sent', 'openai_call', 'zep_upsert', 'zep_search', 'error'].includes(type);
}

/**
 * Validate payload requirements based on event type
 */
export function validateEventPayload(type: TelemetryEventType, payload: TelemetryPayload): boolean {
  switch (type) {
    case 'message_sent':
      return typeof payload.duration_ms === 'number';
      
    case 'openai_call':
      return typeof payload.openai_ms === 'number' &&
             typeof payload.model === 'string' &&
             typeof payload.tokens_in === 'number' &&
             typeof payload.tokens_out === 'number' &&
             typeof payload.cost_usd === 'number';
      
    case 'zep_upsert':
    case 'zep_search':
      return typeof payload.zep_ms === 'number';
      
    case 'error':
      return payload.error !== undefined;
      
    default:
      return true;
  }
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Event type display names for UI
 */
export const EVENT_TYPE_LABELS: Record<TelemetryEventType, string> = {
  message_sent: 'Message Sent',
  openai_call: 'OpenAI Call',
  zep_upsert: 'Zep Upsert',
  zep_search: 'Zep Search',
  error: 'Error'
};

/**
 * Event type colors for UI (e.g., charts)
 */
export const EVENT_TYPE_COLORS: Record<TelemetryEventType, string> = {
  message_sent: '#10b981', // emerald-500
  openai_call: '#3b82f6',  // blue-500
  zep_upsert: '#f59e0b',   // amber-500
  zep_search: '#8b5cf6',   // violet-500
  error: '#ef4444'         // red-500
};