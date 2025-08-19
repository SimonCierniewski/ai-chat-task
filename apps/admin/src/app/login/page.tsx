'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/providers/auth-provider'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const { signInWithEmail, user, profile } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  // Redirect if already logged in
  useEffect(() => {
    if (user && profile) {
      if (profile.role === 'admin') {
        router.push('/admin')
      } else {
        router.push('/unauthorized')
      }
    }
  }, [user, profile, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      await signInWithEmail(email)
      setMessage('Check your email for the magic link!')
      setEmailSent(true)
    } catch (error: any) {
      setMessage(error.message || 'An error occurred')
      setEmailSent(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Admin Dashboard
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {emailSent 
              ? 'Magic link sent!' 
              : 'Sign in with your email via magic link'}
          </p>
        </div>
        
        {/* Show check email state */}
        {emailSent ? (
          <div className="rounded-lg bg-green-50 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-green-900 mb-2">Check your email!</h3>
            <p className="text-sm text-green-700 mb-4">
              We've sent a magic link to <strong>{email}</strong>
            </p>
            <p className="text-xs text-green-600">
              Click the link in the email to sign in. The link expires in 1 hour.
            </p>
            <button
              onClick={() => {
                setEmailSent(false)
                setMessage(null)
                setEmail('')
              }}
              className="mt-4 text-sm text-green-700 hover:text-green-800 underline"
            >
              Try a different email
            </button>
          </div>
        ) : (
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
              />
            </div>
          </div>

          {error === 'auth_failed' && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">
                Authentication failed. Please try again.
              </p>
            </div>
          )}

          {message && (
            <div className={`rounded-md p-4 ${
              message.includes('Check your email') 
                ? 'bg-green-50' 
                : 'bg-yellow-50'
            }`}>
              <p className={`text-sm ${
                message.includes('Check your email')
                  ? 'text-green-800'
                  : 'text-yellow-800'
              }`}>
                {message}
              </p>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send Magic Link'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}