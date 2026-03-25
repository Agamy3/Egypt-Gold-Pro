/**
 * FX Rates
 * 
 * Fetch real USD→EGP exchange rate from open.er-api.com (no API key required)
 */

// Cloudflare Workers (and some runtimes) may not support AbortSignal.timeout.
// Polyfill it so upstream fetches time out instead of throwing.
const AbortSignalAny = AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal };
if (typeof AbortSignalAny.timeout !== 'function') {
  AbortSignalAny.timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}

export interface UsdEgpResult {
  rate: number | null;
  fetchedAt: number;
  stale: boolean;
  source: string;
  error?: string;
}

// In-memory cache with 10 minute TTL
let fxCache: {
  rate: number;
  fetchedAt: number;
} | null = null;

const FX_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FX_STALE_MS = 30 * 60 * 1000; // 30 minutes (consider stale after this)

/**
 * Fetch USD→EGP exchange rate from open.er-api.com
 */
export async function getUsdEgpRate(): Promise<UsdEgpResult> {
  const now = Date.now();

  // Check memory cache first
  if (fxCache && (now - fxCache.fetchedAt) < FX_CACHE_TTL_MS) {
    return {
      rate: fxCache.rate,
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
      return {
        rate: fxCache?.rate ?? null,
        fetchedAt: now,
        stale: true,
        source: 'open.er-api.com',
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    
    // Parse response: { result: "success", rates: { EGP: 48.12 }, updated_date: "2024-01-01" }
    if (data.result === 'success' && data.rates && typeof data.rates.EGP === 'number') {
      const rate = data.rates.EGP;
      
      // Validate range: 1-200 EGP per USD (sanity check)
      if (rate > 0 && rate < 200) {
        // Update cache
        fxCache = {
          rate,
          fetchedAt: now,
        };
        
        return {
          rate,
          fetchedAt: now,
          stale: false,
          source: 'open.er-api.com',
        };
      } else {
        return {
          rate: fxCache?.rate ?? null,
          fetchedAt: now,
          stale: true,
          source: 'open.er-api.com',
          error: `Invalid rate: ${rate} (out of expected range)`,
        };
      }
    } else {
      return {
        rate: fxCache?.rate ?? null,
        fetchedAt: now,
        stale: true,
        source: 'open.er-api.com',
        error: 'Invalid response format',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      rate: fxCache?.rate ?? null,
      fetchedAt: now,
      stale: true,
      source: 'open.er-api.com',
      error: errorMessage,
    };
  }
}

/**
 * Legacy function name for backward compatibility
 * @deprecated Use getUsdEgpRate() instead
 */
export async function fetchUsdEgp(): Promise<{ usdEgp: number | null; source: string; stale: boolean; error: string | null }> {
  const result = await getUsdEgpRate();
  return {
    usdEgp: result.rate,
    source: result.source,
    stale: result.stale,
    error: result.error || null,
  };
}

