/**
 * Delete Account API
 * 
 * DELETE: Delete user account and all associated data
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { confirm } = body;

    if (!confirm || confirm !== 'DELETE') {
      return NextResponse.json(
        { error: 'Confirmation required. Send { "confirm": "DELETE" }' },
        { status: 400 }
      );
    }

    // Use admin client to delete user
    const supabaseAdmin = getServerClient();
    
    // Delete user (this will cascade delete profile and other data due to ON DELETE CASCADE)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

