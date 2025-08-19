/**
 * OpenAI Streaming Provider
 * Handles streaming completions from OpenAI API with usage tracking
 */

import { config } from '../config';
import { logger } from '../config/logger';
import { UsageEventData } from '@shared/api/chat';

// ============================================================================
// Types
// ============================================================================

interface StreamOptions {
  message: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  onToken: (text: string) => void;
  onUsage: (usage: UsageEventData) => void;
  onDone: (reason: 'stop' | 'length' | 'content_filter' | 'error') => void;
  onError: (error: Error) => void;
  onFirstToken?: () => void;
}

interface OpenAIStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason?: 'stop' | 'length' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// OpenAI Provider
// ============================================================================

export class OpenAIProvider {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';
  private connectTimeoutMs: number;
  private timeoutMs: number;
  private retryMax: number;

  constructor() {
    this.apiKey = config.openai.apiKey;
    this.connectTimeoutMs = config.openai.connectTimeoutMs;
    this.timeoutMs = config.openai.timeoutMs;
    this.retryMax = config.openai.retryMax;

    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }
  }

  /**
   * Stream completion from OpenAI with usage tracking
   */
  async streamCompletion(options: StreamOptions): Promise<void> {
    const {
      message,
      model = config.openai.defaultModel,
      systemPrompt,
      temperature = 0.7,
      maxTokens = 2000,
      messages,
      onToken,
      onUsage,
      onDone,
      onError,
      onFirstToken
    } = options;

    let ttftMs: number | undefined;
    let firstTokenReceived = false;
    const startTime = Date.now();
    let retryCount = 0;

    // Build messages array
    const requestMessages = messages || [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      { role: 'user' as const, content: message }
    ];

    while (retryCount <= this.retryMax) {
      try {
        const controller = new AbortController();
        const connectTimeout = setTimeout(() => controller.abort(), this.connectTimeoutMs);
        
        const overallTimeout = setTimeout(() => {
          controller.abort();
          onError(new Error('OpenAI request timeout'));
        }, this.timeoutMs);

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'OpenAI-Beta': 'assistants=v2'
          },
          body: JSON.stringify({
            model,
            messages: requestMessages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
            stream_options: {
              include_usage: true
            }
          }),
          signal: controller.signal
        });

        clearTimeout(connectTimeout);

        // Handle non-2xx responses
        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`OpenAI API error: ${response.status} ${errorText}`);
          
          // Never retry 4xx errors
          if (response.status >= 400 && response.status < 500) {
            logger.error('OpenAI client error', { 
              status: response.status, 
              error: errorText 
            });
            onError(error);
            return;
          }
          
          // Retry 5xx errors
          if (response.status >= 500 && retryCount < this.retryMax) {
            retryCount++;
            const jitter = Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, 1000 + jitter));
            continue;
          }
          
          throw error;
        }

        // Process SSE stream
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let usage: OpenAIStreamResponse['usage'] | undefined;
        let finishReason: 'stop' | 'length' | 'content_filter' = 'stop';

        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                clearTimeout(overallTimeout);
                
                // Emit usage if we have it
                if (usage) {
                  onUsage({
                    tokens_in: usage.prompt_tokens,
                    tokens_out: usage.completion_tokens,
                    cost_usd: 0, // Will be calculated by UsageService
                    model
                  });
                }
                
                onDone(finishReason);
                return;
              }

              try {
                const parsed: OpenAIStreamResponse = JSON.parse(data);
                
                // Extract usage if present
                if (parsed.usage) {
                  usage = parsed.usage;
                }
                
                // Process content delta
                if (parsed.choices?.[0]?.delta?.content) {
                  const content = parsed.choices[0].delta.content;
                  
                  // Track TTFT
                  if (!firstTokenReceived && content.trim()) {
                    firstTokenReceived = true;
                    ttftMs = Date.now() - startTime;
                    onFirstToken?.();
                    
                    logger.info('First token received', {
                      ttft_ms: ttftMs,
                      model
                    });
                  }
                  
                  onToken(content);
                }
                
                // Track finish reason
                if (parsed.choices?.[0]?.finish_reason) {
                  finishReason = parsed.choices[0].finish_reason as any;
                }
                
              } catch (e) {
                logger.warn('Failed to parse SSE data', { data, error: e });
              }
            }
          }
        }

        clearTimeout(overallTimeout);
        return;

      } catch (error: any) {
        // Handle network errors with retry
        if (retryCount < this.retryMax && 
            (error.code === 'ECONNRESET' || error.name === 'AbortError')) {
          retryCount++;
          const jitter = Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, 1000 + jitter));
          continue;
        }
        
        logger.error('OpenAI streaming error', { 
          error: error.message,
          retryCount 
        });
        onError(error);
        return;
      }
    }
  }

  /**
   * Get time to first token (if tracked)
   */
  getTTFT(): number | undefined {
    // This would be tracked internally if needed
    return undefined;
  }
}