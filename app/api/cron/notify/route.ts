/**
 * Notification Cron Job
 * 
 * GET /api/cron/notify?secret=CRON_SECRET
 * 
 * Handles all notification triggers:
 * Q1) Price move >= 0.5% (with cooldown)
 * Q2) Custom threshold crossing (one-time)
 * Q3) Portfolio P/L >= 5% (one-time)
 * Q4) Daily summary at 12:00 AM Egypt time
 * Q5) Weekly outlook at 12:00 AM Egypt time each Friday
 * Q6) Macro events
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getMarketMedians } from '@/lib/supabase/queries-norm';
import { getCountryCurrency, getMultiCurrencyRates, convertMoney } from '@/lib/fx-multi';
import { sendPushNotification } from '@/lib/push';
import { sendNotificationEmail, formatPriceChangeEmail } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Karat = 14 | 18 | 21 | 24;

const countryNames: Record<Country, string> = {
  EG: 'Egypt',
  AE: 'UAE',
  SA: 'Saudi Arabia',
  US: 'USA',
};

/**
 * Check if user is offline (no activity in last 5 minutes)
 */
async function isUserOffline(userId: string): Promise<boolean> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from('user_activity')
    .select('last_seen_at')
    .eq('user_id', userId)
    .single();

  if (!data) {
    return true; // No activity record = offline
  }

  const lastSeen = new Date(data.last_seen_at);
  const now = new Date();
  const minutesSinceLastSeen = (now.getTime() - lastSeen.getTime()) / (1000 * 60);

  return minutesSinceLastSeen > 5;
}

/**
 * Create in-app notification
 */
async function createInAppNotification(
  userId: string,
  country: Country | null,
  title: string,
  body: string,
  url: string | null,
  kind: 'alert' | 'summary' | 'macro' = 'alert'
) {
  const supabase = getServerClient();
  await supabase
    .from('in_app_notifications')
    .insert({
      user_id: userId,
      country,
      title,
      body,
      url,
      kind,
    });
}

/**
 * Log delivery
 */
async function logDelivery(
  userId: string,
  ruleId: number | null,
  channel: 'inapp' | 'push' | 'email',
  status: 'sent' | 'failed' | 'skipped',
  payload: any,
  error: string | null = null
) {
  const supabase = getServerClient();
  await supabase
    .from('notification_deliveries_log')
    .insert({
      user_id: userId,
      rule_id: ruleId,
      channel,
      status,
      payload,
      error,
    });
}

/**
 * Get users watching a country
 */
async function getUsersWatchingCountry(country: Country): Promise<string[]> {
  const supabase = getServerClient();
  
  const { data: watchlist } = await supabase
    .from('user_country_watchlist')
    .select('user_id')
    .eq('country', country)
    .eq('enabled', true);

  const watchlistUserIds = watchlist?.map((w) => w.user_id) || [];

  // Fallback to preferred_country
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('preferred_country', country);

  const profileUserIds = profiles?.map((p) => p.id) || [];

  return [...new Set([...watchlistUserIds, ...profileUserIds])];
}

/**
 * Q1: Price move >= 0.5% check
 */
async function checkPriceMoves() {
  const supabase = getServerClient();
  const countries: Country[] = ['EG', 'AE', 'SA', 'US'];
  const karats: Karat[] = [14, 18, 21, 24];
  const fxRates = await getMultiCurrencyRates();

  for (const country of countries) {
    const userIds = await getUsersWatchingCountry(country);
    if (userIds.length === 0) continue;

    const marketData = await getMarketMedians(country, false, 60);
    const canonicalCurrency = getCountryCurrency(country);

    for (const karat of karats) {
      const priceKey = `market${karat}Buy` as keyof typeof marketData.prices;
      const currentPrice = marketData.prices[priceKey] as number | null;

      if (!currentPrice || currentPrice <= 0) continue;

      // Get rules for this country/karat
      const { data: rules } = await supabase
        .from('notification_rules')
        .select('*')
        .eq('type', 'price_move_pct')
        .eq('country', country)
        .eq('karat', karat)
        .eq('enabled', true)
        .in('user_id', userIds);

      if (!rules || rules.length === 0) continue;

      for (const rule of rules) {
        // Get state for cooldown check
        const { data: state } = await supabase
          .from('notification_state')
          .select('*')
          .eq('user_id', rule.user_id)
          .eq('rule_id', rule.id)
          .single();

        if (state) {
          const lastSent = new Date(state.last_sent_at);
          const now = new Date();
          const minutesSinceLastSent = (now.getTime() - lastSent.getTime()) / (1000 * 60);

          // Cooldown: 30 minutes
          if (minutesSinceLastSent < 30) continue;

          const lastPrice = state.last_value;
          if (lastPrice) {
            const pctChange = (currentPrice - lastPrice) / lastPrice;
            const absPctChange = Math.abs(pctChange);

            if (absPctChange < 0.005) {
              // Update state but don't trigger
              await supabase
                .from('notification_state')
                .upsert({
                  user_id: rule.user_id,
                  rule_id: rule.id,
                  last_value: currentPrice,
                  last_sent_at: state.last_sent_at,
                  last_direction: state.last_direction,
                });
              continue;
            }

            const direction = pctChange >= 0 ? 'up' : 'down';
            const lastDirection = state.last_direction;

            // Only trigger if direction changed or is first time
            if (direction === lastDirection && lastDirection) {
              // Same direction, update state but don't trigger
              await supabase
                .from('notification_state')
                .upsert({
                  user_id: rule.user_id,
                  rule_id: rule.id,
                  last_value: currentPrice,
                  last_sent_at: state.last_sent_at,
                  last_direction: direction,
                });
              continue;
            }
          }
        }

        // Calculate pct change from last known price or threshold
        const lastPrice = state?.last_value || currentPrice * 0.995; // Assume 0.5% change if no history
        const pctChange = (currentPrice - lastPrice) / lastPrice;
        const absPctChange = Math.abs(pctChange);

        if (absPctChange >= 0.005) {
          const direction = pctChange >= 0 ? 'up' : 'down';
          const directionLabel = direction === 'up' ? 'UP' : 'DOWN';

          // Get user profile
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('email, email_notifications_enabled, push_notifications_enabled')
            .eq('id', rule.user_id)
            .single();

          if (!profile) continue;

          const title = `${countryNames[country]} Gold Update`;
          const body = `${karat}k ${directionLabel} ${(absPctChange * 100).toFixed(2)}% → ${canonicalCurrency} ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com'}/?country=${country}&currency=${canonicalCurrency}`;

          // Always create in-app notification
          await createInAppNotification(rule.user_id, country, title, body, url, 'alert');
          await logDelivery(rule.user_id, rule.id, 'inapp', 'sent', { country, karat, direction, pctChange: absPctChange });

          // Push if offline and enabled
          if (rule.channel_push && profile.push_notifications_enabled) {
            const offline = await isUserOffline(rule.user_id);
            if (offline) {
              const { data: subscriptions } = await supabase
                .from('push_subscriptions')
                .select('endpoint, p256dh, auth')
                .eq('user_id', rule.user_id);

              if (subscriptions && subscriptions.length > 0) {
                for (const sub of subscriptions) {
                  const result = await sendPushNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    { title, body, url }
                  );
                  await logDelivery(rule.user_id, rule.id, 'push', result.success ? 'sent' : 'failed', { endpoint: sub.endpoint }, result.error || null);
                }
              }
            }
          }

          // Email if enabled
          if (rule.channel_email && profile.email_notifications_enabled && profile.email) {
            const { subject, html, text } = formatPriceChangeEmail(
              country,
              karat,
              directionLabel,
              absPctChange,
              lastPrice,
              currentPrice,
              canonicalCurrency
            );
            const emailResult = await sendNotificationEmail({ to: profile.email, subject, html, text });
            await logDelivery(rule.user_id, rule.id, 'email', emailResult.success ? 'sent' : 'failed', { email: profile.email }, emailResult.error || null);
          }

          // Update state
          await supabase
            .from('notification_state')
            .upsert({
              user_id: rule.user_id,
              rule_id: rule.id,
              last_value: currentPrice,
              last_sent_at: new Date().toISOString(),
              last_direction: direction,
            });
        } else {
          // Update state without triggering
          await supabase
            .from('notification_state')
            .upsert({
              user_id: rule.user_id,
              rule_id: rule.id,
              last_value: currentPrice,
              last_sent_at: state?.last_sent_at || null,
              last_direction: state?.last_direction || null,
            });
        }
      }
    }
  }
}

/**
 * Q2: Custom threshold crossing (one-time)
 */
async function checkThresholdCrossings() {
  const supabase = getServerClient();
  const { data: rules } = await supabase
    .from('notification_rules')
    .select('*')
    .eq('type', 'price_threshold_cross')
    .eq('enabled', true)
    .not('country', 'is', null)
    .not('karat', 'is', null)
    .not('threshold_value', 'is', null);

  if (!rules || rules.length === 0) return;

  const fxRates = await getMultiCurrencyRates();

  for (const rule of rules) {
    const country = rule.country as Country;
    const karat = rule.karat as Karat;
    const threshold = rule.threshold_value;

    const marketData = await getMarketMedians(country, false, 60);
    const priceKey = `market${karat}Buy` as keyof typeof marketData.prices;
    const currentPrice = marketData.prices[priceKey] as number | null;

    if (!currentPrice || currentPrice <= 0) continue;

    // Get state
    const { data: state } = await supabase
      .from('notification_state')
      .select('*')
      .eq('user_id', rule.user_id)
      .eq('rule_id', rule.id)
      .single();

    const lastPrice = state?.last_value || null;
    const direction = rule.direction === 'above' ? 'above' : 'below';

    let shouldTrigger = false;

    if (direction === 'above') {
      if (currentPrice >= threshold && (!lastPrice || lastPrice < threshold)) {
        shouldTrigger = true;
      }
    } else {
      if (currentPrice <= threshold && (!lastPrice || lastPrice > threshold)) {
        shouldTrigger = true;
      }
    }

    if (shouldTrigger) {
      // Get user profile
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email, email_notifications_enabled, push_notifications_enabled')
        .eq('id', rule.user_id)
        .single();

      if (!profile) continue;

      const canonicalCurrency = getCountryCurrency(country);
      const title = `${countryNames[country]} Gold Alert`;
      const body = `${karat}k crossed ${direction} ${canonicalCurrency} ${threshold.toLocaleString('en-US', { minimumFractionDigits: 2 })} (Current: ${canonicalCurrency} ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })})`;
      const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com'}/?country=${country}&currency=${canonicalCurrency}`;

      // Always create in-app
      await createInAppNotification(rule.user_id, country, title, body, url, 'alert');
      await logDelivery(rule.user_id, rule.id, 'inapp', 'sent', { country, karat, threshold, direction });

      // Push if offline
      if (rule.channel_push && profile.push_notifications_enabled) {
        const offline = await isUserOffline(rule.user_id);
        if (offline) {
          const { data: subscriptions } = await supabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', rule.user_id);

          if (subscriptions && subscriptions.length > 0) {
            for (const sub of subscriptions) {
              const result = await sendPushNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                { title, body, url }
              );
              await logDelivery(rule.user_id, rule.id, 'push', result.success ? 'sent' : 'failed', { endpoint: sub.endpoint }, result.error || null);
            }
          }
        }
      }

      // Email if enabled
      if (rule.channel_email && profile.email_notifications_enabled && profile.email) {
        const emailResult = await sendNotificationEmail({
          to: profile.email,
          subject: title,
          html: `<p>${body}</p><p><a href="${url}">View Market Data</a></p>`,
        });
        await logDelivery(rule.user_id, rule.id, 'email', emailResult.success ? 'sent' : 'failed', { email: profile.email }, emailResult.error || null);
      }

      // Disable rule (one-time)
      await supabase
        .from('notification_rules')
        .update({ enabled: false })
        .eq('id', rule.id);

      // Update state
      await supabase
        .from('notification_state')
        .upsert({
          user_id: rule.user_id,
          rule_id: rule.id,
          last_value: currentPrice,
          last_sent_at: new Date().toISOString(),
          last_direction: direction,
        });
    } else {
      // Update state without triggering
      await supabase
        .from('notification_state')
        .upsert({
          user_id: rule.user_id,
          rule_id: rule.id,
          last_value: currentPrice,
          last_sent_at: state?.last_sent_at || null,
          last_direction: state?.last_direction || null,
        });
    }
  }
}

/**
 * Q3: Portfolio P/L >= 5% (one-time)
 */
async function checkPortfolioPL() {
  const supabase = getServerClient();
  const { data: rules } = await supabase
    .from('notification_rules')
    .select('*')
    .eq('type', 'portfolio_pl_pct')
    .eq('enabled', true);

  if (!rules || rules.length === 0) return;

  const fxRates = await getMultiCurrencyRates();

  for (const rule of rules) {
    // Get user's portfolio holdings
    const { data: holdings } = await supabase
      .from('user_gold_holdings')
      .select('*')
      .eq('user_id', rule.user_id);

    if (!holdings || holdings.length === 0) continue;

    // Group by country and karat, calculate P/L
    const holdingsByCountryKarat: Record<string, typeof holdings> = {};
    for (const holding of holdings) {
      const country = holding.country || 'EG';
      const key = `${country}_${holding.karat}`;
      if (!holdingsByCountryKarat[key]) {
        holdingsByCountryKarat[key] = [];
      }
      holdingsByCountryKarat[key].push(holding);
    }

    for (const [key, groupHoldings] of Object.entries(holdingsByCountryKarat)) {
      const [country, karatStr] = key.split('_');
      const karat = parseInt(karatStr, 10) as Karat;
      const countryCode = country as Country;

      // Get current market price
      const marketData = await getMarketMedians(countryCode, false, 60);
      const priceKey = `market${karat}Buy` as keyof typeof marketData.prices;
      const currentPrice = marketData.prices[priceKey] as number | null;

      if (!currentPrice || currentPrice <= 0) continue;

      // Calculate aggregate P/L
      let totalInvested = 0;
      let totalGrams = 0;

      for (const holding of groupHoldings) {
        const investedInCanonical = convertMoney(
          holding.grams * holding.purchase_price_per_gram,
          holding.purchase_currency,
          getCountryCurrency(countryCode),
          fxRates
        );
        if (investedInCanonical !== null) {
          totalInvested += investedInCanonical;
        }
        totalGrams += holding.grams;
      }

      const currentValue = totalGrams * currentPrice;
      const pnl = currentValue - totalInvested;
      const pnlPct = totalInvested > 0 ? pnl / totalInvested : 0;

      if (Math.abs(pnlPct) >= 0.05) {
        // Get user profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('email, email_notifications_enabled, push_notifications_enabled')
          .eq('id', rule.user_id)
          .single();

        if (!profile) continue;

        const canonicalCurrency = getCountryCurrency(countryCode);
        const pnlLabel = pnlPct >= 0 ? 'Profit' : 'Loss';
        const title = `Portfolio ${pnlLabel} Alert`;
        const body = `${countryNames[countryCode]} ${karat}k: ${pnlLabel} ${(Math.abs(pnlPct) * 100).toFixed(2)}% (${canonicalCurrency} ${Math.abs(pnl).toLocaleString('en-US', { minimumFractionDigits: 2 })})`;
        const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com'}/portfolio?country=${countryCode}`;

        // Always create in-app
        await createInAppNotification(rule.user_id, countryCode, title, body, url, 'alert');
        await logDelivery(rule.user_id, rule.id, 'inapp', 'sent', { country: countryCode, karat, pnlPct });

        // Push if offline
        if (rule.channel_push && profile.push_notifications_enabled) {
          const offline = await isUserOffline(rule.user_id);
          if (offline) {
            const { data: subscriptions } = await supabase
              .from('push_subscriptions')
              .select('endpoint, p256dh, auth')
              .eq('user_id', rule.user_id);

            if (subscriptions && subscriptions.length > 0) {
              for (const sub of subscriptions) {
                const result = await sendPushNotification(
                  { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                  { title, body, url }
                );
                await logDelivery(rule.user_id, rule.id, 'push', result.success ? 'sent' : 'failed', { endpoint: sub.endpoint }, result.error || null);
              }
            }
          }
        }

        // Email if enabled
        if (rule.channel_email && profile.email_notifications_enabled && profile.email) {
          const emailResult = await sendNotificationEmail({
            to: profile.email,
            subject: title,
            html: `<p>${body}</p><p><a href="${url}">View Portfolio</a></p>`,
          });
          await logDelivery(rule.user_id, rule.id, 'email', emailResult.success ? 'sent' : 'failed', { email: profile.email }, emailResult.error || null);
        }

        // Disable rule (one-time)
        await supabase
          .from('notification_rules')
          .update({ enabled: false })
          .eq('id', rule.id);

        break; // Only trigger once per rule
      }
    }
  }
}

/**
 * Q4: Daily summary at 12:00 AM Egypt time
 */
async function sendDailySummaries() {
  // Check if it's 12:00 AM Egypt time (UTC+2, so 10:00 PM UTC previous day)
  const now = new Date();
  const egyptTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const hour = egyptTime.getHours();
  const minute = egyptTime.getMinutes();

  if (hour !== 0 || minute > 5) return; // Only run within first 5 minutes of midnight

  const supabase = getServerClient();
  const { data: rules } = await supabase
    .from('notification_rules')
    .select('*')
    .eq('type', 'daily_summary')
    .eq('enabled', true);

  if (!rules || rules.length === 0) return;

  const countries: Country[] = ['EG', 'AE', 'SA', 'US'];
  const karats: Karat[] = [21, 24]; // Only 21k and 24k

  for (const rule of rules) {
    const country = rule.country as Country | null;
    const countriesToCheck = country ? [country] : countries;

    for (const countryCode of countriesToCheck) {
      const userIds = await getUsersWatchingCountry(countryCode);
      if (!userIds.includes(rule.user_id)) continue;

      const marketData = await getMarketMedians(countryCode, false, 1440); // 24 hours
      const canonicalCurrency = getCountryCurrency(countryCode);

      let summaryText = `Daily Summary for ${countryNames[countryCode]}:\n\n`;

      for (const karat of karats) {
        const priceKey = `market${karat}Buy` as keyof typeof marketData.prices;
        const price = marketData.prices[priceKey] as number | null;
        if (price) {
          summaryText += `${karat}k: ${canonicalCurrency} ${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
        }
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email, email_notifications_enabled, push_notifications_enabled')
        .eq('id', rule.user_id)
        .single();

      if (!profile) continue;

      const title = `${countryNames[countryCode]} Daily Gold Summary`;
      const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com'}/?country=${countryCode}`;

      // Always create in-app
      await createInAppNotification(rule.user_id, countryCode, title, summaryText, url, 'summary');
      await logDelivery(rule.user_id, rule.id, 'inapp', 'sent', { country: countryCode, type: 'daily_summary' });

      // Push if offline
      if (rule.channel_push && profile.push_notifications_enabled) {
        const offline = await isUserOffline(rule.user_id);
        if (offline) {
          const { data: subscriptions } = await supabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', rule.user_id);

          if (subscriptions && subscriptions.length > 0) {
            for (const sub of subscriptions) {
              const result = await sendPushNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                { title, body: summaryText, url }
              );
              await logDelivery(rule.user_id, rule.id, 'push', result.success ? 'sent' : 'failed', { endpoint: sub.endpoint }, result.error || null);
            }
          }
        }
      }

      // Email if enabled
      if (rule.channel_email && profile.email_notifications_enabled && profile.email) {
        const emailResult = await sendNotificationEmail({
          to: profile.email,
          subject: title,
          html: `<p>${summaryText.replace(/\n/g, '<br>')}</p><p><a href="${url}">View Market Data</a></p>`,
        });
        await logDelivery(rule.user_id, rule.id, 'email', emailResult.success ? 'sent' : 'failed', { email: profile.email }, emailResult.error || null);
      }
    }
  }
}

/**
 * Q5: Weekly outlook at 12:00 AM Egypt time each Friday
 */
async function sendWeeklyOutlooks() {
  const now = new Date();
  const egyptTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const dayOfWeek = egyptTime.getDay(); // 0 = Sunday, 5 = Friday
  const hour = egyptTime.getHours();
  const minute = egyptTime.getMinutes();

  if (dayOfWeek !== 5 || hour !== 0 || minute > 5) return; // Only Friday at midnight

  const supabase = getServerClient();
  const { data: rules } = await supabase
    .from('notification_rules')
    .select('*')
    .eq('type', 'weekly_outlook')
    .eq('enabled', true);

  if (!rules || rules.length === 0) return;

  const countries: Country[] = ['EG', 'AE', 'SA', 'US'];
  const karats: Karat[] = [21, 24]; // Only 21k and 24k

  for (const rule of rules) {
    const country = rule.country as Country | null;
    const countriesToCheck = country ? [country] : countries;

    for (const countryCode of countriesToCheck) {
      const userIds = await getUsersWatchingCountry(countryCode);
      if (!userIds.includes(rule.user_id)) continue;

      const marketData = await getMarketMedians(countryCode, false, 10080); // 7 days
      const canonicalCurrency = getCountryCurrency(countryCode);

      let outlookText = `Weekly Outlook for ${countryNames[countryCode]}:\n\n`;

      for (const karat of karats) {
        const priceKey = `market${karat}Buy` as keyof typeof marketData.prices;
        const price = marketData.prices[priceKey] as number | null;
        if (price) {
          outlookText += `${karat}k: ${canonicalCurrency} ${price.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
        }
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email, email_notifications_enabled, push_notifications_enabled')
        .eq('id', rule.user_id)
        .single();

      if (!profile) continue;

      const title = `${countryNames[countryCode]} Weekly Gold Outlook`;
      const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com'}/?country=${countryCode}`;

      // Always create in-app
      await createInAppNotification(rule.user_id, countryCode, title, outlookText, url, 'summary');
      await logDelivery(rule.user_id, rule.id, 'inapp', 'sent', { country: countryCode, type: 'weekly_outlook' });

      // Push if offline
      if (rule.channel_push && profile.push_notifications_enabled) {
        const offline = await isUserOffline(rule.user_id);
        if (offline) {
          const { data: subscriptions } = await supabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', rule.user_id);

          if (subscriptions && subscriptions.length > 0) {
            for (const sub of subscriptions) {
              const result = await sendPushNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                { title, body: outlookText, url }
              );
              await logDelivery(rule.user_id, rule.id, 'push', result.success ? 'sent' : 'failed', { endpoint: sub.endpoint }, result.error || null);
            }
          }
        }
      }

      // Email if enabled
      if (rule.channel_email && profile.email_notifications_enabled && profile.email) {
        const emailResult = await sendNotificationEmail({
          to: profile.email,
          subject: title,
          html: `<p>${outlookText.replace(/\n/g, '<br>')}</p><p><a href="${url}">View Market Data</a></p>`,
        });
        await logDelivery(rule.user_id, rule.id, 'email', emailResult.success ? 'sent' : 'failed', { email: profile.email }, emailResult.error || null);
      }
    }
  }
}

/**
 * Q6: Macro events
 */
async function checkMacroEvents() {
  const supabase = getServerClient();
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get upcoming macro events (next 24 hours)
  const { data: events } = await supabase
    .from('macro_events')
    .select('*')
    .gte('event_date', now.toISOString())
    .lte('event_date', tomorrow.toISOString())
    .order('event_date', { ascending: true });

  if (!events || events.length === 0) return;

  // Get rules for macro events
  const { data: rules } = await supabase
    .from('notification_rules')
    .select('*')
    .eq('type', 'macro_event')
    .eq('enabled', true);

  if (!rules || rules.length === 0) return;

  for (const event of events) {
    for (const rule of rules) {
      // Check if rule applies to this event's country (or global if rule.country is null)
      if (rule.country && rule.country !== event.country) continue;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email, email_notifications_enabled, push_notifications_enabled')
        .eq('id', rule.user_id)
        .single();

      if (!profile) continue;

      const country = event.country as Country | null;
      const countryName = country ? countryNames[country] : 'Global';
      const title = `Economic Event: ${event.title}`;
      const body = event.description || event.title;
      const url = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com'}/?country=${country || 'EG'}`;

      // Always create in-app
      await createInAppNotification(rule.user_id, country, title, body, url, 'macro');
      await logDelivery(rule.user_id, rule.id, 'inapp', 'sent', { eventId: event.id, type: 'macro_event' });

      // Push if offline
      if (rule.channel_push && profile.push_notifications_enabled) {
        const offline = await isUserOffline(rule.user_id);
        if (offline) {
          const { data: subscriptions } = await supabase
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', rule.user_id);

          if (subscriptions && subscriptions.length > 0) {
            for (const sub of subscriptions) {
              const result = await sendPushNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                { title, body, url }
              );
              await logDelivery(rule.user_id, rule.id, 'push', result.success ? 'sent' : 'failed', { endpoint: sub.endpoint }, result.error || null);
            }
          }
        }
      }

      // Email if enabled
      if (rule.channel_email && profile.email_notifications_enabled && profile.email) {
        const emailResult = await sendNotificationEmail({
          to: profile.email,
          subject: title,
          html: `<p>${body}</p><p><a href="${url}">View Market Data</a></p>`,
        });
        await logDelivery(rule.user_id, rule.id, 'email', emailResult.success ? 'sent' : 'failed', { email: profile.email }, emailResult.error || null);
      }
    }
  }
}

/**
 * Main cron handler
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const expectedSecret = process.env.CRON_SECRET;
    const isVercelCron = !!request.headers.get('x-vercel-cron');

    if (!isVercelCron) {
      const secret =
        searchParams.get('secret') ||
        request.headers.get('x-cron-secret') ||
        request.headers.get('authorization')?.replace('Bearer ', '');
      if (!expectedSecret || secret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const results = {
      q1_price_moves: 0,
      q2_threshold_crossings: 0,
      q3_portfolio_pl: 0,
      q4_daily_summaries: 0,
      q5_weekly_outlooks: 0,
      q6_macro_events: 0,
      errors: [] as string[],
    };

    try {
      await checkPriceMoves();
      results.q1_price_moves = 1;
    } catch (error) {
      results.errors.push(`Q1 error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    try {
      await checkThresholdCrossings();
      results.q2_threshold_crossings = 1;
    } catch (error) {
      results.errors.push(`Q2 error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    try {
      await checkPortfolioPL();
      results.q3_portfolio_pl = 1;
    } catch (error) {
      results.errors.push(`Q3 error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    try {
      await sendDailySummaries();
      results.q4_daily_summaries = 1;
    } catch (error) {
      results.errors.push(`Q4 error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    try {
      await sendWeeklyOutlooks();
      results.q5_weekly_outlooks = 1;
    } catch (error) {
      results.errors.push(`Q5 error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    try {
      await checkMacroEvents();
      results.q6_macro_events = 1;
    } catch (error) {
      results.errors.push(`Q6 error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[CRON] Notify error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

