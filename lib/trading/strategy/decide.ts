import type { AlpacaAccount, AlpacaPosition } from '@/lib/brokers/alpacaPaper';
import { computeIndicators } from '@/lib/trading/indicators';
import { fetchHistory } from '@/lib/trading/data/market';
import { getNewsSentimentForSymbol } from '@/lib/trading/data/news';
import { scoreSymbol } from '@/lib/trading/strategy/score';
import { computeStops, positionSizing } from '@/lib/trading/strategy/risk';

export type StrategyDecision = {
  actions: Array<
    | {
        type: 'BUY_BRACKET';
        symbol: string;
        qty: number;
        entryPrice: number;
        stopLoss: number;
        takeProfit: number;
        score: number;
        confidence0to1: number;
        reasons: string[];
        indicators: any;
      }
    | { type: 'SKIP'; symbol: string; reason: string }
  >;
  considered: number;
};

function num(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

export async function decideActions(input: {
  universe: string[];
  account: AlpacaAccount;
  positions: AlpacaPosition[];
  maxRiskPerTradePct: number;
  scoreThreshold?: number;
}): Promise<StrategyDecision> {
  const scoreThreshold = input.scoreThreshold ?? 70;

  const equity = num(input.account.equity) ?? 0;
  const inPos = new Set(input.positions.map((p) => p.symbol));

  const candidates: Array<{ symbol: string; score: number; confidence0to1: number; reasons: string[]; price: number; atr: number | null; indicators: any }> = [];

  for (const symbol of input.universe) {
    if (inPos.has(symbol)) continue;

    // Use 5Min bars for a conservative short-term view
    const bars = await fetchHistory(symbol, '5Min', 200).catch(() => []);
    if (bars.length < 60) continue;
    const indicators = computeIndicators(bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c })));
    const lastClose = bars[bars.length - 1]?.c;
    if (!isFinite(lastClose)) continue;
    const sentiment = await getNewsSentimentForSymbol(symbol);

    const s = scoreSymbol({
      indicators,
      realtime: { price: lastClose, ts: bars[bars.length - 1]?.t ?? '' },
      sentiment,
    });

    candidates.push({
      symbol,
      score: s.score,
      confidence0to1: s.confidence0to1,
      reasons: s.reasons,
      price: Number(lastClose),
      atr: indicators.atr14,
      indicators,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const actions: StrategyDecision['actions'] = [];
  let picked = 0;

  for (const c of candidates) {
    if (picked >= 1) break; // MVP: at most 1 new position per run (capital preservation)
    if (c.score < scoreThreshold) {
      actions.push({ type: 'SKIP', symbol: c.symbol, reason: `score_below_threshold:${c.score}` });
      continue;
    }

    const { stopLoss, takeProfit, stopDistance } = computeStops({ entry: c.price, atr: c.atr });
    const qty = positionSizing({
      equityUsd: equity,
      maxRiskPct: input.maxRiskPerTradePct,
      stopDistance,
      maxNotionalUsd: equity * 0.05, // extra conservative: 5% equity cap
      price: c.price,
    });

    if (qty <= 0) {
      actions.push({ type: 'SKIP', symbol: c.symbol, reason: 'qty_zero' });
      continue;
    }

    actions.push({
      type: 'BUY_BRACKET',
      symbol: c.symbol,
      qty,
      entryPrice: c.price,
      stopLoss,
      takeProfit,
      score: c.score,
      confidence0to1: c.confidence0to1,
      reasons: c.reasons,
      indicators: c.indicators,
    });
    picked += 1;
  }

  return { actions, considered: candidates.length };
}

