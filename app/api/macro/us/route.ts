/**
 * US Macro Data API
 * 
 * GET /api/macro/us
 */

import { NextResponse } from 'next/server';
import { getFredSeries } from '@/lib/macro/fred';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

export async function GET() {
  try {
    const [fedFunds, cpi] = await Promise.all([
      getFredSeries('FEDFUNDS'),
      getFredSeries('CPIAUCSL'),
    ]);

    return NextResponse.json({
      fedFunds: fedFunds ? { value: fedFunds.value, date: fedFunds.date } : null,
      cpi: cpi ? { value: cpi.value, date: cpi.date } : null,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API /macro/us] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

