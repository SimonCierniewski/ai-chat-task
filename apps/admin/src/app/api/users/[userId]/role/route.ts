import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverConfig, validateServerConfig } from '../../../../../../lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UpdateRoleRequest {
  role: 'user' | 'admin';
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    // Validate server config
    validateServerConfig();
    
    // Check authentication
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    
    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    // Parse request body
    const body: UpdateRoleRequest = await request.json();
    
    if (!body.role || !['user', 'admin'].includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Prevent self-demotion
    if (params.userId === user.id && body.role !== 'admin') {
      return NextResponse.json({ 
        error: 'Cannot demote yourself. Ask another admin to change your role.' 
      }, { status: 400 });
    }

    // Update the user's role in profiles table using service role
    // We need to use service role to bypass RLS
    const updateResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?user_id=eq.${params.userId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': serverConfig.supabaseServiceKey,
          'Authorization': `Bearer ${serverConfig.supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ role: body.role }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('Failed to update role:', errorText);
      
      // Check if profile doesn't exist
      if (updateResponse.status === 404 || errorText.includes('0 rows')) {
        // Create profile if it doesn't exist
        const createResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles`,
          {
            method: 'POST',
            headers: {
              'apikey': serverConfig.supabaseServiceKey,
              'Authorization': `Bearer ${serverConfig.supabaseServiceKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation',
            },
            body: JSON.stringify({ 
              user_id: params.userId,
              role: body.role,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          }
        );

        if (!createResponse.ok) {
          throw new Error('Failed to create profile');
        }

        const createdProfile = await createResponse.json();
        return NextResponse.json({ 
          success: true,
          user_id: params.userId,
          role: body.role,
          message: 'Profile created and role set',
        });
      }
      
      throw new Error('Failed to update role');
    }

    const updatedProfiles = await updateResponse.json();
    
    if (!updatedProfiles || updatedProfiles.length === 0) {
      // Profile might not exist, try to create it
      const createResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles`,
        {
          method: 'POST',
          headers: {
            'apikey': serverConfig.supabaseServiceKey,
            'Authorization': `Bearer ${serverConfig.supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ 
            user_id: params.userId,
            role: body.role,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        }
      );

      if (createResponse.ok) {
        return NextResponse.json({ 
          success: true,
          user_id: params.userId,
          role: body.role,
          message: 'Profile created and role set',
        });
      }
      
      return NextResponse.json({ 
        error: 'User profile not found. User may need to sign in first.' 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true,
      user_id: params.userId,
      role: body.role,
      message: 'Role updated successfully',
    });

  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { error: 'Failed to update user role' },
      { status: 500 }
    );
  }
}