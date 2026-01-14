/**
 * Price Change Notification Cron Job v2
 * 
 * Checks for price changes >= 0.5% and user custom rules, sends notifications
 * 
 * GET /api/cron/notify-price-changes?secret=CRON_SECRET
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { checkAllPriceChanges, evaluateUserRules } from '@/lib/price-change-detector-v2';
import { sendPushNotification } from '@/lib/push';
import { sendNotificationEmail, formatPriceChangeEmail } from '@/lib/email/resend';
import { getCountryCurrency } from '@/lib/fx-multi';

export const dynamic = 'force-dynamic';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Karat = 14 | 18 | 21 | 22 | 24;

const countryNames: Record<Country, string> = {
  EG: 'Egypt',
  AE: 'UAE',
  SA: 'Saudi Arabia',
  US: 'USA',
};

/**
 * Get users watching a specific country
 */
async function getUsersWatchingCountry(country: Country): Promise<string[]> {
  const supabase = getServerClient();
  
  // Get users with explicit watchlist entries for this country
  const { data: watchlistUsers } = await supabase
    .from('user_country_watchlist')
    .select('user_id')
    .eq('country', country)
    .eq('enabled', true);

  const watchlistUserIds = watchlistUsers?.map((w) => w.user_id) || [];

  // Also get users with preferred_country matching (if no explicit watchlist)
  const { data: profileUsers } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('preferred_country', country);

  const profileUserIds = profileUsers?.map((p) => p.id) || [];

  // Combine and dedupe
  const allUserIds = [...new Set([...watchlistUserIds, ...profileUserIds])];

  return allUserIds;
}

/**
 * Send push notification to user
 */
async function sendPushToUser(
  userId: string,
  country: Country,
  karat: Karat,
  direction: 'UP' | 'DOWN',
  pctChange: number,
  newPrice: number,
  currency: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServerClient();
  
  // Get user's push subscriptions
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subscriptions || subscriptions.length === 0) {
    return { success: false, error: 'No push subscriptions' };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com';
  const countryName = countryNames[country];
  const pctFormatted = (pctChange * 100).toFixed(2);
  const priceFormatted = newPrice.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const title = `${countryName} Gold Update`;
  const body = `${karat}k ${direction} ${pctFormatted}% → ${currency} ${priceFormatted}`;
  const url = `${siteUrl}/?country=${country}&currency=${currency}`;

  let successCount = 0;
  let lastError: string | undefined;

  for (const sub of subscriptions) {
    const result = await sendPushNotification(
      {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      },
      {
        title,
        body,
        url,
      }
    );

    if (result.success) {
      successCount++;
    } else {
      lastError = result.error;
      // If subscription expired, remove it
      if (result.error === 'Subscription expired') {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', sub.endpoint);
      }
    }
  }

  return {
    success: successCount > 0,
    error: successCount === 0 ? lastError : undefined,
  };
}

/**
 * Send email notification to user
 */
async function sendEmailToUser(
  userId: string,
  email: string,
  country: Country,
  karat: Karat,
  direction: 'UP' | 'DOWN',
  pctChange: number,
  oldPrice: number,
  newPrice: number,
  currency: string
): Promise<{ success: boolean; error?: string }> {
  const { subject, html, text } = formatPriceChangeEmail(
    country,
    karat,
    direction,
    pctChange,
    oldPrice,
    newPrice,
    currency
  );

  const result = await sendNotificationEmail({
    to: email,
    subject,
    html,
    text,
  });

  return result;
}

/**
 * Log notification delivery
 */
async function logDelivery(
  userId: string,
  country: Country,
  karat: Karat,
  channel: 'email' | 'push',
  status: 'sent' | 'failed' | 'skipped',
  priceChangePct: number,
  price: number,
  currency: string,
  direction: 'UP' | 'DOWN',
  error?: string,
  payload?: any
): Promise<void> {
  const supabase = getServerClient();
  
  await supabase.from('notification_deliveries_log').insert({
    user_id: userId,
    country,
    karat,
    channel,
    status,
    price_change_pct: priceChangePct,
    price,
    currency,
    direction,
    error: error || null,
    payload: payload || null,
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const expectedSecret = process.env.CRON_SECRET;

    // Detect Vercel Cron (requests from Vercel Cron include this header)
    const isVercelCron = !!request.headers.get('x-vercel-cron');

    if (!isVercelCron) {
      // For manual calls (e.g. curl), require the secret via query param or Authorization header
      const secret =
        searchParams.get('secret') ||
        request.headers.get('authorization')?.replace('Bearer ', '');

      if (!expectedSecret) {
        console.error('CRON_SECRET not configured in environment variables');
        return NextResponse.json(
          { error: 'Server configuration error' },
          { status: 500 }
        );
      }

      if (!secret || secret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      // For Vercel Cron, we trust the platform and only require that CRON_SECRET exists
      if (!expectedSecret) {
        console.warn(
          '[notify-price-changes] CRON_SECRET not configured; Vercel Cron requests will still be allowed'
        );
      }
    }

    const supabase = getServerClient();
    const results = {
      checked: 0,
      triggered: 0,
      userRulesTriggered: 0,
      notificationsSent: 0,
      notificationsFailed: 0,
      errors: [] as string[],
    };

    // Check global price changes (0.5% threshold)
    const priceChanges = await checkAllPriceChanges();
    results.checked = priceChanges.length;

    // Process triggered global changes
    for (const change of priceChanges) {
      if (!change.triggered || !change.direction || !change.pctChange || !change.oldPrice || !change.newPrice) {
        continue;
      }

      results.triggered++;

      try {
        // Get users watching this country
        const userIds = await getUsersWatchingCountry(change.country);
        
        if (userIds.length === 0) {
          continue; // No users watching this country
        }

        const currency = getCountryCurrency(change.country);

        // Get user profiles to check preferences and emails
        const { data: profiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('id, email, email_notifications_enabled, app_notifications_enabled')
          .in('id', userIds);

        if (profilesError) {
          console.error(`Error fetching profiles for ${change.country} ${change.karat}k:`, profilesError);
          results.errors.push(`Error fetching profiles: ${profilesError.message}`);
          continue;
        }

        if (!profiles || profiles.length === 0) {
          console.log(`No profiles found for users watching ${change.country}`);
          continue;
        }

        // Send notifications to each user
        for (const profile of profiles) {
          const emailEnabled = profile.email_notifications_enabled ?? true;
          const pushEnabled = profile.app_notifications_enabled ?? false;

          // Send email if enabled
          if (emailEnabled) {
            if (!profile.email) {
              console.warn(`User ${profile.id} has email notifications enabled but no email address`);
              await logDelivery(
                profile.id,
                change.country,
                change.karat,
                'email',
                'skipped',
                change.pctChange,
                change.newPrice,
                currency,
                change.direction,
                'No email address in profile',
                { type: 'global_alert' }
              );
              continue;
            }

            console.log(`Sending email to ${profile.email} for ${change.country} ${change.karat}k ${change.direction} ${change.pctChange * 100}%`);
            
            const emailResult = await sendEmailToUser(
              profile.id,
              profile.email,
              change.country,
              change.karat,
              change.direction,
              change.pctChange,
              change.oldPrice,
              change.newPrice,
              currency
            );

            await logDelivery(
              profile.id,
              change.country,
              change.karat,
              'email',
              emailResult.success ? 'sent' : 'failed',
              change.pctChange,
              change.newPrice,
              currency,
              change.direction,
              emailResult.error,
              { email: profile.email, type: 'global_alert' }
            );

            if (emailResult.success) {
              results.notificationsSent++;
              console.log(`Email sent successfully to ${profile.email}`);
            } else {
              results.notificationsFailed++;
              const errorMsg = `Email failed for user ${profile.id} (${profile.email}): ${emailResult.error}`;
              console.error(errorMsg);
              results.errors.push(errorMsg);
            }
          }

          // Send push if enabled
          if (pushEnabled) {
            const pushResult = await sendPushToUser(
              profile.id,
              change.country,
              change.karat,
              change.direction,
              change.pctChange,
              change.newPrice,
              currency
            );

            await logDelivery(
              profile.id,
              change.country,
              change.karat,
              'push',
              pushResult.success ? 'sent' : 'failed',
              change.pctChange,
              change.newPrice,
              currency,
              change.direction,
              pushResult.error
            );

            if (pushResult.success) {
              results.notificationsSent++;
            } else {
              results.notificationsFailed++;
              results.errors.push(`Push failed for user ${profile.id}: ${pushResult.error}`);
            }
          }
        }
      } catch (error) {
        results.errors.push(
          `Error processing ${change.country} ${change.karat}k: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Check user custom price alert rules
    const userRuleTriggers = await evaluateUserRules();
    results.userRulesTriggered = userRuleTriggers.length;

    for (const trigger of userRuleTriggers) {
      try {
        // Get user profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, email, email_notifications_enabled, app_notifications_enabled')
          .eq('id', trigger.userId)
          .single();

        if (!profile) {
          continue;
        }

        const emailEnabled = profile.email_notifications_enabled ?? true;
        const pushEnabled = profile.app_notifications_enabled ?? false;

        // Calculate pct change (approximate from threshold)
        const pctChange = Math.abs((trigger.currentPrice - trigger.thresholdPrice) / trigger.thresholdPrice);

        // Send email if enabled
        if (emailEnabled) {
          if (!profile.email) {
            console.warn(`User ${profile.id} has email notifications enabled but no email address (rule ${trigger.ruleId})`);
            await logDelivery(
              profile.id,
              trigger.country,
              trigger.karat,
              'email',
              'skipped',
              pctChange,
              trigger.currentPrice,
              trigger.currency,
              trigger.direction,
              'No email address in profile',
              { ruleId: trigger.ruleId }
            );
            continue;
          }

          console.log(`Sending email to ${profile.email} for rule ${trigger.ruleId} (${trigger.country} ${trigger.karat}k)`);
          
          const { subject, html, text } = formatPriceChangeEmail(
            trigger.country,
            trigger.karat,
            trigger.direction,
            pctChange,
            trigger.thresholdPrice,
            trigger.currentPrice,
            trigger.currency
          );

          const emailResult = await sendNotificationEmail({
            to: profile.email,
            subject,
            html,
            text,
          });

          await logDelivery(
            profile.id,
            trigger.country,
            trigger.karat,
            'email',
            emailResult.success ? 'sent' : 'failed',
            pctChange,
            trigger.currentPrice,
            trigger.currency,
            trigger.direction,
            emailResult.error,
            { ruleId: trigger.ruleId, email: profile.email }
          );

          if (emailResult.success) {
            results.notificationsSent++;
            console.log(`Email sent successfully to ${profile.email} for rule ${trigger.ruleId}`);
          } else {
            results.notificationsFailed++;
            const errorMsg = `Email failed for user ${profile.id} (${profile.email}, rule ${trigger.ruleId}): ${emailResult.error}`;
            console.error(errorMsg);
            results.errors.push(errorMsg);
          }
        }

        // Send push if enabled
        if (pushEnabled) {
          const pushResult = await sendPushToUser(
            profile.id,
            trigger.country,
            trigger.karat,
            trigger.direction,
            pctChange,
            trigger.currentPrice,
            trigger.currency
          );

          await logDelivery(
            profile.id,
            trigger.country,
            trigger.karat,
            'push',
            pushResult.success ? 'sent' : 'failed',
            pctChange,
            trigger.currentPrice,
            trigger.currency,
            trigger.direction,
            pushResult.error,
            { ruleId: trigger.ruleId }
          );

          if (pushResult.success) {
            results.notificationsSent++;
          } else {
            results.notificationsFailed++;
            results.errors.push(`Push failed for user ${profile.id}: ${pushResult.error}`);
          }
        }
      } catch (error) {
        results.errors.push(
          `Error processing rule ${trigger.ruleId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Price change notification error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

