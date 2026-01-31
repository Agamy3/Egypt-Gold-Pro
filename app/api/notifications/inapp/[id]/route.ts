import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient, getServerUser } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getServerUser();
    if (!user) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));

    const supabase = await createServerSupabaseClient();
    const idNum = Number(params.id);
    if (!Number.isFinite(idNum)) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 }));

    const { data, error } = await supabase
      .from('in_app_notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('id', idNum)
      .maybeSingle();

    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 400 }));
    if (!data) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 }));

    return withNoStoreHeaders(NextResponse.json({ ok: true, notification: data }));
  } catch (e) {
    console.error('[NOTIF] GET in-app by id error:', e);
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 }));
  }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  // Mark as read
  try {
    const user = await getServerUser();
    if (!user) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));

    const supabase = await createServerSupabaseClient();
    const idNum = Number(params.id);
    if (!Number.isFinite(idNum)) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Invalid id' }, { status: 400 }));

    const { error } = await supabase
      .from('in_app_notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('id', idNum);

    if (error) return withNoStoreHeaders(NextResponse.json({ ok: false, error: error.message }, { status: 400 }));
    return withNoStoreHeaders(NextResponse.json({ ok: true }));
  } catch (e) {
    console.error('[NOTIF] POST mark-read by id error:', e);
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 }));
  }
}

