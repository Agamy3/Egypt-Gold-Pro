/**
 * Core Pricing Engine - Pure Functions
 * 
 * TROY OUNCE ONLY: 1 troy ounce = 31.1034768 grams
 * 
 * Rules:
 * - Never compute market prices from spot
 * - Never override with fair value
 * - If market data is missing, return null
 */

const TROY_OUNCE_GRAMS = 31.1034768;
const KARAT_21_FACTOR = 0.875; // 21/24 = 0.875

/**
 * Convert Egypt Market Implied Ounce (USD per troy ounce) to USD per gram (24k)
 */
export function impliedOunceToUsdPerGram24(impliedOunceUsd: number | null): number | null {
  if (impliedOunceUsd === null || impliedOunceUsd <= 0) {
    return null;
  }
  return impliedOunceUsd / TROY_OUNCE_GRAMS;
}

/**
 * Convert USD per gram (24k) to USD per gram (21k)
 */
export function usdPerGram24To21(usdPerGram24: number | null): number | null {
  if (usdPerGram24 === null || usdPerGram24 <= 0) {
    return null;
  }
  return usdPerGram24 * KARAT_21_FACTOR;
}

/**
 * Compute implied "Gold FX" (USD/EGP) from market prices
 * Uses median of 21k and 24k FX values if both available
 */
export function computeImpliedGoldFx(
  market21Buy: number | null,
  market24Buy: number | null,
  usdPerGram21: number | null,
  usdPerGram24: number | null
): number | null {
  const fxValues: number[] = [];
  
  if (market24Buy !== null && usdPerGram24 !== null && usdPerGram24 > 0) {
    fxValues.push(market24Buy / usdPerGram24);
  }
  if (market21Buy !== null && usdPerGram21 !== null && usdPerGram21 > 0) {
    fxValues.push(market21Buy / usdPerGram21);
  }
  
  if (fxValues.length === 0) {
    return null;
  }
  
  // Use median if multiple, single value if only one
  if (fxValues.length === 1) {
    return fxValues[0];
  }
  
  const sorted = [...fxValues].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute local market parity prices
 * 
 * These should converge to GoldBillion / Dahab Masr levels
 */
export function computeLocalMarketParity(
  usdPerGram24: number | null,
  usdPerGram21: number | null,
  usdEgpGold: number | null
): {
  local24: number | null;
  local21: number | null;
} {
  if (usdEgpGold === null || usdPerGram24 === null || usdPerGram21 === null) {
    return { local24: null, local21: null };
  }

  const local24 = usdPerGram24 * usdEgpGold;
  const local21 = local24 * KARAT_21_FACTOR;

  return { local24, local21 };
}

/**
 * Compute fair value using real USD/EGP exchange rate
 */
export function computeFairValue(
  usdPerGram24: number | null,
  usdPerGram21: number | null,
  usdEgp: number | null
): {
  fair24: number | null;
  fair21: number | null;
} {
  if (usdEgp === null || usdPerGram24 === null || usdPerGram21 === null) {
    return { fair24: null, fair21: null };
  }

  const fair24 = usdPerGram24 * usdEgp;
  const fair21 = usdPerGram21 * usdEgp;

  return { fair24, fair21 };
}

/**
 * Compute over/under pricing variance
 * Uses 21k if available, otherwise 24k
 * 
 * Classification thresholds:
 * |variance| <= 0.75% → FAIR
 * variancePct > 0 → PREMIUM
 * variancePct < 0 → DISCOUNT
 * 
 * Returns:
 * - variancePct: percentage difference
 * - premiumEGP: absolute difference in EGP
 * - classification
 */
export function computeVariance(
  market21Buy: number | null,
  market24Buy: number | null,
  fair21: number | null,
  fair24: number | null
): {
  variancePct: number | null;
  premiumEGP: number | null;
  classification: 'FAIR' | 'PREMIUM' | 'DISCOUNT' | 'N/A';
} {
  // Prefer 21k, fallback to 24k
  const marketBuy = market21Buy ?? market24Buy;
  const fairValue = fair21 ?? fair24;
  
  if (marketBuy === null || fairValue === null || fairValue <= 0) {
    return {
      variancePct: null,
      premiumEGP: null,
      classification: 'N/A',
    };
  }

  const variancePct = ((marketBuy - fairValue) / fairValue) * 100;
  const premiumEGP = marketBuy - fairValue;

  const absVariance = Math.abs(variancePct);
  let classification: 'FAIR' | 'PREMIUM' | 'DISCOUNT';
  
  if (absVariance <= 0.75) {
    classification = 'FAIR';
  } else {
    classification = variancePct > 0 ? 'PREMIUM' : 'DISCOUNT';
  }

  return {
    variancePct,
    premiumEGP,
    classification,
  };
}

/**
 * Main pricing calculation pipeline
 */
export function calculatePricing(params: {
  impliedOunceUsd: number | null;
  market21Buy: number | null;
  market21Sell: number | null;
  market24Buy: number | null;
  market24Sell: number | null;
  usdEgp?: number | null; // Real USD/EGP exchange rate
}): {
  usdPerGram24: number | null;
  usdPerGram21: number | null;
  usdEgpGold: number | null; // Real USD/EGP rate
  localMarketParity: { local24: number | null; local21: number | null };
  fairValue: { fair24: number | null; fair21: number | null };
  variance: {
    variancePct: number | null;
    premiumEGP: number | null;
    classification: 'FAIR' | 'PREMIUM' | 'DISCOUNT' | 'N/A';
  };
} {
  // Step 1: Convert Egypt Market Implied Ounce to USD per gram
  const usdPerGram24 = impliedOunceToUsdPerGram24(params.impliedOunceUsd);
  const usdPerGram21 = usdPerGram24To21(usdPerGram24);

  // Step 2: Use real USD/EGP exchange rate
  const usdEgpGold = params.usdEgp ?? null;

  // Step 3: Local market parity (using real FX)
  const localMarketParity = computeLocalMarketParity(
    usdPerGram24,
    usdPerGram21,
    usdEgpGold
  );

  // Step 4: Fair value (using real USD/EGP exchange rate)
  const fairValue = computeFairValue(
    usdPerGram24,
    usdPerGram21,
    usdEgpGold
  );

  // Step 5: Variance (using BUY prices and real FX fair value)
  const variance = computeVariance(
    params.market21Buy,
    params.market24Buy,
    fairValue.fair21,
    fairValue.fair24
  );

  return {
    usdPerGram24,
    usdPerGram21,
    usdEgpGold, // Real USD/EGP rate
    localMarketParity,
    fairValue,
    variance,
  };
}

