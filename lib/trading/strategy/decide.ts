import type { AlpacaAccount, AlpacaPosition } from '@/lib/brokers/alpacaPaper';
import { computeIndicators } from '@/lib/trading/indicators';
import { fetchHistory, fetchRealtime } from '@/lib/trading/data/market';
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
  availableUsd?: number;
  maxRiskPerTradePct: number;
  scoreThreshold?: number;
}): Promise<StrategyDecision> {
  const scoreThreshold = input.scoreThreshold ?? 70;

  const equity = num(input.account.equity) ?? 0;
  const cash = num((input.account as any).cash) ?? 0;
  const buyingPower = num((input.account as any).buying_power) ?? null;
  const availableUsd = Math.max(0, input.availableUsd ?? cash);
  const inPos = new Set(input.positions.map((p) => p.symbol));

  // Use realtime quotes for entry reference (reduces Alpaca base_price mismatches vs bar closes).
  const realtimeBySymbol = await fetchRealtime(input.universe);

  const candidates: Array<{ symbol: string; score: number; confidence0to1: number; reasons: string[]; price: number; atr: number | null; indicators: any }> = [];

  for (const symbol of input.universe) {
    if (inPos.has(symbol)) continue;

    // Use 5Min bars for a conservative short-term view
    const bars = await fetchHistory(symbol, '5Min', 200).catch(() => []);
    if (bars.length < 60) continue;
    const indicators = computeIndicators(bars.map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c })));
    const rt = realtimeBySymbol[symbol];
    const price = rt?.price;
    if (!isFinite(price)) continue;
    const sentiment = await getNewsSentimentForSymbol(symbol);

    const s = scoreSymbol({
      indicators,
      realtime: rt ?? null,
      sentiment,
    });

    candidates.push({
      symbol,
      score: s.score,
      confidence0to1: s.confidence0to1,
      reasons: s.reasons,
      price: Number(price),
      atr: indicators.atr14,
      indicators,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const actions: StrategyDecision['actions'] = [];
  const eligible = candidates.filter((c) => c.score >= scoreThreshold);
  if (eligible.length === 0) {
    // keep behavior: emit SKIPs for visibility (top few only)
    for (const c of candidates.slice(0, 5)) actions.push({ type: 'SKIP', symbol: c.symbol, reason: `score_below_threshold:${c.score}` });
    return { actions, considered: candidates.length };
  }

  // Initial allocation: spread a conservative budget across top-scoring symbols.
  const MAX_NEW_POSITIONS = availableUsd < 1_000 ? 1 : 3;
  const MIN_NOTIONAL_USD = 200;
  const TOTAL_BUDGET_USD = Math.max(0, Math.min(availableUsd, buyingPower ?? availableUsd) * 0.15); // use ~15% of available cash per run
  const PER_POSITION_BUDGET_CAP_USD = Math.max(0, Math.min(TOTAL_BUDGET_USD, (buyingPower ?? availableUsd) * 0.07)); // hard cap per position

  const picked = eligible.slice(0, MAX_NEW_POSITIONS);
  const weights = picked.map((c) => Math.max(1, c.score - scoreThreshold + 1));
  const weightSum = weights.reduce((a, b) => a + b, 0);

  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    const w = weights[i] / weightSum;
    const rawBudget = TOTAL_BUDGET_USD * w;
    const budget = Math.min(PER_POSITION_BUDGET_CAP_USD, rawBudget);
    if (budget < MIN_NOTIONAL_USD) {
      actions.push({ type: 'SKIP', symbol: c.symbol, reason: `budget_too_small:${budget.toFixed(2)}` });
      continue;
    }

    const { stopLoss, takeProfit, stopDistance } = computeStops({ entry: c.price, atr: c.atr });

    const qtyByRisk = positionSizing({
      equityUsd: equity,
      maxRiskPct: input.maxRiskPerTradePct,
      stopDistance,
      maxNotionalUsd: budget,
      price: c.price,
    });
    const qtyByBudget = Math.floor(budget / c.price);
    const qty = Math.max(0, Math.min(qtyByRisk, qtyByBudget));

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
  }

  return { actions, considered: candidates.length };
}

