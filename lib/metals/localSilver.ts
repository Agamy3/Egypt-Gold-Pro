import 'server-only';

import { getCountryCurrency } from '@/lib/fx-multi';
import { fetchUsdTo } from '@/lib/fx/frankfurter';
import { fetchSpotXagUsd } from '@/lib/metals/silverSpot';

const TROY_OUNCE_GRAMS = 31.1034768;

export async function getLocalSilver(country: 'EG' | 'AE' | 'SA' | 'US'): Promise<
  | {
      ok: true;
      country: 'EG' | 'AE' | 'SA' | 'US';
      currency: 'EGP' | 'AED' | 'SAR' | 'USD';
      priceLocalPerOunce: number;
      priceLocalPerGram: number;
      spotUsdPerOunce: number;
      usdToLocal: number;
      meta: { asOfIso: string; spotAsOf: string; fxDate: string; sourceSpot: string; sourceFx: string };
    }
  | { ok: false; error: string }
> {
  const currency = getCountryCurrency(country);

  const spot = await fetchSpotXagUsd();
  if (!spot.ok) return { ok: false, error: spot.error };

  const fx = await fetchUsdTo(currency);
  if (!fx.ok) return { ok: false, error: fx.error };

  const priceLocalPerOunce = spot.priceUsdPerOunce * fx.rate;
  const priceLocalPerGram = priceLocalPerOunce / TROY_OUNCE_GRAMS;

  if (!isFinite(priceLocalPerOunce) || priceLocalPerOunce <= 0) return { ok: false, error: 'Computed local silver price invalid' };

  const asOfIso = new Date().toISOString();
  return {
    ok: true,
    country,
    currency,
    priceLocalPerOunce,
    priceLocalPerGram,
    spotUsdPerOunce: spot.priceUsdPerOunce,
    usdToLocal: fx.rate,
    meta: {
      asOfIso,
      spotAsOf: spot.tsIso,
      fxDate: fx.date,
      sourceSpot: spot.source,
      sourceFx: fx.source,
    },
  };
}

