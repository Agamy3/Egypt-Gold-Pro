import { NextResponse } from 'next/server';
import { fetchRapidApiEgyptGold } from '@/lib/sources/rapidapi-egypt-gold';
import crypto from 'crypto';

export interface RapidApiQAResult {
  requestSource: string | number;
  responseSource: string | null;
  score: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
  prices: {
    market21Buy: number | null;
    market21Sell: number | null;
    market24Buy: number | null;
    market24Sell: number | null;
  };
  ratio21to24: number | null;
  spread21Pct: number | null;
  spread24Pct: number | null;
  httpStatus: number | null;
  fetchedAt: number;
  rawSnippet?: string;
  fingerprint?: string;
}

/**
 * Generate fingerprint from prices data
 */
function generateFingerprint(data: any): string {
  try {
    const keyData = {
      price21: data.price21 || null,
      price24: data.price24 || null,
      priceounce: data.priceounce || null,
    };
    const jsonStr = JSON.stringify(keyData);
    return crypto.createHash('sha256').update(jsonStr).digest('hex').substring(0, 16);
  } catch {
    return '';
  }
}

/**
 * QA endpoint for RapidAPI source validation
 * Tests multiple source IDs and names, scores them
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'both'; // 'names' | 'ids' | 'both'
    const idsParam = searchParams.get('ids');
    const namesParam = searchParams.get('names');
    
    // Default test sets
    const defaultIds = [1, 2, 3, 4, 5, 6, 7, 8];
    const defaultNames = ['isagha', 'goldbullioneg', 'gold_era', 'edahab', 'masrawy'];
    
    // Determine which candidates to test
    let testIds: number[] = [];
    let testNames: string[] = [];
    
    if (mode === 'ids' || mode === 'both') {
      if (idsParam) {
        testIds = idsParam.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id) && id > 0);
      } else {
        testIds = defaultIds;
      }
    }
    
    if (mode === 'names' || mode === 'both') {
      if (namesParam) {
        testNames = namesParam.split(',').map(name => name.trim()).filter(name => name.length > 0);
      } else {
        testNames = defaultNames;
      }
    }

    const results: RapidApiQAResult[] = [];

    // Test numeric IDs
    for (const sourceId of testIds) {
      const result = await testSource(sourceId);
      results.push(result);
    }

    // Test named sources
    for (const sourceName of testNames) {
      const result = await testSource(sourceName);
      results.push(result);
    }

    // Generate fingerprints and check for duplicates
    const fingerprints = new Map<string, RapidApiQAResult[]>();
    for (const result of results) {
      if (result.fingerprint) {
        if (!fingerprints.has(result.fingerprint)) {
          fingerprints.set(result.fingerprint, []);
        }
        fingerprints.get(result.fingerprint)!.push(result);
      }
    }

    // Add warnings for duplicate payloads
    const distinctPayloadCount = fingerprints.size;
    if (distinctPayloadCount === 1 && results.length > 1 && results.some(r => r.fingerprint)) {
      // All sources returned identical payload
      for (const result of results) {
        result.warnings.push('All sources returned identical payload; API may ignore source parameter.');
        result.score -= 10;
        result.score = Math.max(0, result.score);
      }
    } else if (distinctPayloadCount < results.length && distinctPayloadCount > 1) {
      // Some duplicates found
      for (const [fingerprint, dupResults] of fingerprints.entries()) {
        if (dupResults.length > 1) {
          const sources = dupResults.map(r => String(r.requestSource)).join(', ');
          for (const result of dupResults) {
            result.warnings.push(`Payload duplicates sources: ${sources}`);
            result.score -= 5;
            result.score = Math.max(0, result.score);
          }
        }
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    const bestCandidate = results.length > 0 && results[0].valid ? results[0].requestSource : null;

    return NextResponse.json({
      timestamp: Date.now(),
      mode,
      testedCandidates: {
        ids: testIds,
        names: testNames,
      },
      results,
      summary: {
        distinctPayloadCount,
        bestCandidate,
        totalTested: results.length,
        validCount: results.filter(r => r.valid).length,
      },
    }, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('RapidAPI QA error:', errorMessage);
    return NextResponse.json({
      error: 'QA test failed',
      message: errorMessage,
      timestamp: Date.now(),
    }, { status: 500 });
  }
}

/**
 * Test a single source (ID or name) and return scored result
 */
async function testSource(sourceValue: number | string): Promise<RapidApiQAResult> {
  const result: RapidApiQAResult = {
    requestSource: sourceValue,
    responseSource: null,
    score: 100,
    valid: false,
    errors: [],
    warnings: [],
    prices: {
      market21Buy: null,
      market21Sell: null,
      market24Buy: null,
      market24Sell: null,
    },
    ratio21to24: null,
    spread21Pct: null,
    spread24Pct: null,
    httpStatus: null,
    fetchedAt: Date.now(),
  };

  try {
    // Fetch data with the specified source value (ID or name)
    const apiResult = await fetchRapidApiEgyptGold(sourceValue);

    result.httpStatus = apiResult.httpStatus || null;
    result.fetchedAt = apiResult.fetchedAt;
    result.rawSnippet = apiResult.rawSnippet?.substring(0, 500);

    if (!apiResult.ok) {
      result.errors.push(apiResult.error || 'Unknown error');
      result.score = 0;
      return result;
    }

    // Try to parse responseSource and generate fingerprint from response
    try {
      // Use fullResponse if available, otherwise use rawSnippet
      const responseData = apiResult.fullResponse || apiResult.rawSnippet;
      if (responseData) {
        // Try to parse as JSON
        let parsedData: any;
        try {
          parsedData = JSON.parse(responseData);
        } catch {
          // If not valid JSON (might be error message), skip
          parsedData = null;
        }
        
        if (parsedData) {
          if (parsedData.source) {
            result.responseSource = parsedData.source;
          }
          
          // Generate fingerprint
          result.fingerprint = generateFingerprint(parsedData);
        }
      }
    } catch {
      // Failed to parse responseSource, continue
    }

    // Check if responseSource matches requestSource (for name mode)
    if (typeof sourceValue === 'string' && result.responseSource) {
      if (result.responseSource.toLowerCase() !== sourceValue.toLowerCase()) {
        result.warnings.push(`Response source "${result.responseSource}" does not match request source "${sourceValue}"`);
        result.score -= 15;
      }
    }

    // Extract prices
    result.prices = {
      market21Buy: apiResult.market21Buy,
      market21Sell: apiResult.market21Sell,
      market24Buy: apiResult.market24Buy,
      market24Sell: apiResult.market24Sell,
    };

    // Validation checks
    const { buy21, sell21, buy24, sell24 } = {
      buy21: apiResult.market21Buy,
      sell21: apiResult.market21Sell,
      buy24: apiResult.market24Buy,
      sell24: apiResult.market24Sell,
    };

    // Check if 21k buy/sell are present
    if (buy21 === null || sell21 === null || !isFinite(buy21) || !isFinite(sell21)) {
      result.errors.push('Missing or invalid 21k buy/sell prices');
      result.score -= 40;
    }

    // Check if 24k buy/sell are present
    if (buy24 === null || sell24 === null || !isFinite(buy24) || !isFinite(sell24)) {
      result.errors.push('Missing or invalid 24k buy/sell prices');
      result.score -= 20;
    }

    // If we have both 21k and 24k, check ratio
    if (buy21 !== null && buy24 !== null && isFinite(buy21) && isFinite(buy24) && buy24 > 0) {
      const ratio = buy21 / buy24;
      result.ratio21to24 = ratio;
      
      // Expected ratio for Egypt: ~0.84-0.90 (21k is 87.5% of 24k, but market spreads vary)
      if (ratio < 0.84 || ratio > 0.90) {
        result.errors.push(`Ratio 21k/24k out of expected range: ${ratio.toFixed(3)} (expected 0.84-0.90)`);
        result.score -= 30;
      }
    }

    // Range checks: 21k 3000-15000, 24k 3500-17000
    if (buy21 !== null && isFinite(buy21)) {
      if (buy21 < 3000 || buy21 > 15000) {
        result.errors.push(`21k buy price out of range: ${buy21} (expected 3000-15000)`);
        result.score -= 20;
      }
    }
    if (sell21 !== null && isFinite(sell21)) {
      if (sell21 < 3000 || sell21 > 15000) {
        result.errors.push(`21k sell price out of range: ${sell21} (expected 3000-15000)`);
        result.score -= 20;
      }
    }
    if (buy24 !== null && isFinite(buy24)) {
      if (buy24 < 3500 || buy24 > 17000) {
        result.errors.push(`24k buy price out of range: ${buy24} (expected 3500-17000)`);
        result.score -= 20;
      }
    }
    if (sell24 !== null && isFinite(sell24)) {
      if (sell24 < 3500 || sell24 > 17000) {
        result.errors.push(`24k sell price out of range: ${sell24} (expected 3500-17000)`);
        result.score -= 20;
      }
    }

    // Check buy >= sell
    if (buy21 !== null && sell21 !== null && isFinite(buy21) && isFinite(sell21)) {
      if (buy21 < sell21) {
        result.errors.push(`21k buy (${buy21}) < sell (${sell21})`);
        result.score -= 10;
      } else {
        const spread = ((buy21 - sell21) / sell21) * 100;
        result.spread21Pct = spread;
        if (spread > 3) {
          result.warnings.push(`21k spread too wide: ${spread.toFixed(2)}% (expected <= 3%)`);
          result.score -= 10;
        }
      }
    }
    if (buy24 !== null && sell24 !== null && isFinite(buy24) && isFinite(sell24)) {
      if (buy24 < sell24) {
        result.errors.push(`24k buy (${buy24}) < sell (${sell24})`);
        result.score -= 10;
      } else {
        const spread = ((buy24 - sell24) / sell24) * 100;
        result.spread24Pct = spread;
        if (spread > 3) {
          result.warnings.push(`24k spread too wide: ${spread.toFixed(2)}% (expected <= 3%)`);
          result.score -= 10;
        }
      }
    }

    // Check 21k < 24k
    if (buy21 !== null && buy24 !== null && isFinite(buy21) && isFinite(buy24)) {
      if (buy21 >= buy24) {
        result.errors.push(`21k buy (${buy21}) >= 24k buy (${buy24})`);
        result.score -= 30;
      }
    }
    if (sell21 !== null && sell24 !== null && isFinite(sell21) && isFinite(sell24)) {
      if (sell21 >= sell24) {
        result.errors.push(`21k sell (${sell21}) >= 24k sell (${sell24})`);
        result.score -= 30;
      }
    }

    // Mark as valid if score > 0 and no critical errors
    result.valid = result.score > 0 && result.errors.length === 0;
    
    // Ensure score doesn't go below 0
    result.score = Math.max(0, result.score);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errors.push(`Test failed: ${errorMessage}`);
    result.score = 0;
    return result;
  }
}
