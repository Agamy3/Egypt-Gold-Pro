/**
 * Notification Send API (Admin/Cron)
 * 
 * POST /api/notifications/send
 * Evaluates all enabled notifications and sends emails
 * Protected by CRON_SECRET
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient as createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // Get all enabled notifications
    const { data: notifications, error: notifError } = await supabaseAdmin
      .from('user_notifications')
      .select('*, user_profiles!inner(email, display_name)')
      .eq('enabled', true);

    if (notifError) {
      return NextResponse.json({ error: notifError.message }, { status: 400 });
    }

    if (!notifications || notifications.length === 0) {
      return NextResponse.json({ 
        sent: 0,
        message: 'No enabled notifications found' 
      });
    }

    // Fetch market data for all countries
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

    // Evaluate and send notifications
    const sent: any[] = [];
    const errors: any[] = [];

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

      if (!shouldTrigger) {
        continue;
      }

      // Send email if channel is email
      if (notif.channel === 'email') {
        try {
          // Try Supabase Auth email first (if configured)
          // Otherwise log and skip (email provider not configured)
          const userProfile = (notif as any).user_profiles;
          const emailSent = await sendNotificationEmail(
            userProfile.email,
            notif,
            currentPrice,
            marketData.market.median,
            notif.currency
          );

          if (emailSent) {
            // Record delivery
            await supabaseAdmin.from('notification_deliveries').insert({
              notification_id: notif.id,
              status: 'sent',
              last_sent_at: new Date().toISOString(),
            });

            sent.push({
              notification_id: notif.id,
              email: userProfile.email,
            });
          } else {
            errors.push({
              notification_id: notif.id,
              error: 'Email provider not configured',
            });
          }
        } catch (err) {
          console.error(`Error sending email for notification ${notif.id}:`, err);
          
          await supabaseAdmin.from('notification_deliveries').insert({
            notification_id: notif.id,
            status: 'failed',
            last_error: err instanceof Error ? err.message : 'Unknown error',
          });

          errors.push({
            notification_id: notif.id,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    return NextResponse.json({
      sent: sent.length,
      errors: errors.length,
      details: {
        sent,
        errors,
      },
      evaluated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Notification send error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Send notification email
 * Returns true if email was sent, false if provider not configured
 */
async function sendNotificationEmail(
  email: string,
  notification: any,
  currentPrice: number,
  marketMedians: any,
  currency: string
): Promise<boolean> {
  // Check if email provider is configured
  // For now, just log and return false (email not configured)
  // In production, integrate with Resend/Sendgrid/Supabase SMTP
  
  console.log('Notification email would be sent:', {
    to: email,
    notification_id: notification.id,
    current_price: currentPrice,
    threshold: notification.threshold_value,
    currency,
  });

  // TODO: Implement email sending
  // If using Resend:
  //   - Check for RESEND_API_KEY
  //   - Use Resend API to send email
  // If using Sendgrid:
  //   - Check for SENDGRID_API_KEY
  //   - Use Sendgrid API to send email
  // If using Supabase SMTP:
  //   - Configure in Supabase dashboard
  //   - Use Supabase Auth API

  return false; // Email provider not configured
}

