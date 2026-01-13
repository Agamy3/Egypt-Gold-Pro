/**
 * Market Forecast API
 * 
 * Returns directional forecast for 21k gold prices
 * Uses stored snapshot data (no external ML services)
 */

import { NextResponse } from 'next/server';
import { calculateForecast } from '@/lib/forecast';

// Trusted source configuration (safe defaults, no undefined errors)
// Helper to get trusted mode from request
function getTrustedMode(request: Request): boolean {
  const url = new URL(request.url);
  const queryOverride = url.searchParams.get('trustedMode');
  if (queryOverride !== null) {
    return queryOverride === 'true';
  }
  
  const headerOverride = request.headers.get('x-trusted-mode');
  if (headerOverride !== null) {
    return headerOverride === 'true';
  }
  
  return (
    process.env.EGYPT_TRUSTED_ONLY_MODE === 'true' ||
    process.env.NEXT_PUBLIC_EGYPT_TRUSTED_ONLY_MODE === 'true'
  );
}

const TRUSTED_EGYPT_SOURCE = 'goldbullioneg';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    // Get parameters from request
    const { searchParams } = new URL(request.url);
    const countryParam = searchParams.get('country');
    const country = (['EG', 'AE', 'SA', 'US'].includes(countryParam || '') 
      ? countryParam 
      : 'EG') as 'EG' | 'AE' | 'SA' | 'US';

    // Get time range and scope parameters
    const timeRangeParam = searchParams.get('timeRange') || searchParams.get('range');
    const timeRange = (['daily', 'weekly', 'monthly', 'yoy'].includes(timeRangeParam || '') 
      ? timeRangeParam 
      : 'daily') as 'daily' | 'weekly' | 'monthly' | 'yoy';
    
    const scopeParam = searchParams.get('scope');
    const scope = (['local', 'global'].includes(scopeParam || '') 
      ? scopeParam 
      : 'local') as 'local' | 'global';

    // Get trusted mode from request
    const EGYPT_TRUSTED_ONLY_MODE = getTrustedMode(request);

    // Calculate forecast with trusted mode, country, time range, and scope from request
    // calculateForecast will check for sufficient data (at least 10 snapshots in window)
    const forecast = await calculateForecast(country, EGYPT_TRUSTED_ONLY_MODE, timeRange, scope);
    
    // Override message if trusted source unavailable and forecast is insufficient
    let message: string | undefined = undefined;
    if (forecast.insufficientData && EGYPT_TRUSTED_ONLY_MODE) {
      message = `Insufficient data: trusted Egypt source (${TRUSTED_EGYPT_SOURCE}) unavailable`;
    }

    return NextResponse.json({
      timestamp: Date.now(),
      insufficientData: forecast.insufficientData,
      message,
      forecast: forecast.insufficientData ? null : {
        direction: forecast.direction,
        confidence: forecast.confidence,
        horizonMinutes: forecast.horizonMinutes,
        score: forecast.score,
        components: forecast.components,
        reasons: forecast.reasons,
        snapshotCount: forecast.snapshotCount,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Forecast API error:', errorMessage);
    
    return NextResponse.json(
      {
        timestamp: Date.now(),
        insufficientData: true,
        error: 'Failed to calculate forecast',
        errorMessage,
        forecast: null,
      },
      { status: 200 } // Always return 200, even on error
    );
  }
}

