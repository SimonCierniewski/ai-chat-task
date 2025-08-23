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
    // Now using id as primary key for playground users
    const { data: users, error: usersError } = await supabase
      .from('memory_context')
      .select('id, user_name, experiment_title')
      .eq('owner_id', user.id)
      .is('user_id', null)  // Only get playground users (not real users)
      .order('experiment_title', { ascending: true });

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Format users for dropdown
    const formattedUsers = (users || []).map(u => ({
      id: u.id,
      name: u.user_name || '',
      experimentTitle: u.experiment_title || 'Untitled Experiment',
      label: u.experiment_title || 'Untitled Experiment'  // Use experiment title as label in dropdowns
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