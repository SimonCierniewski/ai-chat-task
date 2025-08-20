import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicConfig, serverConfig, validateServerConfig } from '../../../../../lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MetricsQuery {
  from?: string;
  to?: string;
  userId?: string;
  model?: string;
}

interface DailyMetric {
  day: string;
  messages: number;
  total_cost: number;
  avg_ttft_ms: number;
  avg_response_ms: number;
  tokens_in: number;
  tokens_out: number;
}

interface MetricsResponse {
  kpis: {
    total_messages: number;
    total_cost: number;
    avg_ttft_ms: number;
    avg_response_ms: number;
  };
  daily: DailyMetric[];
  models: Array<{
    model: string;
    count: number;
    total_cost: number;
  }>;
  users?: Array<{
    user_id: string;
    email: string;
    message_count: number;
    total_cost: number;
  }>;
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

    // Check admin role using service role key
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    
    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const query: MetricsQuery = {
      from: searchParams.get('from') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      to: searchParams.get('to') || new Date().toISOString().split('T')[0],
      userId: searchParams.get('userId') || undefined,
      model: searchParams.get('model') || undefined,
    };

    // Try to fetch metrics from the backend API first
    try {
      const metricsUrl = new URL('/api/v1/admin/metrics', publicConfig.apiBaseUrl);
      if (query.from) metricsUrl.searchParams.append('from', query.from);
      if (query.to) metricsUrl.searchParams.append('to', query.to);
      if (query.userId) metricsUrl.searchParams.append('userId', query.userId);
      if (query.model) metricsUrl.searchParams.append('model', query.model);

      const metricsResponse = await fetch(metricsUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${user.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (metricsResponse.ok) {
        const metrics = await metricsResponse.json();
        return NextResponse.json(metrics);
      }
    } catch (error) {
      console.log('Backend API not available, fetching directly from Supabase');
    }

    // Fallback to direct Supabase query
    // Build the query for daily_usage_view
    let dailyQuery = supabase
      .from('daily_usage_view')
      .select('*')
      .gte('day', query.from!)
      .lte('day', query.to!);

    if (query.userId) {
      dailyQuery = dailyQuery.eq('user_id', query.userId);
    }
    if (query.model) {
      dailyQuery = dailyQuery.eq('model', query.model);
    }

    const { data: dailyData, error: dailyError } = await dailyQuery;

    if (dailyError) {
      console.error('Error fetching daily metrics:', dailyError);
      return NextResponse.json(
        { error: 'Failed to fetch metrics from database' },
        { status: 500 }
      );
    }

    // Aggregate the data
    const daily: DailyMetric[] = [];
    const dayMap = new Map<string, DailyMetric>();
    const modelMap = new Map<string, { count: number; total_cost: number }>();

    for (const row of dailyData || []) {
      const dayKey = row.day;
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, {
          day: dayKey,
          messages: 0,
          total_cost: 0,
          avg_ttft_ms: 0,
          avg_response_ms: 0,
          tokens_in: 0,
          tokens_out: 0,
        });
      }

      const dayMetric = dayMap.get(dayKey)!;
      dayMetric.messages += row.calls || 0;
      dayMetric.total_cost += row.cost_usd || 0;
      dayMetric.avg_ttft_ms = row.avg_ttft_ms || 0;
      dayMetric.avg_response_ms = row.avg_duration_ms || 0;
      dayMetric.tokens_in += row.tokens_in || 0;
      dayMetric.tokens_out += row.tokens_out || 0;

      // Aggregate by model
      const modelKey = row.model || 'unknown';
      if (!modelMap.has(modelKey)) {
        modelMap.set(modelKey, { count: 0, total_cost: 0 });
      }
      const modelMetric = modelMap.get(modelKey)!;
      modelMetric.count += row.calls || 0;
      modelMetric.total_cost += row.cost_usd || 0;
    }

    // Convert maps to arrays
    daily.push(...Array.from(dayMap.values()).sort((a, b) => a.day.localeCompare(b.day)));

    const models = Array.from(modelMap.entries()).map(([model, data]) => ({
      model,
      count: data.count,
      total_cost: data.total_cost,
    }));

    // Calculate KPIs
    const totalMessages = daily.reduce((sum, d) => sum + d.messages, 0);
    const totalCost = daily.reduce((sum, d) => sum + d.total_cost, 0);
    const avgTtft = daily.length > 0 
      ? daily.reduce((sum, d) => sum + d.avg_ttft_ms, 0) / daily.length 
      : 0;
    const avgResponse = daily.length > 0
      ? daily.reduce((sum, d) => sum + d.avg_response_ms, 0) / daily.length
      : 0;

    const response: MetricsResponse = {
      kpis: {
        total_messages: totalMessages,
        total_cost: totalCost,
        avg_ttft_ms: Math.round(avgTtft),
        avg_response_ms: Math.round(avgResponse),
      },
      daily,
      models,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}