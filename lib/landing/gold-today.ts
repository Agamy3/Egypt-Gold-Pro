import 'server-only';

import db from '@/lib/supabase';
import { getMarketMedians, type EgyptMarketReadTrust } from '@/lib/supabase/queries-norm';
import { getGoldSignalZone, zoneWhyNow } from '@/lib/telegram/signal-zones';

type Karat = 18 | 21 | 24;
type SignalAction = 'BUY' | 'SELL' | 'HOLD';

export type GoldTodayData = {
  asOf: string;
  freshnessMinutes: number;
  sourcesCount: number;
  confidence: number | null;
  signal: {
    action: SignalAction;
    actionAr: 'شراء' | 'بيع' | 'محايد';
    strengthStars: string;
    explanationAr: string;
    zoneLabelAr: string;
  };
  prices: Record<
    Karat,
    {
      current: number | null;
      changePct: number | null;
      direction: 'up' | 'down' | 'flat';
    }
  >;
  /** Present for Egypt: when false, local medians are not fully trusted for “live market” messaging. */
  marketTrust: EgyptMarketReadTrust | null;
};

function strengthFromConfidence(conf: number | null): string {
  if (conf === null || !isFinite(conf)) return '⭐⭐⭐';
  if (conf >= 0.85) return '⭐⭐⭐⭐⭐';
  if (conf >= 0.7) return '⭐⭐⭐⭐';
  if (conf >= 0.55) return '⭐⭐⭐';
  return '⭐⭐';
}

function toArSignal(action: SignalAction): 'شراء' | 'بيع' | 'محايد' {
  if (action === 'BUY') return 'شراء';
  if (action === 'SELL') return 'بيع';
  return 'محايد';
}

function toArZone(label: string | null): string {
  if (!label) return 'خارج النطاق';
  if (label === 'Strong Buy') return 'شراء قوي';
  if (label === 'Buy') return 'شراء';
  if (label === 'Core Buy') return 'شراء أساسي';
  if (label === 'Partial Sell') return 'بيع جزئي';
  if (label === 'Strong Sell') return 'بيع قوي';
  return label;
}

function shortAiExplanation(args: {
  signal: SignalAction;
  zoneLabel: string | null;
  trendPct: number | null;
  volatility: number | null;
}): string {
  const lines: string[] = [];
  if (args.zoneLabel) {
    if (args.zoneLabel === 'Core Buy') lines.push('الذهب في منطقة تجميع قوية طويلة المدى.');
    else if (args.zoneLabel === 'Strong Buy') lines.push('الذهب في منطقة تجميع قوية وبيعتبر أقل من قيمته حسب التحليل.');
    else if (args.zoneLabel === 'Buy') lines.push('الذهب داخل نطاق مناسب للتجميع التدريجي.');
    else if (args.zoneLabel === 'Partial Sell') lines.push('الذهب وصل لمنطقة مناسبة لجني الأرباح جزئياً.');
    else if (args.zoneLabel === 'Strong Sell') lines.push('الذهب في منطقة مرتفعة وخطر نسبي مقارنة بالتحليل.');
    else lines.push('السعر داخل نطاق استراتيجي حسب حدود التحليل الحالية.');
  } else {
    lines.push('السعر يتحرك خارج نطاقات الشراء/البيع الواضحة حالياً، لذلك نعتمد على إشارة الاتجاه اللحظية.');
  }

  if (typeof args.trendPct === 'number' && isFinite(args.trendPct)) {
    const d = args.trendPct > 0 ? 'صاعد' : args.trendPct < 0 ? 'هابط' : 'عرضي';
    lines.push(`الاتجاه القصير حالياً ${d} (${Math.abs(args.trendPct).toFixed(2)}%).`);
  }

  if (typeof args.volatility === 'number' && isFinite(args.volatility)) {
    const v = args.volatility > 0.018 ? 'مرتفعة' : args.volatility > 0.01 ? 'متوسطة' : 'منخفضة';
    lines.push(`التذبذب ${v}، لذلك يفضل إدارة الدخول تدريجياً.`);
  }

  if (args.signal === 'BUY') lines.push('الإشارة الحالية تميل للشراء مع متابعة التحديثات اللحظية.');
  if (args.signal === 'SELL') lines.push('الإشارة الحالية تميل للبيع أو تخفيف المراكز عند الارتفاع.');
  if (args.signal === 'HOLD') lines.push('الإشارة الحالية محايدة حتى تتضح حركة السعر أكثر.');
  return lines.slice(0, 4).join(' ');
}

function safeDirection(pct: number | null): 'up' | 'down' | 'flat' {
  if (pct === null || !isFinite(pct) || Math.abs(pct) < 0.0001) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

export async function getGoldTodayLandingData(): Promise<GoldTodayData> {
  const market = await getMarketMedians('EG', false, 120);

  const { data: rows } = await db.supabase
    .from('market_snapshots_norm')
    .select('karat, price, created_at')
    .eq('country', 'EG')
    .eq('trusted', true)
    .in('karat', [18, 21, 24])
    .order('created_at', { ascending: false })
    .limit(2000);

  const { data: latestSignal } = await db.supabase
    .from('gold_signals')
    .select('final_action, final_confidence0to1, confidence, xau_usd, volatility_proxy, pct_change_5m')
    .eq('country', 'EG')
    .order('cycle_started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const grouped = new Map<number, Array<{ price: number; createdAt: string }>>();
  for (const r of (rows || []) as Array<{ karat: number; price: number; created_at: string }>) {
    if (!grouped.has(r.karat)) grouped.set(r.karat, []);
    grouped.get(r.karat)?.push({ price: Number(r.price), createdAt: String(r.created_at) });
  }

  const buildKarat = (k: Karat, currentFallback: number | null) => {
    const list = grouped.get(k) || [];
    const current = list[0]?.price ?? currentFallback;
    const prev = list[1]?.price ?? null;
    const changePct = current && prev && prev > 0 ? (current - prev) / prev : null;
    return { current: current ?? null, changePct, direction: safeDirection(changePct) };
  };

  const signalAction = (latestSignal?.final_action || 'HOLD') as SignalAction;
  const confRaw = Number((latestSignal?.final_confidence0to1 ?? latestSignal?.confidence) ?? NaN);
  const confidence = isFinite(confRaw) ? confRaw : null;
  const xau = Number(latestSignal?.xau_usd ?? NaN);
  const zone = isFinite(xau) ? getGoldSignalZone(xau) : null;
  const trendPct = Number(latestSignal?.pct_change_5m ?? NaN);
  const vol = Number(latestSignal?.volatility_proxy ?? NaN);
  const asOfMs = market.lastUpdated || Date.now();

  return {
    asOf: new Date(asOfMs).toISOString(),
    freshnessMinutes: Math.max(0, Math.floor((Date.now() - asOfMs) / 60000)),
    sourcesCount: market.activeSourceCount || 0,
    marketTrust: market.egyptMarketTrust ?? null,
    confidence,
    signal: {
      action: signalAction,
      actionAr: toArSignal(signalAction),
      strengthStars: strengthFromConfidence(confidence),
      explanationAr: zone ? zoneWhyNow(zone, 'ar') : shortAiExplanation({
        signal: signalAction,
        zoneLabel: null,
        trendPct: isFinite(trendPct) ? trendPct : null,
        volatility: isFinite(vol) ? vol : null,
      }),
      zoneLabelAr: toArZone(zone?.label || null),
    },
    prices: {
      18: buildKarat(18, market.prices.market18Buy ?? null),
      21: buildKarat(21, market.prices.market21Buy ?? null),
      24: buildKarat(24, market.prices.market24Buy ?? null),
    },
  };
}
