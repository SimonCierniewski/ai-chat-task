/**
 * Prompt Assembler Service
 * Assembles prompts with memory context while enforcing token budgets
 */

import { logger } from '../config/logger';
import { RetrievalResult } from '@shared/telemetry-memory';
import { CONFIG_PRESETS, MemoryConfig } from '@shared/memory-config';

// ============================================================================
// Types
// ============================================================================

interface PromptInput {
  userMessage: string;
  memoryBundle?: RetrievalResult[];
  systemPrompt?: string;
  config?: Partial<MemoryConfig>;
}

interface PromptPlan {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  totalTokens: number;
  memoryTokens: number;
  systemTokens: number;
  userTokens: number;
  itemsIncluded: number;
  itemsExcluded: number;
  excludedReasons: string[];
}

interface TokenBudget {
  total: number;
  memory: number;
  system: number;
  user: number;
}

// ============================================================================
// Prompt Assembler
// ============================================================================

export class PromptAssembler {
  private readonly DEFAULT_SYSTEM_PROMPT = 
    'You are a helpful AI assistant. Use the provided context to give accurate and relevant responses.';
  
  private readonly TOKEN_BUDGET: TokenBudget = {
    total: 4000,      // Leave room for response
    memory: 1500,     // Max tokens for memory context
    system: 200,      // Max tokens for system prompt
    user: 2000        // Max tokens for user message
  };

  /**
   * Assemble prompt with memory context and budget enforcement
   */
  assemblePrompt(input: PromptInput): PromptPlan {
    const {
      userMessage,
      memoryBundle = [],
      systemPrompt = this.DEFAULT_SYSTEM_PROMPT,
      config = CONFIG_PRESETS.DEFAULT
    } = input;

    const plan: PromptPlan = {
      messages: [],
      totalTokens: 0,
      memoryTokens: 0,
      systemTokens: 0,
      userTokens: 0,
      itemsIncluded: 0,
      itemsExcluded: 0,
      excludedReasons: []
    };

    // 1. Add system prompt
    const systemTokens = this.estimateTokens(systemPrompt);
    if (systemTokens <= this.TOKEN_BUDGET.system) {
      plan.messages.push({
        role: 'system',
        content: systemPrompt
      });
      plan.systemTokens = systemTokens;
      plan.totalTokens += systemTokens;
    } else {
      // Truncate system prompt if too long
      const truncated = this.truncateText(systemPrompt, this.TOKEN_BUDGET.system);
      plan.messages.push({
        role: 'system',
        content: truncated
      });
      plan.systemTokens = this.TOKEN_BUDGET.system;
      plan.totalTokens += this.TOKEN_BUDGET.system;
      plan.excludedReasons.push('System prompt truncated to fit budget');
    }

    // 2. Process memory context with budget enforcement
    if (memoryBundle.length > 0) {
      const memoryContext = this.buildMemoryContext(
        memoryBundle,
        config,
        this.TOKEN_BUDGET.memory
      );
      
      if (memoryContext.content) {
        // Add memory as part of system context
        const existingSystem = plan.messages.find(m => m.role === 'system');
        if (existingSystem) {
          existingSystem.content += '\n\n## Relevant Context\n' + memoryContext.content;
        } else {
          plan.messages.push({
            role: 'system',
            content: '## Relevant Context\n' + memoryContext.content
          });
        }
        
        plan.memoryTokens = memoryContext.tokens;
        plan.totalTokens += memoryContext.tokens;
        plan.itemsIncluded = memoryContext.itemsIncluded;
        plan.itemsExcluded = memoryContext.itemsExcluded;
        plan.excludedReasons.push(...memoryContext.reasons);
      }
    }

    // 3. Add user message
    const userTokens = this.estimateTokens(userMessage);
    if (userTokens <= this.TOKEN_BUDGET.user) {
      plan.messages.push({
        role: 'user',
        content: userMessage
      });
      plan.userTokens = userTokens;
      plan.totalTokens += userTokens;
    } else {
      // Truncate user message if too long (rare but possible)
      const truncated = this.truncateText(userMessage, this.TOKEN_BUDGET.user);
      plan.messages.push({
        role: 'user',
        content: truncated + '\n\n[Message truncated due to length]'
      });
      plan.userTokens = this.TOKEN_BUDGET.user;
      plan.totalTokens += this.TOKEN_BUDGET.user;
      plan.excludedReasons.push('User message truncated to fit budget');
    }

    // Log the prompt plan for debugging
    logger.info('Prompt assembled', {
      total_tokens: plan.totalTokens,
      memory_tokens: plan.memoryTokens,
      system_tokens: plan.systemTokens,
      user_tokens: plan.userTokens,
      items_included: plan.itemsIncluded,
      items_excluded: plan.itemsExcluded,
      reasons: plan.excludedReasons
    });

    return plan;
  }

  /**
   * Build memory context with budget enforcement
   */
  private buildMemoryContext(
    memoryBundle: RetrievalResult[],
    config: Partial<MemoryConfig>,
    tokenBudget: number
  ): {
    content: string;
    tokens: number;
    itemsIncluded: number;
    itemsExcluded: number;
    reasons: string[];
  } {
    const result = {
      content: '',
      tokens: 0,
      itemsIncluded: 0,
      itemsExcluded: 0,
      reasons: [] as string[]
    };

    // Sort by relevance score (descending)
    const sorted = [...memoryBundle].sort((a, b) => 
      (b.relevance_score || 0) - (a.relevance_score || 0)
    );

    // Apply top_k limit
    const topK = Math.min(config.top_k || 10, sorted.length);
    const candidates = sorted.slice(0, topK);
    
    if (sorted.length > topK) {
      result.itemsExcluded += sorted.length - topK;
      result.reasons.push(`${sorted.length - topK} items excluded by top_k=${topK} limit`);
    }

    // Build context with token budget
    const contextParts: string[] = [];
    let currentTokens = 0;

    for (const item of candidates) {
      // Apply sentence clipping if configured
      let text = item.text;
      if (config.clip_sentences && config.clip_sentences > 0) {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        if (sentences.length > config.clip_sentences) {
          text = sentences.slice(0, config.clip_sentences).join(' ');
        }
      }

      // Check if adding this item would exceed budget
      const itemTokens = this.estimateTokens(text);
      if (currentTokens + itemTokens > tokenBudget) {
        // Try to fit partial content
        const remainingBudget = tokenBudget - currentTokens;
        if (remainingBudget > 50) { // Only include if we have meaningful space
          const truncated = this.truncateText(text, remainingBudget);
          contextParts.push(`- ${truncated}...`);
          currentTokens += this.estimateTokens(truncated);
          result.itemsIncluded++;
          result.reasons.push('Last item truncated to fit token budget');
        } else {
          result.itemsExcluded++;
          result.reasons.push('Item excluded: would exceed token budget');
        }
        break;
      }

      // Add item to context
      contextParts.push(`- ${text}`);
      currentTokens += itemTokens;
      result.itemsIncluded++;
    }

    result.content = contextParts.join('\n');
    result.tokens = currentTokens;

    return result;
  }

  /**
   * Estimate token count for text
   * Rough approximation: 1 token ≈ 4 characters
   */
  private estimateTokens(text: string): number {
    // More accurate estimation based on common patterns
    // Average English word is ~4.7 characters, ~1.3 tokens per word
    const words = text.split(/\s+/).length;
    const chars = text.length;
    
    // Use combination of word and character count for better estimate
    const wordBasedEstimate = words * 1.3;
    const charBasedEstimate = chars / 4;
    
    // Average the two estimates
    return Math.ceil((wordBasedEstimate + charBasedEstimate) / 2);
  }

  /**
   * Truncate text to fit within token budget
   */
  private truncateText(text: string, maxTokens: number): string {
    const estimatedCharsPerToken = 4;
    const maxChars = maxTokens * estimatedCharsPerToken;
    
    if (text.length <= maxChars) {
      return text;
    }
    
    // Try to truncate at a word boundary
    const truncated = text.substring(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxChars * 0.8) {
      return truncated.substring(0, lastSpace);
    }
    
    return truncated;
  }

  /**
   * Get prompt plan for telemetry
   */
  getPromptPlanSummary(plan: PromptPlan): Record<string, any> {
    return {
      total_tokens: plan.totalTokens,
      memory_tokens: plan.memoryTokens,
      system_tokens: plan.systemTokens,
      user_tokens: plan.userTokens,
      items_included: plan.itemsIncluded,
      items_excluded: plan.itemsExcluded,
      excluded_reasons: plan.excludedReasons
    };
  }
}