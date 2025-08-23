import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
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

    const { name, experimentTitle } = await request.json();
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (!experimentTitle || typeof experimentTitle !== 'string' || experimentTitle.trim().length === 0) {
      return NextResponse.json({ error: 'Experiment title is required' }, { status: 400 });
    }

    // Generate new user ID
    const newUserId = uuidv4();

    // Create user in memory_context table
    const { error: memoryError } = await supabase
      .from('memory_context')
      .insert({
        user_id: newUserId,
        owner_id: user.id,
        user_name: name.trim(),
        experiment_title: experimentTitle.trim(),
        context_block: '',
        metadata: {}
      });

    if (memoryError) {
      console.error('Error creating user in memory_context:', memoryError);
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Note: Zep user and thread will be created automatically when first message is sent
    // This is handled by the chat endpoint which has proper authentication

    return NextResponse.json({
      success: true,
      user: {
        id: newUserId,
        name: name.trim(),
        experimentTitle: experimentTitle.trim(),
        label: experimentTitle.trim()  // Use experiment title as label in dropdowns
      }
    });
  } catch (error) {
    console.error('Error in user init API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}