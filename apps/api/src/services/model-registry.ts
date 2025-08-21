/**
 * Model Registry Service
 * Validates models against pricing table and provides model information
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ModelPricing } from '@prototype/shared';

// ============================================================================
// Types
// ============================================================================

export interface ModelInfo extends ModelPricing {
  available: boolean;
  is_default: boolean;
}

export interface ModelValidation {
  valid: boolean;
  model: string;
  pricing?: ModelPricing;
  is_default: boolean;
}

// ============================================================================
// Model Registry
// ============================================================================

export class ModelRegistry {
  private supabase;
  private modelCache: Map<string, ModelInfo> = new Map();
  private cacheExpiry = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private defaultModel: string;

  constructor() {
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey
    );
    this.defaultModel = config.openai.defaultModel;
  }

  /**
   * Validate and resolve model for request
   */
  async validateModel(requestedModel?: string): Promise<ModelValidation> {
    const model = requestedModel || this.defaultModel;
    
    // Refresh cache if expired
    if (this.cacheExpiry < Date.now()) {
      await this.refreshCache();
    }

    // Check if model exists in registry
    const modelInfo = this.modelCache.get(model);
    
    if (modelInfo && modelInfo.available) {
      return {
        valid: true,
        model,
        pricing: modelInfo,
        is_default: false
      };
    }

    // Fallback to default model if requested model is invalid
    if (requestedModel && requestedModel !== this.defaultModel) {
      logger.warn({
        requested: requestedModel,
        default: this.defaultModel
      }, 'Model not found in registry, using default');

      const defaultInfo = this.modelCache.get(this.defaultModel);
      if (defaultInfo) {
        return {
          valid: true,
          model: this.defaultModel,
          pricing: defaultInfo,
          is_default: true
        };
      }
    }

    // If even default model is not found, return validation failure
    // but still allow request to proceed (pricing will be estimated)
    logger.error({
      model: this.defaultModel
    }, 'Default model not found in registry');

    return {
      valid: false,
      model: this.defaultModel,
      is_default: true
    };
  }

  /**
   * Get all available models with pricing
   */
  async getAllModels(): Promise<ModelInfo[]> {
    // Refresh cache if expired
    if (this.cacheExpiry < Date.now()) {
      await this.refreshCache();
    }

    return Array.from(this.modelCache.values())
      .filter(m => m.available)
      .sort((a, b) => {
        // Sort by provider then by model name
        if (a.model.startsWith('gpt-4o') && !b.model.startsWith('gpt-4o')) return -1;
        if (!a.model.startsWith('gpt-4o') && b.model.startsWith('gpt-4o')) return 1;
        return a.model.localeCompare(b.model);
      });
  }

  /**
   * Refresh model cache from database
   */
  private async refreshCache(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('models_pricing')
        .select('*')
        .order('model');

      if (error) {
        logger.error({ error }, 'Failed to fetch models from database');
        return;
      }

      // Clear and rebuild cache
      this.modelCache.clear();

      if (data) {
        for (const model of data) {
          this.modelCache.set(model.model, {
            ...model,
            available: true,
            is_default: model.model === this.defaultModel
          });
        }

        logger.info({
          models: data.length,
          default: this.defaultModel
        }, 'Model registry cache refreshed');
      }

      // Update cache expiry
      this.cacheExpiry = Date.now() + this.CACHE_TTL;

    } catch (error) {
      logger.error({ error }, 'Model registry refresh error');
    }
  }

  /**
   * Get pricing for a specific model
   */
  async getModelPricing(model: string): Promise<ModelPricing | null> {
    const validation = await this.validateModel(model);
    return validation.pricing || null;
  }

  /**
   * Force cache refresh (e.g., after admin updates pricing)
   */
  async invalidateCache(): Promise<void> {
    this.cacheExpiry = 0;
    await this.refreshCache();
  }

  /**
   * Check if model is available
   */
  async isModelAvailable(model: string): Promise<boolean> {
    const validation = await this.validateModel(model);
    return validation.valid;
  }
}