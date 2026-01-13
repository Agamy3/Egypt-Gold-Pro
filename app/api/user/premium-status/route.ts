/**
 * User Premium Status API
 * 
 * GET /api/user/premium-status
 */

import { NextResponse } from 'next/server';
import { getUserPremiumStatus } from '@/lib/auth/getUserPremiumStatus';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getUserPremiumStatus();
    return NextResponse.json({ status });
  } catch (error) {
    console.error('[API /user/premium-status] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

