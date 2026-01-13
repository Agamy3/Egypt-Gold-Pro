import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/profile
 * Returns the current user's profile including display_name and notification preferences
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();
    
    // Get user profile with all fields
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('display_name, email_notifications_enabled, push_notifications_enabled')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user profile:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      profile: profile ? {
        display_name: profile.display_name || null,
        email_notifications_enabled: profile.email_notifications_enabled ?? true,
        push_notifications_enabled: profile.push_notifications_enabled ?? false,
      } : null,
      email: user.email,
      user_metadata: user.user_metadata,
    });
  } catch (error) {
    console.error('GET user profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/user/profile
 * Updates the current user's profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const updates: any = {};

    // Only allow updating specific fields
    if (body.display_name !== undefined) {
      updates.display_name = body.display_name;
    }
    if (body.email_notifications_enabled !== undefined) {
      updates.email_notifications_enabled = body.email_notifications_enabled;
    }
    if (body.push_notifications_enabled !== undefined) {
      updates.push_notifications_enabled = body.push_notifications_enabled;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    
    // Upsert profile (create if doesn't exist, update if exists)
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .upsert({
        id: user.id,
        email: user.email,
        ...updates,
      }, {
        onConflict: 'id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true,
      profile: {
        display_name: profile.display_name,
        email_notifications_enabled: profile.email_notifications_enabled,
        push_notifications_enabled: profile.push_notifications_enabled,
      }
    });
  } catch (error) {
    console.error('PATCH user profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

