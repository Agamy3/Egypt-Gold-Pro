/**
 * Ad Visibility Check API
 * 
 * Returns whether ads should be shown for the current user
 */

import { NextResponse } from 'next/server';
import { shouldShowAds } from '@/lib/auth/shouldShowAds';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await shouldShowAds();
    return NextResponse.json({
      shouldShow: result.shouldShow,
      reason: result.reason,
    });
  } catch (error) {
    console.error('[Ads Check API] Error:', error);
    // On error, default to not showing ads
    return NextResponse.json({
      shouldShow: false,
      reason: 'Error checking ad visibility',
    });
  }
}

