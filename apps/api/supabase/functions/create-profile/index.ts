// Supabase Edge Function to create profile on user signup
// Deploy with: supabase functions deploy create-profile

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: {
    id: string;
    email?: string;
    raw_user_meta_data?: any;
  };
  old_record?: any;
}

serve(async (req) => {
  try {
    // Verify webhook secret (optional but recommended)
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    if (webhookSecret) {
      const providedSecret = req.headers.get('x-webhook-secret');
      if (providedSecret !== webhookSecret) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    // Parse webhook payload
    const payload: WebhookPayload = await req.json();

    // Only process INSERT events on auth.users
    if (payload.type !== 'INSERT' || payload.table !== 'users') {
      return new Response('Not applicable', { status: 200 });
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create profile for new user
    const { error } = await supabase
      .from('profiles')
      .insert({
        user_id: payload.record.id,
        role: 'user',
        display_name: payload.record.raw_user_meta_data?.display_name || payload.record.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .single();

    if (error && error.code !== '23505') { // Ignore duplicate key errors
      console.error('Error creating profile:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});