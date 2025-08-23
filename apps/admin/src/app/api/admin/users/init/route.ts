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

    const { name } = await request.json();
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Generate new user ID
    const newUserId = uuidv4();

    // Create user in memory_context table
    const { error: memoryError } = await supabase
      .from('memory_context')
      .insert({
        user_id: newUserId,
        owner_id: user.id,
        name: name.trim(),
        context_block: '',
        metadata: {}
      });

    if (memoryError) {
      console.error('Error creating user in memory_context:', memoryError);
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Call the API /init endpoint to create user and thread in Zep
    // Using the internal API endpoint
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';
    
    try {
      const initResponse = await fetch(`${apiUrl}/api/v1/memory/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // We need to pass an admin token or service role for this internal call
          // For now, we'll use a simplified approach
        },
        body: JSON.stringify({
          userId: newUserId,
          sessionId: newUserId // Using userId as sessionId/threadId
        })
      });

      if (!initResponse.ok) {
        const errorData = await initResponse.text();
        console.error('Error initializing Zep:', errorData);
        // Don't fail the whole operation if Zep init fails
        // The user is already created in memory_context
      }
    } catch (zepError) {
      console.error('Error calling Zep init:', zepError);
      // Continue anyway - user is created in database
    }

    return NextResponse.json({
      success: true,
      user: {
        id: newUserId,
        name: name.trim(),
        label: `${name.trim()} (${newUserId.substring(0, 8)}...)`
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