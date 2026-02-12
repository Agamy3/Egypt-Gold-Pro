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

type Action = 'BUY' | 'SELL' | 'HOLD';

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 10_000) / 100; // 2dp
}

export async function GET(_req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = getServerClient();

    const [{ data: signals }, { data: reviews }] = await Promise.all([
      supabase
        .from('gold_signals')
        .select(
          'id, cycle_key, cycle_started_at, country, action, confidence, xau_usd, pct_change_5m, volatility_proxy, asia_session, variance_pct, due_at, validated_at, outcome, pnl_bp, created_at, updated_at'
        )
        .order('cycle_started_at', { ascending: false })
        .limit(100),
      supabase
        .from('gold_signal_ai_reviews')
        .select(
          'id, cycle_key, country, algo_action, algo_confidence, ai_action, ai_confidence0to1, ai_reasons, risk_regime, decision, requested_count, created_at, updated_at'
        )
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const sig = (signals ?? []) as any[];
    const rev = (reviews ?? []) as any[];

    let evaluated = 0;
    let correct = 0;
    const dist: Record<Action, number> = { BUY: 0, SELL: 0, HOLD: 0 };
    for (const r of sig) {
      const a = String(r.action || 'HOLD') as Action;
      if (dist[a] !== undefined) dist[a] += 1;
      const outcome = r.outcome ? String(r.outcome) : null;
      if (outcome === 'true' || outcome === 'false') {
        evaluated += 1;
        if (outcome === 'true') correct += 1;
      }
    }

    let overrideCount = 0;
    let downgradeCount = 0;
    let approvedCount = 0;
    for (const r of rev) {
      const d = String(r.decision || '');
      if (d === 'overridden') overrideCount += 1;
      else if (d === 'downgraded_to_hold') downgradeCount += 1;
      else if (d === 'approved') approvedCount += 1;
    }
    const totalReviewed = overrideCount + downgradeCount + approvedCount;

    return withNoStoreHeaders(
      NextResponse.json(
        {
          ok: true,
          metrics: {
            algorithm_accuracy_pct: pct(correct, evaluated),
            algorithm_evaluated_count: evaluated,
            ai_override_rate_pct: pct(overrideCount, totalReviewed),
            ai_downgrade_rate_pct: pct(downgradeCount, totalReviewed),
            signal_distribution: dist,
          },
          gold_signals: sig,
          gold_signal_ai_reviews: rev,
          serverAsOf: new Date().toISOString(),
        },
        { status: 200 }
      )
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}

