/**
 * iSagha Source Adapter
 * 
 * Discovers and uses the underlying JSON endpoint from market.isagha.com/prices
 * Avoids OCR/image parsing by finding the real data source
 */

interface DiscoveredEndpoint {
  url: string;
  method: 'GET' | 'POST';
  confidence: 'high' | 'medium' | 'low';
  discoveredAt: number;
}

interface IsaghaPrices {
  24: { buy: number | null; sell: number | null };
  21: { buy: number | null; sell: number | null };
  18: { buy: number | null; sell: number | null };
  14: { buy: number | null; sell: number | null };
}

interface IsaghaResult {
  ok: boolean;
  prices: IsaghaPrices;
  method: 'direct-json' | 'discovered-endpoint' | 'fallback';
  endpoint?: string;
  httpStatus?: number;
  latency?: number;
  jsonSnippet?: string;
  error?: string;
  parseError?: string;
}

// In-memory cache for discovered endpoint (TTL: 6 hours)
let endpointCache: DiscoveredEndpoint | null = null;
const ENDPOINT_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Extract candidate JS bundle URLs from HTML
 */
function extractJsBundles(html: string): string[] {
  const bundles: string[] = [];
  const baseUrl = 'https://market.isagha.com';
  
  // Match script tags with src pointing to /build/assets/*.js
  const scriptRegex = /<script[^>]+src=["']([^"']*\/build\/assets\/[^"']*\.js[^"']*)["']/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const url = match[1];
    if (url.startsWith('http')) {
      bundles.push(url);
    } else if (url.startsWith('/')) {
      bundles.push(baseUrl + url);
    } else {
      bundles.push(baseUrl + '/' + url);
    }
  }
  
  return bundles;
}

/**
 * Search JS bundle for API endpoint patterns
 */
async function searchBundleForEndpoints(bundleUrl: string): Promise<string[]> {
  try {
    const response = await fetch(bundleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/javascript, text/javascript, */*',
      },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    
    if (!response.ok) return [];
    
    const jsText = await response.text();
    const endpoints: string[] = [];
    const baseUrl = 'https://market.isagha.com';
    
    // Pattern 1: /api/* endpoints
    const apiPattern = /["'](\/api\/[^"']+)["']/gi;
    let match;
    while ((match = apiPattern.exec(jsText)) !== null) {
      endpoints.push(baseUrl + match[1]);
    }
    
    // Pattern 2: /prices, /ajax, /getPrices, etc.
    const pricePatterns = [
      /["'](\/(?:prices|ajax|getPrices|data|fetch)[^"']*)["']/gi,
      /["'](\/api\/prices[^"']*)["']/gi,
      /fetch\(["']([^"']*prices[^"']*)["']/gi,
      /axios\.(?:get|post)\(["']([^"']*prices[^"']*)["']/gi,
    ];
    
    for (const pattern of pricePatterns) {
      while ((match = pattern.exec(jsText)) !== null) {
        const url = match[1];
        if (url.startsWith('http')) {
          endpoints.push(url);
        } else if (url.startsWith('/')) {
          endpoints.push(baseUrl + url);
        }
      }
    }
    
    return [...new Set(endpoints)]; // Remove duplicates
  } catch (error) {
    return [];
  }
}

/**
 * Extract inline JSON from HTML (window.__INITIAL_STATE__, dataLayer, etc.)
 */
function extractInlineJson(html: string): any[] {
  const jsonBlobs: any[] = [];
  
  // Pattern 1: window.__INITIAL_STATE__ = {...}
  const initialStatePattern = /window\.__INITIAL_STATE__\s*=\s*({[^;]+});/i;
  const match1 = initialStatePattern.exec(html);
  if (match1) {
    try {
      jsonBlobs.push(JSON.parse(match1[1]));
    } catch (e) {
      // Invalid JSON, skip
    }
  }
  
  // Pattern 2: dataLayer = [...]
  const dataLayerPattern = /dataLayer\s*=\s*(\[[^\]]+\]);/i;
  const match2 = dataLayerPattern.exec(html);
  if (match2) {
    try {
      jsonBlobs.push(JSON.parse(match2[1]));
    } catch (e) {
      // Invalid JSON, skip
    }
  }
  
  // Pattern 3: <script type="application/json">...</script>
  const scriptJsonPattern = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match3;
  while ((match3 = scriptJsonPattern.exec(html)) !== null) {
    try {
      jsonBlobs.push(JSON.parse(match3[1]));
    } catch (e) {
      // Invalid JSON, skip
    }
  }
  
  return jsonBlobs;
}

/**
 * Discover the iSagha JSON endpoint
 */
export async function discoverIsaghaEndpoint(): Promise<DiscoveredEndpoint | null> {
  // Check cache first
  if (endpointCache && (Date.now() - endpointCache.discoveredAt) < ENDPOINT_CACHE_TTL) {
    return endpointCache;
  }
  
  try {
    const htmlResponse = await fetch('https://market.isagha.com/prices', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });
    
    if (!htmlResponse.ok) {
      return null;
    }
    
    const html = await htmlResponse.text();
    
    // Step 1: Check for inline JSON
    const inlineJson = extractInlineJson(html);
    for (const json of inlineJson) {
      // Look for price data in JSON
      if (json && typeof json === 'object') {
        const jsonStr = JSON.stringify(json);
        if (jsonStr.includes('price') || jsonStr.includes('24') || jsonStr.includes('21')) {
          // Found potential data, but we need an endpoint, not inline data
          // Continue searching
        }
      }
    }
    
    // Step 2: Extract JS bundles
    const bundles = extractJsBundles(html);
    
    // Step 3: Search bundles for endpoints (prioritize smaller bundles)
    const bundleSizes: Array<{ url: string; size: number }> = [];
    for (const bundleUrl of bundles.slice(0, 5)) { // Limit to first 5 bundles
      try {
        const headResponse = await fetch(bundleUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: AbortSignal.timeout(5000),
        });
        const size = parseInt(headResponse.headers.get('content-length') || '999999', 10);
        bundleSizes.push({ url: bundleUrl, size });
      } catch (e) {
        // Skip if HEAD fails
      }
    }
    
    // Sort by size (smallest first) and search
    bundleSizes.sort((a, b) => a.size - b.size);
    
    for (const { url } of bundleSizes.slice(0, 3)) { // Search top 3 smallest
      const endpoints = await searchBundleForEndpoints(url);
      for (const endpoint of endpoints) {
        // Test the endpoint
        try {
          const testResponse = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json, text/json, */*',
              'Accept-Language': 'ar,en-US;q=0.9',
            },
            signal: AbortSignal.timeout(5000),
          });
          
          if (testResponse.ok) {
            const contentType = testResponse.headers.get('content-type') || '';
            if (contentType.includes('json')) {
              const json = await testResponse.json();
              // Check if it looks like price data
              if (json && typeof json === 'object') {
                const jsonStr = JSON.stringify(json).toLowerCase();
                if (jsonStr.includes('price') || jsonStr.includes('24') || jsonStr.includes('21') || 
                    jsonStr.includes('karat') || jsonStr.includes('عيار')) {
                  // Found valid endpoint!
                  endpointCache = {
                    url: endpoint,
                    method: 'GET',
                    confidence: 'high',
                    discoveredAt: Date.now(),
                  };
                  return endpointCache;
                }
              }
            }
          }
        } catch (e) {
          // Try POST if GET fails
          try {
            const testResponse = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/json, */*',
                'Accept-Language': 'ar,en-US;q=0.9',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({}),
              signal: AbortSignal.timeout(5000),
            });
            
            if (testResponse.ok) {
              const contentType = testResponse.headers.get('content-type') || '';
              if (contentType.includes('json')) {
                const json = await testResponse.json();
                if (json && typeof json === 'object') {
                  const jsonStr = JSON.stringify(json).toLowerCase();
                  if (jsonStr.includes('price') || jsonStr.includes('24') || jsonStr.includes('21')) {
                    endpointCache = {
                      url: endpoint,
                      method: 'POST',
                      confidence: 'medium',
                      discoveredAt: Date.now(),
                    };
                    return endpointCache;
                  }
                }
              }
            }
          } catch (e2) {
            // Skip this endpoint
          }
        }
      }
    }
    
    // Fallback: Try common endpoint patterns
    const commonEndpoints = [
      'https://market.isagha.com/api/prices',
      'https://market.isagha.com/api/gold-prices',
      'https://market.isagha.com/prices.json',
      'https://market.isagha.com/api/data',
    ];
    
    for (const endpoint of commonEndpoints) {
      try {
        const testResponse = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/json, */*',
            'Accept-Language': 'ar,en-US;q=0.9',
          },
          signal: AbortSignal.timeout(5000),
        });
        
        if (testResponse.ok) {
          const contentType = testResponse.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            const json = await testResponse.json();
            if (json && typeof json === 'object') {
              endpointCache = {
                url: endpoint,
                method: 'GET',
                confidence: 'low',
                discoveredAt: Date.now(),
              };
              return endpointCache;
            }
          }
        }
      } catch (e) {
        // Continue to next
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse prices from iSagha JSON response
 */
function parseIsaghaPrices(json: any): IsaghaPrices {
  const prices: IsaghaPrices = {
    24: { buy: null, sell: null },
    21: { buy: null, sell: null },
    18: { buy: null, sell: null },
    14: { buy: null, sell: null },
  };
  
  // Normalize JSON keys (handle Arabic and English)
  const normalizeKey = (key: string): string => {
    return key.toLowerCase()
      .replace(/[_\s-]/g, '')
      .replace(/karat|k|عيار/g, '')
      .replace(/buy|شراء|purchase/g, 'buy')
      .replace(/sell|بيع|sale/g, 'sell');
  };
  
  // Try various JSON structures
  const extractPrice = (obj: any, karat: number, type: 'buy' | 'sell'): number | null => {
    const karatStr = karat.toString();
    const typeStr = type === 'buy' ? 'buy' : 'sell';
    
    // Pattern 1: { "24": { "buy": 123, "sell": 456 } }
    if (obj[karatStr] && typeof obj[karatStr] === 'object') {
      const val = obj[karatStr][typeStr] || obj[karatStr][type] || obj[karatStr][`price${typeStr}`];
      if (typeof val === 'number' && val > 0) return val;
    }
    
    // Pattern 2: { "price24Buy": 123, "price24Sell": 456 }
    const key1 = `price${karatStr}${typeStr.charAt(0).toUpperCase() + typeStr.slice(1)}`;
    if (obj[key1] && typeof obj[key1] === 'number' && obj[key1] > 0) return obj[key1];
    
    // Pattern 3: Array of objects with karat field
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (item && typeof item === 'object') {
          const itemKarat = item.karat || item.k || item.عيار || item.karat24 || item.karat21;
          if (itemKarat === karat || itemKarat === karatStr) {
            const val = item[typeStr] || item[type] || item.price || item.value;
            if (typeof val === 'number' && val > 0) return val;
          }
        }
      }
    }
    
    // Pattern 4: Nested structure
    if (obj.prices && typeof obj.prices === 'object') {
      return extractPrice(obj.prices, karat, type);
    }
    
    // Pattern 5: Flat keys with normalization
    for (const key in obj) {
      const normalized = normalizeKey(key);
      if (normalized.includes(karatStr) && normalized.includes(typeStr)) {
        const val = obj[key];
        if (typeof val === 'number' && val > 0) return val;
      }
    }
    
    return null;
  };
  
  // Extract prices for each karat
  for (const karat of [24, 21, 18, 14] as const) {
    prices[karat].buy = extractPrice(json, karat, 'buy');
    prices[karat].sell = extractPrice(json, karat, 'sell');
    
    // If only one price exists, treat it as buy
    if (prices[karat].buy === null && prices[karat].sell !== null) {
      prices[karat].buy = prices[karat].sell;
      prices[karat].sell = null;
    }
  }
  
  return prices;
}

/**
 * Validate prices are within reasonable EGP ranges
 */
function validatePrices(prices: IsaghaPrices): { valid: boolean; error?: string } {
  const ranges: Record<number, { min: number; max: number }> = {
    24: { min: 2000, max: 20000 },
    21: { min: 1750, max: 17500 },
    18: { min: 1500, max: 15000 },
    14: { min: 1000, max: 10000 },
  };
  
  for (const karat of [24, 21, 18, 14] as const) {
    const range = ranges[karat];
    if (prices[karat].buy !== null) {
      if (prices[karat].buy < range.min || prices[karat].buy > range.max) {
        return {
          valid: false,
          error: `Karat ${karat} buy price ${prices[karat].buy} outside valid range [${range.min}, ${range.max}]`,
        };
      }
    }
    if (prices[karat].sell !== null) {
      if (prices[karat].sell < range.min || prices[karat].sell > range.max) {
        return {
          valid: false,
          error: `Karat ${karat} sell price ${prices[karat].sell} outside valid range [${range.min}, ${range.max}]`,
        };
      }
    }
    // Buy should be <= sell (if both exist)
    if (prices[karat].buy !== null && prices[karat].sell !== null) {
      if (prices[karat].buy > prices[karat].sell) {
        return {
          valid: false,
          error: `Karat ${karat} buy price (${prices[karat].buy}) cannot be greater than sell (${prices[karat].sell})`,
        };
      }
    }
  }
  
  // Must have at least 21k or 24k buy price
  if (prices[21].buy === null && prices[24].buy === null) {
    return {
      valid: false,
      error: 'Missing required prices: must have at least 21k or 24k buy price',
    };
  }
  
  return { valid: true };
}

/**
 * Fetch iSagha prices using discovered endpoint
 */
export async function fetchIsaghaPrices(): Promise<IsaghaResult> {
  const startTime = Date.now();
  
  try {
    // Step 1: Discover endpoint (or use cache)
    const endpoint = await discoverIsaghaEndpoint();
    
    if (!endpoint) {
      return {
        ok: false,
        prices: { 24: { buy: null, sell: null }, 21: { buy: null, sell: null }, 18: { buy: null, sell: null }, 14: { buy: null, sell: null } },
        method: 'fallback',
        error: 'Could not discover iSagha endpoint',
      };
    }
    
    // Step 2: Fetch prices from endpoint
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/json, */*',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        ...(endpoint.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: endpoint.method === 'POST' ? JSON.stringify({}) : undefined,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    
    const latency = Date.now() - startTime;
    
    if (!response.ok) {
      return {
        ok: false,
        prices: { 24: { buy: null, sell: null }, 21: { buy: null, sell: null }, 18: { buy: null, sell: null }, 14: { buy: null, sell: null } },
        method: 'discovered-endpoint',
        endpoint: endpoint.url,
        httpStatus: response.status,
        latency,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const json = await response.json();
    const jsonSnippet = JSON.stringify(json).substring(0, 500);
    
    // Step 3: Parse prices
    const prices = parseIsaghaPrices(json);
    
    // Step 4: Validate
    const validation = validatePrices(prices);
    if (!validation.valid) {
      return {
        ok: false,
        prices,
        method: 'discovered-endpoint',
        endpoint: endpoint.url,
        httpStatus: response.status,
        latency,
        jsonSnippet,
        parseError: validation.error,
      };
    }
    
    return {
      ok: true,
      prices,
      method: 'discovered-endpoint',
      endpoint: endpoint.url,
      httpStatus: response.status,
      latency,
      jsonSnippet,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return {
      ok: false,
      prices: { 24: { buy: null, sell: null }, 21: { buy: null, sell: null }, 18: { buy: null, sell: null }, 14: { buy: null, sell: null } },
      method: 'fallback',
      latency,
      error: errorMessage,
    };
  }
}



