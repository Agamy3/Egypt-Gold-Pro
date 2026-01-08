/**
 * Prices API Endpoint
 * 
 * GET /api/prices - Returns latest price data
 */

import { NextResponse } from 'next/server';
import { runIngestionCycle } from '@/lib/gold-ingestion-engine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Cache latest result in memory
let cachedResult: any = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache

export async function GET() {
  try {
    // Check cache
    const now = Date.now();
    if (cachedResult && (now - lastCacheTime) < CACHE_TTL_MS) {
      return NextResponse.json(cachedResult);
    }

    // Run ingestion cycle
    const result = await runIngestionCycle();
    
    // Update cache
    cachedResult = result;
    lastCacheTime = now;

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Prices API error:', errorMessage);
    
    // Return cached result if available, even if stale
    if (cachedResult) {
      return NextResponse.json(cachedResult);
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch prices',
        errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}


