import { NextRequest, NextResponse } from 'next/server';

import { requireAdmin, adminErrorToResponse } from '@/lib/auth/admin';
import { runIngestionCycle } from '@/lib/gold-ingestion-engine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

type Country = 'EG';

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = (await req.json().catch(() => null)) as { country?: string } | null;
    const country = (body?.country || 'EG').toUpperCase();

    if (country !== 'EG') {
      return withNoStoreHeaders(
        NextResponse.json({ ok: false, error: 'Unsupported country (only EG is supported)' }, { status: 400 })
      );
    }

    const res = await runIngestionCycle();

    return withNoStoreHeaders(
      NextResponse.json(
        {
          ok: true,
          country: country as Country,
          supabaseKeyType: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon',
          usingServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          sourcesWritten: res.sourcesWritten,
          aggregatedSnapshotWritten: res.aggregatedSnapshotWritten,
          ingestionRunId: res.ingestionRunId,
          aggregatedMarkedDegraded: res.aggregatedMarkedDegraded,
          errors: res.errors,
        },
        { status: 200 }
      )
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}
