/**
 * USD/EGP FX Rate API
 * 
 * Returns real USD→EGP exchange rate from exchangerate.host
 */

import { NextResponse } from 'next/server';
import { fetchUsdEgp } from '@/lib/fx';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const result = await fetchUsdEgp();
    
    return NextResponse.json({
      timestamp: Date.now(),
      usdEgp: result.usdEgp,
      source: result.source,
      stale: result.stale,
      error: result.error,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('FX API error:', errorMessage);
    
    return NextResponse.json({
      timestamp: Date.now(),
      usdEgp: null,
      source: 'exchangerate.host',
      stale: false,
      error: errorMessage,
    }, { status: 200 }); // Always return 200, never 500
  }
}


