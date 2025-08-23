import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function PUT(request: Request) {
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

    const { userId, name } = await request.json();
    
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Verify the user belongs to this admin
    const { data: existingUser, error: checkError } = await supabase
      .from('memory_context')
      .select('user_id')
      .eq('user_id', userId)
      .eq('owner_id', user.id)
      .single();

    if (checkError || !existingUser) {
      return NextResponse.json({ error: 'User not found or access denied' }, { status: 404 });
    }

    // Update the user's name
    const { error: updateError } = await supabase
      .from('memory_context')
      .update({ name: name.trim() })
      .eq('user_id', userId)
      .eq('owner_id', user.id);

    if (updateError) {
      console.error('Error updating user name:', updateError);
      return NextResponse.json({ error: 'Failed to update user name' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        name: name.trim(),
        label: `${name.trim()} (${userId.substring(0, 8)}...)`
      }
    });
  } catch (error) {
    console.error('Error in user update API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}