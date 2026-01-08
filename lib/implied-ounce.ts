/**
 * Egypt Market Implied Ounce Fetching
 * 
 * Source: Gold-API.com (free, no key required)
 * 
 * Rules:
 * - Never throws
 * - Never derives from COMEX/LBMA spot
 * - Explicitly labels as "Egypt Market Implied Ounce"
 */

export interface ImpliedOunceResult {
  price: number | null;
  source: 'gold-api.com' | null;
  error: string | null;
}

/**
 * Fetch Egypt Market Implied Ounce from Gold-API.com
 * Endpoint: GET https://api.gold-api.com/price/XAU
 * Free endpoint, no API key required
 */
async function fetchGoldApiOunceUsd(): Promise<{ price: number | null; timestamp: number | null; error: string | null; httpStatus?: number }> {
  const url = 'https://api.gold-api.com/price/XAU';
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EgyptGold-Pro/1.0)',
        'Accept': 'application/json',
      },
    });

    const httpStatus = response.status;
    const data = await response.json();
    const rawSnippet = JSON.stringify(data).substring(0, 500);

    if (!response.ok) {
      return {
        price: null,
        timestamp: null,
        httpStatus,
        error: `Gold-API.com HTTP ${httpStatus}: ${response.statusText}. Response: ${rawSnippet}`,
      };
    }

    // Parse response: { price: number, updatedAt?: string|number }
    let price: number | null = null;
    let timestamp: number = Date.now();

    if (typeof data.price === 'number') {
      price = data.price;
      // Parse updatedAt if present (could be ISO string, timestamp, or Unix seconds)
      if (data.updatedAt) {
        if (typeof data.updatedAt === 'number') {
          // Assume milliseconds if > 1e12, otherwise seconds
          timestamp = data.updatedAt > 1e12 ? data.updatedAt : data.updatedAt * 1000;
        } else if (typeof data.updatedAt === 'string') {
          const parsed = Date.parse(data.updatedAt);
          if (!isNaN(parsed)) {
            timestamp = parsed;
          }
        }
      }
    } else {
      return {
        price: null,
        timestamp: null,
        httpStatus,
        error: `Gold-API.com response missing price field. Response: ${rawSnippet}`,
      };
    }

    // Validate parsed price (2000-8000 USD range for Egypt Market Implied Ounce)
    if (!isFinite(price) || price < 2000 || price > 8000) {
      return {
        price: null,
        timestamp: null,
        httpStatus,
        error: `Gold-API.com price out of range or invalid: ${price} (expected 2000-8000 for Egypt Market Implied Ounce). Response: ${rawSnippet}`,
      };
    }

    return {
      price,
      timestamp,
      httpStatus,
      error: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      price: null,
      timestamp: null,
      httpStatus: undefined,
      error: `Gold-API.com fetch failed: ${errorMessage}`,
    };
  }
}

/**
 * Fetch Egypt Market Implied Ounce
 * Uses Gold-API.com as the source
 * Never throws, always returns { price, source, error }
 */
export async function fetchImpliedOunce(): Promise<ImpliedOunceResult> {
  const goldApiResult = await fetchGoldApiOunceUsd();

  if (goldApiResult.price !== null) {
    return {
      price: goldApiResult.price,
      source: 'gold-api.com',
      error: null,
    };
  }

  // Gold-API.com failed
  return {
    price: null,
    source: null,
    error: `Egypt Market Implied Ounce unavailable. Gold-API.com: ${goldApiResult.error || 'unknown error'}`,
  };
}

/**
 * Export fetchGoldApiOunceUsd for debug endpoints
 */
export { fetchGoldApiOunceUsd };

