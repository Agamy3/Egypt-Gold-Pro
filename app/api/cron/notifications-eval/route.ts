/**
 * Notification Evaluation Cron Job
 * 
 * Evaluates all enabled notification rules and sends notifications when triggered
 * 
 * GET /api/cron/notifications-eval?secret=CRON_SECRET
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getMarketMedians } from '@/lib/supabase/queries-norm';
import { getMultiCurrencyRates, convertMoney, getCountryCurrency } from '@/lib/fx-multi';
import { sendEmail } from '@/lib/email/mailer';
import { formatNotificationEmail } from '@/lib/email';
import { sendPushNotification } from '@/lib/push';

export const dynamic = 'force-dynamic';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Currency = 'EGP' | 'USD' | 'AED' | 'SAR';

interface NotificationRule {
  id: number;
  user_id: string;
  country: Country;
  karat: number;
  side: 'buy' | 'sell';
  currency: Currency;
  direction: 'above' | 'below';
  threshold: number;
  cooldown_minutes: number;
  enabled: boolean;
}

function generateDedupeKey(
  country: Country,
  karat: number,
  side: string,
  direction: string,
  threshold: number,
  roundedPrice: number,
  timeBucket: number
): string {
  return `${country}:${karat}:${side}:${direction}:${threshold}:${roundedPrice}:${timeBucket}`;
}

function getTimeBucket(timestamp: number, cooldownMinutes: number): number {
  const cooldownMs = cooldownMinutes * 60 * 1000;
  return Math.floor(timestamp / cooldownMs);
}

async function evaluateRule(
  rule: NotificationRule,
  currentPrice: number,
  userEmail: string,
  siteUrl: string
): Promise<{ triggered: boolean; deliveryId?: number; error?: string }> {
  const triggered =
    (rule.direction === 'above' && currentPrice >= rule.threshold) ||
    (rule.direction === 'below' && currentPrice <= rule.threshold);

  if (!triggered) {
    return { triggered: false };
  }

  // Check cooldown - generate dedupe key
  const now = Date.now();
  const roundedPrice = Math.round(currentPrice * 100) / 100;
  const timeBucket = getTimeBucket(now, rule.cooldown_minutes);
  const dedupeKey = generateDedupeKey(
    rule.country,
    rule.karat,
    rule.side,
    rule.direction,
    rule.threshold,
    roundedPrice,
    timeBucket
  );

  const supabaseAdmin = getServerClient();

  // Check if we already sent this notification (dedupe)
  const { data: existingDelivery } = await supabaseAdmin
    .from('notification_deliveries')
    .select('id')
    .eq('rule_id', rule.id)
    .eq('dedupe_key', dedupeKey)
    .single();

  if (existingDelivery) {
    // Already sent in this time bucket
    return { triggered: true };
  }

  // Get user profile to check notification preferences
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('email_notifications_enabled, push_notifications_enabled')
    .eq('id', rule.user_id)
    .single();

  const emailEnabled = profile?.email_notifications_enabled ?? true;
  const pushEnabled = profile?.push_notifications_enabled ?? true; // Enable push by default

  let emailSent = false;
  let pushSent = false;
  let emailError: string | undefined;
  let pushError: string | undefined;

  // Send email if enabled
  if (emailEnabled) {
    const { subject, html } = formatNotificationEmail(
      rule.country,
      rule.karat,
      rule.side,
      rule.currency,
      rule.direction,
      rule.threshold,
      currentPrice,
      siteUrl
    );

    const emailResult = await sendEmail({
      to: userEmail,
      subject,
      html,
    });

    emailSent = emailResult.success;
    if (!emailResult.success) {
      emailError = emailResult.error;
    }
  }

  // Send push if enabled and user has subscriptions
  if (pushEnabled) {
    const { data: subscriptions } = await supabaseAdmin
      .from('web_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', rule.user_id);

    if (subscriptions && subscriptions.length > 0) {
      for (const sub of subscriptions) {
        const pushResult = await sendPushNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          {
            title: `Gold Price Alert: ${rule.country} ${rule.karat}k`,
            body: `Price ${rule.direction === 'above' ? 'exceeded' : 'dropped below'} ${rule.currency} ${rule.threshold.toFixed(2)}`,
            url: `${siteUrl}/portfolio`,
          }
        );

        if (pushResult.success) {
          pushSent = true;
        } else {
          pushError = pushResult.error;
          // If subscription expired, remove it
          if (pushResult.error === 'Subscription expired') {
            await supabaseAdmin
              .from('web_push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint);
          }
        }
      }
    }
  }

  // Log delivery
  const deliveryStatus = emailSent || pushSent ? 'sent' : 'failed';
  const deliveryErrorMessage = emailError || pushError || undefined;

  const { data: delivery, error: deliveryDbError } = await supabaseAdmin
    .from('notification_deliveries')
    .insert({
      rule_id: rule.id,
      user_id: rule.user_id,
      channel: emailSent ? 'email' : pushSent ? 'push' : 'email', // Default to email if both failed
      status: deliveryStatus,
      error: deliveryErrorMessage,
      dedupe_key: dedupeKey,
    })
    .select()
    .single();

  if (deliveryDbError) {
    console.error('Error logging delivery:', deliveryDbError);
  }

  return {
    triggered: true,
    deliveryId: delivery?.id,
    error: deliveryErrorMessage,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getServerClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com';

    // Fetch all enabled rules
    const { data: rules, error: rulesError } = await supabaseAdmin
      .from('user_notification_rules')
      .select('*')
      .eq('enabled', true);

    if (rulesError) {
      console.error('Error fetching rules:', rulesError);
      return NextResponse.json({ error: rulesError.message }, { status: 500 });
    }

    if (!rules || rules.length === 0) {
      return NextResponse.json({ message: 'No enabled rules to evaluate', evaluated: 0 });
    }

    // Group rules by country for efficient market data fetching
    const rulesByCountry = new Map<Country, NotificationRule[]>();
    for (const rule of rules as NotificationRule[]) {
      const existing = rulesByCountry.get(rule.country) || [];
      rulesByCountry.set(rule.country, [...existing, rule]);
    }

    const results = {
      evaluated: 0,
      triggered: 0,
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Fetch FX rates once
    const fxRates = await getMultiCurrencyRates();

    // Process each country
    for (const [country, countryRules] of rulesByCountry.entries()) {
      try {
        // Fetch market data for this country
        const marketData = await getMarketMedians(country, true, 60);
        const canonicalCurrency = getCountryCurrency(country);

        // Get user emails for these rules
        const userIds = [...new Set(countryRules.map((r) => r.user_id))];
        const { data: users } = await supabaseAdmin
          .from('user_profiles')
          .select('id, email')
          .in('id', userIds);

        const userEmailMap = new Map(
          users?.map((u) => [u.id, u.email]) || []
        );

        // Evaluate each rule
        for (const rule of countryRules) {
          results.evaluated++;

          try {
            // Get current price for this karat and side
            const priceKey = `market${rule.karat}${rule.side === 'buy' ? 'Buy' : 'Sell'}` as keyof typeof marketData.prices;
            const priceCanonical = marketData.prices[priceKey] as number | null;

            if (!priceCanonical) {
              continue; // No price data available
            }

            // Convert to rule's currency if needed
            const currentPrice =
              rule.currency === canonicalCurrency
                ? priceCanonical
                : convertMoney(priceCanonical, canonicalCurrency, rule.currency, fxRates);

            if (currentPrice === null) {
              results.errors.push(`Cannot convert price for rule ${rule.id}: FX rate unavailable`);
              continue;
            }

            const userEmail = userEmailMap.get(rule.user_id);
            if (!userEmail) {
              results.errors.push(`User email not found for rule ${rule.id}`);
              continue;
            }

            const evalResult = await evaluateRule(rule, currentPrice, userEmail, siteUrl);

            if (evalResult.triggered) {
              results.triggered++;
              if (evalResult.deliveryId) {
                results.sent++;
              } else {
                results.failed++;
                if (evalResult.error) {
                  results.errors.push(`Rule ${rule.id}: ${evalResult.error}`);
                }
              }
            }
          } catch (ruleError) {
            results.failed++;
            results.errors.push(
              `Error evaluating rule ${rule.id}: ${ruleError instanceof Error ? ruleError.message : 'Unknown error'}`
            );
          }
        }
      } catch (countryError) {
        results.errors.push(
          `Error processing country ${country}: ${countryError instanceof Error ? countryError.message : 'Unknown error'}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Notification evaluation error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

