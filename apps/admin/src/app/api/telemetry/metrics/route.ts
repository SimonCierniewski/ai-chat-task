import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicConfig } from '../../../../../lib/config';

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

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const from = searchParams.get('from') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const to = searchParams.get('to') || new Date().toISOString().split('T')[0];
    const userId = searchParams.get('userId') || undefined;
    const model = searchParams.get('model') || undefined;

    // Fetch metrics from the backend API - this is the only way to get metrics
    const metricsUrl = new URL('/api/v1/admin/metrics', publicConfig.apiBaseUrl);
    if (from) metricsUrl.searchParams.append('from', from);
    if (to) metricsUrl.searchParams.append('to', to);
    if (userId) metricsUrl.searchParams.append('userId', userId);
    if (model) metricsUrl.searchParams.append('model', model);

    const metricsResponse = await fetch(metricsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!metricsResponse.ok) {
      const errorText = await metricsResponse.text();
      console.error('Backend API error:', metricsResponse.status, errorText);
      return NextResponse.json(
        { error: errorText },
        { status: metricsResponse.status || 502 }
      );
    }

    const metrics = await metricsResponse.json();
    return NextResponse.json(metrics);

  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}
