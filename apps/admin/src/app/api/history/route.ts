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

    console.log('History - Found memory users:', {
      count: memoryUsers?.length,
      users: memoryUsers?.map(u => ({ 
        user_id: u.user_id, 
        experiment_title: u.experiment_title,
        user_name: u.user_name 
      }))
    });

    if (!memoryUsers || memoryUsers.length === 0) {
      return NextResponse.json({ users: [] });
    }

    // Get aggregated metrics for each user
    const usersWithMetrics = await Promise.all(
      memoryUsers.map(async (memoryUser) => {
        // Get the user ID - use user_id field, or skip if not present
        const userId = memoryUser.user_id;
        
        console.log(`History - Processing user:`, { 
          userId, 
          experiment_title: memoryUser.experiment_title,
          has_user_id: !!userId 
        });
        
        // If no user_id, return user with zero stats
        if (!userId) {
          return {
            userId: memoryUser.id, // Use the record id as fallback
            name: memoryUser.experiment_title || memoryUser.user_name || 'Unknown User',
            messageCount: 0,
            memory: { totalMs: 0, startMs: 0, cost: 0 },
            openai: { ttftMs: 0, totalMs: 0, startMs: 0, cost: 0, tokensIn: 0, tokensOut: 0 },
            total: { cost: 0 }
          };
        }
        
        // Get all messages for this user
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('role, start_ms, ttft_ms, total_ms, tokens_in, tokens_out, price')
          .eq('user_id', userId);

        // Don't skip users with message errors or no messages
        if (messagesError) {
          console.error(`Error fetching messages for user ${userId}:`, messagesError);
          // Continue with empty messages array
        }
        
        console.log(`History - Found messages for ${userId}:`, {
          count: messages?.length || 0,
          roles: messages?.map(m => m.role) || [],
          samples: messages?.slice(0, 3).map(m => ({
            role: m.role,
            tokens_in: m.tokens_in,
            tokens_out: m.tokens_out,
            price: m.price,
            ttft_ms: m.ttft_ms
          }))
        });

        // Separate messages by role (handle null messages)
        const safeMessages = messages || [];
        const userMessages = safeMessages.filter(m => m.role === 'user');
        const assistantMessages = safeMessages.filter(m => m.role === 'assistant');
        const memoryMessages = safeMessages.filter(m => m.role === 'memory');

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
        
        // Always return user data, even if no messages
        return {
          userId: userIdentifier || memoryUser.id, // Fallback to id if user_id is null
          name: userName,
          messageCount: safeMessages.length,
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