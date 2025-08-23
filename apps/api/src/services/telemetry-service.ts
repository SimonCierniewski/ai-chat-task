/**
 * Telemetry Service
 * Handles telemetry event logging to Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { TelemetryEventType, TelemetryPayload } from '@prototype/shared';

// ============================================================================
// Telemetry Service
// ============================================================================

export class TelemetryService {
  private supabase;

  constructor() {
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey
    );
  }

  /**
   * Log telemetry event
   */
  async logEvent(
    userId: string,
    type: TelemetryEventType,
    payload: TelemetryPayload,
    sessionId?: string
  ): Promise<void> {
    try {
      const event = {
        user_id: userId,
        session_id: sessionId || null,
        type,
        payload_json: payload,
        created_at: new Date().toISOString()
      };

      const { error } = await this.supabase
        .from('telemetry_events')
        .insert(event);

      if (error) {
        logger.error({
          type,
          error: error.message
        }, 'Failed to log telemetry event');
      }
    } catch (error) {
      logger.error({
        type,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Telemetry logging error');
    }
  }

  /**
   * Log message sent event
   */
  async logMessageSent(
    userId: string,
    sessionId: string | undefined,
    durationMs: number,
    messageLength: number
  ): Promise<void> {
    await this.logEvent(
      userId,
      'message_sent',
      {
        duration_ms: durationMs,
        message_length: messageLength
      },
      sessionId
    );
  }

  /**
   * Log OpenAI call event
   */
  async logOpenAICall(
    userId: string,
    sessionId: string | undefined,
    payload: {
      model: string;
      tokens_in: number;
      tokens_out: number;
      cost_usd: number;
      ttft_ms?: number;
      openai_ms?: number;
      has_provider_usage?: boolean;
      prompt_plan?: Record<string, any>;
    }
  ): Promise<void> {
    await this.logEvent(
      userId,
      'openai_call',
      payload,
      sessionId
    );
  }

  /**
   * Log Zep search event
   */
  async logZepSearch(
    userId: string, sessionId: string | undefined, zepMs: number, resultsLength: number, contextFromCache: boolean  ): Promise<void> {
    await this.logEvent(
      userId,
      'zep_search',
      {
        zep_ms: zepMs,
        results_length: resultsLength,
        context_from_cache: contextFromCache,
      },
      sessionId
    );
  }
  
  /**
   * Log Zep upsert event
   */
  async logZepUpsert(
    userId: string,
    sessionId: string | undefined,
    zepMs: number,
    success: boolean
  ): Promise<void> {
    await this.logEvent(
      userId,
      'zep_upsert',
      {
        zep_ms: zepMs,
        success: success,
      },
      sessionId
    );
  }

  /**
   * Log error event
   */
  async logError(
    userId: string,
    sessionId: string | undefined,
    error: Error | string,
    context?: Record<string, any>
  ): Promise<void> {
    const errorPayload: TelemetryPayload = {
      error: typeof error === 'string'
        ? error
        : {
            message: error.message,
            code: (error as any).code,
            stack: error.stack
          },
      ...context
    };

    await this.logEvent(
      userId,
      'error',
      errorPayload,
      sessionId
    );
  }
}
