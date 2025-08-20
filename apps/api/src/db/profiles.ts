import { createClient } from '@supabase/supabase-js';
import { ProfileRow } from '../types/auth';

/**
 * Database client for profiles table
 * Uses Supabase service role key for admin operations
 */
export class ProfilesClient {
  private supabaseAdmin: any;

  constructor() {
    // Initialize Supabase admin client with service role key
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL is not configured. Cannot connect to database.');
    }
    
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured. Cannot authenticate with database.');
    }

    this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  /**
   * Get user profile by user_id
   * Throws error if profile doesn't exist
   */
  async getProfile(userId: string): Promise<ProfileRow> {
    const { data, error } = await this.supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error(`Profile not found for user ${userId}. User must have a profile in the database.`);
      }
      throw new Error(`Database error fetching profile: ${error.message}`);
    }

    if (!data) {
      throw new Error(`No profile data returned for user ${userId}`);
    }

    return data;
  }

  /**
   * Get user role
   * Throws error if profile doesn't exist
   */
  async getUserRole(userId: string): Promise<'user' | 'admin'> {
    const profile = await this.getProfile(userId);
    if (!profile.role) {
      throw new Error(`Profile for user ${userId} has no role defined`);
    }
    return profile.role;
  }

  /**
   * Check if user is admin
   */
  async isAdmin(userId: string): Promise<boolean> {
    const role = await this.getUserRole(userId);
    return role === 'admin';
  }

  /**
   * Create a new profile (only for signup flow)
   */
  async createProfile(userId: string, email: string): Promise<ProfileRow> {
    const { data, error } = await this.supabaseAdmin
      .from('profiles')
      .insert({
        user_id: userId,
        email: email,
        role: 'user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to create profile for user ${userId}: ${error.message}`);
    }
    
    if (!data) {
      throw new Error(`No data returned after creating profile for user ${userId}`);
    }
    
    return data;
  }

  /**
   * Update user role (admin operation)
   */
  async updateRole(userId: string, newRole: 'user' | 'admin'): Promise<void> {
    const { error } = await this.supabaseAdmin
      .from('profiles')
      .update({
        role: newRole,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to update role for user ${userId}: ${error.message}`);
    }
  }
}

// Singleton instance
export const profilesClient = new ProfilesClient();
