export type IndicatorSnapshot = {
  smaFast: number | null;
  smaSlow: number | null;
  emaFast: number | null;
  emaSlow: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  atr14: number | null;
  atrPct: number | null;
};

type Bar = { o: number; h: number; l: number; c: number };

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses += -delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macd(closes: number[], fast = 12, slow = 26, signal = 9): { macd: number | null; signal: number | null } {
  if (closes.length < slow + signal) return { macd: null, signal: null };
  // Build EMA series (simple implementation)
  const emaSeries = (period: number) => {
    const k = 2 / (period + 1);
    const out: number[] = [];
    let e = closes[0];
    out.push(e);
    for (let i = 1; i < closes.length; i++) {
      e = closes[i] * k + e * (1 - k);
      out.push(e);
    }
    return out;
  };
  const ef = emaSeries(fast);
  const es = emaSeries(slow);
  const m: number[] = ef.map((v, i) => v - es[i]);
  const sig = ema(m, signal);
  return { macd: m[m.length - 1] ?? null, signal: sig };
}

function atr(bars: Bar[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].c;
    const high = bars[i].h;
    const low = bars[i].l;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  if (trs.length < period) return null;
  const slice = trs.slice(trs.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function computeIndicators(bars: Bar[]): IndicatorSnapshot {
  const closes = bars.map((b) => b.c).filter((n) => isFinite(n));
  const lastClose = closes.length ? closes[closes.length - 1] : null;

  const smaFast = sma(closes, 20);
  const smaSlow = sma(closes, 50);
  const emaFast = ema(closes, 12);
  const emaSlow = ema(closes, 26);
  const rsi14 = rsi(closes, 14);
  const m = macd(closes, 12, 26, 9);
  const atr14 = atr(bars, 14);
  const atrPct = atr14 != null && lastClose != null && lastClose > 0 ? atr14 / lastClose : null;

  return {
    smaFast,
    smaSlow,
    emaFast,
    emaSlow,
    rsi14,
    macd: m.macd,
    macdSignal: m.signal,
    atr14,
    atrPct,
  };
}

