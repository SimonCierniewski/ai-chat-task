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

  try {
    // Use service role key for admin operations (SERVER ONLY)
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    console.log('Service role key configured:', !!serviceRoleKey)
    console.log('User ID:', user.id)

    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not configured - please set it in .env.local')
      return NextResponse.json({
        authenticated: true,
        userId: user.id,
        email: user.email,
        role: 'user', // Default to user if service key missing
        warning: 'Service role key not configured - cannot fetch actual role from profiles table'
      })
    }

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

      // Create profile if it doesn't exist
      if (profileError.code === 'PGRST116') {
        const { data: newProfile, error: createError } = await supabaseAdmin
          .from('profiles')
          .insert({
            user_id: user.id,
            email: user.email,
            role: 'user'
          })
          .select('role')
          .single()

        if (createError) {
          console.error('Error creating profile:', createError)
          return NextResponse.json({
            authenticated: true,
            userId: user.id,
            email: user.email,
            role: 'user'
          })
        }

        return NextResponse.json({
          authenticated: true,
          userId: user.id,
          email: user.email,
          role: newProfile.role
        })
      }
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
