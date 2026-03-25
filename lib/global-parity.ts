/**
 * Global Parity Price Computation
 * 
 * Computes per-gram gold prices from global XAUUSD spot price + FX rates
 * Used for AE/SA parity snapshots (derived from global market, not scraped)
 */

const GRAMS_PER_OUNCE = 31.1034768;

/**
 * Worker-safe base64 encoder for stable raw_hash values.
 * Cloudflare Workers may not provide Node.js `Buffer`.
 */
function base64Encode(input: string): string {
  if (typeof btoa === 'function' && typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }
    return btoa(binary);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input).toString('base64');
  }

  throw new Error('No base64 encoder available in this runtime');
}

export interface ParityPrices {
  24: number;
  21: number;
  18: number;
  14: number;
}

export interface ParityComputationParams {
  impliedOunceUsd: number;
  currency: 'AED' | 'SAR' | 'USD';
  usdRate: number; // USD/AED or USD/SAR (for USD, this is 1.0)
}

/**
 * Compute parity prices from global spot + FX
 * 
 * @param params - Computation parameters
 * @returns Per-gram prices in local currency for 24k, 21k, 18k, 14k
 */
export function computeParityPrices(params: ParityComputationParams): ParityPrices {
  const { impliedOunceUsd, currency, usdRate } = params;
  
  // Step 1: Convert ounce to gram (pure 24k in USD)
  const pure24kUsdPerGram = impliedOunceUsd / GRAMS_PER_OUNCE;
  
  // Step 2: Convert to local currency
  const pure24kLocalPerGram = pure24kUsdPerGram * usdRate;
  
  // Step 3: Compute other karats based on purity ratio
  const prices: ParityPrices = {
    24: roundPrice(pure24kLocalPerGram, currency),
    21: roundPrice(pure24kLocalPerGram * (21 / 24), currency),
    18: roundPrice(pure24kLocalPerGram * (18 / 24), currency),
    14: roundPrice(pure24kLocalPerGram * (14 / 24), currency),
  };
  
  return prices;
}

/**
 * Round price to appropriate decimal places
 * USD: 2 decimals, AED/SAR: 2 decimals
 */
function roundPrice(price: number, currency: 'AED' | 'SAR' | 'USD'): number {
  return Math.round(price * 100) / 100; // Always 2 decimals
}

/**
 * Generate stable hash for parity snapshot
 * Uses country + source + impliedOunceUsd + fx rate + timestamp bucket (1 minute)
 */
export function generateParityHash(
  country: 'AE' | 'SA',
  source: string,
  impliedOunceUsd: number,
  fxRate: number,
  timestampMs: number
): string {
  // Round timestamp to 1-minute bucket for stability
  const timestampBucket = Math.floor(timestampMs / 60000) * 60000;
  
  const hashInput = `${country}:${source}:${impliedOunceUsd.toFixed(2)}:${fxRate.toFixed(4)}:${timestampBucket}`;
  return base64Encode(hashInput).substring(0, 32);
}


