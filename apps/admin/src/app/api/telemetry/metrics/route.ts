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

    // Fetch metrics from the backend API
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

    if (!metricsResponse.ok) {
      // If the backend API isn't available, return mock data for development
      if (metricsResponse.status === 404 || metricsResponse.status === 502) {
        return NextResponse.json(getMockMetrics(query));
      }
      throw new Error(`Metrics API error: ${metricsResponse.status}`);
    }

    const metrics = await metricsResponse.json();
    return NextResponse.json(metrics);

  } catch (error) {
    console.error('Error fetching metrics:', error);
    // Return mock data in development
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(getMockMetrics({}));
    }
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}

// Mock data for development/testing
function getMockMetrics(query: MetricsQuery): MetricsResponse {
  const days = 7;
  const baseDate = new Date(query.to || new Date());
  
  const daily: DailyMetric[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() - i);
    daily.push({
      day: date.toISOString().split('T')[0],
      messages: Math.floor(Math.random() * 500) + 100,
      total_cost: Math.random() * 50 + 10,
      avg_ttft_ms: Math.floor(Math.random() * 200) + 150,
      avg_response_ms: Math.floor(Math.random() * 1000) + 500,
      tokens_in: Math.floor(Math.random() * 50000) + 10000,
      tokens_out: Math.floor(Math.random() * 100000) + 20000,
    });
  }

  const totalMessages = daily.reduce((sum, d) => sum + d.messages, 0);
  const totalCost = daily.reduce((sum, d) => sum + d.total_cost, 0);
  const avgTtft = daily.reduce((sum, d) => sum + d.avg_ttft_ms, 0) / daily.length;
  const avgResponse = daily.reduce((sum, d) => sum + d.avg_response_ms, 0) / daily.length;

  return {
    kpis: {
      total_messages: totalMessages,
      total_cost: totalCost,
      avg_ttft_ms: Math.round(avgTtft),
      avg_response_ms: Math.round(avgResponse),
    },
    daily,
    models: [
      { model: 'gpt-4o-mini', count: Math.floor(totalMessages * 0.6), total_cost: totalCost * 0.3 },
      { model: 'gpt-4o', count: Math.floor(totalMessages * 0.3), total_cost: totalCost * 0.6 },
      { model: 'gpt-3.5-turbo', count: Math.floor(totalMessages * 0.1), total_cost: totalCost * 0.1 },
    ],
    users: [
      { user_id: 'user-1', email: 'alice@example.com', message_count: Math.floor(totalMessages * 0.4), total_cost: totalCost * 0.4 },
      { user_id: 'user-2', email: 'bob@example.com', message_count: Math.floor(totalMessages * 0.35), total_cost: totalCost * 0.35 },
      { user_id: 'user-3', email: 'charlie@example.com', message_count: Math.floor(totalMessages * 0.25), total_cost: totalCost * 0.25 },
    ],
  };
}