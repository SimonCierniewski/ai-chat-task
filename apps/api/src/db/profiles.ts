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

    if (!supabaseUrl || !serviceRoleKey) {
      console.warn('Supabase credentials not configured, using stub mode');
      this.supabaseAdmin = null;
    } else {
      this.supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }
  }

  /**
   * Get user profile by user_id
   * Returns null if profile doesn't exist
   */
  async getProfile(userId: string): Promise<ProfileRow | null> {
    try {
      const { data, error } = await this.supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile found
          console.warn(`Profile not found for user: ${userId}`);
          return null;
        }
        console.error('Error fetching profile:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getProfile:', error);
      return null;
    }
  }

  /**
   * Get user role
   * Returns 'user' as default if profile doesn't exist
   */
  async getUserRole(userId: string): Promise<'user' | 'admin' | "null"> {
    const profile = await this.getProfile(userId);
    return profile?.role;
  }

  /**
   * Check if user is admin
   */
  async isAdmin(userId: string): Promise<boolean> {
    const role = await this.getUserRole(userId);
    return role === 'admin';
  }

  /**
   * Update user role (admin operation)
   */
  async updateRole(userId: string, newRole: 'user' | 'admin'): Promise<void> {
    if (!this.supabaseAdmin) {
      console.warn('Cannot update role without database connection');
      return;
    }

    try {
      const { error } = await this.supabaseAdmin
        .from('profiles')
        .update({
          role: newRole,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) {
        console.error('Error updating role:', error);
        throw error;
      }
    } catch (error) {
      console.error('Error in updateRole:', error);
      throw error;
    }
  }
}

// Singleton instance
export const profilesClient = new ProfilesClient();
