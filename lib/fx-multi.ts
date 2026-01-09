/**
 * Multi-Currency FX Rates
 * 
 * Fetches USD→EGP, USD→AED, USD→SAR exchange rates from open.er-api.com
 * Uses USD as pivot currency for all conversions
 */

export type Currency = 'USD' | 'EGP' | 'AED' | 'SAR';

export interface MultiCurrencyRates {
  usd_egp: number | null;
  usd_aed: number | null;
  usd_sar: number | null;
  fetchedAt: number;
  stale: boolean;
  source: string;
  errors?: Record<string, string>;
}

// In-memory cache with 10 minute TTL
let fxCache: {
  rates: {
    usd_egp: number;
    usd_aed: number;
    usd_sar: number;
  };
  fetchedAt: number;
} | null = null;

const FX_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FX_STALE_MS = 30 * 60 * 1000; // 30 minutes (consider stale after this)

/**
 * Fetch all required FX rates from open.er-api.com
 * Returns rates with USD as pivot (1 USD = X EGP, 1 USD = X AED, etc.)
 */
export async function getMultiCurrencyRates(): Promise<MultiCurrencyRates> {
  const now = Date.now();

  // Check memory cache first
  if (fxCache && (now - fxCache.fetchedAt) < FX_CACHE_TTL_MS) {
    return {
      usd_egp: fxCache.rates.usd_egp,
      usd_aed: fxCache.rates.usd_aed,
      usd_sar: fxCache.rates.usd_sar,
      fetchedAt: fxCache.fetchedAt,
      stale: (now - fxCache.fetchedAt) > FX_STALE_MS,
      source: 'open.er-api.com',
    };
  }

  try {
    // open.er-api.com API: https://open.er-api.com/v6/latest/USD
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      // Return cached rates if available, otherwise null
      return {
        usd_egp: fxCache?.rates.usd_egp ?? null,
        usd_aed: fxCache?.rates.usd_aed ?? null,
        usd_sar: fxCache?.rates.usd_sar ?? null,
        fetchedAt: now,
        stale: true,
        source: 'open.er-api.com',
        errors: {
          http: `HTTP ${response.status}: ${response.statusText}`,
        },
      };
    }

    const data = await response.json();
    
    // Parse response: { result: "success", rates: { EGP: 48.12, AED: 3.67, SAR: 3.75 }, updated_date: "2024-01-01" }
    if (data.result === 'success' && data.rates) {
      const rates = data.rates;
      const usd_egp = typeof rates.EGP === 'number' ? rates.EGP : null;
      const usd_aed = typeof rates.AED === 'number' ? rates.AED : null;
      const usd_sar = typeof rates.SAR === 'number' ? rates.SAR : null;
      
      const errors: Record<string, string> = {};
      
      // Validate EGP rate: 1-200 EGP per USD (sanity check)
      if (usd_egp === null || usd_egp <= 0 || usd_egp >= 200) {
        errors.egp = usd_egp === null ? 'EGP rate missing' : `Invalid EGP rate: ${usd_egp}`;
      }
      
      // Validate AED rate: 3.0-4.0 AED per USD (sanity check)
      if (usd_aed === null || usd_aed < 3.0 || usd_aed > 4.0) {
        errors.aed = usd_aed === null ? 'AED rate missing' : `Invalid AED rate: ${usd_aed}`;
      }
      
      // Validate SAR rate: 3.0-4.0 SAR per USD (sanity check)
      if (usd_sar === null || usd_sar < 3.0 || usd_sar > 4.0) {
        errors.sar = usd_sar === null ? 'SAR rate missing' : `Invalid SAR rate: ${usd_sar}`;
      }
      
      // If we have at least some valid rates, update cache
      if (usd_egp !== null || usd_aed !== null || usd_sar !== null) {
        // Use cached values if new ones are invalid
        const cachedUsdEgp = fxCache?.rates.usd_egp ?? 48.0;
        const cachedUsdAed = fxCache?.rates.usd_aed ?? 3.67;
        const cachedUsdSar = fxCache?.rates.usd_sar ?? 3.75;
        
        fxCache = {
          rates: {
            usd_egp: (usd_egp !== null && usd_egp > 0 && usd_egp < 200) ? usd_egp : cachedUsdEgp,
            usd_aed: (usd_aed !== null && usd_aed >= 3.0 && usd_aed <= 4.0) ? usd_aed : cachedUsdAed,
            usd_sar: (usd_sar !== null && usd_sar >= 3.0 && usd_sar <= 4.0) ? usd_sar : cachedUsdSar,
          },
          fetchedAt: now,
        };
      }
      
      // Ensure fxCache is not null before accessing
      if (!fxCache) {
        return {
          usd_egp: null,
          usd_aed: null,
          usd_sar: null,
          fetchedAt: now,
          stale: true,
          source: 'open.er-api.com',
          errors: { cache: 'No cached rates available' },
        };
      }
      
      return {
        usd_egp: fxCache.rates.usd_egp,
        usd_aed: fxCache.rates.usd_aed,
        usd_sar: fxCache.rates.usd_sar,
        fetchedAt: now,
        stale: Object.keys(errors).length > 0,
        source: 'open.er-api.com',
        errors: Object.keys(errors).length > 0 ? errors : undefined,
      };
    } else {
      // Invalid response format
      return {
        usd_egp: fxCache?.rates.usd_egp ?? null,
        usd_aed: fxCache?.rates.usd_aed ?? null,
        usd_sar: fxCache?.rates.usd_sar ?? null,
        fetchedAt: now,
        stale: true,
        source: 'open.er-api.com',
        errors: { format: 'Invalid response format' },
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      usd_egp: fxCache?.rates.usd_egp ?? null,
      usd_aed: fxCache?.rates.usd_aed ?? null,
      usd_sar: fxCache?.rates.usd_sar ?? null,
      fetchedAt: now,
      stale: true,
      source: 'open.er-api.com',
      errors: { network: errorMessage },
    };
  }
}

/**
 * Convert money from one currency to another using USD as pivot
 * @param amount - Amount to convert
 * @param from - Source currency
 * @param to - Target currency
 * @param rates - FX rates object with usd_egp, usd_aed, usd_sar
 * @returns Converted amount or null if conversion not possible
 */
export function convertMoney(
  amount: number,
  from: Currency,
  to: Currency,
  rates: { usd_egp: number | null; usd_aed: number | null; usd_sar: number | null }
): number | null {
  // Same currency, no conversion needed
  if (from === to) {
    return amount;
  }
  
  // Convert to USD first (pivot)
  let amountInUsd: number | null = null;
  
  if (from === 'USD') {
    amountInUsd = amount;
  } else if (from === 'EGP' && rates.usd_egp !== null && rates.usd_egp > 0) {
    amountInUsd = amount / rates.usd_egp;
  } else if (from === 'AED' && rates.usd_aed !== null && rates.usd_aed > 0) {
    amountInUsd = amount / rates.usd_aed;
  } else if (from === 'SAR' && rates.usd_sar !== null && rates.usd_sar > 0) {
    amountInUsd = amount / rates.usd_sar;
  }
  
  if (amountInUsd === null) {
    return null; // Cannot convert to USD
  }
  
  // Convert from USD to target currency
  if (to === 'USD') {
    return amountInUsd;
  } else if (to === 'EGP' && rates.usd_egp !== null && rates.usd_egp > 0) {
    return amountInUsd * rates.usd_egp;
  } else if (to === 'AED' && rates.usd_aed !== null && rates.usd_aed > 0) {
    return amountInUsd * rates.usd_aed;
  } else if (to === 'SAR' && rates.usd_sar !== null && rates.usd_sar > 0) {
    return amountInUsd * rates.usd_sar;
  }
  
  return null; // Cannot convert to target currency
}

/**
 * Get canonical currency for a country
 */
export function getCountryCurrency(country: 'EG' | 'AE' | 'SA' | 'US'): Currency {
  switch (country) {
    case 'EG': return 'EGP';
    case 'AE': return 'AED';
    case 'SA': return 'SAR';
    case 'US': return 'USD';
    default: return 'USD';
  }
}

