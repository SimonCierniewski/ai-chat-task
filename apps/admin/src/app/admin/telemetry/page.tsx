'use client';

import { useState, useEffect } from 'react';
import { AdminHeader } from '@/components/admin/header';
import { Card } from '@/components/ui/card';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

interface MetricsData {
  kpis: {
    total_messages: number;
    total_cost: number;
    avg_ttft_ms: number;
    avg_response_ms: number;
  };
  daily: Array<{
    day: string;
    messages: number;
    total_cost: number;
    avg_ttft_ms: number;
    avg_response_ms: number;
    tokens_in: number;
    tokens_out: number;
  }>;
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

export default function TelemetryPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<'7' | '30'>('7');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    fetchMetrics();
  }, [dateRange, selectedUser, selectedModel]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      // Calculate date range
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - parseInt(dateRange));

      // Build query params
      const params = new URLSearchParams({
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
      });
      if (selectedUser) params.append('userId', selectedUser);
      if (selectedModel) params.append('model', selectedModel);

      const response = await fetch(`/api/telemetry/metrics?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch metrics');
      }

      const data = await response.json();
      setMetrics(data);

      // Extract unique models for filter
      if (data.models) {
        const models = data.models.map((m: any) => m.model);
        setAvailableModels(models);
      }
    } catch (err: any) {
      console.error('Error fetching metrics:', err);
      setError(err.message || 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const formatTiming = (ms: number) => {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-sm">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {
                entry.dataKey.includes('cost') 
                  ? formatCurrency(entry.value)
                  : entry.dataKey.includes('ms')
                  ? formatTiming(entry.value)
                  : formatNumber(entry.value)
              }
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <>
        <AdminHeader 
          title="Telemetry" 
          subtitle="System metrics and performance data"
        />
        <div className="p-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading metrics...</div>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <AdminHeader 
          title="Telemetry" 
          subtitle="System metrics and performance data"
        />
        <div className="p-8">
          <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-700">{error}</p>
            <button 
              onClick={fetchMetrics}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader 
        title="Telemetry" 
        subtitle="System metrics and performance data"
      />
      
      <div className="p-8">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Range
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as '7' | '30')}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </div>

          {metrics?.users && metrics.users.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User (Optional)
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Users</option>
                {metrics.users.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {availableModels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model (Optional)
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Models</option>
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card
            title="Total Messages"
            value={formatNumber(metrics?.kpis.total_messages || 0)}
            description={`Last ${dateRange} days`}
            icon="💬"
          />
          <Card
            title="Total Cost"
            value={formatCurrency(metrics?.kpis.total_cost || 0)}
            description={`Last ${dateRange} days`}
            icon="💰"
          />
          <Card
            title="Avg TTFT"
            value={formatTiming(metrics?.kpis.avg_ttft_ms || 0)}
            description="Time to first token"
            icon="⚡"
          />
          <Card
            title="Avg Response Time"
            value={formatTiming(metrics?.kpis.avg_response_ms || 0)}
            description="End-to-end latency"
            icon="⏱️"
          />
        </div>

        {/* Charts */}
        {metrics?.daily && metrics.daily.length > 0 && (
          <div className="space-y-8">
            {/* Messages per Day Chart */}
            <Card title="Messages per Day" icon="📊">
              <div className="mt-4 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="day" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="messages" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      name="Messages"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Average TTFT per Day Chart */}
            <Card title="Average TTFT per Day" icon="⚡">
              <div className="mt-4 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="day" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `${value}ms`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="avg_ttft_ms" 
                      stroke="#8b5cf6" 
                      strokeWidth={2}
                      dot={{ fill: '#8b5cf6', r: 4 }}
                      name="Avg TTFT (ms)"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="avg_response_ms" 
                      stroke="#ec4899" 
                      strokeWidth={2}
                      dot={{ fill: '#ec4899', r: 4 }}
                      name="Avg Response (ms)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Costs per Day Chart */}
            <Card title="Costs per Day" icon="💰">
              <div className="mt-4 h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metrics.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="day" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="total_cost" 
                      stroke="#10b981" 
                      fill="#10b981"
                      fillOpacity={0.3}
                      strokeWidth={2}
                      name="Cost (USD)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Model Distribution */}
            {metrics.models && metrics.models.length > 0 && (
              <Card title="Model Usage & Costs" icon="🤖">
                <div className="mt-4 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.models}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="model" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 12 }} />
                      <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => `$${value}`}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar 
                        yAxisId="left" 
                        dataKey="count" 
                        fill="#3b82f6" 
                        name="Message Count"
                      />
                      <Bar 
                        yAxisId="right" 
                        dataKey="total_cost" 
                        fill="#10b981" 
                        name="Total Cost (USD)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}