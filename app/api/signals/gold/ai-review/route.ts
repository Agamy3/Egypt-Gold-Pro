import { NextRequest, NextResponse } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { getUserPremiumStatus } from '@/lib/auth/getUserPremiumStatus';
import { callOpenAiStrictJson } from '@/lib/ai/openaiStrictJson';
import { deriveFinalSignal, type FinalAction, type Regime } from '@/lib/signals/deriveFinalSignal';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;
export const runtime = 'nodejs';

type Country = 'GLOBAL' | 'EG';
type Action = 'BUY' | 'SELL' | 'HOLD';
type RiskRegime = 'calm' | 'elevated' | 'volatile' | 'crisis';
type Decision = 'approved' | 'downgraded_to_hold' | 'overridden' | 'fallback_algo';

const AI_SYSTEM_PROMPT = `
You are a gold market risk validator AI.

You DO NOT predict price.

You evaluate whether an algorithmic BUY/SELL/HOLD signal should be approved, downgraded to HOLD, or overridden.

You MUST return JSON in EXACTLY this format:

{
  "ai_action": "BUY" | "SELL" | "HOLD",
  "ai_confidence0to1": number between 0 and 1,
  "ai_reasons": ["short reason 1", "short reason 2"],
  "risk_regime": "calm" | "elevated" | "volatile" | "crisis"
}

Rules:
- Only these 4 keys are allowed.
- No extra keys.
- No nested objects.
- ai_reasons must contain max 5 short strings.
- ai_confidence0to1 must be numeric between 0 and 1.
- If uncertain, return HOLD with lower confidence.
- Be conservative.

Return STRICT JSON only.
No markdown.
No explanation.
No commentary.
`;

function withNoStoreHeaders(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

function isCountry(x: unknown): x is Country {
  return x === 'GLOBAL' || x === 'EG';
}

function isAction(x: unknown): x is Action {
  return x === 'BUY' || x === 'SELL' || x === 'HOLD';
}

function isRiskRegime(x: unknown): x is RiskRegime {
  return x === 'calm' || x === 'elevated' || x === 'volatile' || x === 'crisis';
}

function isFinite01(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
}

function pickHeadlines(rows: any[], max = 10): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const t = String(r?.title ?? '').trim();
    if (t) out.push(t.slice(0, 180));
    if (out.length >= max) break;
  }
  return out;
}

function decide(args: { algoAction: Action; aiAction: Action; aiConfidence: number }): Decision {
  if (args.aiConfidence >= 0.8 && args.aiAction !== args.algoAction) return 'overridden';
  if (args.aiAction === 'HOLD' && args.algoAction !== 'HOLD') return 'downgraded_to_hold';
  return 'approved';
}

function isValidAiContract(obj: any): obj is {
  ai_action: 'BUY' | 'SELL' | 'HOLD';
  ai_confidence0to1: number;
  ai_reasons: string[];
  risk_regime: 'calm' | 'elevated' | 'volatile' | 'crisis';
} {
  if (!obj || typeof obj !== 'object') return false;

  if (!['BUY', 'SELL', 'HOLD'].includes((obj as any).ai_action)) return false;
  if (typeof (obj as any).ai_confidence0to1 !== 'number' || (obj as any).ai_confidence0to1 < 0 || (obj as any).ai_confidence0to1 > 1)
    return false;
  if (!Array.isArray((obj as any).ai_reasons)) return false;
  if (!['calm', 'elevated', 'volatile', 'crisis'].includes((obj as any).risk_regime)) return false;

  return true;
}

export async function POST(req: NextRequest) {
  const user = await getServerUser();
  if (!user) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }));

  const premium = await getUserPremiumStatus();
  if (!premium?.isPremium) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'premium_required' }, { status: 403 }));
  }

  const body = (await req.json().catch(() => null)) as { country?: Country; cycle_key?: string } | null;
  const country = body?.country;
  const cycleKey = String(body?.cycle_key ?? '').trim() || null;
  if (country && !isCountry(country)) {
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Invalid country' }, { status: 400 }));
  }

  const supabase = getServerClient();

  // Find latest signal if cycle_key not provided
  const { data: signal, error: sigErr } = await (cycleKey
    ? supabase
        .from('gold_signals')
        .select(
          'cycle_key, cycle_started_at, country, action, confidence, raw_action, raw_confidence0to1, final_action, final_confidence0to1, final_changed_at, pct_change_5m, volatility_proxy, asia_session, variance_pct, meta, updated_at'
        )
        .eq('cycle_key', cycleKey)
        .eq('country', country ?? 'GLOBAL')
        .maybeSingle()
    : supabase
        .from('gold_signals')
        .select(
          'cycle_key, cycle_started_at, country, action, confidence, raw_action, raw_confidence0to1, final_action, final_confidence0to1, final_changed_at, pct_change_5m, volatility_proxy, asia_session, variance_pct, meta, updated_at'
        )
        .eq('country', country ?? 'GLOBAL')
        .order('cycle_started_at', { ascending: false })
        .limit(1)
        .maybeSingle());

  if (sigErr) return withNoStoreHeaders(NextResponse.json({ ok: false, error: sigErr.message }, { status: 500 }));
  if (!signal) return withNoStoreHeaders(NextResponse.json({ ok: false, error: 'Signal not found' }, { status: 404 }));

  const effectiveCountry = String((signal as any).country) as Country;
  const effectiveCycleKey = String((signal as any).cycle_key);

  // Cache check
  const { data: cached } = await supabase
    .from('gold_signal_ai_reviews')
    .select(
      'cycle_key, country, algo_action, algo_confidence, ai_action, ai_confidence0to1, ai_reasons, risk_regime, decision, requested_count, created_at, updated_at'
    )
    .eq('cycle_key', effectiveCycleKey)
    .eq('country', effectiveCountry)
    .maybeSingle();

  if (cached) {
    // Increment requested_count best-effort
    await supabase
      .from('gold_signal_ai_reviews')
      .update({ requested_count: Number((cached as any).requested_count ?? 1) + 1 })
      .eq('cycle_key', effectiveCycleKey)
      .eq('country', effectiveCountry);

    return withNoStoreHeaders(NextResponse.json({ ok: true, cached: true, review: cached }, { status: 200 }));
  }

  // Inputs
  const { data: lastSignals } = await supabase
    .from('gold_signals')
    .select('action, confidence')
    .eq('country', effectiveCountry)
    .order('cycle_started_at', { ascending: false })
    .limit(12);

  const newsCountry = effectiveCountry === 'EG' ? 'EG' : 'GLOBAL';
  const { data: headlinesRows } = await supabase
    .from('news_items')
    .select('title, published_at, created_at')
    .eq('country', newsCountry)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(10);

  const promptObj: any = {
    country: effectiveCountry,
    algo_action: String((signal as any).action) as Action,
    algo_confidence: Number((signal as any).confidence),
    pct_change_5m: Number((signal as any).pct_change_5m),
    volatility_proxy: Number((signal as any).volatility_proxy),
    asia_session: Boolean((signal as any).asia_session),
    last_12_signals: (lastSignals ?? []).map((r: any) => ({ action: r.action, confidence: r.confidence })),
    top_headlines: pickHeadlines(headlinesRows ?? [], 10),
  };
  if (effectiveCountry === 'EG') {
    promptObj.variance_pct = (signal as any).variance_pct ?? null;
  }

  // Call AI
  const ai = await callOpenAiStrictJson<unknown>({
    systemPrompt: AI_SYSTEM_PROMPT,
    userJson: promptObj,
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 400,
    timeoutMs: 8000,
  });

  console.log('[AI RAW RESULT]', ai);
  if (!ai.ok) {
    console.error('[AI ERROR]', ai.error, ai.rawText);
  }

  const algoAction = promptObj.algo_action as Action;
  const algoConfidence = Number(promptObj.algo_confidence);

  let record: any;
  if (ai.ok && isValidAiContract(ai.json)) {
    const decision = decide({ algoAction, aiAction: ai.json.ai_action, aiConfidence: ai.json.ai_confidence0to1 });
    record = {
      cycle_key: effectiveCycleKey,
      country: effectiveCountry,
      algo_action: algoAction,
      algo_confidence: algoConfidence,
      ai_action: ai.json.ai_action,
      ai_confidence0to1: ai.json.ai_confidence0to1,
      ai_reasons: ai.json.ai_reasons,
      risk_regime: ai.json.risk_regime,
      decision,
      requested_count: 1,
      requested_by_user_id: user.id,
      raw_prompt: promptObj,
      raw_response: ai.json,
    };
  } else {
    // Fallback to algorithm if AI fails or returns invalid JSON.
    record = {
      cycle_key: effectiveCycleKey,
      country: effectiveCountry,
      algo_action: algoAction,
      algo_confidence: algoConfidence,
      ai_action: algoAction,
      ai_confidence0to1: Math.max(0, Math.min(1, algoConfidence)),
      ai_reasons: ['ai_unavailable'],
      risk_regime: 'elevated' as RiskRegime,
      decision: 'fallback_algo' as Decision,
      requested_count: 1,
      requested_by_user_id: user.id,
      raw_prompt: promptObj,
      raw_response: ai.ok ? ai.json : { error: ai.error, rawText: ai.rawText ?? null },
    };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('gold_signal_ai_reviews')
    .insert(record)
    .select(
      'cycle_key, country, algo_action, algo_confidence, ai_action, ai_confidence0to1, ai_reasons, risk_regime, decision, requested_count, created_at, updated_at'
    )
    .single();

  const isFallback = String(record?.decision || '') === 'fallback_algo';

  if (insErr) {
    // If another request won the race, return cached row.
    const { data: raced } = await supabase
      .from('gold_signal_ai_reviews')
      .select(
        'cycle_key, country, algo_action, algo_confidence, ai_action, ai_confidence0to1, ai_reasons, risk_regime, decision, requested_count, created_at, updated_at'
      )
      .eq('cycle_key', effectiveCycleKey)
      .eq('country', effectiveCountry)
      .maybeSingle();
    if (raced) {
      const racedFallback = String((raced as any).decision || '') === 'fallback_algo';
      if (racedFallback) {
        return withNoStoreHeaders(
          NextResponse.json({ ok: true, cached: true, fallback: true, reason: 'ai_unavailable', review: raced }, { status: 200 })
        );
      }
      return withNoStoreHeaders(NextResponse.json({ ok: true, cached: true, fallback: false, review: raced }, { status: 200 }));
    }
    return withNoStoreHeaders(NextResponse.json({ ok: false, error: insErr.message }, { status: 500 }));
  }

  // If AI is available (not fallback), optionally apply state-machine final update globally.
  if (!isFallback && inserted) {
    const sigMeta = (signal as any).meta as any;
    const regimeNow: Regime =
      sigMeta && typeof sigMeta.regime === 'string' && ['calm', 'trending', 'volatile', 'choppy'].includes(String(sigMeta.regime))
        ? (String(sigMeta.regime) as Regime)
        : 'calm';
    const chopDetectedNow = Boolean(sigMeta?.chopDetected);
    const varianceConflictNow = Boolean(sigMeta?.varianceConflictNow);

    const { data: prevState } = await supabase
      .from('gold_signal_state')
      .select('final_action, final_confidence0to1, final_changed_at')
      .eq('country', effectiveCountry)
      .eq('asset', 'XAUUSD')
      .maybeSingle();

    const prevFinalAction = (prevState?.final_action ? String((prevState as any).final_action) : String((signal as any).final_action ?? 'HOLD')) as FinalAction;
    const prevFinalChangedAt = prevState?.final_changed_at ? String((prevState as any).final_changed_at) : (signal as any).final_changed_at ?? null;

    const { data: histRows } = await supabase
      .from('gold_signals')
      .select('cycle_key, raw_action, raw_confidence0to1, action, confidence')
      .eq('country', effectiveCountry)
      .order('cycle_started_at', { ascending: false })
      .limit(12);

    const historyRaw = (histRows ?? [])
      .filter((r: any) => String(r.cycle_key) !== effectiveCycleKey)
      .map((r: any) => ({
        cycle_key: String(r.cycle_key),
        rawAction: String(r.raw_action ?? r.action ?? 'HOLD') as FinalAction,
        rawConfidence: Number(r.raw_confidence0to1 ?? r.confidence ?? 0),
      }));

    const derived = deriveFinalSignal({
      prevFinalAction,
      prevFinalChangedAt,
      rawActionNow: algoAction,
      rawConfidenceNow: algoConfidence,
      regimeNow,
      chopDetectedNow,
      varianceConflictNow,
      ai: { enabled: true, action: String((inserted as any).ai_action) as FinalAction, confidence0to1: Number((inserted as any).ai_confidence0to1) },
      historyRaw,
    });

    const finalChangedAtIso = derived.changed ? new Date().toISOString() : (prevFinalChangedAt ?? new Date().toISOString());

    await supabase
      .from('gold_signals')
      .update({
        final_action: derived.finalAction,
        final_confidence0to1: derived.finalConfidence0to1,
        final_changed_at: finalChangedAtIso,
        final_change_reason: derived.changeReason,
        updated_at: new Date().toISOString(),
      })
      .eq('cycle_key', effectiveCycleKey)
      .eq('country', effectiveCountry);

    await supabase.from('gold_signal_state').upsert(
      {
        country: effectiveCountry,
        asset: 'XAUUSD',
        final_action: derived.finalAction,
        final_confidence0to1: derived.finalConfidence0to1,
        final_changed_at: finalChangedAtIso,
        last_cycle_key: effectiveCycleKey,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'country,asset' }
    );
  }

  if (isFallback) {
    return withNoStoreHeaders(
      NextResponse.json({ ok: true, cached: false, fallback: true, reason: 'ai_unavailable', review: inserted }, { status: 200 })
    );
  }
  return withNoStoreHeaders(NextResponse.json({ ok: true, cached: false, fallback: false, review: inserted }, { status: 200 }));
}

