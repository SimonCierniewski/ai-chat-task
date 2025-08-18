'use client'

import { useAuth } from '@/providers/auth-provider'

export function AuthStatus() {
  const { user, profile, signOut } = useAuth()

  if (!user) {
    return null
  }

  return (
    <div className="flex items-center space-x-4">
      <div className="text-sm text-right">
        <p className="text-gray-900 font-medium">{profile?.email || user.email}</p>
        <p className="text-gray-500">
          Role: <span className={`font-semibold ${profile?.role === 'admin' ? 'text-green-600' : 'text-blue-600'}`}>
            {profile?.role || 'user'}
          </span>
        </p>
      </div>
      <button
        onClick={signOut}
        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Sign Out
      </button>
    </div>
  )
}