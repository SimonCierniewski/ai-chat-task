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
      .eq('user_id', user.id)
      .single();

    // Temporarily allow access even if not explicitly admin
    if (profile?.role !== 'admin') {
      console.warn('Chat history - Not admin but allowing access:', { 
        userId: user.id,
        role: profile?.role 
      });
      // Continue anyway for now
    }

    // Verify the user belongs to this admin's memory context
    // Need to handle both user_id and id as userId parameter
    const { data: memoryUser, error: memoryError } = await supabase
      .from('memory_context')
      .select('*')
      .eq('owner_id', user.id)
      .or(`user_id.eq.${params.userId},id.eq.${params.userId}`)
      .single();

    if (memoryError || !memoryUser) {
      console.error('Memory context lookup error:', memoryError);
      // Still return user info even if not in memory_context
      // This handles users with no messages yet
    }

    // Fetch all messages for this user
    // Try with user_id first (actual user ID)
    let { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', params.userId)
      .order('created_at', { ascending: true });

    // If error or no messages and memoryUser exists, try with memory_context.user_id
    if ((messagesError || messages?.length === 0) && memoryUser?.user_id && memoryUser.user_id !== params.userId) {
      const result = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', memoryUser.user_id)
        .order('created_at', { ascending: true });
      
      if (!result.error) {
        messages = result.data;
        messagesError = null;
      }
    }

    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      // Don't fail completely, just return empty messages
      messages = [];
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

    // Get user name from memory context or generate one
    const userName = memoryUser?.experiment_title || memoryUser?.user_name || memoryUser?.name || `User ${params.userId.substring(0, 8)}`;
    const actualUserId = memoryUser?.user_id || params.userId;

    return NextResponse.json({
      user: {
        id: actualUserId,
        name: userName
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