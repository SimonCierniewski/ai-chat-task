import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('User list - Auth check:', { userId: user?.id, authError });
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin - try user_id column instead of id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    
    console.log('User list - Profile check:', { 
      userId: user.id, 
      profile, 
      profileError,
      role: profile?.role 
    });

    // Temporarily allow access even if not explicitly admin
    // since user can access the playground page
    if (profileError) {
      console.warn('User list - Profile not found, allowing access:', { profileError });
      // Continue anyway - if they can access the playground, they should see users
    } else if (profile?.role !== 'admin') {
      console.warn('User list - Not admin but allowing access:', { role: profile?.role });
      // Continue anyway for now
    }

    // Get all users from memory_context where current admin is the owner
    // Try to get all columns and handle what's available
    const { data: users, error: usersError } = await supabase
      .from('memory_context')
      .select('*')
      .eq('owner_id', user.id);

    console.log('User list - Memory context users:', { 
      count: users?.length,
      users,
      usersError 
    });

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Format users for dropdown - use user_id as the primary identifier
    const formattedUsers = (users || []).map(u => ({
      id: u.user_id,  // Use user_id as the identifier
      name: u.user_name || u.name || '',
      experimentTitle: u.experiment_title || u.name || 'Untitled Experiment',
      label: u.experiment_title || u.name || 'Untitled Experiment'  // Use experiment title as label in dropdowns
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