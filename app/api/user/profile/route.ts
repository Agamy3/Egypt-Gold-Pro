import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/profile
 * Returns the current user's profile including display_name
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();
    
    // Get user profile with display_name
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user profile:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      display_name: profile?.display_name || null,
      email: user.email,
      user_metadata: user.user_metadata,
    });
  } catch (error) {
    console.error('GET user profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

