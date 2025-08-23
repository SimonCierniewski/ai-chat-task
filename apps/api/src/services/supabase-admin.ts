import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

let supabaseAdmin: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const supabaseUrl = config.supabase.url;
    const serviceRoleKey = config.supabase.serviceRoleKey;
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }
    
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  
  return supabaseAdmin;
}
