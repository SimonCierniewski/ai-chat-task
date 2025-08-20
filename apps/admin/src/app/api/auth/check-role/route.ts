import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  // Regular client for auth
  const supabase = createClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    )
  }

  // Use service role key for admin operations (SERVER ONLY)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!serviceRoleKey) {
    // Fail fast - this is a critical configuration error
    return NextResponse.json(
      { 
        error: 'Configuration Error',
        message: 'SUPABASE_SERVICE_ROLE_KEY is not configured. Cannot verify user roles.',
        details: 'Please set SUPABASE_SERVICE_ROLE_KEY in .env.local'
      },
      { status: 500 }
    )
  }

  try {

    // Create admin client with service role
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    )

    // Fetch profile directly from database
    console.log('Fetching profile for user:', user.id)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    console.log('Profile fetch result:', { profile, error: profileError })

    if (profileError) {
      console.error('Error fetching profile:', profileError)
      
      // Fail fast - user must have a profile
      if (profileError.code === 'PGRST116') {
        return NextResponse.json(
          {
            error: 'Profile Not Found',
            message: `No profile found for user ${user.id}. User must be properly onboarded.`,
            userId: user.id
          },
          { status: 404 }
        )
      }
      
      // Other database errors
      return NextResponse.json(
        {
          error: 'Database Error',
          message: 'Failed to fetch user profile from database',
          details: profileError.message
        },
        { status: 500 }
      )
    }
    
    if (!profile) {
      return NextResponse.json(
        {
          error: 'Profile Not Found', 
          message: 'Profile data is null',
          userId: user.id
        },
        { status: 404 }
      )
    }

    console.log('Returning role:', profile?.role || 'user')
    
    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      role: profile?.role || 'user',
    })
  } catch (error) {
    console.error('Error in role check:', error)

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      role: 'user', // Default to user on any error
    })
  }
}
