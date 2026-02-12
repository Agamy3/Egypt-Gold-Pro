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

    // Last 7 days window for accuracy metrics (keeps query cheap).
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();

    const [{ data: signals }, { data: aiReviews }] = await Promise.all([
      supabase
        .from('gold_signals')
        .select('country, action, outcome, asia_session, created_at')
        .gte('created_at', sinceIso)
        .limit(5000),
      supabase
        .from('gold_signal_ai_reviews')
        .select('decision, requested_count, created_at')
        .gte('created_at', sinceIso)
        .limit(5000),
    ]);

    const sig = (signals ?? []) as any[];
    const ai = (aiReviews ?? []) as any[];

    let correct = 0;
    let wrong = 0;
    let evaluated = 0;
    const dist: Record<Action, number> = { BUY: 0, SELL: 0, HOLD: 0 };
    let asiaEval = 0;
    let asiaCorrect = 0;
    let nonAsiaEval = 0;
    let nonAsiaCorrect = 0;

    for (const r of sig) {
      const action = String(r.action || 'HOLD') as Action;
      if (dist[action] !== undefined) dist[action] += 1;

      const outcome = r.outcome ? String(r.outcome) : null;
      if (outcome === 'true' || outcome === 'false') {
        evaluated += 1;
        if (outcome === 'true') correct += 1;
        else wrong += 1;

        const isAsia = Boolean(r.asia_session);
        if (isAsia) {
          asiaEval += 1;
          if (outcome === 'true') asiaCorrect += 1;
        } else {
          nonAsiaEval += 1;
          if (outcome === 'true') nonAsiaCorrect += 1;
        }
      }
    }

    let overrideCount = 0;
    let downgradeCount = 0;
    let approvedCount = 0;
    let premiumAiUsage = 0;
    for (const r of ai) {
      const decision = String(r.decision || '');
      if (decision === 'overridden') overrideCount += 1;
      else if (decision === 'downgraded_to_hold') downgradeCount += 1;
      else if (decision === 'approved') approvedCount += 1;
      premiumAiUsage += Math.max(1, Number(r.requested_count ?? 1));
    }

    const reviewTotal = overrideCount + downgradeCount + approvedCount;

    return withNoStoreHeaders(
      NextResponse.json(
        {
          ok: true,
          windowDays: 7,
          algorithm_accuracy_pct: pct(correct, evaluated),
          algorithm_evaluated_count: evaluated,
          ai_override_rate_pct: pct(overrideCount, reviewTotal),
          ai_downgrade_rate_pct: pct(downgradeCount, reviewTotal),
          premium_ai_usage_count: premiumAiUsage,
          signal_distribution: dist,
          asia_session_win_rate_pct: pct(asiaCorrect, asiaEval),
          non_asia_session_win_rate_pct: pct(nonAsiaCorrect, nonAsiaEval),
          serverAsOf: new Date().toISOString(),
        },
        { status: 200 }
      )
    );
  } catch (e) {
    return withNoStoreHeaders(adminErrorToResponse(e));
  }
}

