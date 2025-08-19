'use client';

import { AdminHeader } from '@/components/admin/header';
import { Card } from '@/components/ui/card';

export default function TelemetryPage() {
  // Mock data for chart visualization
  const mockData = {
    messagesPerDay: [
      { day: 'Mon', count: 1234 },
      { day: 'Tue', count: 1456 },
      { day: 'Wed', count: 1678 },
      { day: 'Thu', count: 1234 },
      { day: 'Fri', count: 1890 },
      { day: 'Sat', count: 987 },
      { day: 'Sun', count: 765 },
    ],
    costByModel: [
      { model: 'gpt-4o-mini', cost: 234.56 },
      { model: 'gpt-4o', cost: 456.78 },
      { model: 'gpt-3.5-turbo', cost: 123.45 },
    ]
  };

  return (
    <>
      <AdminHeader 
        title="Telemetry" 
        subtitle="System metrics and performance data"
      />
      
      <div className="p-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card
            title="Avg TTFT"
            value="287ms"
            description="Time to first token"
            icon="⚡"
          />
          <Card
            title="Success Rate"
            value="99.2%"
            description="Last 24 hours"
            icon="✅"
          />
          <Card
            title="Total Tokens"
            value="1.2M"
            description="This month"
            icon="🔤"
          />
          <Card
            title="Error Rate"
            value="0.8%"
            description="Last 24 hours"
            icon="⚠️"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Messages Per Day Chart */}
          <Card title="Messages Per Day" icon="📊">
            <div className="mt-4">
              <div className="h-64 flex items-end justify-between gap-2">
                {mockData.messagesPerDay.map((day) => (
                  <div key={day.day} className="flex-1 flex flex-col items-center">
                    <div 
                      className="w-full bg-blue-500 rounded-t"
                      style={{ height: `${(day.count / 2000) * 100}%` }}
                    />
                    <span className="text-xs text-gray-600 mt-2">{day.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Cost by Model */}
          <Card title="Cost by Model" icon="💰">
            <div className="mt-4 space-y-4">
              {mockData.costByModel.map((item) => (
                <div key={item.model}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{item.model}</span>
                    <span>${item.cost.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${(item.cost / 500) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Detailed Metrics Table */}
        <Card title="Recent Events" icon="📋" className="mt-8">
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tokens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    TTFT
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    10:23:45
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                      openai_call
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    user@example.com
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    gpt-4o-mini
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    1,234
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    $0.0234
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    245ms
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}