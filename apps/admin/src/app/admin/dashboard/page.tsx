import { AdminHeader } from '@/components/admin/header';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

export default function AdminDashboard() {
  // This would be fetched from API in production
  const stats = {
    totalUsers: 1247,
    activeToday: 342,
    totalMessages: 45892,
    avgResponseTime: '287ms',
    totalCost: '$1,234.56',
    systemHealth: 'Operational'
  };

  return (
    <>
      <AdminHeader 
        title="Dashboard" 
        subtitle="System overview and key metrics"
      />
      
      <div className="p-8">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card
            title="Total Users"
            value={stats.totalUsers.toLocaleString()}
            description="Registered users"
            icon="👥"
          />
          <Card
            title="Active Today"
            value={stats.activeToday}
            description="Users in last 24h"
            icon="🟢"
          />
          <Card
            title="Total Messages"
            value={stats.totalMessages.toLocaleString()}
            description="All-time messages sent"
            icon="💬"
          />
          <Card
            title="Avg Response Time"
            value={stats.avgResponseTime}
            description="Last 24 hours"
            icon="⚡"
          />
          <Card
            title="Total Cost"
            value={stats.totalCost}
            description="Month to date"
            icon="💰"
          />
          <Card
            title="System Health"
            value={stats.systemHealth}
            description="All services status"
            icon="✅"
          />
        </div>

        {/* Quick Actions */}
        <h3 className="text-xl font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/admin/playground">
            <Card 
              title="Test Playground"
              description="Try the chat system"
              icon="🎮"
              className="hover:shadow-md transition-shadow cursor-pointer"
            />
          </Link>
          <Link href="/admin/users">
            <Card 
              title="Manage Users"
              description="View and edit users"
              icon="👤"
              className="hover:shadow-md transition-shadow cursor-pointer"
            />
          </Link>
          <Link href="/admin/telemetry">
            <Card 
              title="View Telemetry"
              description="System metrics"
              icon="📊"
              className="hover:shadow-md transition-shadow cursor-pointer"
            />
          </Link>
          <Link href="/admin/pricing">
            <Card 
              title="Update Pricing"
              description="Model pricing config"
              icon="💳"
              className="hover:shadow-md transition-shadow cursor-pointer"
            />
          </Link>
        </div>
      </div>
    </>
  );
}