import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all users from memory_context where current admin is the owner
    const { data: users, error: usersError } = await supabase
      .from('memory_context')
      .select('user_id, name')
      .eq('owner_id', user.id)
      .order('name', { ascending: true });

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Format users for dropdown
    const formattedUsers = (users || []).map(u => ({
      id: u.user_id,
      name: u.name || `User ${u.user_id.substring(0, 8)}`,
      label: `${u.name || 'Unnamed'} (${u.user_id.substring(0, 8)}...)`
    }));

    return NextResponse.json({ users: formattedUsers });
  } catch (error) {
    console.error('Error in users list API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}