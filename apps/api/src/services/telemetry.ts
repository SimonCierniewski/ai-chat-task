/**
 * Telemetry Service
 * 
 * Logs events for monitoring, analytics, and cost tracking.
 * Phase 2 will implement actual database persistence.
 */

import { FastifyBaseLogger } from 'fastify';

export type TelemetryEventType = 
  | 'message_sent'
  | 'openai_call'
  | 'zep_upsert'
  | 'zep_search'
  | 'error'
  | 'auth_request'
  | 'auth_success'
  | 'auth_failure';

export interface TelemetryEvent {
  type: TelemetryEventType;
  user_id?: string | null;
  session_id?: string;
  payload: {
    // Timing metrics
    ttft_ms?: number;        // Time to first token
    openai_ms?: number;      // OpenAI API call duration
    zep_ms?: number;         // Zep API call duration
    duration_ms?: number;    // Total duration
    
    // Usage metrics
    model?: string;
    tokens_in?: number;
    tokens_out?: number;
    cost_usd?: number;
    
    // Context
    operation?: string;
    success?: boolean;
    error?: string;
    
    // Auth specific
    email?: string;
    method?: string;
    role?: string;
    reason?: string;
    
    // Additional metadata
    [key: string]: any;
  };
  timestamp?: Date;
}

/**
 * Log a telemetry event
 * 
 * In Phase 1, this just logs to the application logger.
 * In Phase 2, this will persist to the telemetry_events table.
 */
export async function logTelemetry(
  logger: FastifyBaseLogger,
  event: TelemetryEvent
): Promise<void> {
  const telemetryEvent = {
    ...event,
    timestamp: event.timestamp || new Date(),
  };
  
  // Phase 1: Log to application logger
  logger.info(
    {
      telemetry: true,
      event: telemetryEvent,
    },
    `Telemetry: ${event.type}`
  );
  
  // Phase 2 TODO: Persist to database
  // await db.insert('telemetry_events', {
  //   id: uuid(),
  //   user_id: event.user_id,
  //   session_id: event.session_id,
  //   type: event.type,
  //   payload_json: JSON.stringify(event.payload),
  //   created_at: telemetryEvent.timestamp,
  // });
}

/**
 * Calculate cost for OpenAI usage
 * 
 * @param model - The model used (e.g., 'gpt-4o-mini')
 * @param tokensIn - Input tokens
 * @param tokensOut - Output tokens
 * @returns Cost in USD
 */
export function calculateOpenAICost(
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  // Phase 2 will load these from models_pricing table
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini': {
      input: 0.15 / 1_000_000,    // $0.15 per 1M tokens
      output: 0.60 / 1_000_000,   // $0.60 per 1M tokens
    },
    'gpt-4o': {
      input: 2.50 / 1_000_000,    // $2.50 per 1M tokens
      output: 10.00 / 1_000_000,  // $10.00 per 1M tokens
    },
    'gpt-4-turbo': {
      input: 10.00 / 1_000_000,   // $10.00 per 1M tokens
      output: 30.00 / 1_000_000,  // $30.00 per 1M tokens
    },
  };
  
  const modelPricing = pricing[model] || pricing['gpt-4o-mini'];
  
  const inputCost = tokensIn * modelPricing.input;
  const outputCost = tokensOut * modelPricing.output;
  
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Log an authentication event
 */
export async function logAuthEvent(
  logger: FastifyBaseLogger,
  type: 'auth_request' | 'auth_success' | 'auth_failure',
  data: {
    user_id?: string | null;
    email?: string;
    role?: string;
    method?: string;
    reason?: string;
  }
): Promise<void> {
  await logTelemetry(logger, {
    type,
    user_id: data.user_id,
    payload: data,
  });
}

/**
 * Log a Zep operation
 */
export async function logZepOperation(
  logger: FastifyBaseLogger,
  operation: 'search' | 'upsert',
  data: {
    user_id?: string;
    duration_ms: number;
    success: boolean;
    error?: string;
    items_count?: number;
  }
): Promise<void> {
  await logTelemetry(logger, {
    type: operation === 'search' ? 'zep_search' : 'zep_upsert',
    user_id: data.user_id,
    payload: {
      operation,
      zep_ms: data.duration_ms,
      success: data.success,
      error: data.error,
      items_count: data.items_count,
    },
  });
}

/**
 * Get telemetry stats (Phase 2 will query database)
 */
export async function getTelemetryStats(
  logger: FastifyBaseLogger,
  filters?: {
    user_id?: string;
    from?: Date;
    to?: Date;
  }
): Promise<{
  total_messages: number;
  total_cost_usd: number;
  avg_ttft_ms: number;
  avg_response_time_ms: number;
}> {
  // Phase 1: Return stub data
  logger.debug({ filters }, 'Getting telemetry stats (stub)');
  
  return {
    total_messages: 0,
    total_cost_usd: 0,
    avg_ttft_ms: 0,
    avg_response_time_ms: 0,
  };
  
  // Phase 2 TODO: Query actual data
  // const stats = await db.query(`
  //   SELECT
  //     COUNT(*) FILTER (WHERE type = 'message_sent') as total_messages,
  //     SUM((payload_json->>'cost_usd')::numeric) as total_cost_usd,
  //     AVG((payload_json->>'ttft_ms')::numeric) as avg_ttft_ms,
  //     AVG((payload_json->>'duration_ms')::numeric) as avg_response_time_ms
  //   FROM telemetry_events
  //   WHERE ($1::uuid IS NULL OR user_id = $1)
  //     AND ($2::timestamp IS NULL OR created_at >= $2)
  //     AND ($3::timestamp IS NULL OR created_at <= $3)
  // `, [filters?.user_id, filters?.from, filters?.to]);
}