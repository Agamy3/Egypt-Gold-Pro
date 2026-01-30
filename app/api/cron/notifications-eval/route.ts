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
import { getProvidedCronSecret, isCronRequestAuthorized } from '@/lib/cron/cronSecret';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Currency = 'EGP' | 'USD' | 'AED' | 'SAR';

interface NotificationRule {
  id: number;
  user_id: string;
  rule_type?: string;
  params?: any;
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
    .select('email_notifications_enabled, app_notifications_enabled, push_notifications_enabled')
    .eq('id', rule.user_id)
    .single();

  const emailEnabled = profile?.email_notifications_enabled ?? true;
  const pushEnabled = (profile?.push_notifications_enabled ?? profile?.app_notifications_enabled ?? true); // Enable push by default

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

function asNum(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return isFinite(n) ? n : null;
}

async function getLocalPctChangePoints(input: {
  country: Country;
  karat: number;
  windowSeconds: number;
  minAgeSeconds: number;
}): Promise<
  | { ok: true; latest: { price: number; atIso: string }; prev: { price: number; atIso: string } }
  | { ok: false; error: string }
> {
  const supabase = getServerClient();
  const country = input.country;
  const karat = input.karat;

  function median(nums: number[]): number | null {
    const arr = nums.filter((n) => isFinite(n) && n > 0).sort((a, b) => a - b);
    if (arr.length === 0) return null;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
  }

  async function getLatestBucketIso(): Promise<string | null> {
    const { data, error } = await supabase
      .from('market_snapshots_norm')
      .select('created_at')
      .eq('country', country)
      .eq('karat', karat)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const iso = data ? String((data as any).created_at || '') : '';
    return iso || null;
  }

  async function getMedianAtBucket(createdAtIso: string): Promise<number | null> {
    const { data, error } = await supabase
      .from('market_snapshots_norm')
      .select('price')
      .eq('country', country)
      .eq('karat', karat)
      .eq('created_at', createdAtIso)
      .limit(5000);
    if (error) throw new Error(error.message);
    const prices = (data || []).map((r: any) => asNum(r.price)).filter((n): n is number => n != null);
    return median(prices);
  }

  try {
    const tLatestIso = await getLatestBucketIso();
    if (!tLatestIso) return { ok: false, error: 'No local price buckets found' };

    const tLatestMs = Date.parse(tLatestIso);
    const minAgeMs = input.minAgeSeconds * 1000;
    const windowMs = input.windowSeconds * 1000;
    const minIso = new Date(tLatestMs - windowMs).toISOString();
    const maxIso = new Date(tLatestMs - minAgeMs).toISOString();

    // Find the most recent DISTINCT created_at bucket within [tLatest-window, tLatest-minAge]
    const { data: prevBucket, error: prevBucketErr } = await supabase
      .from('market_snapshots_norm')
      .select('created_at')
      .eq('country', country)
      .eq('karat', karat)
      .gte('created_at', minIso)
      .lte('created_at', maxIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (prevBucketErr) return { ok: false, error: prevBucketErr.message };

    const tPrevIso = prevBucket ? String((prevBucket as any).created_at || '') : '';
    if (!tPrevIso) return { ok: false, error: 'No previous bucket found within window' };

    const latestMedian = await getMedianAtBucket(tLatestIso);
    const prevMedian = await getMedianAtBucket(tPrevIso);

    if (latestMedian == null || prevMedian == null || prevMedian <= 0) {
      return { ok: false, error: 'Median price unavailable for latest/prev buckets' };
    }

    return {
      ok: true,
      latest: { price: latestMedian, atIso: tLatestIso },
      prev: { price: prevMedian, atIso: tPrevIso },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Local median query failed' };
  }
}

async function maybeSendLocalPctChange(rule: NotificationRule): Promise<{ triggered: boolean; sent: boolean; error?: string }> {
  const supabaseAdmin = getServerClient();
  const params = (rule.params || {}) as any;

  const thresholdPct = asNum(params.thresholdPct) ?? 0.0005;
  const windowSeconds = Math.max(60, Math.min(3600, Math.floor(asNum(params.windowSeconds) ?? 300)));
  const minAgeSeconds = Math.max(10, Math.min(windowSeconds, Math.floor(asNum(params.minAgeSeconds) ?? 60)));
  const cooldownSeconds = Math.max(60, Math.min(24 * 3600, Math.floor(asNum(params.cooldownSeconds) ?? 600)));
  const karat = Math.floor(asNum(params.karat) ?? rule.karat ?? 24);

  // Country: prefer user profile preferred_country, else params, else EG
  let country: Country = 'EG';
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('preferred_country')
    .eq('id', rule.user_id)
    .maybeSingle();

  const c = (profile?.preferred_country || params.country || 'EG') as Country;
  if (['EG', 'AE', 'SA', 'US'].includes(c)) country = c;

  const points = await getLocalPctChangePoints({ country, karat, windowSeconds, minAgeSeconds });
  if (!points.ok) return { triggered: false, sent: false, error: points.error };

  const pct = Math.abs((points.latest.price - points.prev.price) / points.prev.price);
  const triggered = pct >= thresholdPct;
  console.log('[local_pct_change]', {
    ruleId: rule.id,
    userId: rule.user_id,
    country,
    karat,
    t_latest: points.latest.atIso,
    price_latest: points.latest.price,
    t_prev: points.prev.atIso,
    price_prev: points.prev.price,
    pct,
    thresholdPct,
    triggered,
  });
  if (!triggered) return { triggered: false, sent: false };

  // Cooldown check: most recent sent delivery within cooldownSeconds
  const sinceIso = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
  const { data: recentSent } = await supabaseAdmin
    .from('notification_deliveries')
    .select('id')
    .eq('rule_id', rule.id)
    .eq('channel', 'push')
    .eq('status', 'sent')
    .gte('sent_at', sinceIso)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentSent?.id) return { triggered: true, sent: false };

  const tLatestKeyIso = new Date(points.latest.atIso).toISOString();
  const dedupeKey = `localpct:${rule.id}:${country}:${karat}:${tLatestKeyIso}`;
  const { data: existing } = await supabaseAdmin
    .from('notification_deliveries')
    .select('id')
    .eq('rule_id', rule.id)
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();
  if (existing?.id) return { triggered: true, sent: false };

  // Reserve delivery row to prevent duplicates across retries
  const { data: delivery, error: insErr } = await supabaseAdmin
    .from('notification_deliveries')
    .insert({
      rule_id: rule.id,
      user_id: rule.user_id,
      channel: 'push',
      status: 'skipped',
      dedupe_key: dedupeKey,
      error: null,
    })
    .select('id')
    .single();
  if (insErr) return { triggered: true, sent: false, error: insErr.message };

  const direction = points.latest.price > points.prev.price ? 'UP' : 'DOWN';
  const directionAr = direction === 'UP' ? 'ارتفاع' : 'انخفاض';

  const titleEn = 'Local gold price moved';
  const bodyEn = `Moved ${direction} by ${(pct * 100).toFixed(2)}% in the last few minutes. (${country} ${karat}k)`;
  const titleAr = 'تحرك سعر الذهب المحلي';
  const bodyAr = `تحرك ${directionAr} بنسبة ${(pct * 100).toFixed(2)}% خلال الدقائق الأخيرة. (${country} ${karat}k)`;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com';

  const { data: subs } = await supabaseAdmin
    .from('web_push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', rule.user_id);

  if (!subs || subs.length === 0) {
    await supabaseAdmin.from('notification_deliveries').update({ status: 'failed', error: 'No push subscriptions' }).eq('id', delivery.id);
    return { triggered: true, sent: false, error: 'No push subscriptions' };
  }

  let sentAny = false;
  let lastError: string | null = null;

  for (const sub of subs) {
    const pushRes = await sendPushNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      {
        title: titleEn,
        body: bodyEn,
        url: `${siteUrl}/?country=${country}`,
      }
    );

    if (pushRes.success) {
      sentAny = true;
    } else {
      lastError = pushRes.error ?? 'push_failed';
      if (pushRes.error === 'Subscription expired') {
        await supabaseAdmin.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  }

  await supabaseAdmin
    .from('notification_deliveries')
    .update({
      status: sentAny ? 'sent' : 'failed',
      error: sentAny ? null : lastError,
      sent_at: new Date().toISOString(),
    })
    .eq('id', delivery.id);

  return { triggered: true, sent: sentAny, error: sentAny ? undefined : (lastError ?? undefined) };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const provided = getProvidedCronSecret(request) || secret;
    if (!isCronRequestAuthorized(request, provided)) {
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
    const localPctRules: NotificationRule[] = [];
    for (const rule of rules as NotificationRule[]) {
      if ((rule as any).rule_type === 'local_pct_change') {
        localPctRules.push(rule);
        continue;
      }
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

    // Evaluate local % change rules (per-user local market)
    for (const rule of localPctRules) {
      results.evaluated++;
      try {
        const r = await maybeSendLocalPctChange(rule);
        if (r.triggered) results.triggered++;
        if (r.sent) results.sent++;
        if (r.triggered && !r.sent && r.error) {
          results.failed++;
          results.errors.push(`Rule ${rule.id}: ${r.error}`);
        }
      } catch (e) {
        results.failed++;
        results.errors.push(`Rule ${rule.id}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

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

