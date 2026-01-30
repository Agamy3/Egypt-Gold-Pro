export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function computeStops(input: { entry: number; atr: number | null; kStop?: number; kTp?: number }) {
  const kStop = input.kStop ?? 1.2;
  const kTp = input.kTp ?? 1.8;
  const atr = input.atr ?? 0;
  const stopDistance = Math.max(0.01, atr * kStop);
  const stopLoss = Math.max(0.01, input.entry - stopDistance);
  const takeProfit = Math.max(0.01, input.entry + atr * kTp);
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

