/**
 * Test Notification Evaluation API
 * 
 * GET /api/notifications/test-evaluate
 * Evaluates user's notifications against latest market data (dry run)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerUser } from '@/lib/supabase/server-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getServerUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();
    
    // Get user's enabled notifications
    const { data: notifications, error: notifError } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('enabled', true);

    if (notifError) {
      return NextResponse.json({ error: notifError.message }, { status: 400 });
    }

    if (!notifications || notifications.length === 0) {
      return NextResponse.json({ 
        triggered: [],
        message: 'No enabled notifications found' 
      });
    }

    // Fetch latest market data for each unique country
    const countries = [...new Set(notifications.map((n: any) => n.country))];
    const marketDataMap: Record<string, any> = {};

    for (const country of countries) {
      try {
        const marketUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/marketSnapshot?country=${country}`;
        const marketRes = await fetch(marketUrl, { cache: 'no-store' });
        if (marketRes.ok) {
          marketDataMap[country] = await marketRes.json();
        }
      } catch (err) {
        console.error(`Error fetching market data for ${country}:`, err);
      }
    }

    // Evaluate each notification
    const triggered: any[] = [];

    for (const notif of notifications) {
      const marketData = marketDataMap[notif.country];
      if (!marketData || !marketData.market || !marketData.market.median) {
        continue;
      }

      const karatKey = `market${notif.karat}Buy` as keyof typeof marketData.market.median;
      const currentPrice = marketData.market.median[karatKey] as number | null;

      if (currentPrice === null || currentPrice === undefined) {
        continue;
      }

      let shouldTrigger = false;
      if (notif.direction === 'above' && currentPrice >= notif.threshold_value) {
        shouldTrigger = true;
      } else if (notif.direction === 'below' && currentPrice <= notif.threshold_value) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        triggered.push({
          notification_id: notif.id,
          country: notif.country,
          karat: notif.karat,
          threshold_value: notif.threshold_value,
          current_price: currentPrice,
          direction: notif.direction,
          currency: notif.currency,
        });
      }
    }

    return NextResponse.json({
      triggered,
      total_notifications: notifications.length,
      evaluated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Test evaluate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

