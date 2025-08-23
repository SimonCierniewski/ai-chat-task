import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
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

    // Verify the user belongs to this admin's memory context
    const { data: memoryUser, error: memoryError } = await supabase
      .from('memory_context')
      .select('user_id, name')
      .eq('user_id', params.userId)
      .eq('owner_id', user.id)
      .single();

    if (memoryError || !memoryUser) {
      return NextResponse.json({ error: 'User not found or access denied' }, { status: 404 });
    }

    // Fetch all messages for this user
    // Note: In the messages table, user_id is the owner of the message
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', params.userId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    // Format messages with proper metadata
    const formattedMessages = (messages || []).map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.created_at,
      metadata: {
        startMs: msg.start_ms,
        ttftMs: msg.ttft_ms,
        totalMs: msg.total_ms,
        tokensIn: msg.tokens_in,
        tokensOut: msg.tokens_out,
        price: msg.price,
        model: msg.model
      }
    }));

    return NextResponse.json({
      user: {
        id: memoryUser.user_id,
        name: memoryUser.name || `User ${params.userId.substring(0, 8)}`
      },
      messages: formattedMessages
    });
  } catch (error) {
    console.error('Error in chat history API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}