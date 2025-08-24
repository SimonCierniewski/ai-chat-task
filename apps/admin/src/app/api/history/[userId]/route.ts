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
    // Important: Playground messages are stored with the admin's user_id, not the playground user's ID
    let messages: any[] = [];
    let messagesError = null;
    
    // First try: Get messages with this exact user_id (for real users)
    const { data: directMessages, error: directError } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', params.userId)
      .order('created_at', { ascending: true });
      
    if (!directError && directMessages && directMessages.length > 0) {
      messages = directMessages;
    } else {
      // Second try: For playground users, messages are stored with admin's ID
      const { data: adminMessages, error: adminError } = await supabase
        .from('messages')
        .select('*')
        .eq('user_id', user.id)  // Use the admin's ID
        .order('created_at', { ascending: true });
        
      if (!adminError && adminMessages) {
        // Filter messages that belong to this user based on thread_id or context
        const userIdShort = params.userId.substring(0, 8);
        messages = adminMessages.filter(m => {
          // Check if thread_id contains part of the user ID
          return m.thread_id && (
            m.thread_id.includes(params.userId) || 
            m.thread_id.includes(userIdShort)
          );
        });
        
        // If still no messages with user ID in thread, try to match by memory_context
        if (messages.length === 0 && memoryUser) {
          // Get all threads for this memory context user
          messages = adminMessages; // For now, show all admin messages if we can't filter
        }
      } else {
        messagesError = adminError;
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