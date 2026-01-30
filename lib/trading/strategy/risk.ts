export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function computeStops(input: { entry: number; atr: number | null; kStop?: number; kTp?: number }) {
  const kStop = input.kStop ?? 1.2;
  const kTp = input.kTp ?? 1.8;
  const atr = input.atr ?? 0;
  // Alpaca bracket orders validate stop/tp against an internal base_price (often near the fill).
  // To avoid 422s like "stop_price must be <= base_price - 0.01", enforce a small absolute gap.
  const MIN_GAP = 0.05; // $0.05 cushion
  const stopDistance = Math.max(0.01, atr * kStop, MIN_GAP);
  const stopLossRaw = Math.max(0.01, input.entry - stopDistance);
  const takeProfitRaw = Math.max(0.01, input.entry + Math.max(atr * kTp, MIN_GAP));

  // Alpaca rejects prices with excessive precision; normalize to 2 decimals.
  const stopLoss = round2(stopLossRaw);
  const takeProfit = round2(takeProfitRaw);
  return { stopLoss, takeProfit, stopDistance };
}

export function positionSizing(input: {
  equityUsd: number;
  maxRiskPct: number; // <= 0.02
  stopDistance: number;
  maxNotionalUsd?: number; // hard cap
  price: number;
}): number {
  const riskDollar = Math.max(0, input.equityUsd * clamp(input.maxRiskPct, 0, 0.02));
  const rawQty = input.stopDistance > 0 ? Math.floor(riskDollar / input.stopDistance) : 0;
  const maxNotional = input.maxNotionalUsd ?? input.equityUsd * 0.1; // 10% equity cap default
  const notionalCapQty = Math.floor(maxNotional / input.price);
  return Math.max(0, Math.min(rawQty, notionalCapQty));
}

