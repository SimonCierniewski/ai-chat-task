/**
 * Zep Memory Service Client
 *
 * Uses the official Zep SDK for v3 API integration.
 */

import { FastifyBaseLogger } from 'fastify';
import { ZepClient as ZepSDKClient } from '@getzep/zep-cloud';

export class ZepClient {
  private client: ZepSDKClient;
  private logger?: FastifyBaseLogger;

  constructor(config: {
    apiKey?: string;
    baseUrl?: string;
    logger?: FastifyBaseLogger;
  }) {
    const apiKey = config.apiKey || process.env.ZEP_API_KEY || '';
    this.logger = config.logger;

    // Fail fast if Zep is not configured
    if (!apiKey) {
      throw new Error('ZEP_API_KEY is not configured. Cannot initialize Zep client.');
    }

    // Initialize the SDK client
    this.client = new ZepSDKClient({
      apiKey
    });

    this.logger?.info('Zep SDK client initialized');
  }

  /**
   * Initialize a new user in Zep memory system using SDK
   * This creates a user in Zep for storing chat history and memory
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
      total: number;
    };
  }> {
    const startTime = Date.now();

    try {
      this.logger?.info({ userId, email }, 'Initializing Zep user via SDK');

      // Create or update user using SDK
      const userStartTime = Date.now();

      try {
        // Check if user exists
        await this.client.user.get(userId);

        // User exists, update metadata if email provided
        if (email) {
          await this.client.user.update(userId, {
            email,
            metadata: {
              updated_at: new Date().toISOString(),
              source: 'signup_hook',
            },
          });
        }

        this.logger?.info({ userId }, 'Zep user already exists, updated metadata');
      } catch (error: any) {
        // User doesn't exist, create new one
        if (error.statusCode === 404 || error.message?.includes('not found')) {
          await this.client.user.add({
            userId,
            email,
            metadata: {
              created_at: new Date().toISOString(),
              source: 'signup_hook',
            },
          });

          this.logger?.info({ userId }, 'Created new Zep user');
        } else {
          throw error;
        }
      }

      const userTime = Date.now() - userStartTime;
      const totalTime = Date.now() - startTime;

      this.logger?.info(
        {
          userId,
          timings: {
            createUser: userTime,
            total: totalTime,
          },
        },
        'Zep user initialized successfully via SDK'
      );

      return {
        success: true,
        timings: {
          createUser: userTime,
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
        'Failed to initialize Zep user via SDK'
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
   * Check if Zep is enabled (always true if initialized)
   */
  isEnabled(): boolean {
    return true;
  }

  /**
   * Ensure user exists in Zep (create if not exists)
   * @returns true if user exists or was created
   */
  async ensureUser(userId: string, email?: string): Promise<boolean> {
    try {
      // Try to get the user first
      try {
        await this.client.user.get(userId);
        return true; // User exists
      } catch (error: any) {
        // User doesn't exist, create it
        if (error.statusCode === 404 || error.message?.includes('not found')) {
          await this.client.user.add({
            userId,
            email,
            metadata: {
              created_at: new Date().toISOString()
            }
          });
          this.logger?.info('Created new Zep user', { userId });
          return true;
        }
        throw error; // Re-throw other errors
      }
    } catch (error: any) {
      this.logger?.error('Failed to ensure Zep user', {
        userId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Ensure thread exists in Zep (create if not exists)
   * @returns true if thread exists or was created
   */
  async ensureThread(userId: string, sessionId: string): Promise<boolean> {
    try {
      // Try to get the thread first
      try {
        await this.client.thread.get(sessionId);
        return true; // Thread exists
      } catch (error: any) {
        // Thread doesn't exist, create it
        if (error.statusCode === 404 || error.message?.includes('not found')) {
          await this.client.thread.create({
            threadId: sessionId,
            userId,
            metadata: {
              created_at: new Date().toISOString()
            }
          });
          this.logger?.info('Created new Zep thread', { userId, sessionId });
          return true;
        }
        throw error; // Re-throw other errors
      }
    } catch (error: any) {
      this.logger?.error('Failed to ensure Zep thread', {
        userId,
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get context block from Zep (for fast chat endpoint)
   * This retrieves the basic context without processing messages
   */
  async getContextBlock(userId: string, sessionId: string): Promise<string | undefined> {
    try {
      // Get thread context which includes facts and summaries
      const context = await this.client.thread.getUserContext(sessionId, { mode: "basic" });
      return context.context;
    } catch (error: any) {
      this.logger?.warn('Failed to get context block', {
        userId,
        sessionId,
        error: error.message
      });
      return undefined;
    }
  }

  /**
   * Get the SDK client for direct access
   */
  getClient(): ZepSDKClient {
    return this.client;
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
