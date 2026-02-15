import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function GET() {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const { data, error } = await supabase
      .from('admin_settings')
      .select('key, value, description, updated_at, updated_by_user_id')
      .eq('key', 'default_new_users_premium')
      .maybeSingle();

    if (error) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
    }

    const enabled = data?.value === true || data?.value === 'true' || (typeof data?.value === 'string' && data.value.toLowerCase() === 'true');

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        enabled,
        description: data?.description || null,
        updated_at: data?.updated_at || null,
        updated_by_user_id: data?.updated_by_user_id || null,
      })
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireAdmin();
    const supabase = getServerClient();
    const body = await req.json();
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'enabled must be a boolean' }, { status: 400 }));
    }

    // Upsert the setting
    const { data, error } = await supabase
      .from('admin_settings')
      .upsert(
        {
          key: 'default_new_users_premium',
          value: enabled,
          description: 'If true, all new user registrations will automatically receive premium status',
          updated_by_user_id: adminUser.user.id,
        },
        { onConflict: 'key' }
      )
      .select('key, value, updated_at, updated_by_user_id')
      .single();

    if (error) {
      return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 500 }));
    }

    return withNoStoreHeaders(
      NextResponse.json({
        ok: true,
        enabled: data.value === true || data.value === 'true' || (typeof data.value === 'string' && data.value.toLowerCase() === 'true'),
        updated_at: data.updated_at,
        updated_by_user_id: data.updated_by_user_id,
      })
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}
