/**
 * Money → Gold Calculator Helper
 * 
 * Computes how many grams of gold can be purchased for a given amount
 * using live market prices or fallback fair values.
 */

export interface GoldCalculationResult {
  grams24: number | null;
  grams21: number | null;
  grams18: number | null;
  price24: number | null;
  price21: number | null;
  price18: number | null;
  usedFallback: boolean;
  referenceUnavailable: boolean;
}

export interface MarketSnapshot {
  market?: {
    median?: {
      market24Buy?: number | null;
      market21Buy?: number | null;
      market18Buy?: number | null;
    };
  };
  pricing?: {
    fairValue?: {
      fair24?: number | null;
      fair21?: number | null;
      fair18?: number | null;
    };
  };
  warnings?: {
    referenceUnavailable?: boolean;
  };
}

/**
 * Compute grams of gold for each karat from a money amount
 * 
 * @param amount - Amount in selected currency
 * @param snapshot - Market snapshot from /api/marketSnapshot
 * @param feesPct - Optional fees percentage (0-100), reduces buying power
 * @returns Calculation result with grams per karat
 */
export function computeGoldFromMoney(
  amount: number,
  snapshot: MarketSnapshot,
  feesPct: number = 0
): GoldCalculationResult {
  // Apply fees: effectiveAmount = amount * (1 - feesPct/100)
  const effectiveAmount = amount * (1 - feesPct / 100);

  // Try to use market medians first
  const medians = snapshot.market?.median;
  const fairValues = snapshot.pricing?.fairValue;

  let price24: number | null = null;
  let price21: number | null = null;
  let price18: number | null = null;
  let usedFallback = false;
  let referenceUnavailable = snapshot.warnings?.referenceUnavailable ?? false;

  // Priority 1: Use market medians (buy prices)
  if (medians?.market24Buy && medians.market21Buy && medians.market18Buy) {
    price24 = medians.market24Buy;
    price21 = medians.market21Buy;
    price18 = medians.market18Buy;
  }
  // Priority 2: Use fair values as fallback (calculate 18k from 24k if missing)
  else if (fairValues?.fair24 && fairValues.fair21) {
    price24 = fairValues.fair24;
    price21 = fairValues.fair21;
    // Calculate 18k from 24k: 18k = 24k * (18/24) = 24k * 0.75
    price18 = fairValues.fair18 ?? (fairValues.fair24 * 0.75);
    usedFallback = true;
  }
  // Priority 3: No reference available
  else {
    referenceUnavailable = true;
  }

  // Calculate grams: grams = effectiveAmount / pricePerGram
  let grams24: number | null = null;
  let grams21: number | null = null;
  let grams18: number | null = null;

  if (!referenceUnavailable && price24 && price21 && price18) {
    grams24 = effectiveAmount / price24;
    grams21 = effectiveAmount / price21;
    grams18 = effectiveAmount / price18;
  }

  return {
    grams24,
    grams21,
    grams18,
    price24,
    price21,
    price18,
    usedFallback,
    referenceUnavailable,
  };
}

