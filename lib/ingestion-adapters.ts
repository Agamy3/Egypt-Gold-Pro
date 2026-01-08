/**
 * Ingestion Adapters for Egypt Gold Market Sources
 * 
 * Fetches prices from iSagha and GoldBillion sources
 */

import crypto from 'crypto';

export interface IngestionResult {
  source: 'isagha' | 'goldbillion';
  market21Buy: number | null;
  market21Sell: number | null;
  market24Buy: number | null;
  market24Sell: number | null;
  usdBuy: number | null;
  usdSell: number | null;
  rawHash: string;
  error: string | null;
  rawResponse: string;
  httpStatus?: number;
  regexMatches?: Array<{ pattern: string; match: string }>;
  url?: string;
  jinaUrl?: string | null;
  discoveredEndpoint?: string | null;
  jsonSnippet?: string | null;
  contentLength?: number;
  bodyTextSnippet?: string | null;
  attemptedUrls?: Array<{ url: string; status: number }>;
  parsedValues?: {
    market21Buy?: number;
    market21Sell?: number;
    market24Buy?: number;
    market24Sell?: number;
  };
}

/**
 * Fetch iSagha prices
 * Try: 1) JSON endpoint, 2) Embedded JSON in HTML, 3) Jina AI fallback
 */
export async function fetchIsagha(): Promise<IngestionResult> {
  const url = 'https://market.isagha.com/prices';
  const rawHash = crypto.createHash('sha256').update(url).digest('base64').substring(0, 64);
  
  // Use the new iSagha adapter
  try {
    const { fetchIsaghaPrices } = await import('@/lib/isagha-adapter');
    const result = await fetchIsaghaPrices();
    
    if (!result.ok) {
      return {
        source: 'isagha',
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
        usdBuy: null,
        usdSell: null,
        rawHash,
        httpStatus: result.httpStatus || null,
        url: result.endpoint || url,
        error: result.error || result.parseError || 'Failed to fetch iSagha prices',
        rawResponse: result.jsonSnippet || '',
        regexMatches: result.endpoint ? [{ pattern: 'endpoint', match: result.endpoint }] : undefined,
        discoveredEndpoint: result.endpoint || null,
        jsonSnippet: result.jsonSnippet || null,
        contentLength: null,
        bodyTextSnippet: null,
      };
    }
    
    const rawResponse = result.jsonSnippet || JSON.stringify(result.prices);
    const finalHash = crypto.createHash('sha256').update(rawResponse).digest('base64').substring(0, 64);
    
    return {
      source: 'isagha',
      market21Buy: result.prices[21].buy,
      market21Sell: result.prices[21].sell,
      market24Buy: result.prices[24].buy,
      market24Sell: result.prices[24].sell,
      usdBuy: null,
      usdSell: null,
      rawHash: finalHash,
      httpStatus: result.httpStatus || 200,
      url: result.endpoint || url,
      error: null,
      rawResponse,
      regexMatches: result.endpoint ? [{ pattern: 'endpoint', match: result.endpoint }] : undefined,
      discoveredEndpoint: result.endpoint || null,
      jsonSnippet: result.jsonSnippet || null,
      contentLength: rawResponse.length,
      bodyTextSnippet: null,
      parsedValues: {
        market21Buy: result.prices[21].buy ?? undefined,
        market21Sell: result.prices[21].sell ?? undefined,
        market24Buy: result.prices[24].buy ?? undefined,
        market24Sell: result.prices[24].sell ?? undefined,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      source: 'isagha',
      market21Buy: null,
      market21Sell: null,
      market24Buy: null,
      market24Sell: null,
      usdBuy: null,
      usdSell: null,
      rawHash,
      httpStatus: null,
      url,
      error: `iSagha adapter error: ${errorMessage}`,
      rawResponse: '',
      regexMatches: undefined,
      contentLength: null,
      bodyTextSnippet: null,
    };
  }
}

// Legacy implementation (kept for reference, not used)
export async function fetchIsaghaLegacy(): Promise<IngestionResult> {
  const url = 'https://market.isagha.com/prices';
  const rawHash = crypto.createHash('sha256').update(url).digest('base64').substring(0, 64);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    const httpStatus = response.status;
    const rawResponse = await response.text();
    const contentLength = rawResponse.length;

    if (!response.ok) {
      return {
        source: 'isagha',
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
        usdBuy: null,
        usdSell: null,
        rawHash: crypto.createHash('sha256').update(rawResponse).digest('base64').substring(0, 64),
        error: `HTTP ${httpStatus}: ${response.statusText}`,
        rawResponse,
        httpStatus,
        url,
        contentLength,
        bodyTextSnippet: rawResponse.substring(0, 1200),
      };
    }

    // Try to extract JSON from HTML (embedded data)
    let jsonData: any = null;
    let discoveredEndpoint: string | null = null;
    
    // Try window.__INITIAL_STATE__
    const initialStateMatch = rawResponse.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/s);
    if (initialStateMatch) {
      try {
        jsonData = JSON.parse(initialStateMatch[1]);
        discoveredEndpoint = 'window.__INITIAL_STATE__';
      } catch (e) {
        // Continue
      }
    }
    
    // Try dataLayer
    if (!jsonData) {
      const dataLayerMatch = rawResponse.match(/dataLayer\s*=\s*(\[.+?\]);/s);
      if (dataLayerMatch) {
        try {
          const dataLayer = JSON.parse(dataLayerMatch[1]);
          if (Array.isArray(dataLayer) && dataLayer.length > 0) {
            jsonData = dataLayer[0];
            discoveredEndpoint = 'dataLayer';
          }
        } catch (e) {
          // Continue
        }
      }
    }
    
    // Try JSON-LD
    if (!jsonData) {
      const jsonLdMatches = rawResponse.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.+?)<\/script>/gs);
      if (jsonLdMatches) {
        for (const match of jsonLdMatches) {
          try {
            const jsonLdContent = match.replace(/<script[^>]*>|<\/script>/g, '');
            const parsed = JSON.parse(jsonLdContent);
            if (parsed && (parsed['@type'] === 'Product' || parsed.offers)) {
              jsonData = parsed;
              discoveredEndpoint = 'JSON-LD';
              break;
            }
          } catch (e) {
            // Continue
          }
        }
      }
    }
    
    // Try inline script with JSON
    if (!jsonData) {
      const scriptMatches = rawResponse.match(/<script[^>]*>(.*?)<\/script>/gs);
      if (scriptMatches) {
        for (const script of scriptMatches) {
          const jsonMatch = script.match(/\{[\s\S]*"price[0-9]+"[\s\S]*\}/);
          if (jsonMatch) {
            try {
              jsonData = JSON.parse(jsonMatch[0]);
              discoveredEndpoint = 'inline-script';
              break;
            } catch (e) {
              // Continue
            }
          }
        }
      }
    }

    // If no JSON found, try Jina AI fallback
    if (!jsonData) {
      try {
        const jinaUrl = `https://r.jina.ai/https://market.isagha.com/prices`;
        const jinaResponse = await fetch(jinaUrl, {
          headers: {
            'Accept': 'text/plain',
            'X-Return-Format': 'text',
          },
          signal: AbortSignal.timeout(15000),
        });
        
        if (jinaResponse.ok) {
          const jinaText = await jinaResponse.text();
          // Try to parse prices from rendered text using regex
          const price24Match = jinaText.match(/عيار\s*24[^\d]*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)/);
          const price21Match = jinaText.match(/عيار\s*21[^\d]*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)/);
          
          if (price24Match || price21Match) {
            const market24Buy = price24Match ? parseFloat(price24Match[1].replace(/[, ]/g, '')) : null;
            const market21Buy = price21Match ? parseFloat(price21Match[1].replace(/[, ]/g, '')) : null;
            
            if (market24Buy || market21Buy) {
              return {
                source: 'isagha',
                market21Buy: market21Buy && market21Buy > 0 ? market21Buy : null,
                market21Sell: null,
                market24Buy: market24Buy && market24Buy > 0 ? market24Buy : null,
                market24Sell: null,
                usdBuy: null,
                usdSell: null,
                rawHash: crypto.createHash('sha256').update(jinaText).digest('base64').substring(0, 64),
                error: null,
                rawResponse: jinaText,
                httpStatus: jinaResponse.status,
                url,
                jinaUrl,
                contentLength: jinaText.length,
                bodyTextSnippet: jinaText.substring(0, 1200),
                discoveredEndpoint: 'jina-ai',
                parsedValues: {
                  market21Buy: market21Buy && market21Buy > 0 ? market21Buy : undefined,
                  market24Buy: market24Buy && market24Buy > 0 ? market24Buy : undefined,
                },
              };
            }
          }
        }
      } catch (jinaError) {
        // Continue to return error
      }
    }

    // If we found JSON, extract prices
    if (jsonData) {
      // Extract prices from JSON (try various structures)
      const price24 = jsonData.price24 || jsonData.price_24 || jsonData['24'] || jsonData.karat24 || jsonData['24k'] || jsonData.data?.price24;
      const price21 = jsonData.price21 || jsonData.price_21 || jsonData['21'] || jsonData.karat21 || jsonData['21k'] || jsonData.data?.price21;
      const buy24 = price24?.buy || price24?.buyPrice || price24?.purchase || price24;
      const sell24 = price24?.sell || price24?.sellPrice || price24?.sale;
      const buy21 = price21?.buy || price21?.buyPrice || price21?.purchase || price21;
      const sell21 = price21?.sell || price21?.sellPrice || price21?.sale;

      const market24Buy = typeof buy24 === 'number' && isFinite(buy24) && buy24 > 0 ? buy24 : null;
      const market24Sell = typeof sell24 === 'number' && isFinite(sell24) && sell24 > 0 ? sell24 : null;
      const market21Buy = typeof buy21 === 'number' && isFinite(buy21) && buy21 > 0 ? buy21 : null;
      const market21Sell = typeof sell21 === 'number' && isFinite(sell21) && sell21 > 0 ? sell21 : null;

      if (market21Buy || market24Buy) {
        return {
          source: 'isagha',
          market21Buy,
          market21Sell,
          market24Buy,
          market24Sell,
          usdBuy: null,
          usdSell: null,
          rawHash: crypto.createHash('sha256').update(rawResponse).digest('base64').substring(0, 64),
          error: null,
          rawResponse,
          httpStatus,
          url,
          contentLength,
          jsonSnippet: JSON.stringify(jsonData).substring(0, 800),
          discoveredEndpoint,
          parsedValues: {
            market21Buy: market21Buy ?? undefined,
            market21Sell: market21Sell ?? undefined,
            market24Buy: market24Buy ?? undefined,
            market24Sell: market24Sell ?? undefined,
          },
        };
      }
    }

    // No prices found
    return {
      source: 'isagha',
      market21Buy: null,
      market21Sell: null,
      market24Buy: null,
      market24Sell: null,
      usdBuy: null,
      usdSell: null,
      rawHash: crypto.createHash('sha256').update(rawResponse).digest('base64').substring(0, 64),
      error: 'Could not parse prices from iSagha (JS-rendered page, no embedded JSON found)',
      rawResponse,
      httpStatus,
      url,
      contentLength,
      bodyTextSnippet: rawResponse.substring(0, 1200),
      discoveredEndpoint: discoveredEndpoint || null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      source: 'isagha',
      market21Buy: null,
      market21Sell: null,
      market24Buy: null,
      market24Sell: null,
      usdBuy: null,
      usdSell: null,
      rawHash,
      error: `Fetch error: ${errorMessage}`,
      rawResponse: '',
      httpStatus: undefined,
      url,
    };
  }
}

/**
 * Fetch GoldBillion prices
 * Try multiple URLs, then Jina AI fallback
 */
export async function fetchGoldBillion(): Promise<IngestionResult> {
  const attemptedUrls: Array<{ url: string; status: number }> = [];
  const baseUrls = [
    'https://www.goldbillion.com/prices',
    'https://goldbillion.com/prices',
    'https://www.goldbillion.com',
    'https://goldbillion.com',
  ];

  const fetchErrors: string[] = [];

  for (const url of baseUrls) {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'ar-EG,ar;q=0.9,en;q=0.7',
          'Referer': 'https://www.goldbillion.com/',
        },
        signal: AbortSignal.timeout(10000),
      });

      attemptedUrls.push({ url, status: response.status });

      if (response.ok) {
        const rawResponse = await response.text();
        const contentLength = rawResponse.length;

        // Try to parse HTML (basic parsing)
        // This is a stub - full HTML parsing would require cheerio
        // For now, return error indicating HTML parsing needed
        return {
          source: 'goldbillion',
          market21Buy: null,
          market21Sell: null,
          market24Buy: null,
          market24Sell: null,
          usdBuy: null,
          usdSell: null,
          rawHash: crypto.createHash('sha256').update(rawResponse).digest('base64').substring(0, 64),
          error: 'GoldBillion HTML parsing not yet implemented - page structure needs analysis',
          rawResponse,
          httpStatus: response.status,
          url,
          contentLength,
          bodyTextSnippet: rawResponse.substring(0, 1200),
          attemptedUrls,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      attemptedUrls.push({ url, status: 0 });
      fetchErrors.push(`${url}: ${errorMsg}`);
    }
  }

  // Try Jina AI fallback for each URL
  for (const url of baseUrls) {
    try {
      const jinaUrl = `https://r.jina.ai/${url}`;
      const jinaResponse = await fetch(jinaUrl, {
        headers: {
          'Accept': 'text/plain',
          'X-Return-Format': 'text',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (jinaResponse.ok) {
        const jinaText = await jinaResponse.text();
        // Try to parse prices from rendered text using regex
        const price24Match = jinaText.match(/عيار\s*24[^\d]*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)/);
        const price21Match = jinaText.match(/عيار\s*21[^\d]*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?)/);
        
        if (price24Match || price21Match) {
          const market24Buy = price24Match ? parseFloat(price24Match[1].replace(/[, ]/g, '')) : null;
          const market21Buy = price21Match ? parseFloat(price21Match[1].replace(/[, ]/g, '')) : null;
          
          if (market24Buy || market21Buy) {
            return {
              source: 'goldbillion',
              market21Buy: market21Buy && market21Buy > 0 ? market21Buy : null,
              market21Sell: null,
              market24Buy: market24Buy && market24Buy > 0 ? market24Buy : null,
              market24Sell: null,
              usdBuy: null,
              usdSell: null,
              rawHash: crypto.createHash('sha256').update(jinaText).digest('base64').substring(0, 64),
              error: null,
              rawResponse: jinaText,
              httpStatus: jinaResponse.status,
              url,
              jinaUrl,
              contentLength: jinaText.length,
              bodyTextSnippet: jinaText.substring(0, 1200),
              attemptedUrls,
            };
          }
        }
      }
    } catch (jinaError) {
      // Continue to next URL
    }
  }

  return {
    source: 'goldbillion',
    market21Buy: null,
    market21Sell: null,
    market24Buy: null,
    market24Sell: null,
    usdBuy: null,
    usdSell: null,
    rawHash: crypto.createHash('sha256').update('stub').digest('base64').substring(0, 64),
    error: `GoldBillion adapter: All URL attempts failed. Errors: ${fetchErrors.join('; ')}`,
    rawResponse: '',
    httpStatus: undefined,
    url: baseUrls[0],
    attemptedUrls,
  };
}
