/**
 * Multi-Country Gold Source Adapters
 * 
 * Adapters for UAE, Saudi Arabia, and USA gold prices
 */

import * as cheerio from 'cheerio';
import { Karat } from './gold-ingestion-config';

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

export interface MultiCountrySourceResult {
  source: string;
  country: 'AE' | 'SA' | 'US';
  valid: boolean;
  prices: Record<number, number>; // karat -> buy price (per gram)
  errors: string[];
  notes: string[];
  rawSnippet?: string;
  httpStatus?: number;
}

const TROY_OUNCE_TO_GRAM = 31.1034768;

/**
 * USA Adapter: Derive prices from global spot price
 * Uses the existing impliedOunceUsd (from gold-api.com)
 */
export async function fetchUSASpotPrices(spotOunceUsd: number | null): Promise<MultiCountrySourceResult> {
  const result: MultiCountrySourceResult = {
    source: 'goldapi_spot',
    country: 'US',
    valid: false,
    prices: {},
    errors: [],
    notes: [],
  };

  if (spotOunceUsd === null || !isFinite(spotOunceUsd) || spotOunceUsd <= 0) {
    result.errors.push('Spot price not available or invalid');
    return result;
  }

  try {
    // Convert ounce to gram: 1 troy oz = 31.1034768g
    const price24kPerGram = spotOunceUsd / TROY_OUNCE_TO_GRAM;
    
    // Calculate other karats based on purity ratio
    result.prices = {
      24: price24kPerGram,
      22: price24kPerGram * (22 / 24),
      21: price24kPerGram * (21 / 24),
      18: price24kPerGram * (18 / 24),
      14: price24kPerGram * (14 / 24),
    };

    result.valid = true;
    result.notes.push(`Derived from spot price: $${spotOunceUsd.toFixed(2)}/oz`);
    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error calculating USA prices');
    return result;
  }
}

/**
 * UAE Adapter: Scrape goldprice.org UAE page
 * URL: https://goldprice.org/gold-price-united-arab-emirates.html
 */
export async function fetchUAEGoldPrices(): Promise<MultiCountrySourceResult> {
  const result: MultiCountrySourceResult = {
    source: 'goldprice_org_ae',
    country: 'AE',
    valid: false,
    prices: {},
    errors: [],
    notes: [],
  };

  try {
    const url = 'https://goldprice.org/gold-price-united-arab-emirates.html';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    result.httpStatus = response.status;

    if (!response.ok) {
      result.errors.push(`HTTP ${response.status}: ${response.statusText}`);
      return result;
    }

    const html = await response.text();
    result.rawSnippet = html.substring(0, 1000);

    if (html.length < 5000) {
      result.errors.push('HTML response too short');
      return result;
    }

    const $ = cheerio.load(html);
    
    // GoldPrice.org typically has tables with karat and price columns
    // Try multiple parsing strategies
    const prices: Record<number, number> = {};
    const karats: Karat[] = [24, 22, 21, 18, 14];

    // Strategy 1: Look for table rows with karat numbers and AED prices
    $('table tr, .table tr, [class*="table"] tr').each((_, el) => {
      const text = $(el).text();
      for (const karat of karats) {
        if (prices[karat]) continue; // Already found
        
        // Look for karat mention (24k, 22k, 21k, 18k, 14k, or 24 karat, etc.)
        const karatRegex = new RegExp(`\\b${karat}\\s*(?:k|karat|carat)`, 'i');
        if (karatRegex.test(text)) {
          // Extract numbers that could be AED prices (typically 3-6 digits before decimal)
          const numberRegex = /\b(\d{2,6}(?:\.\d{1,4})?)\b/g;
          const matches = text.match(numberRegex);
          if (matches) {
            // AED per gram prices are typically 100-300 range
            for (const match of matches) {
              const num = parseFloat(match);
              if (num >= 100 && num <= 300) {
                prices[karat] = num;
                result.notes.push(`Found ${karat}k via table: ${num} AED`);
                break;
              }
            }
          }
        }
      }
    });

    // Strategy 2: Look for text patterns like "24k: 245.50 AED" or "24 karat gold: 245.50"
    if (Object.keys(prices).length < 3) {
      const bodyText = $('body').text();
      for (const karat of karats) {
        if (prices[karat]) continue;
        
        const patterns = [
          new RegExp(`\\b${karat}\\s*k\\s*[:\\-]?\\s*(\\d{2,6}(?:\\.\\d{1,4})?)\\s*(?:AED|dirham)`, 'i'),
          new RegExp(`(\\d{2,6}(?:\\.\\d{1,4})?)\\s*(?:AED|dirham).*?\\b${karat}\\s*k`, 'i'),
          new RegExp(`\\b${karat}\\s*karat.*?(\\d{2,6}(?:\\.\\d{1,4})?)\\s*(?:AED|dirham)?`, 'i'),
        ];

        for (const pattern of patterns) {
          const match = bodyText.match(pattern);
          if (match && match[1]) {
            const num = parseFloat(match[1]);
            if (num >= 100 && num <= 300) {
              prices[karat] = num;
              result.notes.push(`Found ${karat}k via regex: ${num} AED`);
              break;
            }
          }
        }
      }
    }

    // Strategy 3: Look for specific elements with data attributes or classes
    if (Object.keys(prices).length < 3) {
      $('[data-karat], [class*="karat"], [class*="24k"], [class*="22k"], [class*="21k"], [class*="18k"], [class*="14k"]').each((_, el) => {
        const $el = $(el);
        const text = $el.text();
        for (const karat of karats) {
          if (prices[karat]) continue;
          if (new RegExp(`\\b${karat}\\s*k`, 'i').test(text)) {
            const numberRegex = /\b(\d{2,6}(?:\.\d{1,4})?)\b/;
            const match = text.match(numberRegex);
            if (match) {
              const num = parseFloat(match[1]);
              if (num >= 100 && num <= 300) {
                prices[karat] = num;
                result.notes.push(`Found ${karat}k via element: ${num} AED`);
              }
            }
          }
        }
      });
    }

    if (Object.keys(prices).length >= 2) {
      result.prices = prices;
      result.valid = true;
      result.notes.push(`Parsed ${Object.keys(prices).length} karats from goldprice.org UAE`);
    } else {
      result.errors.push(`Only found ${Object.keys(prices).length} karat prices (need at least 2)`);
    }

    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error fetching UAE prices');
    return result;
  }
}

/**
 * Saudi Arabia Adapter: Scrape goldprice.org Saudi page
 * URL: https://goldprice.org/gold-price-saudi-arabia.html
 */
export async function fetchSaudiGoldPrices(): Promise<MultiCountrySourceResult> {
  const result: MultiCountrySourceResult = {
    source: 'goldprice_org_sa',
    country: 'SA',
    valid: false,
    prices: {},
    errors: [],
    notes: [],
  };

  try {
    const url = 'https://goldprice.org/gold-price-saudi-arabia.html';
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    result.httpStatus = response.status;

    if (!response.ok) {
      result.errors.push(`HTTP ${response.status}: ${response.statusText}`);
      return result;
    }

    const html = await response.text();
    result.rawSnippet = html.substring(0, 1000);

    if (html.length < 5000) {
      result.errors.push('HTML response too short');
      return result;
    }

    const $ = cheerio.load(html);
    
    const prices: Record<number, number> = {};
    const karats: Karat[] = [24, 22, 21, 18, 14];

    // Strategy 1: Table parsing (same as UAE)
    $('table tr, .table tr, [class*="table"] tr').each((_, el) => {
      const text = $(el).text();
      for (const karat of karats) {
        if (prices[karat]) continue;
        
        const karatRegex = new RegExp(`\\b${karat}\\s*(?:k|karat|carat)`, 'i');
        if (karatRegex.test(text)) {
          const numberRegex = /\b(\d{2,6}(?:\.\d{1,4})?)\b/g;
          const matches = text.match(numberRegex);
          if (matches) {
            // SAR per gram prices are typically 100-300 range
            for (const match of matches) {
              const num = parseFloat(match);
              if (num >= 100 && num <= 300) {
                prices[karat] = num;
                result.notes.push(`Found ${karat}k via table: ${num} SAR`);
                break;
              }
            }
          }
        }
      }
    });

    // Strategy 2: Text pattern matching (same as UAE, but look for SAR)
    if (Object.keys(prices).length < 3) {
      const bodyText = $('body').text();
      for (const karat of karats) {
        if (prices[karat]) continue;
        
        const patterns = [
          new RegExp(`\\b${karat}\\s*k\\s*[:\\-]?\\s*(\\d{2,6}(?:\\.\\d{1,4})?)\\s*(?:SAR|riyal)`, 'i'),
          new RegExp(`(\\d{2,6}(?:\\.\\d{1,4})?)\\s*(?:SAR|riyal).*?\\b${karat}\\s*k`, 'i'),
          new RegExp(`\\b${karat}\\s*karat.*?(\\d{2,6}(?:\\.\\d{1,4})?)\\s*(?:SAR|riyal)?`, 'i'),
        ];

        for (const pattern of patterns) {
          const match = bodyText.match(pattern);
          if (match && match[1]) {
            const num = parseFloat(match[1]);
            if (num >= 100 && num <= 300) {
              prices[karat] = num;
              result.notes.push(`Found ${karat}k via regex: ${num} SAR`);
              break;
            }
          }
        }
      }
    }

    // Strategy 3: Element-based parsing
    if (Object.keys(prices).length < 3) {
      $('[data-karat], [class*="karat"], [class*="24k"], [class*="22k"], [class*="21k"], [class*="18k"], [class*="14k"]').each((_, el) => {
        const $el = $(el);
        const text = $el.text();
        for (const karat of karats) {
          if (prices[karat]) continue;
          if (new RegExp(`\\b${karat}\\s*k`, 'i').test(text)) {
            const numberRegex = /\b(\d{2,6}(?:\.\d{1,4})?)\b/;
            const match = text.match(numberRegex);
            if (match) {
              const num = parseFloat(match[1]);
              if (num >= 100 && num <= 300) {
                prices[karat] = num;
                result.notes.push(`Found ${karat}k via element: ${num} SAR`);
              }
            }
          }
        }
      });
    }

    if (Object.keys(prices).length >= 2) {
      result.prices = prices;
      result.valid = true;
      result.notes.push(`Parsed ${Object.keys(prices).length} karats from goldprice.org Saudi`);
    } else {
      result.errors.push(`Only found ${Object.keys(prices).length} karat prices (need at least 2)`);
    }

    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error fetching Saudi prices');
    return result;
  }
}

