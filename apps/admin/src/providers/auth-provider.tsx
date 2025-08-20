'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface UserProfile {
  id: string
  email: string
  role: 'user' | 'admin'
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  session: Session | null
  loading: boolean
  signInWithEmail: (email: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  const fetchProfile = async (userId: string) => {
    try {
      // First try the API server /api/me endpoint if configured
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
      if (apiBaseUrl && session?.access_token) {
        try {
          const response = await fetch(`${apiBaseUrl}/api/me`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          })
          
          if (response.ok) {
            const data = await response.json()
            setProfile({
              id: userId,
              email: data.user.email,
              role: data.user.role,
            })
            return
          }
        } catch (apiError) {
          console.warn('Failed to fetch from API server, falling back to local endpoint:', apiError)
        }
      }
      
      // Fallback to local Next.js API route which has access to service role key
      const response = await fetch('/api/auth/check-role')
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to fetch user role')
      }
      
      const data = await response.json()
      setProfile({
        id: userId,
        email: data.email,
        role: data.role,
      })
    } catch (error) {
      console.error('Error fetching profile:', error)
    }
  }

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (session) {
          setSession(session)
          setUser(session.user)
          await fetchProfile(session.user.id)
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
      } finally {
        setLoading(false)
      }
    }

    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      
      if (session?.user) {
        await fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
      
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const signInWithEmail = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      throw error
    }
  }

  const signOut = async () => {
    // Sign out from Supabase
    await supabase.auth.signOut()
    
    // Clear local state
    setUser(null)
    setProfile(null)
    setSession(null)
    
    // Clear all storage to remove any cached tokens
    if (typeof window !== 'undefined') {
      // Clear localStorage
      localStorage.clear()
      
      // Clear sessionStorage
      sessionStorage.clear()
      
      // Clear all cookies for this domain
      document.cookie.split(";").forEach((c) => {
        const eqPos = c.indexOf("=")
        const name = eqPos > -1 ? c.substr(0, eqPos) : c
        document.cookie = `${name.trim()}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
        document.cookie = `${name.trim()}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`
        document.cookie = `${name.trim()}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`
      })
    }
    
    // Navigate to login
    router.push('/login')
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  const value = {
    user,
    profile,
    session,
    loading,
    signInWithEmail,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}