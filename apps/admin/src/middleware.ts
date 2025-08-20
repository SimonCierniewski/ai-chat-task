import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { validateAdminEnvironment } from '@/lib/validate-env'

// Validate environment on first load
let envValidated = false;

export async function middleware(request: NextRequest) {
  // Validate environment once
  if (!envValidated) {
    try {
      validateAdminEnvironment();
      envValidated = true;
    } catch (error) {
      console.error('Environment validation failed:', error);
      // Return error page for all requests
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
          <head><title>Configuration Error</title></head>
          <body style="font-family: system-ui; padding: 2rem;">
            <h1>⚠️ Configuration Error</h1>
            <p>The admin panel is not properly configured.</p>
            <pre style="background: #f4f4f4; padding: 1rem; border-radius: 4px;">${error instanceof Error ? error.message : 'Unknown error'}</pre>
            <p>Please check your .env.local file and restart the server.</p>
          </body>
        </html>`,
        {
          status: 500,
          headers: { 'content-type': 'text/html' },
        }
      );
    }
  }
  
  // Update session first
  const response = await updateSession(request)
  
  // Check if this is an admin route
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin') && 
                      !request.nextUrl.pathname.startsWith('/admin/login')
  
  if (!isAdminRoute) {
    return response
  }

  // Create supabase client for auth check
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set() {},
        remove() {},
      },
    }
  )

  // Check if user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  if (userError || !user) {
    // Redirect to login if not authenticated
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Verify admin role using regular Supabase session RLS
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      // Redirect to unauthorized if not admin
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }
  } catch (error) {
    console.error('Error checking admin role:', error)
    return NextResponse.redirect(new URL('/unauthorized', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}