/**
 * Egypt Market Sources Integration
 * 
 * Sources: GoldBillion, Dahab Masr, Ta3weem DahabMasr
 * 
 * Rules:
 * - Parse 21k and 24k buy/sell
 * - Timeout + retry (max 2)
 * - If source fails → mark DOWN
 * - Never compute from spot
 * - Status OK only if at least market21Buy and market21Sell are valid numbers
 */

const CACHE_TTL_MS = (parseInt(process.env.EGYPT_SOURCES_CACHE_TTL || '180')) * 1000;
const FETCH_TIMEOUT_MS = 10000; // 10 seconds
const MAX_RETRIES = 2;

/**
 * Browser-like headers for Egypt source fetches
 */
function getBrowserHeaders(referer: string): HeadersInit {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    'Referer': referer,
  };
}

export interface EgyptMarketPrices {
  market21Buy: number | null;
  market21Sell: number | null;
  market24Buy: number | null;
  market24Sell: number | null;
}

export interface SourceStatus {
  source: string;
  status: 'OK' | 'DOWN' | 'STALE';
  prices: EgyptMarketPrices;
  fetchedAt: number;
  errorMessage?: string;
  rawResponse?: string;
  url?: string;
  httpStatus?: number;
}

export interface ParseResult {
  prices: EgyptMarketPrices;
  rawResponse: string;
  url: string;
  httpStatus?: number;
  error?: string;
}

/**
 * Fetch with timeout and retry
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (retries > 0 && (error as Error).name !== 'AbortError') {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

/**
 * Validate that prices contain at least market21Buy and market21Sell as valid numbers
 */
function validatePrices(prices: EgyptMarketPrices): boolean {
  return (
    prices.market21Buy !== null &&
    prices.market21Sell !== null &&
    isFinite(prices.market21Buy) &&
    isFinite(prices.market21Sell) &&
    prices.market21Buy > 0 &&
    prices.market21Sell > 0
  );
}

/**
 * Extract price from text/HTML using regex patterns
 */
function extractPriceFromText(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }
  }
  return null;
}

/**
 * Parse GoldBillion prices from HTML
 */
export async function parseGoldBillion(): Promise<ParseResult | null> {
  const url = process.env.GOLDBILLION_API_URL || 'https://goldbillion.com';
  
  try {
    const response = await fetchWithRetry(url, {
      headers: getBrowserHeaders(url),
    });
    
    const statusCode = response.status;
    const text = await response.text();
    const rawResponse = text.substring(0, 800); // First 800 chars for debug

    if (!response.ok) {
      if (statusCode === 403 || statusCode === 429) {
        return {
          prices: {
            market21Buy: null,
            market21Sell: null,
            market24Buy: null,
            market24Sell: null,
          },
        rawResponse,
        url,
        httpStatus: statusCode,
        error: `HTTP ${statusCode}: Blocked by server (likely Cloudflare protection)`,
      };
    }
    return {
      prices: {
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      },
      rawResponse,
      url,
      httpStatus: statusCode,
      error: `HTTP ${statusCode}: ${response.statusText}`,
    };
    }

    // Try to parse HTML - look for common patterns for 21k and 24k prices
    // Common patterns: prices in tables, spans, divs with numbers around 6000-7000 EGP range
    const prices: EgyptMarketPrices = {
      market21Buy: null,
      market21Sell: null,
      market24Buy: null,
      market24Sell: null,
    };

    // Look for 21k prices - try various patterns
    // Pattern: "21" followed by price, or "عيار 21" (21 karat in Arabic)
    const patterns21Buy = [
      /21\s*k.*?buy.*?(\d{4,5}(?:\.\d+)?)/i,
      /عيار\s*21.*?شراء.*?(\d{4,5}(?:\.\d+)?)/i,
      /21k.*?buy.*?(\d{4,5}(?:\.\d+)?)/i,
      /(?:21|عيار\s*21).*?(?:buy|شراء|purchase).*?(\d{4,5}(?:\.\d+)?)/i,
    ];
    
    const patterns21Sell = [
      /21\s*k.*?sell.*?(\d{4,5}(?:\.\d+)?)/i,
      /عيار\s*21.*?بيع.*?(\d{4,5}(?:\.\d+)?)/i,
      /21k.*?sell.*?(\d{4,5}(?:\.\d+)?)/i,
      /(?:21|عيار\s*21).*?(?:sell|بيع|sale).*?(\d{4,5}(?:\.\d+)?)/i,
    ];

    const patterns24Buy = [
      /24\s*k.*?buy.*?(\d{4,5}(?:\.\d+)?)/i,
      /عيار\s*24.*?شراء.*?(\d{4,5}(?:\.\d+)?)/i,
      /24k.*?buy.*?(\d{4,5}(?:\.\d+)?)/i,
      /(?:24|عيار\s*24).*?(?:buy|شراء|purchase).*?(\d{4,5}(?:\.\d+)?)/i,
    ];

    const patterns24Sell = [
      /24\s*k.*?sell.*?(\d{4,5}(?:\.\d+)?)/i,
      /عيار\s*24.*?بيع.*?(\d{4,5}(?:\.\d+)?)/i,
      /24k.*?sell.*?(\d{4,5}(?:\.\d+)?)/i,
      /(?:24|عيار\s*24).*?(?:sell|بيع|sale).*?(\d{4,5}(?:\.\d+)?)/i,
    ];

    prices.market21Buy = extractPriceFromText(text, patterns21Buy);
    prices.market21Sell = extractPriceFromText(text, patterns21Sell);
    prices.market24Buy = extractPriceFromText(text, patterns24Buy);
    prices.market24Sell = extractPriceFromText(text, patterns24Sell);

    // Validate prices are in reasonable range (5000-8000 EGP)
    if (prices.market21Buy && (prices.market21Buy < 5000 || prices.market21Buy > 8000)) prices.market21Buy = null;
    if (prices.market21Sell && (prices.market21Sell < 5000 || prices.market21Sell > 8000)) prices.market21Sell = null;
    if (prices.market24Buy && (prices.market24Buy < 5500 || prices.market24Buy > 8500)) prices.market24Buy = null;
    if (prices.market24Sell && (prices.market24Sell < 5500 || prices.market24Sell > 8500)) prices.market24Sell = null;

    // Check if we got at least market21Buy and market21Sell
    if (!validatePrices(prices)) {
      return {
        prices,
        rawResponse,
        url,
        httpStatus: statusCode,
        error: 'Could not parse valid market21Buy and market21Sell from GoldBillion HTML. HTML structure may have changed.',
      };
    }

    return { prices, rawResponse, url, httpStatus: statusCode };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('GoldBillion fetch error:', errorMessage, errorStack);
    return {
      prices: {
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      },
      rawResponse: '',
      url,
      error: `GoldBillion fetch failed: ${errorMessage}${errorStack ? ` | Stack: ${errorStack.substring(0, 200)}` : ''}`,
    };
  }
}

/**
 * Parse Dahab Masr prices from HTML
 * Extracts from "Dahab Masr spot prices" table
 */
export async function parseDahabMasr(): Promise<ParseResult | null> {
  const url = process.env.DAHABMASR_API_URL || 'https://dahabmasr.com';
  
  try {
    const response = await fetchWithRetry(url, {
      headers: getBrowserHeaders(url),
    });
    
    const statusCode = response.status;
    const text = await response.text();
    const rawResponse = text.substring(0, 800); // First 800 chars for debug

    if (!response.ok) {
      if (statusCode === 403 || statusCode === 429) {
        return {
          prices: {
            market21Buy: null,
            market21Sell: null,
            market24Buy: null,
            market24Sell: null,
          },
          rawResponse,
          url,
          httpStatus: statusCode,
          error: `HTTP ${statusCode}: Blocked by server (likely Cloudflare protection)`,
        };
      }
      return {
        prices: {
          market21Buy: null,
          market21Sell: null,
          market24Buy: null,
          market24Sell: null,
        },
        rawResponse,
        url,
        httpStatus: statusCode,
        error: `HTTP ${statusCode}: ${response.statusText}`,
      };
    }

    // Try to parse HTML - look for Dahab Masr spot prices table
    // Common patterns for tables with 21k and 24k prices
    const prices: EgyptMarketPrices = {
      market21Buy: null,
      market21Sell: null,
      market24Buy: null,
      market24Sell: null,
    };

    // Look for table structures with 21k and 24k prices
    // Pattern: table rows with "21" or "24" and prices
    const patterns21Buy = [
      /(?:21|عيار\s*21).*?(?:شراء|buy|purchase).*?(\d{4,5}(?:\.\d+)?)/i,
      /<tr[^>]*>.*?21.*?(\d{4,5}(?:\.\d+)?).*?<\/tr>/i,
      /21\s*k.*?(\d{4,5}(?:\.\d+)?).*?buy/i,
      /(?:شراء|buy).*?21.*?(\d{4,5}(?:\.\d+)?)/i,
    ];
    
    const patterns21Sell = [
      /(?:21|عيار\s*21).*?(?:بيع|sell|sale).*?(\d{4,5}(?:\.\d+)?)/i,
      /21\s*k.*?(\d{4,5}(?:\.\d+)?).*?sell/i,
      /(?:بيع|sell).*?21.*?(\d{4,5}(?:\.\d+)?)/i,
    ];

    const patterns24Buy = [
      /(?:24|عيار\s*24).*?(?:شراء|buy|purchase).*?(\d{4,5}(?:\.\d+)?)/i,
      /<tr[^>]*>.*?24.*?(\d{4,5}(?:\.\d+)?).*?<\/tr>/i,
      /24\s*k.*?(\d{4,5}(?:\.\d+)?).*?buy/i,
      /(?:شراء|buy).*?24.*?(\d{4,5}(?:\.\d+)?)/i,
    ];

    const patterns24Sell = [
      /(?:24|عيار\s*24).*?(?:بيع|sell|sale).*?(\d{4,5}(?:\.\d+)?)/i,
      /24\s*k.*?(\d{4,5}(?:\.\d+)?).*?sell/i,
      /(?:بيع|sell).*?24.*?(\d{4,5}(?:\.\d+)?)/i,
    ];

    prices.market21Buy = extractPriceFromText(text, patterns21Buy);
    prices.market21Sell = extractPriceFromText(text, patterns21Sell);
    prices.market24Buy = extractPriceFromText(text, patterns24Buy);
    prices.market24Sell = extractPriceFromText(text, patterns24Sell);

    // Validate prices are in reasonable range (5000-8000 EGP)
    if (prices.market21Buy && (prices.market21Buy < 5000 || prices.market21Buy > 8000)) prices.market21Buy = null;
    if (prices.market21Sell && (prices.market21Sell < 5000 || prices.market21Sell > 8000)) prices.market21Sell = null;
    if (prices.market24Buy && (prices.market24Buy < 5500 || prices.market24Buy > 8500)) prices.market24Buy = null;
    if (prices.market24Sell && (prices.market24Sell < 5500 || prices.market24Sell > 8500)) prices.market24Sell = null;

    // Check if we got at least market21Buy and market21Sell
    if (!validatePrices(prices)) {
      return {
        prices,
        rawResponse,
        url,
        httpStatus: statusCode,
        error: 'Could not parse valid market21Buy and market21Sell from Dahab Masr HTML. HTML structure may have changed.',
      };
    }

    return { prices, rawResponse, url, httpStatus: statusCode };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Dahab Masr fetch error:', errorMessage, errorStack);
    return {
      prices: {
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      },
      rawResponse: '',
      url,
      error: `Dahab Masr fetch failed: ${errorMessage}${errorStack ? ` | Stack: ${errorStack.substring(0, 200)}` : ''}`,
    };
  }
}

/**
 * Parse Ta3weem DahabMasr prices from HTML
 * This is a stable third source for Egypt market prices
 * Tries multiple URLs until one returns 200
 */
export async function parseTa3weemDahabMasr(): Promise<ParseResult | null> {
  const candidateUrls = [
    'https://ta3weem.com/dahab-masr',
    'https://www.ta3weem.com/dahab-masr/',
    'https://ta3weem.com/en/dahab-masr',
    'https://ta3weem.com/ar/dahab-masr',
  ];

  let workingUrl: string | null = null;
  let response: Response | null = null;
  let lastError: string | null = null;

  // Try each URL until one returns 200
  for (const url of candidateUrls) {
    try {
      const testResponse = await fetchWithRetry(url, {
        headers: getBrowserHeaders('https://ta3weem.com'),
      });

      if (testResponse.ok) {
        workingUrl = url;
        response = testResponse;
        break;
      }

      // If not 200, continue to next URL
      lastError = `HTTP ${testResponse.status}: ${testResponse.statusText}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      lastError = `Fetch error: ${errorMessage}`;
      // Continue to next URL
    }
  }

  // If no URL worked, return error
  if (!workingUrl || !response) {
    return {
      prices: {
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      },
      rawResponse: '',
      url: candidateUrls[0], // Return first URL as reference
      httpStatus: undefined,
      error: `All Ta3weem URLs failed. Last error: ${lastError || 'All URLs returned non-200 status'}`,
    };
  }

  try {
    const statusCode = response.status;
    const text = await response.text();
    const rawResponse = text.substring(0, 800); // First 800 chars for debug

    // Log the working URL
    console.log(`Ta3weem DahabMasr: Using working URL: ${workingUrl}`);

    if (!response.ok) {
      if (statusCode === 403 || statusCode === 429) {
        return {
          prices: {
            market21Buy: null,
            market21Sell: null,
            market24Buy: null,
            market24Sell: null,
          },
          rawResponse,
          url: workingUrl,
          httpStatus: statusCode,
          error: `HTTP ${statusCode}: Blocked by server (likely Cloudflare protection)`,
        };
      }
      return {
        prices: {
          market21Buy: null,
          market21Sell: null,
          market24Buy: null,
          market24Sell: null,
        },
        rawResponse,
        url: workingUrl,
        httpStatus: statusCode,
        error: `HTTP ${statusCode}: ${response.statusText}`,
      };
    }

    // Try to parse HTML - look for DahabMasr prices table
    const prices: EgyptMarketPrices = {
      market21Buy: null,
      market21Sell: null,
      market24Buy: null,
      market24Sell: null,
    };

    // Look for table structures with 21k and 24k prices
    // Ta3weem typically shows prices in tables
    const patterns21Buy = [
      /(?:21|عيار\s*21|21\s*k).*?(?:شراء|buy|purchase).*?(\d{4,5}(?:\.\d+)?)/i,
      /<tr[^>]*>.*?21.*?شراء.*?(\d{4,5}(?:\.\d+)?).*?<\/tr>/i,
      /<td[^>]*>.*?21.*?<\/td>.*?<td[^>]*>.*?(\d{4,5}(?:\.\d+)?).*?<\/td>/i,
      /21\s*k.*?(\d{4,5}(?:\.\d+)?).*?buy/i,
      /(?:شراء|buy).*?21.*?(\d{4,5}(?:\.\d+)?)/i,
    ];
    
    const patterns21Sell = [
      /(?:21|عيار\s*21|21\s*k).*?(?:بيع|sell|sale).*?(\d{4,5}(?:\.\d+)?)/i,
      /<tr[^>]*>.*?21.*?بيع.*?(\d{4,5}(?:\.\d+)?).*?<\/tr>/i,
      /21\s*k.*?(\d{4,5}(?:\.\d+)?).*?sell/i,
      /(?:بيع|sell).*?21.*?(\d{4,5}(?:\.\d+)?)/i,
    ];

    const patterns24Buy = [
      /(?:24|عيار\s*24|24\s*k).*?(?:شراء|buy|purchase).*?(\d{4,5}(?:\.\d+)?)/i,
      /<tr[^>]*>.*?24.*?شراء.*?(\d{4,5}(?:\.\d+)?).*?<\/tr>/i,
      /24\s*k.*?(\d{4,5}(?:\.\d+)?).*?buy/i,
      /(?:شراء|buy).*?24.*?(\d{4,5}(?:\.\d+)?)/i,
    ];

    const patterns24Sell = [
      /(?:24|عيار\s*24|24\s*k).*?(?:بيع|sell|sale).*?(\d{4,5}(?:\.\d+)?)/i,
      /<tr[^>]*>.*?24.*?بيع.*?(\d{4,5}(?:\.\d+)?).*?<\/tr>/i,
      /24\s*k.*?(\d{4,5}(?:\.\d+)?).*?sell/i,
      /(?:بيع|sell).*?24.*?(\d{4,5}(?:\.\d+)?)/i,
    ];

    prices.market21Buy = extractPriceFromText(text, patterns21Buy);
    prices.market21Sell = extractPriceFromText(text, patterns21Sell);
    prices.market24Buy = extractPriceFromText(text, patterns24Buy);
    prices.market24Sell = extractPriceFromText(text, patterns24Sell);

    // Validate prices are in reasonable range (5000-8000 EGP)
    if (prices.market21Buy && (prices.market21Buy < 5000 || prices.market21Buy > 8000)) prices.market21Buy = null;
    if (prices.market21Sell && (prices.market21Sell < 5000 || prices.market21Sell > 8000)) prices.market21Sell = null;
    if (prices.market24Buy && (prices.market24Buy < 5500 || prices.market24Buy > 8500)) prices.market24Buy = null;
    if (prices.market24Sell && (prices.market24Sell < 5500 || prices.market24Sell > 8500)) prices.market24Sell = null;

    // Check if we got at least market21Buy and market21Sell
    if (!validatePrices(prices)) {
      return {
        prices,
        rawResponse,
        url: workingUrl,
        httpStatus: statusCode,
        error: 'Could not parse valid market21Buy and market21Sell from Ta3weem DahabMasr HTML. HTML structure may have changed.',
      };
    }

    return { prices, rawResponse, url: workingUrl, httpStatus: statusCode };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Ta3weem DahabMasr fetch error:', errorMessage, errorStack);
    return {
      prices: {
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      },
      rawResponse: '',
      url: workingUrl || candidateUrls[0],
      error: `Ta3weem DahabMasr fetch failed: ${errorMessage}${errorStack ? ` | Stack: ${errorStack.substring(0, 200)}` : ''}`,
    };
  }
}

/**
 * Fetch prices from a single source
 */
async function fetchSource(source: string): Promise<SourceStatus> {
  let parseResult: ParseResult | null = null;
  let errorMessage: string | undefined;

  try {
    if (source === 'goldbillion') {
      parseResult = await parseGoldBillion();
    } else if (source === 'dahabmasr') {
      parseResult = await parseDahabMasr();
    } else if (source === 'ta3weem_dahabmasr') {
      parseResult = await parseTa3weemDahabMasr();
    } else {
      errorMessage = `Unknown source: ${source}`;
    }
  } catch (error) {
    errorMessage = (error as Error).message;
    const errorStack = (error as Error).stack;
    console.error(`Market snapshot error: ${source} fetch threw exception -`, errorMessage, errorStack);
  }

  if (!parseResult || parseResult.error) {
    return {
      source,
      status: 'DOWN',
      prices: parseResult?.prices || {
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      },
      fetchedAt: Date.now(),
      errorMessage: parseResult?.error || errorMessage || 'Failed to fetch/parse',
      rawResponse: parseResult?.rawResponse,
      url: parseResult?.url,
      httpStatus: parseResult?.httpStatus,
    };
  }

  // Status OK only if we have at least market21Buy and market21Sell as valid numbers
  if (!validatePrices(parseResult.prices)) {
    return {
      source,
      status: 'DOWN',
      prices: parseResult.prices,
      fetchedAt: Date.now(),
      errorMessage: 'Parsed data missing required market21Buy and market21Sell values',
      rawResponse: parseResult.rawResponse,
      url: parseResult.url,
      httpStatus: parseResult.httpStatus,
    };
  }

  return {
    source,
    status: 'OK',
    prices: parseResult.prices,
    fetchedAt: Date.now(),
    rawResponse: parseResult.rawResponse,
    url: parseResult.url,
    httpStatus: parseResult.httpStatus,
  };
}

/**
 * Get cached source status or fetch new if expired
 */
export async function getEgyptMarketWithCache(
  db: any,
  source: string
): Promise<SourceStatus> {
  // Check cache using Supabase
  const { data: cached, error } = await db.supabase
    .from('egypt_market')
    .select('market_21_buy, market_21_sell, market_24_buy, market_24_sell, fetched_at, status, error_message, raw_response')
    .eq('source', source)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached && !error) {
    const age = Date.now() - cached.fetched_at;
    if (age < CACHE_TTL_MS) {
      return {
        source,
        status: cached.status as 'OK' | 'DOWN' | 'STALE',
        prices: {
          market21Buy: cached.market_21_buy,
          market21Sell: cached.market_21_sell,
          market24Buy: cached.market_24_buy,
          market24Sell: cached.market_24_sell,
        },
        fetchedAt: cached.fetched_at,
        errorMessage: cached.error_message || undefined,
        rawResponse: cached.raw_response || undefined,
      };
    }
  }

  // Fetch new
  const fresh = await fetchSource(source);

  // Store in DB using Supabase
  await db.supabase
    .from('egypt_market')
    .insert({
      source: fresh.source,
      market_21_buy: fresh.prices.market21Buy,
      market_21_sell: fresh.prices.market21Sell,
      market_24_buy: fresh.prices.market24Buy,
      market_24_sell: fresh.prices.market24Sell,
      fetched_at: fresh.fetchedAt,
      status: fresh.status,
      error_message: fresh.errorMessage || null,
      raw_response: fresh.rawResponse || null,
    });

  return fresh;
}

/**
 * Get all sources and compute median
 */
export async function getAllEgyptSources(db: any): Promise<{
  sources: SourceStatus[];
  median: EgyptMarketPrices;
}> {
  const sourcesList = ['goldbillion', 'dahabmasr'];
  const sources = await Promise.all(
    sourcesList.map(source => getEgyptMarketWithCache(db, source))
  );

  // Compute median across available sources
  const valid21Buy = sources
    .filter(s => s.status === 'OK' && s.prices.market21Buy !== null)
    .map(s => s.prices.market21Buy!);
  const valid21Sell = sources
    .filter(s => s.status === 'OK' && s.prices.market21Sell !== null)
    .map(s => s.prices.market21Sell!);
  const valid24Buy = sources
    .filter(s => s.status === 'OK' && s.prices.market24Buy !== null)
    .map(s => s.prices.market24Buy!);
  const valid24Sell = sources
    .filter(s => s.status === 'OK' && s.prices.market24Sell !== null)
    .map(s => s.prices.market24Sell!);

  const median = (arr: number[]) => {
    if (arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  };

  return {
    sources,
    median: {
      market21Buy: median(valid21Buy),
      market21Sell: median(valid21Sell),
      market24Buy: median(valid24Buy),
      market24Sell: median(valid24Sell),
    },
  };
}

