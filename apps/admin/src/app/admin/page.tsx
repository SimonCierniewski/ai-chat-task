'use client'

import { ProtectedRoute } from '@/components/auth/protected-route'
import { AuthStatus } from '@/components/auth/auth-status'
import { useAuth } from '@/providers/auth-provider'

export default function AdminPage() {
  const { profile } = useAuth()

  return (
    <ProtectedRoute requireAdmin={true}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                <AuthStatus />
              </div>

              <div className="border-t border-gray-200 pt-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="bg-blue-50 p-6 rounded-lg">
                    <h3 className="text-lg font-medium text-blue-900">Playground</h3>
                    <p className="mt-2 text-sm text-blue-700">
                      Test AI chat with memory and SSE streaming
                    </p>
                    <a
                      href="/admin/playground"
                      className="mt-4 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                    >
                      Open Playground
                    </a>
                  </div>

                  <div className="bg-green-50 p-6 rounded-lg">
                    <h3 className="text-lg font-medium text-green-900">Users</h3>
                    <p className="mt-2 text-sm text-green-700">
                      Manage users and their roles
                    </p>
                    <a
                      href="/admin/users"
                      className="mt-4 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                    >
                      View Users
                    </a>
                  </div>

                  <div className="bg-purple-50 p-6 rounded-lg">
                    <h3 className="text-lg font-medium text-purple-900">Telemetry</h3>
                    <p className="mt-2 text-sm text-purple-700">
                      View usage metrics and costs
                    </p>
                    <a
                      href="/admin/telemetry"
                      className="mt-4 inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
                    >
                      View Metrics
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Session Info</h3>
                <div className="text-sm text-gray-600">
                  <p>User ID: {profile?.id}</p>
                  <p>Email: {profile?.email}</p>
                  <p>Role: <span className="font-semibold text-green-600">{profile?.role}</span></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}