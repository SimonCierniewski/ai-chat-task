/**
 * Usage Service
 * Handles token usage tracking and cost calculation with fallback estimation
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../config/logger';
import { ModelPricing, calculateCost } from '@shared/pricing';
import { UsageEventData } from '@shared/api/chat';

// ============================================================================
// Types
// ============================================================================

interface UsageCalculation {
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  model: string;
  has_provider_usage: boolean;
}

interface TokenEstimate {
  text: string;
  estimatedTokens: number;
}

// ============================================================================
// Usage Service
// ============================================================================

export class UsageService {
  private supabase;
  private pricingCache: Map<string, ModelPricing> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey
    );
  }

  /**
   * Calculate usage and cost from provider-reported data (primary path)
   */
  async calculateFromProvider(
    usage: UsageEventData,
    model: string
  ): Promise<UsageCalculation> {
    const pricing = await this.getModelPricing(model);
    
    if (!pricing) {
      logger.warn('Model pricing not found, using fallback', { model });
      return {
        tokens_in: usage.tokens_in,
        tokens_out: usage.tokens_out,
        cost_usd: this.roundForDisplay(usage.cost_usd || 0),
        model,
        has_provider_usage: true
      };
    }

    // Calculate cost with 6-8 decimal precision internally
    const costBreakdown = calculateCost(
      {
        input_tokens: usage.tokens_in,
        output_tokens: usage.tokens_out,
        cached_input_tokens: 0
      },
      pricing
    );

    return {
      tokens_in: usage.tokens_in,
      tokens_out: usage.tokens_out,
      cost_usd: this.roundForDisplay(costBreakdown.total_cost_usd),
      model,
      has_provider_usage: true
    };
  }

  /**
   * Estimate usage and cost when provider data is missing (fallback path)
   */
  async estimateUsage(
    inputText: string,
    outputText: string,
    model: string
  ): Promise<UsageCalculation> {
    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const tokensIn = Math.ceil(inputText.length / 4);
    const tokensOut = Math.ceil(outputText.length / 4);

    const pricing = await this.getModelPricing(model);
    
    if (!pricing) {
      // Use default pricing if model not found
      const defaultCost = this.calculateDefaultCost(tokensIn, tokensOut, model);
      
      logger.warn('Using default pricing for unknown model', { 
        model,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: defaultCost
      });

      return {
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: this.roundForDisplay(defaultCost),
        model,
        has_provider_usage: false
      };
    }

    // Calculate cost with pricing data
    const costBreakdown = calculateCost(
      {
        input_tokens: tokensIn,
        output_tokens: tokensOut,
        cached_input_tokens: 0
      },
      pricing
    );

    return {
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: this.roundForDisplay(costBreakdown.total_cost_usd),
      model,
      has_provider_usage: false
    };
  }

  /**
   * Get model pricing from cache or database
   */
  private async getModelPricing(model: string): Promise<ModelPricing | null> {
    // Check cache
    if (this.cacheExpiry > Date.now()) {
      const cached = this.pricingCache.get(model);
      if (cached) return cached;
    }

    try {
      // Fetch from database
      const { data, error } = await this.supabase
        .from('models_pricing')
        .select('*')
        .eq('model', model)
        .single();

      if (error || !data) {
        logger.warn('Model pricing not found in database', { model, error });
        return null;
      }

      // Update cache
      this.pricingCache.set(model, data);
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

      return data;
    } catch (error) {
      logger.error('Failed to fetch model pricing', { model, error });
      return null;
    }
  }

  /**
   * Calculate default cost for unknown models
   */
  private calculateDefaultCost(
    tokensIn: number,
    tokensOut: number,
    model: string
  ): number {
    // Default pricing based on model name patterns
    let inputRate = 0.5;  // $0.50 per million tokens
    let outputRate = 1.5; // $1.50 per million tokens

    if (model.includes('gpt-4o-mini')) {
      inputRate = 0.15;
      outputRate = 0.6;
    } else if (model.includes('gpt-4o')) {
      inputRate = 5.0;
      outputRate = 15.0;
    } else if (model.includes('gpt-4')) {
      inputRate = 30.0;
      outputRate = 60.0;
    } else if (model.includes('gpt-3.5')) {
      inputRate = 0.5;
      outputRate = 1.5;
    }

    // Keep 6-8 decimal precision internally
    const cost = (tokensIn / 1_000_000) * inputRate + 
                 (tokensOut / 1_000_000) * outputRate;
    
    return cost;
  }

  /**
   * Round cost for display (4 decimal places)
   */
  private roundForDisplay(cost: number): number {
    return Math.round(cost * 10000) / 10000;
  }

  /**
   * Track token usage for better estimation
   */
  async trackUsage(
    userId: string,
    sessionId: string | undefined,
    usage: UsageCalculation,
    ttftMs?: number,
    openaiMs?: number
  ): Promise<void> {
    try {
      // Store in telemetry_events table
      const telemetryPayload = {
        user_id: userId,
        session_id: sessionId,
        type: 'openai_call',
        payload_json: {
          tokens_in: usage.tokens_in,
          tokens_out: usage.tokens_out,
          cost_usd: usage.cost_usd,
          model: usage.model,
          has_provider_usage: usage.has_provider_usage,
          ttft_ms: ttftMs,
          openai_ms: openaiMs
        }
      };

      const { error } = await this.supabase
        .from('telemetry_events')
        .insert(telemetryPayload);

      if (error) {
        logger.error('Failed to track usage telemetry', { error });
      }
    } catch (error) {
      logger.error('Usage tracking error', { error });
    }
  }

  /**
   * Batch fetch pricing for multiple models (optimization)
   */
  async prefetchPricing(models: string[]): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('models_pricing')
        .select('*')
        .in('model', models);

      if (!error && data) {
        data.forEach(pricing => {
          this.pricingCache.set(pricing.model, pricing);
        });
        this.cacheExpiry = Date.now() + this.CACHE_TTL;
      }
    } catch (error) {
      logger.warn('Failed to prefetch pricing', { error });
    }
  }
}