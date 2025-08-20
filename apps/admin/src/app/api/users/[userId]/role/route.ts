import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publicConfig } from '../../../../../../lib/config';

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

    // Call the backend API to update the role
    const apiUrl = new URL(`/api/v1/admin/users/${params.userId}/role`, publicConfig.apiBaseUrl);
    const updateResponse = await fetch(apiUrl.toString(), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${user.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: body.role }),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('Backend API error:', updateResponse.status, errorText);
      
      if (updateResponse.status === 404) {
        return NextResponse.json({ 
          error: 'User profile not found. User may need to sign in first.' 
        }, { status: 404 });
      }
      
      return NextResponse.json(
        { error: 'Failed to update role via backend API' },
        { status: updateResponse.status || 500 }
      );
    }

    const result = await updateResponse.json();
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { error: 'Failed to update user role' },
      { status: 500 }
    );
  }
}