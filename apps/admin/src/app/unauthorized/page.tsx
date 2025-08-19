'use client'

import { useAuth } from '@/providers/auth-provider'

export default function UnauthorizedPage() {
  const { signOut, user, profile } = useAuth()

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Access Denied
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            You need admin privileges to access this page.
          </p>
          {user && (
            <div className="mt-4 p-3 bg-gray-100 rounded-md">
              <p className="text-xs text-gray-700">
                Signed in as: <strong>{user.email}</strong>
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Current role: <span className="font-medium">{profile?.role || 'user'}</span>
              </p>
            </div>
          )}
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