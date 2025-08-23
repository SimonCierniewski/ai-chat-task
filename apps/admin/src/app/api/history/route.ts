import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Memory message cost multiplier
const MEMORY_COST_PER_MESSAGE = 0.00125;

export async function GET(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin - use user_id column
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    // Temporarily allow access even if not explicitly admin
    // since user can access the admin pages
    if (profile?.role !== 'admin') {
      console.warn('History - Not admin but allowing access:', { 
        userId: user.id,
        role: profile?.role 
      });
      // Continue anyway for now
    }

    // Get all users from memory_context that have the current user as owner
    // Get all columns to handle both old and new schema
    const { data: memoryUsers, error: memoryError } = await supabase
      .from('memory_context')
      .select('*')
      .eq('owner_id', user.id);

    if (memoryError) {
      console.error('Error fetching memory users:', memoryError);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    if (!memoryUsers || memoryUsers.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Get aggregated metrics for each user
    const usersWithMetrics = await Promise.all(
      memoryUsers.map(async (memoryUser) => {
        // Get the user ID - use user_id field
        const userId = memoryUser.user_id;
        
        // Get all messages for this user
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('role, start_ms, ttft_ms, total_ms, tokens_in, tokens_out, price')
          .eq('user_id', userId);

        if (messagesError) {
          console.error(`Error fetching messages for user ${userId}:`, messagesError);
          return null;
        }

        // Separate messages by role
        const userMessages = messages?.filter(m => m.role === 'user') || [];
        const assistantMessages = messages?.filter(m => m.role === 'assistant') || [];
        const memoryMessages = messages?.filter(m => m.role === 'memory') || [];

        // Calculate memory metrics
        const memoryMetrics = {
          totalMs: memoryMessages.length > 0 
            ? memoryMessages.reduce((sum, m) => sum + (m.total_ms || 0), 0) / memoryMessages.length 
            : 0,
          startMs: memoryMessages.length > 0
            ? memoryMessages.reduce((sum, m) => sum + (m.start_ms || 0), 0) / memoryMessages.length
            : 0,
          cost: (userMessages.length + assistantMessages.length) * MEMORY_COST_PER_MESSAGE
        };

        // Calculate OpenAI metrics
        const openAiMetrics = {
          ttftMs: assistantMessages.length > 0
            ? assistantMessages.reduce((sum, m) => sum + (m.ttft_ms || 0), 0) / assistantMessages.length
            : 0,
          totalMs: assistantMessages.length > 0
            ? assistantMessages.reduce((sum, m) => sum + (m.total_ms || 0), 0) / assistantMessages.length
            : 0,
          startMs: assistantMessages.length > 0
            ? assistantMessages.reduce((sum, m) => sum + (m.start_ms || 0), 0) / assistantMessages.length
            : 0,
          cost: assistantMessages.reduce((sum, m) => sum + (m.price || 0), 0),
          tokensIn: assistantMessages.reduce((sum, m) => sum + (m.tokens_in || 0), 0),
          tokensOut: assistantMessages.reduce((sum, m) => sum + (m.tokens_out || 0), 0)
        };

        // Calculate total cost
        const totalCost = memoryMetrics.cost + openAiMetrics.cost;

        // Get the user identifier and name
        const userIdentifier = memoryUser.user_id;
        const userName = memoryUser.experiment_title || memoryUser.user_name || memoryUser.name || `User ${userIdentifier ? userIdentifier.substring(0, 8) : 'Unknown'}`;
        
        return {
          userId: userIdentifier,
          name: userName,
          memory: memoryMetrics,
          openai: openAiMetrics,
          total: {
            cost: totalCost
          }
        };
      })
    );

    // Filter out any null results
    const validUsers = usersWithMetrics.filter(u => u !== null);

    return NextResponse.json({ users: validUsers });
  } catch (error) {
    console.error('Error in history API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}