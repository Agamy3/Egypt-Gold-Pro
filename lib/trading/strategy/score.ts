import type { IndicatorSnapshot } from '@/lib/trading/indicators';

export type ScoreInput = {
  indicators: IndicatorSnapshot;
  realtime: { price: number; ts: string } | null;
  sentiment: { sentiment: number; headlines: string[] };
  liquidity?: { avgVolume?: number | null };
};

export type ScoreOutput = {
  score: number; // 0..100
  confidence0to1: number; // 0..1
  reasons: string[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function scoreSymbol(input: ScoreInput): ScoreOutput {
  const reasons: string[] = [];

  const i = input.indicators;
  const sentiment = clamp(input.sentiment.sentiment, -1, 1);

  // Trend (0..40)
  let trend = 0;
  if (i.emaFast != null && i.emaSlow != null) {
    if (i.emaFast > i.emaSlow) {
      trend += 25;
      reasons.push('EMA fast > EMA slow');
    } else {
      trend += 5;
      reasons.push('EMA fast <= EMA slow');
    }
  }
  if (i.macd != null && i.macdSignal != null) {
    if (i.macd > i.macdSignal) {
      trend += 15;
      reasons.push('MACD > signal');
    } else {
      trend += 5;
      reasons.push('MACD <= signal');
    }
  }

  // Momentum (0..30)
  let momentum = 0;
  if (i.rsi14 != null) {
    if (i.rsi14 >= 45 && i.rsi14 <= 65) {
      momentum += 25;
      reasons.push('RSI in 45-65');
    } else if (i.rsi14 > 70 || i.rsi14 < 30) {
      momentum += 5;
      reasons.push('RSI extreme');
    } else {
      momentum += 12;
      reasons.push('RSI neutral');
    }
  }

  // Volatility penalty (0..-20)
  let volPenalty = 0;
  if (i.atrPct != null) {
    if (i.atrPct > 0.03) {
      volPenalty -= 20;
      reasons.push('ATR% too high');
    } else if (i.atrPct > 0.02) {
      volPenalty -= 10;
      reasons.push('ATR% elevated');
    } else {
      reasons.push('ATR% acceptable');
    }
  }

  // Liquidity penalty (0..-10) (placeholder)
  let liqPenalty = 0;
  const avgVol = input.liquidity?.avgVolume ?? null;
  if (avgVol != null && isFinite(avgVol)) {
    if (avgVol < 1_000_000) {
      liqPenalty -= 10;
      reasons.push('Low avg volume');
    }
  }

  // Sentiment (0..10)
  const sentimentScore = Math.round(((sentiment + 1) / 2) * 10);
  if (sentimentScore >= 6) reasons.push('Positive sentiment');
  else if (sentimentScore <= 4) reasons.push('Negative/neutral sentiment');

  const raw = trend + momentum + sentimentScore + volPenalty + liqPenalty;
  const score = clamp(Math.round(raw), 0, 100);

  // Conservative confidence: require enough signals.
  const signalCount =
    (i.emaFast != null && i.emaSlow != null ? 1 : 0) +
    (i.macd != null && i.macdSignal != null ? 1 : 0) +
    (i.rsi14 != null ? 1 : 0) +
    (i.atr14 != null ? 1 : 0);

  const confidence0to1 = clamp(0.2 + 0.2 * signalCount + score / 200, 0, 1);

  return { score, confidence0to1, reasons };
}

