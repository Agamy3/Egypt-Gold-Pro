import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { isAdminUser } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const debug = {
      timestamp: new Date().toISOString(),
      steps: [] as any[]
    };

    // Step 1: Check if we can get the user
    debug.steps.push({ step: 'getServerUser', status: 'starting' });
    const user = await getServerUser();
    debug.steps.push({ 
      step: 'getServerUser', 
      status: 'completed',
      result: user ? { id: user.id, email: user.email } : null 
    });

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'No user found in session',
        debug
      });
    }

    // Step 2: Check admin status with isAdminUser
    debug.steps.push({ step: 'isAdminUser', status: 'starting' });
    const isAdmin = await isAdminUser();
    debug.steps.push({ 
      step: 'isAdminUser', 
      status: 'completed',
      result: isAdmin 
    });

    // Step 3: Direct database check with service role client
    debug.steps.push({ step: 'direct_db_check', status: 'starting' });
    const supabase = getServerClient();
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('is_admin, email')
      .eq('id', user.id)
      .single();
    debug.steps.push({ 
      step: 'direct_db_check', 
      status: 'completed',
      result: { profile, profileError }
    });

    // Step 4: Check auth.users directly
    debug.steps.push({ step: 'auth_users_check', status: 'starting' });
    const { data: authUserData, error: authError } = await supabase.auth.admin.getUserById(user.id);
    const authUser = authUserData?.user || null;
    debug.steps.push({ 
      step: 'auth_users_check', 
      status: 'completed',
      result: { authUser: authUser ? { id: authUser.id, email: authUser.email } : null, authError }
    });

    return NextResponse.json({
      success: true,
      debug,
      summary: {
        user_id: user.id,
        user_email: user.email,
        is_admin_check: isAdmin,
        profile_is_admin: profile?.is_admin,
        profile_email: profile?.email,
        final_status: isAdmin ? 'ADMIN_ACCESS_GRANTED' : 'NO_ADMIN_ACCESS'
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}
