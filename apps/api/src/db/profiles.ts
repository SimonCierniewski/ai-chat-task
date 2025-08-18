import { ProfileRow } from '../types/auth';

/**
 * Thin database client for profiles table
 * TODO: Replace stub with actual Supabase client when database is wired
 */
export class ProfilesClient {
  private stubProfiles: Map<string, ProfileRow> = new Map();

  constructor() {
    // Initialize with some stub data for testing
    this.stubProfiles.set('test-user-id', {
      user_id: 'test-user-id',
      role: 'user',
      display_name: 'Test User',
      created_at: new Date(),
      updated_at: new Date(),
    });

    this.stubProfiles.set('test-admin-id', {
      user_id: 'test-admin-id',
      role: 'admin',
      display_name: 'Test Admin',
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  /**
   * Get user profile by user_id
   * Returns null if profile doesn't exist
   */
  async getProfile(userId: string): Promise<ProfileRow | null> {
    // TODO: Replace with actual database query
    // const { data, error } = await supabaseAdmin
    //   .from('profiles')
    //   .select('*')
    //   .eq('user_id', userId)
    //   .single();
    
    // Stub implementation
    const profile = this.stubProfiles.get(userId);
    if (!profile) {
      console.warn(`Profile not found for user: ${userId}, creating default user profile`);
      // Simulate auto-creation like the trigger would do
      const newProfile: ProfileRow = {
        user_id: userId,
        role: 'user',
        display_name: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      this.stubProfiles.set(userId, newProfile);
      return newProfile;
    }
    
    return profile;
  }

  /**
   * Get user role
   * Returns 'user' as default if profile doesn't exist
   */
  async getUserRole(userId: string): Promise<'user' | 'admin'> {
    const profile = await this.getProfile(userId);
    return profile?.role || 'user';
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
   * TODO: Add proper authorization check
   */
  async updateRole(userId: string, newRole: 'user' | 'admin'): Promise<void> {
    // TODO: Replace with actual database update
    // const { error } = await supabaseAdmin
    //   .from('profiles')
    //   .update({ role: newRole, updated_at: new Date() })
    //   .eq('user_id', userId);
    
    // Stub implementation
    const profile = await this.getProfile(userId);
    if (profile) {
      profile.role = newRole;
      profile.updated_at = new Date();
      this.stubProfiles.set(userId, profile);
    }
  }
}

// Singleton instance
export const profilesClient = new ProfilesClient();