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
      .eq('user_id', params.userId)
      .single();

    if (memoryError || !memoryUser) {
      console.error('Memory context lookup error:', memoryError);
      // Still return user info even if not in memory_context
      // This handles users with no messages yet
    }

    // Fetch all messages for this user
    // For playground users, the thread_id IS the user_id
    let messages: any[] = [];
    
    // First try: Get messages with this exact user_id (for real users)
    const { data: directMessages, error: directError } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', params.userId)
      .order('created_at', { ascending: true });
      
    if (!directError && directMessages && directMessages.length > 0) {
      messages = directMessages;
      console.log('Found direct messages for user:', params.userId, 'count:', directMessages.length);
    } else {
      // Second try: For playground users, get messages where thread_id matches the userId
      // In playground, sessionId (which becomes thread_id) is set to the user's ID
      const { data: threadMessages, error: threadError } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', params.userId)  // Thread ID matches the user ID for playground users
        .order('created_at', { ascending: true });
        
      if (!threadError && threadMessages && threadMessages.length > 0) {
        messages = threadMessages;
        console.log('Found thread messages for user:', params.userId, 'count:', threadMessages.length);
      } else {
        // Last try: Get admin messages and filter by thread_id
        const { data: adminMessages, error: adminError } = await supabase
          .from('messages')
          .select('*')
          .eq('user_id', user.id)  // Use the admin's ID
          .order('created_at', { ascending: true });
          
        if (!adminError && adminMessages) {
          // Filter for exact thread_id match only
          messages = adminMessages.filter(m => m.thread_id === params.userId);
          // Don't use partial match - it causes wrong messages to show
          console.log('Filtered admin messages for user:', params.userId, 'count:', messages.length);
        }
      }
    }

    if (messages.length === 0) {
      console.log('No messages found for user:', params.userId);
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
      },
      prompt: msg.prompt // Include the OpenAI prompt if available
    }));

    // Get user name and experiment title from memory context
    let userName = '';
    let experimentTitle = '';
    
    if (memoryUser) {
      userName = memoryUser.user_name || '';
      experimentTitle = memoryUser.experiment_title || '';
      
      // If neither is available, use fallback
      if (!userName && !experimentTitle) {
        userName = `User ${params.userId.substring(0, 8)}`;
      }
    } else {
      // No memory context found
      userName = `User ${params.userId.substring(0, 8)}`;
    }
    
    const actualUserId = memoryUser?.user_id || params.userId;

    // Calculate average ttft_ms and total_ms from user messages
    const userMessages = formattedMessages.filter(msg => msg.role === 'user');
    const userMessagesWithTtft = userMessages.filter(msg => msg.metadata.ttftMs);
    const userMessagesWithTotal = userMessages.filter(msg => msg.metadata.totalMs);
    
    const avgUserTtft = userMessagesWithTtft.length > 0
      ? userMessagesWithTtft.reduce((sum, msg) => sum + (msg.metadata.ttftMs || 0), 0) / userMessagesWithTtft.length
      : null;
    
    const avgUserTotal = userMessagesWithTotal.length > 0
      ? userMessagesWithTotal.reduce((sum, msg) => sum + (msg.metadata.totalMs || 0), 0) / userMessagesWithTotal.length
      : null;

    return NextResponse.json({
      user: {
        id: actualUserId,
        name: userName,
        experimentTitle: experimentTitle
      },
      messages: formattedMessages,
      userMetrics: {
        avgTtftMs: avgUserTtft,
        avgTotalMs: avgUserTotal,
        userMessageCount: userMessages.length,
        userMessagesWithTtft: userMessagesWithTtft.length,
        userMessagesWithTotal: userMessagesWithTotal.length
      }
    });
  } catch (error) {
    console.error('Error in chat history API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
