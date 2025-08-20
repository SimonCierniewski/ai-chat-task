import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicConfig, serverConfig, validateServerConfig } from '../../../../lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ModelPricing {
  model: string;
  display_name?: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cached_input_per_mtok?: number;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  try {
    // Validate server config
    validateServerConfig();
    
    // Check authentication
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    
    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Try to fetch from backend API first
    try {
      const apiUrl = new URL('/api/v1/admin/models', publicConfig.apiBaseUrl);
      const response = await fetch(apiUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${user.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({ models: data.models || [] });
      }
    } catch (error) {
      console.log('Backend API not available, using fallback data');
    }

    // Fallback to direct Supabase query
    const { data: pricing, error: pricingError } = await supabase
      .from('models_pricing')
      .select('*')
      .order('model', { ascending: true });

    if (pricingError) {
      console.error('Error fetching pricing from Supabase:', pricingError);
      return NextResponse.json(
        { error: 'Failed to fetch pricing from database' },
        { status: 500 }
      );
    }

    return NextResponse.json({ models: pricing || [] });

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
    // Validate server config
    validateServerConfig();
    
    // Check authentication
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
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

    // Try to update via backend API first
    try {
      const apiUrl = new URL('/api/v1/admin/models/pricing', publicConfig.apiBaseUrl);
      const response = await fetch(apiUrl.toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ models }),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({ 
          success: true,
          message: 'Pricing updated successfully',
          models: data.models || models,
        });
      }
    } catch (error) {
      console.log('Backend API not available, updating directly in Supabase');
    }

    // Fallback to direct Supabase update using service role
    const updatePromises = models.map(async (model) => {
      const updateData = {
        input_per_mtok: model.input_per_mtok,
        output_per_mtok: model.output_per_mtok,
        cached_input_per_mtok: model.cached_input_per_mtok || null,
        updated_at: new Date().toISOString(),
      };

      // Use service role to bypass RLS
      const response = await fetch(
        `${publicConfig.supabaseUrl}/rest/v1/models_pricing?model=eq.${model.model}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': serverConfig.supabaseServiceKey,
            'Authorization': `Bearer ${serverConfig.supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(updateData),
        }
      );

      if (!response.ok) {
        // If update fails, try to insert
        const insertResponse = await fetch(
          `${publicConfig.supabaseUrl}/rest/v1/models_pricing`,
          {
            method: 'POST',
            headers: {
              'apikey': serverConfig.supabaseServiceKey,
              'Authorization': `Bearer ${serverConfig.supabaseServiceKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({
              model: model.model,
              ...updateData,
            }),
          }
        );

        if (!insertResponse.ok) {
          throw new Error(`Failed to update pricing for model: ${model.model}`);
        }
      }
    });

    await Promise.all(updatePromises);

    return NextResponse.json({ 
      success: true,
      message: 'Pricing updated successfully',
      models,
    });

  } catch (error) {
    console.error('Error updating pricing:', error);
    return NextResponse.json(
      { error: 'Failed to update pricing' },
      { status: 500 }
    );
  }
}