import { NextResponse } from 'next/server';

import { adminErrorToResponse, requireAdmin } from '@/lib/auth/admin';
import { getEgyptMarketIngestionDiagnostics } from '@/lib/market-ingestion-health';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Admin-only: latest ingestion run id + trust summary (Egypt).
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return adminErrorToResponse(e);
  }

  const d = await getEgyptMarketIngestionDiagnostics();
  return NextResponse.json({
    ok: true,
    serverNowIso: d.serverNowIso,
    serverNowMs: d.serverNowMs,
    latestIngestionRunId: d.latestIngestionRunId,
    trust: d.trust,
    healthBadge: d.healthBadge,
  });
}
