'use client'

import { useAuth } from '@/providers/auth-provider'

export default function UnauthorizedPage() {
  const { signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Access Denied
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            You need admin privileges to access this page.
          </p>
          <p className="mt-4 text-xs text-gray-500">
            If you were just granted admin access, please sign out and sign back in to refresh your permissions.
          </p>
        </div>
        <div className="mt-8 space-y-3">
          <button
            onClick={handleSignOut}
            className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
          >
            Sign Out
          </button>
          <a
            href="/"
            className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Go to Home
          </a>
        </div>
      </div>
    </div>
  )
}