import { AdminHeader } from '@/components/admin/header';
import { Card } from '@/components/ui/card';

// This would be fetched from API in production
const mockUsers = [
  { id: '1', email: 'admin@example.com', role: 'admin', createdAt: '2024-01-01', lastSignIn: '2024-01-15', messageCount: 234, totalCost: 45.67 },
  { id: '2', email: 'user1@example.com', role: 'user', createdAt: '2024-01-02', lastSignIn: '2024-01-14', messageCount: 156, totalCost: 23.45 },
  { id: '3', email: 'user2@example.com', role: 'user', createdAt: '2024-01-03', lastSignIn: '2024-01-13', messageCount: 89, totalCost: 12.34 },
];

export default function UsersPage() {
  return (
    <>
      <AdminHeader 
        title="Users" 
        subtitle="Manage users and view their activity"
      />
      
      <div className="p-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card
            title="Total Users"
            value="1,247"
            icon="👥"
          />
          <Card
            title="Active Today"
            value="342"
            icon="🟢"
          />
          <Card
            title="Admin Users"
            value="3"
            icon="👑"
          />
          <Card
            title="New This Week"
            value="47"
            icon="✨"
          />
        </div>

        {/* Users Table */}
        <Card title="All Users" icon="📋">
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Sign In
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Messages
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {mockUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        user.role === 'admin' 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.createdAt}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.lastSignIn}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.messageCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${user.totalCost.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button className="text-blue-600 hover:text-blue-900 mr-3">
                        View
                      </button>
                      <button className="text-red-600 hover:text-red-900">
                        Disable
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}