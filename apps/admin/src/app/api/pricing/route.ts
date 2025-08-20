import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicConfig } from '../../../../lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get session with access token
    const supabase = createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', session.user.id)
      .single();
    
    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Fetch from backend API - this is the only way to get pricing
    const apiUrl = new URL('/api/v1/admin/models', publicConfig.apiBaseUrl);
    const response = await fetch(apiUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Backend API not available. Please ensure the API server is running.' },
        { status: response.status || 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({ models: data.models || [] });

  } catch (error) {
    console.error('Error fetching pricing:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch pricing' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get session with access token
    const supabase = createClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', session.user.id)
      .single();
    
    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { models } = body;

    if (!models || !Array.isArray(models)) {
      return NextResponse.json({ error: 'Invalid pricing data' }, { status: 400 });
    }

    // Validate pricing data
    for (const model of models) {
      if (!model.model || typeof model.input_per_mtok !== 'number' || typeof model.output_per_mtok !== 'number') {
        return NextResponse.json({ 
          error: `Invalid pricing for model: ${model.model}` 
        }, { status: 400 });
      }

      if (model.input_per_mtok < 0 || model.output_per_mtok < 0) {
        return NextResponse.json({ 
          error: `Pricing must be non-negative for model: ${model.model}` 
        }, { status: 400 });
      }
    }

    // Update via backend API - this is the only way to update pricing
    const apiUrl = new URL('/api/v1/admin/models/pricing', publicConfig.apiBaseUrl);
    const response = await fetch(apiUrl.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ models }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend API error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Failed to update pricing. Please ensure the API server is running.' },
        { status: response.status || 500 }
      );
    }

    const data = await response.json();
    return NextResponse.json({ 
      success: true,
      message: 'Pricing updated successfully',
      models: data.models || models,
    });

  } catch (error) {
    console.error('Error updating pricing:', error);
    return NextResponse.json(
      { error: 'Failed to update pricing' },
      { status: 500 }
    );
  }
}