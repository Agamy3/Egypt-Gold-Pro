import { NextResponse } from 'next/server';

import { adminErrorToResponse, requireAdmin } from '@/lib/auth/admin';
import { getEgyptMarketIngestionDiagnostics } from '@/lib/market-ingestion-health';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Admin-only: Egypt market ingestion + same-run backing diagnostics.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return adminErrorToResponse(e);
  }

  const nowMs = Date.now();
  const diagnostics = await getEgyptMarketIngestionDiagnostics(nowMs);
  const t = diagnostics.trust;

  return NextResponse.json({
    ok: true,
    serverNowIso: diagnostics.serverNowIso,
    serverNowMs: diagnostics.serverNowMs,
    aggregatedFresh: t.aggregatedFresh,
    sourceBacked: t.sourceBacked,
    sameRunBacked: t.sameRunBacked,
    meetsThreshold: t.meetsThreshold,
    homepageSafeToUse: t.homepageSafeToUse,
    degradedReason: t.degradedReason,
    freshnessVerdict: diagnostics.healthBadge,
    latestIngestionRunId: diagnostics.latestIngestionRunId,
    diagnostics,
  });
}
