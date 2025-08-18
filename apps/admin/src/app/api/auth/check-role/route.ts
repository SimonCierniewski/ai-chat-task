import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    )
  }

  try {
    // Call API to get user profile with role
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/me`, {
      headers: {
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch profile')
    }

    const data = await response.json()
    
    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      role: data.user.role,
    })
  } catch (error) {
    console.error('Error fetching role:', error)
    
    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      role: 'user', // Default to user if profile fetch fails
    })
  }
}