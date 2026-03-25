import { NextResponse } from 'next/server';
import { adminErrorToResponse, requireAdmin } from '@/lib/auth/admin';
import { getSourcePriceDiagnostics } from '@/lib/admin/getSourcePriceDiagnostics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    await requireAdmin();
    const payload = await getSourcePriceDiagnostics();
    return NextResponse.json({ ok: true, data: payload });
  } catch (e) {
    return adminErrorToResponse(e);
  }
}
