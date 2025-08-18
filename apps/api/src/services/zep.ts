/**
 * Zep Memory Service Client
 * 
 * This is a stub implementation for Phase 1.
 * Full implementation will be added in Phase 3 (Zep v3 Integration).
 */

import { FastifyBaseLogger } from 'fastify';

interface ZepUser {
  user_id: string;
  email?: string;
  metadata?: Record<string, any>;
}

interface ZepCollection {
  name: string;
  description?: string;
  metadata?: Record<string, any>;
}

export class ZepClient {
  private apiKey: string;
  private baseUrl: string;
  private logger?: FastifyBaseLogger;
  private enabled: boolean;

  constructor(config: {
    apiKey?: string;
    baseUrl?: string;
    logger?: FastifyBaseLogger;
  }) {
    this.apiKey = config.apiKey || process.env.ZEP_API_KEY || '';
    this.baseUrl = config.baseUrl || process.env.ZEP_BASE_URL || 'https://api.getzep.com';
    this.logger = config.logger;
    
    // Zep is only enabled if we have an API key
    this.enabled = Boolean(this.apiKey);
    
    if (!this.enabled) {
      this.logger?.info('Zep client initialized in disabled mode (no API key)');
    } else {
      this.logger?.info({ baseUrl: this.baseUrl }, 'Zep client initialized');
    }
  }

  /**
   * Initialize a new user in Zep memory system
   * This creates a user namespace and default collection for storing chat history
   * 
   * @param userId - The user's ID from Supabase auth
   * @param email - The user's email address
   * @returns Success status and timing metrics
   */
  async initializeUser(userId: string, email?: string): Promise<{
    success: boolean;
    error?: string;
    timings?: {
      createUser?: number;
      createCollection?: number;
      total: number;
    };
  }> {
    const startTime = Date.now();
    
    // If Zep is not enabled, return success (no-op)
    if (!this.enabled) {
      this.logger?.debug({ userId }, 'Zep disabled, skipping user initialization');
      return {
        success: true,
        timings: {
          total: Date.now() - startTime,
        },
      };
    }

    try {
      // Phase 3 TODO: Implement actual Zep API calls
      // For now, this is a stub that simulates the operations
      
      this.logger?.info({ userId, email }, 'Initializing Zep user (stub)');
      
      // Simulate user creation
      const userStartTime = Date.now();
      // const user = await this.createUser({
      //   user_id: `user:${userId}`,
      //   email,
      //   metadata: {
      //     created_at: new Date().toISOString(),
      //     source: 'signup_hook',
      //   },
      // });
      const userTime = Date.now() - userStartTime;
      
      // Simulate collection creation
      const collectionStartTime = Date.now();
      // const collection = await this.createCollection({
      //   name: `user:${userId}:default`,
      //   description: `Default chat history for user ${userId}`,
      //   metadata: {
      //     user_id: userId,
      //     type: 'chat_history',
      //   },
      // });
      const collectionTime = Date.now() - collectionStartTime;
      
      const totalTime = Date.now() - startTime;
      
      this.logger?.info(
        {
          userId,
          timings: {
            createUser: userTime,
            createCollection: collectionTime,
            total: totalTime,
          },
        },
        'Zep user initialized successfully (stub)'
      );
      
      return {
        success: true,
        timings: {
          createUser: userTime,
          createCollection: collectionTime,
          total: totalTime,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const totalTime = Date.now() - startTime;
      
      this.logger?.error(
        {
          userId,
          error: errorMessage,
          duration: totalTime,
        },
        'Failed to initialize Zep user'
      );
      
      return {
        success: false,
        error: errorMessage,
        timings: {
          total: totalTime,
        },
      };
    }
  }

  /**
   * Create a user in Zep (Phase 3 implementation)
   */
  private async createUser(user: ZepUser): Promise<void> {
    // Phase 3 TODO: Implement actual API call
    // POST /users
    // Body: { user_id, email, metadata }
    
    // Stub implementation
    await this.simulateApiDelay(50, 150);
  }

  /**
   * Create a collection in Zep (Phase 3 implementation)
   */
  private async createCollection(collection: ZepCollection): Promise<void> {
    // Phase 3 TODO: Implement actual API call
    // POST /collections
    // Body: { name, description, metadata }
    
    // Stub implementation
    await this.simulateApiDelay(50, 150);
  }

  /**
   * Simulate API delay for stub implementation
   */
  private async simulateApiDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Check if Zep is enabled (has API key)
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
let zepClient: ZepClient | null = null;

/**
 * Get or create the Zep client instance
 */
export function getZepClient(logger?: FastifyBaseLogger): ZepClient {
  if (!zepClient) {
    zepClient = new ZepClient({ logger });
  }
  return zepClient;
}