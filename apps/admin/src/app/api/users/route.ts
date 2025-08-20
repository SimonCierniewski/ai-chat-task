import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicConfig, serverConfig, validateServerConfig } from '../../../../lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface User {
  id: string;
  email: string;
  created_at: string;
  role: 'user' | 'admin';
  last_sign_in_at?: string;
  message_count?: number;
}

export async function GET(request: NextRequest) {
  try {
    // Validate server config
    validateServerConfig();
    
    // Check authentication
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    
    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const offset = (page - 1) * limit;

    // Try to fetch from backend API first
    try {
      const apiUrl = new URL('/api/v1/admin/users', publicConfig.apiBaseUrl);
      apiUrl.searchParams.append('page', page.toString());
      apiUrl.searchParams.append('limit', limit.toString());
      if (search) apiUrl.searchParams.append('search', search);

      const response = await fetch(apiUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${user.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch (error) {
      console.log('Backend API not available, fetching directly from Supabase');
    }

    // Fallback to direct Supabase query
    // First get users from auth.users (requires service role)
    const authUsersResponse = await fetch(
      `${publicConfig.supabaseUrl}/auth/v1/admin/users`,
      {
        headers: {
          'apikey': serverConfig.supabaseServiceKey,
          'Authorization': `Bearer ${serverConfig.supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!authUsersResponse.ok) {
      throw new Error('Failed to fetch users from auth');
    }

    const { users: authUsers } = await authUsersResponse.json();

    // Get profiles for role information
    const userIds = authUsers.map((u: any) => u.id);
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, role')
      .in('user_id', userIds);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
    }

    // Merge auth users with profile data
    const profileMap = new Map(profiles?.map(p => [p.user_id, p.role]) || []);
    
    let users: User[] = authUsers.map((authUser: any) => ({
      id: authUser.id,
      email: authUser.email || '',
      created_at: authUser.created_at,
      role: profileMap.get(authUser.id) || 'user',
      last_sign_in_at: authUser.last_sign_in_at,
    }));

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(u => 
        u.email.toLowerCase().includes(searchLower) ||
        u.id.toLowerCase().includes(searchLower)
      );
    }

    // Calculate pagination
    const total = users.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedUsers = users.slice(offset, offset + limit);

    return NextResponse.json({
      users: paginatedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}