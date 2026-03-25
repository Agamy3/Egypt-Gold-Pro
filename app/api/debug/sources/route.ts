/**
 * Source Audit Debug API
 * 
 * Returns detailed information about all data sources
 * Includes raw responses and parsing errors
 * Never throws - always returns JSON
 */

import { NextResponse } from 'next/server';
import db from '@/lib/supabase';
import { fetchImpliedOunce, fetchGoldApiOunceUsd } from '@/lib/implied-ounce';
import { fetchIsagha, fetchGoldBillion } from '@/lib/ingestion-adapters';
import { processSource } from '@/lib/gold-sources-adapters';
import { SOURCE_WEIGHTS, SOURCE_URLS } from '@/lib/gold-ingestion-config';
import { checkSupabaseWrite } from '@/lib/supabase/snapshots';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Fetch Egypt Market Implied Ounce data (TradingView)
    let impliedOunceData: any = {
      status: 'UNKNOWN',
      price: null,
      source: null,
      ounceType: 'Egypt Market Implied',
      httpStatus: null,
      error: null,
    };

    try {
      // Make a fresh fetch directly from Gold-API.com (bypass cache for debug)
      const goldApiResult = await fetchGoldApiOunceUsd();
      const result = await fetchImpliedOunce();
      impliedOunceData = {
        status: result.price !== null ? 'OK' : 'ERROR',
        price: result.price,
        source: result.source,
        ounceType: 'Egypt Market Implied',
        url: 'https://api.gold-api.com/price/XAU',
        httpStatus: goldApiResult.httpStatus || null,
        error: result.error || goldApiResult.error || null,
        rawSnippet: goldApiResult.error ? JSON.stringify(goldApiResult).substring(0, 500) : null,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      impliedOunceData = {
        status: 'ERROR',
        price: null,
        source: null,
        ounceType: 'Egypt Market Implied',
        httpStatus: null,
        error: `Exception: ${errorMessage}`,
      };
    }

    // Fetch iSagha data: Get from DB snapshot AND do a live fetch for debugging
    let isaghaData: any = {
      status: 'UNKNOWN',
      lastIngested: null,
      prices: {
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      },
      lastError: null,
      httpStatus: null,
      url: null,
      jinaUrl: null,
      rawHtmlSnippet: null,
      regexMatches: null,
      method: null,
      discoveredEndpoint: null,
      jsonSnippet: null,
      contentLength: null,
      bodyTextSnippet: null,
    };

    try {
      // Get latest snapshot from wide table (one row with all karat prices)
      const { data: latestSnapshot } = await db.supabase
        .from('market_snapshots')
        .select('source, createdAt, market21Buy, market21Sell, market24Buy, market24Sell, market18Buy, market18Sell, market14Buy, market14Sell')
        .eq('source', 'isagha')
        .is('error', null)
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSnapshot) {
        const prices: { market21Buy: number | null; market21Sell: number | null; market24Buy: number | null; market24Sell: number | null; market18Buy: number | null; market18Sell: number | null; market14Buy: number | null; market14Sell: number | null } = {
          market21Buy: latestSnapshot.market21Buy as number | null,
          market21Sell: latestSnapshot.market21Sell as number | null,
          market24Buy: latestSnapshot.market24Buy as number | null,
          market24Sell: latestSnapshot.market24Sell as number | null,
          market18Buy: latestSnapshot.market18Buy as number | null,
          market18Sell: latestSnapshot.market18Sell as number | null,
          market14Buy: latestSnapshot.market14Buy as number | null,
          market14Sell: latestSnapshot.market14Sell as number | null,
        };
        
        isaghaData.lastIngested = latestSnapshot.createdAt as number;
        isaghaData.prices = prices;
        isaghaData.status = (prices.market21Buy || prices.market24Buy) ? 'OK' : 'ERROR';
        isaghaData.lastError = (prices.market21Buy || prices.market24Buy) ? null : 'No valid prices';
      } else {
        isaghaData.status = 'UNKNOWN';
        isaghaData.lastError = 'No snapshots found';
      }

      // Do a live fetch for debugging (shows current state)
      try {
        const liveResult = await fetchIsagha();
        isaghaData.httpStatus = liveResult.httpStatus || null;
        isaghaData.url = liveResult.url || null;
        isaghaData.jinaUrl = liveResult.jinaUrl || null;
        isaghaData.rawHtmlSnippet = liveResult.rawResponse?.substring(0, 1200) || null;
        isaghaData.regexMatches = liveResult.regexMatches || null;
        
        // Extract method and endpoint from regexMatches
        const endpointMatch = liveResult.regexMatches?.find(m => m.pattern === 'endpoint');
        if (endpointMatch) {
          isaghaData.method = 'discovered-endpoint';
          isaghaData.discoveredEndpoint = endpointMatch.match;
        } else {
          isaghaData.method = 'direct-json'; // Default for new adapter
        }
        
        isaghaData.contentLength = liveResult.contentLength || null;
        isaghaData.bodyTextSnippet = liveResult.bodyTextSnippet || null;
        isaghaData.jsonSnippet = liveResult.rawResponse?.substring(0, 500) || null;
        
        // If we got prices from live fetch, show them
        if (liveResult.market21Buy || liveResult.market21Sell) {
          isaghaData.liveFetchPrices = {
            market21Buy: liveResult.market21Buy,
            market21Sell: liveResult.market21Sell,
            market24Buy: liveResult.market24Buy,
            market24Sell: liveResult.market24Sell,
          };
          // Update status if we got valid prices
          if (liveResult.market21Buy || liveResult.market24Buy) {
            isaghaData.status = 'OK';
          }
        }
        
        if (liveResult.error && !isaghaData.lastError) {
          isaghaData.lastError = liveResult.error;
          isaghaData.status = 'ERROR';
        }
      } catch (fetchError) {
        // Live fetch failed, but we still have DB data
        const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
        if (!isaghaData.lastError) {
          isaghaData.lastError = `Live fetch error: ${errorMessage}`;
          isaghaData.status = 'ERROR';
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      isaghaData = {
        status: 'ERROR',
        lastIngested: null,
        prices: {
          market21Buy: null,
          market21Sell: null,
          market24Buy: null,
          market24Sell: null,
        },
      lastError: `DB error: ${errorMessage}`,
      httpStatus: null,
      url: null,
      jinaUrl: null,
      rawHtmlSnippet: null,
      regexMatches: null,
      method: null,
    };
    }

    // Fetch GoldBillion snapshot data from DB AND do live fetch for debugging
    const goldBillionData: Record<string, unknown> = {
      status: 'UNKNOWN',
      lastIngested: null,
      prices: {
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      },
      lastError: null,
      httpStatus: null,
      url: null,
      jinaUrl: null,
      rawHtmlSnippet: null,
      regexMatches: null,
      method: null,
      discoveredEndpoint: null,
      jsonSnippet: null,
      contentLength: null,
      bodyTextSnippet: null,
    };

    try {
      // Get latest snapshot from wide table (one row with all karat prices)
      const { data: latestSnapshot } = await db.supabase
        .from('market_snapshots')
        .select('source, createdAt, market21Buy, market21Sell, market24Buy, market24Sell, market18Buy, market18Sell, market14Buy, market14Sell')
        .eq('source', 'goldbillion')
        .is('error', null)
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSnapshot) {
        const prices: { market21Buy: number | null; market21Sell: number | null; market24Buy: number | null; market24Sell: number | null; market18Buy: number | null; market18Sell: number | null; market14Buy: number | null; market14Sell: number | null } = {
          market21Buy: latestSnapshot.market21Buy as number | null,
          market21Sell: latestSnapshot.market21Sell as number | null,
          market24Buy: latestSnapshot.market24Buy as number | null,
          market24Sell: latestSnapshot.market24Sell as number | null,
          market18Buy: latestSnapshot.market18Buy as number | null,
          market18Sell: latestSnapshot.market18Sell as number | null,
          market14Buy: latestSnapshot.market14Buy as number | null,
          market14Sell: latestSnapshot.market14Sell as number | null,
        };
        
        goldBillionData.status = (prices.market21Buy || prices.market24Buy) ? 'OK' : 'ERROR';
        goldBillionData.lastIngested = latestSnapshot.createdAt as number;
        goldBillionData.prices = prices;
        goldBillionData.lastError = (prices.market21Buy || prices.market24Buy) ? null : 'No valid prices';
      } else {
        goldBillionData.status = 'UNKNOWN';
        goldBillionData.lastIngested = null;
        goldBillionData.prices = {
          market21Buy: null,
          market21Sell: null,
          market24Buy: null,
          market24Sell: null,
        };
        goldBillionData.lastError = 'No snapshots found';
      }

      // Do a live fetch for debugging (shows current state)
      try {
        const liveResult = await fetchGoldBillion();
        goldBillionData.httpStatus = liveResult.httpStatus || null;
        goldBillionData.url = liveResult.url || null;
        goldBillionData.jinaUrl = liveResult.jinaUrl || null;
        goldBillionData.rawHtmlSnippet = liveResult.rawResponse?.substring(0, 1200) || null;
        goldBillionData.regexMatches = liveResult.regexMatches || null;
        
        // Extract method from regexMatches (should be "endpoint-discovery")
        const methodMatch = liveResult.regexMatches?.find(m => m.pattern === 'Method');
        if (methodMatch) {
          goldBillionData.method = methodMatch.match;
        } else {
          goldBillionData.method = 'direct-html-multi-url'; // Default since we always use direct HTML parsing now
        }
        
        goldBillionData.contentLength = liveResult.contentLength || null;
        goldBillionData.bodyTextSnippet = liveResult.bodyTextSnippet || null;
        goldBillionData.attemptedUrls = liveResult.attemptedUrls || null;
        
        // If we got prices from live fetch, show them
        if (liveResult.market21Buy || liveResult.market21Sell) {
          goldBillionData.liveFetchPrices = {
            market21Buy: liveResult.market21Buy,
            market21Sell: liveResult.market21Sell,
            market24Buy: liveResult.market24Buy,
            market24Sell: liveResult.market24Sell,
          };
        }
        
        if (liveResult.error && !goldBillionData.lastError) {
          goldBillionData.lastError = liveResult.error;
        }
      } catch (fetchError) {
        // Live fetch failed, but we still have DB data
        const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
        if (!goldBillionData.lastError) {
          goldBillionData.lastError = `Live fetch error: ${errorMessage}`;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      goldBillionData.status = 'ERROR';
      goldBillionData.lastIngested = null;
      goldBillionData.prices = {
        market21Buy: null,
        market21Sell: null,
        market24Buy: null,
        market24Sell: null,
      };
      goldBillionData.lastError = `DB error: ${errorMessage}`;
      goldBillionData.httpStatus = null;
      goldBillionData.url = null;
      goldBillionData.jinaUrl = null;
      goldBillionData.rawHtmlSnippet = null;
      goldBillionData.regexMatches = null;
      goldBillionData.method = null;
      goldBillionData.discoveredEndpoint = null;
      goldBillionData.jsonSnippet = null;
    }

    // Fetch web sources diagnostics (don't write to DB, just fetch and parse)
    const egyptWebSources: Record<string, any> = {};
    const webSourceNames = Object.keys(SOURCE_WEIGHTS);
    
    for (const sourceName of webSourceNames) {
      const startTime = Date.now();
      try {
        const result = await processSource(sourceName);
        const latencyMs = Date.now() - startTime;
        
        // Build parsed values object
        const parsedValues: Record<string, { buy: number | null; sell?: number | null }> = {};
        for (const karat of [24, 21, 18, 14]) {
          if (karat in result.prices) {
            parsedValues[String(karat)] = {
              buy: result.prices[karat],
              sell: null, // We only track buy prices currently
            };
          } else {
            parsedValues[String(karat)] = { buy: null };
          }
        }
        
        egyptWebSources[sourceName] = {
          status: result.valid ? 'OK' : 'ERROR',
          url: SOURCE_URLS[sourceName] || null,
          httpStatus: result.httpStatus || null,
          contentLength: result.contentLength || null,
          latencyMs,
          method: result.method || (result.errors.some(e => e.includes('JS-rendered')) ? 'js_guard' : result.errors.some(e => e.includes('Fetch error') || e.includes('Timeout')) ? 'fetch_error' : 'regex'),
          methodTried: result.methodTried || [],
          selectorHits: result.selectorHits || {},
          rawHtmlSnippet: result.rawSnippet || null,
          bodyTextSnippet: result.bodyTextSnippet || null,
          regexMatches: result.regexMatches || [],
          parsedValues,
          parseError: result.parseError || null,
          rowSamples: result.rowSamples || [],
          numbersFoundSample: result.numbersFoundSample || [],
          allRowSamples: result.allRowSamples || [],
          allRowNumbersSamples: result.allRowNumbersSamples || [],
          errors: result.errors.length > 0 ? result.errors : null,
          notes: result.notes.length > 0 ? result.notes : null,
        };
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        egyptWebSources[sourceName] = {
          status: 'ERROR',
          url: SOURCE_URLS[sourceName] || null,
          httpStatus: null,
          contentLength: null,
          latencyMs,
          method: 'fetch_error',
          rawHtmlSnippet: null,
          regexMatches: [],
          parsedValues: {},
          errors: [error instanceof Error ? error.message : String(error)],
          notes: null,
        };
      }
    }

    // Get Supabase write status
    let supabaseWriteStatus: any = {
      ok: false,
      lastInsertOk: false,
      lastInsertTime: null,
      lastError: null,
    };
    
    try {
      supabaseWriteStatus = await checkSupabaseWrite();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      supabaseWriteStatus = {
        ok: false,
        lastInsertOk: false,
        lastInsertTime: null,
        lastError: `Check failed: ${errorMessage}`,
      };
    }

    return NextResponse.json({
      timestamp: Date.now(),
      impliedOunce: impliedOunceData,
      isagha: isaghaData,
      goldBillion: goldBillionData,
      egyptWebSources,
      supabase: supabaseWriteStatus,
    });
  } catch (error) {
    // Final catch-all to ensure handler never throws
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Debug sources error: Unexpected error -', errorMessage);
    return NextResponse.json(
      {
        timestamp: Date.now(),
        error: 'Failed to fetch debug information',
        errorMessage,
        impliedOunce: { status: 'ERROR', price: null, source: null, ounceType: 'Egypt Market Implied', error: errorMessage },
        isagha: { status: 'ERROR', lastIngested: null, prices: null, lastError: errorMessage },
        goldBillion: { status: 'ERROR', lastIngested: null, prices: null, lastError: errorMessage },
        egyptWebSources: {},
      },
      { status: 200 } // Always return 200, even on error
    );
  }
}
