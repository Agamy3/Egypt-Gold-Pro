import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getMultiCurrencyRates } from '@/lib/fx-multi';
import { getMarketMedians } from '@/lib/supabase/queries-norm';

const TROY_OUNCE_GRAMS = 31.1034768;

export async function computeEgVariancePct(input: {
  supabase: SupabaseClient;
  xauUsdPerOz: number;
}): Promise<number | null> {
  const xau = input.xauUsdPerOz;
  if (!Number.isFinite(xau) || xau <= 0) return null;

  // Local market buy (median) in EGP
  const market = await getMarketMedians('EG', false, 120);
  const local21 = market.prices.market21Buy;
  if (local21 === null || !Number.isFinite(local21) || local21 <= 0) return null;

  const fx = await getMultiCurrencyRates();
  const usdEgp = fx.usd_egp;
  if (usdEgp === null || !Number.isFinite(usdEgp) || usdEgp <= 0) return null;

  // Fair 21k EGP/gram (derived from global XAUUSD)
  const usdPerGram24 = xau / TROY_OUNCE_GRAMS;
  const usdPerGram21 = usdPerGram24 * (21 / 24);
  const fair21Egp = usdPerGram21 * usdEgp;
  if (!Number.isFinite(fair21Egp) || fair21Egp <= 0) return null;

  const variancePct = (local21 - fair21Egp) / fair21Egp;
  if (!Number.isFinite(variancePct)) return null;
  return variancePct;
}

