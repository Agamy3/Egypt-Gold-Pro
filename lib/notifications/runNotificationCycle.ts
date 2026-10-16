import 'server-only';
import { createCycleLookup } from './cycle-cache';

import { getServerClient } from '@/lib/supabase/server';
import { sendPushNotification, type PushSubscription } from '@/lib/push';

type Country = 'EG' | 'AE' | 'SA' | 'US';
type Currency = 'EGP' | 'USD' | 'AED' | 'SAR';

export type UserNotificationRuleRow = {
  id: number;
  user_id: string;
  rule_type?: string | null;
  params?: unknown;
  country: Country;
  karat: number;
  side: 'buy' | 'sell';
  currency: Currency;
  direction: 'above' | 'below';
  threshold: number;
  cooldown_minutes: number;
  enabled: boolean;
};

type PushSubscriptionRow = {
  id: number;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type MarketSnapshotNormRow = {
  price: number | string;
  created_at: string;
  source?: string | null;
};

function asNum(x: unknown): number | null {
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function toUtcMinuteKey(d: Date): string {
  const floored = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), 0, 0)
  );
  return floored.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function safeJson<T>(x: unknown): T | null {
  if (x == null) return null;
  if (typeof x === 'object') return x as T;
  if (typeof x === 'string') {
    try {
      return JSON.parse(x) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function topReasonsCount(reasons: Record<string, number>, topN: number): Array<{ reason: string; count: number }> {
  return Object.entries(reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([reason, count]) => ({ reason, count }));
}

export type NotificationCycleResult = {
  ok: boolean;
  dryRun: boolean;
  serverAsOf: string;
  rulesLoaded: number;
  rulesEnabled: number;
  subscriptionsLoaded: number;
  evaluated: number;
  triggered: number;
  sent: number;
  failed: number;
  skipped: number;
  skipReasons: Record<string, number>;
  topSkipReasons: Array<{ reason: string; count: number }>;
  fired: Array<{
    ruleId: number;
    userId: string;
    ruleType: string;
    title: string;
    body: string;
    dedupeKey: string;
    subscriptionsTried: number;
    sentCount: number;
    failedCount: number;
    error?: string;
  }>;
  errors: string[];
};

type LocalPctChangeParams = {
  thresholdPct?: number;
  windowSeconds?: number;
  minAgeSeconds?: number;
  cooldownSeconds?: number;
  country?: Country;
  karat?: number;
};

async function getPushSubscriptionsForUser(userId: string): Promise<{ rows: PushSubscriptionRow[]; error?: string }> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: (data as any) ?? [] };
}

async function deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const supabase = getServerClient();
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

async function hasRecentSentDelivery(ruleId: number, sinceIso: string): Promise<boolean> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from('notification_deliveries')
    .select('id')
    .eq('rule_id', ruleId)
    .eq('status', 'sent')
    .gte('sent_at', sinceIso)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return Boolean((data as any)?.id);
}

async function deliveryExists(ruleId: number, dedupeKey: string): Promise<boolean> {
  const supabase = getServerClient();
  const { data } = await supabase
    .from('notification_deliveries')
    .select('id')
    .eq('rule_id', ruleId)
    .eq('dedupe_key', dedupeKey)
    .limit(1)
    .maybeSingle();
  return Boolean((data as any)?.id);
}

async function insertDeliveryRow(args: {
  ruleId: number;
  userId: string;
  status: 'sent' | 'failed';
  error?: string | null;
  dedupeKey: string;
}): Promise<void> {
  const supabase = getServerClient();
  await supabase.from('notification_deliveries').insert({
    rule_id: args.ruleId,
    user_id: args.userId,
    channel: 'push',
    status: args.status,
    sent_at: new Date().toISOString(),
    error: args.error ?? null,
    dedupe_key: args.dedupeKey,
  });
}

async function getTrustedLocalSnapshotAtOrBefore(args: {
  country: Country;
  karat: number;
  maxIso: string;
}): Promise<{ row: MarketSnapshotNormRow | null; error?: string }> {
  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('market_snapshots_norm')
    .select('price, created_at, source')
    .eq('country', args.country)
    .eq('karat', args.karat)
    .eq('trusted', true)
    .lte('created_at', args.maxIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: (data as any) ?? null };
}

async function evaluateLocalPctChange(rule: UserNotificationRuleRow, now: Date, lookup: typeof getTrustedLocalSnapshotAtOrBefore): Promise<
  | { ok: true; triggered: boolean; title?: string; body?: string; dedupeKey?: string; debug?: any; reason?: string }
  | { ok: false; error: string; reason?: string }
> {
  const params = (safeJson<LocalPctChangeParams>(rule.params) ?? {}) as LocalPctChangeParams;
  const country = ((params.country ?? rule.country) as Country) || rule.country;
  const karat = Math.floor(asNum(params.karat) ?? rule.karat);

  const thresholdPct = Math.max(0, asNum(params.thresholdPct) ?? 0.0005);
  const windowSeconds = Math.max(60, Math.min(24 * 3600, Math.floor(asNum(params.windowSeconds) ?? 3600)));
  const minAgeSeconds = Math.max(10, Math.min(windowSeconds, Math.floor(asNum(params.minAgeSeconds) ?? 60)));
  const cooldownSeconds = Math.max(60, Math.min(24 * 3600, Math.floor(asNum(params.cooldownSeconds) ?? 600)));

  if (!['EG', 'AE', 'SA', 'US'].includes(country)) {
    return { ok: false, error: 'invalid_country', reason: 'invalid_country' };
  }
  if (![14, 18, 21, 24].includes(karat)) {
    return { ok: false, error: 'invalid_karat', reason: 'invalid_karat' };
  }

  const maxIso = new Date(now.getTime() - minAgeSeconds * 1000).toISOString();
  const latestRes = await lookup({ country, karat, maxIso });
  if (latestRes.error) return { ok: false, error: latestRes.error, reason: 'db_error_latest' };
  const latest = latestRes.row;
  if (!latest) return { ok: true, triggered: false, reason: 'missing_latest_trusted' };

  const latestAtMs = Date.parse(String(latest.created_at));
  if (!Number.isFinite(latestAtMs)) return { ok: true, triggered: false, reason: 'bad_latest_timestamp' };
  const latestPrice = asNum(latest.price);
  if (latestPrice == null || latestPrice <= 0) return { ok: true, triggered: false, reason: 'bad_latest_price' };

  const prevMaxIso = new Date(latestAtMs - windowSeconds * 1000).toISOString();
  const prevRes = await lookup({ country, karat, maxIso: prevMaxIso });
  if (prevRes.error) return { ok: false, error: prevRes.error, reason: 'db_error_prev' };
  const prev = prevRes.row;
  if (!prev) return { ok: true, triggered: false, reason: 'missing_prev_trusted' };

  const prevPrice = asNum(prev.price);
  const prevAtMs = Date.parse(String(prev.created_at));
  if (prevPrice == null || prevPrice <= 0 || !Number.isFinite(prevAtMs)) {
    return { ok: true, triggered: false, reason: 'bad_prev' };
  }

  const pct = Math.abs((latestPrice - prevPrice) / prevPrice);
  const triggered = pct >= thresholdPct;
  if (!triggered) {
    return { ok: true, triggered: false, reason: 'below_threshold', debug: { pct, thresholdPct } };
  }

  const sinceIso = new Date(now.getTime() - cooldownSeconds * 1000).toISOString();
  const cooldownHit = await hasRecentSentDelivery(rule.id, sinceIso);
  if (cooldownHit) {
    return { ok: true, triggered: true, reason: 'cooldown_active', debug: { sinceIso, cooldownSeconds } };
  }

  const minuteKey = toUtcMinuteKey(new Date(latestAtMs));
  const dedupeKey = `local_pct_change:${country}:${karat}:${minuteKey}`;

  const title = 'Local gold price moved';
  const body = `${country} ${karat}k moved ${(pct * 100).toFixed(2)}% (trusted sources)`;

  return {
    ok: true,
    triggered: true,
    title,
    body,
    dedupeKey,
    debug: {
      country,
      karat,
      latestAt: latest.created_at,
      prevAt: prev.created_at,
      pct,
      thresholdPct,
      windowSeconds,
      minAgeSeconds,
      cooldownSeconds,
      latestSource: latest.source ?? null,
      prevSource: prev.source ?? null,
    },
  };
}

async function sendPushToUserSubscriptions(args: {
  userId: string;
  title: string;
  body: string;
  url: string;
  dryRun: boolean;
}): Promise<
  | { ok: true; subscriptionsTried: number; sentCount: number; failedCount: number; error?: string }
  | { ok: false; error: string; subscriptionsTried: number; sentCount: number; failedCount: number }
> {
  const subsRes = await getPushSubscriptionsForUser(args.userId);
  if (subsRes.error) {
    return { ok: false, error: subsRes.error, subscriptionsTried: 0, sentCount: 0, failedCount: 0 };
  }

  const subs = subsRes.rows;
  if (subs.length === 0) {
    return { ok: true, subscriptionsTried: 0, sentCount: 0, failedCount: 0, error: 'no_subscriptions' };
  }

  if (args.dryRun) {
    return { ok: true, subscriptionsTried: subs.length, sentCount: 0, failedCount: 0 };
  }

  let sentCount = 0;
  let failedCount = 0;
  let lastError: string | undefined;

  for (const row of subs) {
    const pushSub: PushSubscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    const res = await sendPushNotification(pushSub, { title: args.title, body: args.body, url: args.url });
    if (res.success) {
      sentCount++;
    } else {
      failedCount++;
      lastError = res.error ?? 'push_failed';
      if (res.error === 'Subscription expired') {
        await deleteSubscriptionByEndpoint(row.endpoint);
      }
    }
  }

  if (sentCount > 0) {
    return { ok: true, subscriptionsTried: subs.length, sentCount, failedCount, error: lastError };
  }
  return {
    ok: false,
    error: lastError ?? 'push_failed',
    subscriptionsTried: subs.length,
    sentCount,
    failedCount,
  };
}

export async function runNotificationCycle(args: { dryRun: boolean; now?: Date; rules?: UserNotificationRuleRow[] }): Promise<NotificationCycleResult> {
  const serverAsOf = new Date().toISOString();
  const now = args.now ?? new Date();
  const supabase = getServerClient();

  const result: NotificationCycleResult = {
    ok: true,
    dryRun: args.dryRun,
    serverAsOf,
    rulesLoaded: 0,
    rulesEnabled: 0,
    subscriptionsLoaded: 0,
    evaluated: 0,
    triggered: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    skipReasons: {},
    topSkipReasons: [],
    fired: [],
    errors: [],
  };

  const { data: rules, error: rulesErr } = args.rules ? { data: args.rules, error: null } : await supabase
    .from('user_notification_rules')
    .select('id, user_id, rule_type, params, country, karat, side, currency, direction, threshold, cooldown_minutes, enabled')
    .eq('enabled', true);

  if (rulesErr) {
    return {
      ...result,
      ok: false,
      errors: [`rules_query_failed:${rulesErr.message}`],
    };
  }

  const rows = ((rules as any) ?? []) as UserNotificationRuleRow[];
  result.rulesLoaded = rows.length;
  result.rulesEnabled = rows.length;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://egyptgoldpro.com';

  const lookupByKey = createCycleLookup((key: string) => getTrustedLocalSnapshotAtOrBefore(JSON.parse(key)));
  const lookup: typeof getTrustedLocalSnapshotAtOrBefore = input => lookupByKey(JSON.stringify(input));

  for (const rule of rows) {
    result.evaluated++;
    const ruleType = String(rule.rule_type || 'threshold_cross');

    try {
      if (ruleType === 'local_pct_change') {
        const evalRes = await evaluateLocalPctChange(rule, now, lookup);
        if (!evalRes.ok) {
          result.skipped++;
          const reason = evalRes.reason ?? 'rule_error';
          result.skipReasons[reason] = (result.skipReasons[reason] ?? 0) + 1;
          result.errors.push(`rule:${rule.id}:${evalRes.error}`);
          continue;
        }

        if (!evalRes.triggered) {
          result.skipped++;
          const reason = evalRes.reason ?? 'not_triggered';
          result.skipReasons[reason] = (result.skipReasons[reason] ?? 0) + 1;
          continue;
        }

        result.triggered++;

        if (!evalRes.dedupeKey || !evalRes.title || !evalRes.body) {
          result.skipped++;
          result.skipReasons.missing_payload = (result.skipReasons.missing_payload ?? 0) + 1;
          continue;
        }

        const exists = await deliveryExists(rule.id, evalRes.dedupeKey);
        if (exists) {
          result.skipped++;
          result.skipReasons.deduped = (result.skipReasons.deduped ?? 0) + 1;
          continue;
        }

        const sendRes = await sendPushToUserSubscriptions({
          userId: rule.user_id,
          title: evalRes.title,
          body: evalRes.body,
          url: `${siteUrl}/account/notifications`,
          dryRun: args.dryRun,
        });

        // Count subscriptions loaded (best-effort; for perf we count only when we fetch)
        result.subscriptionsLoaded += Math.max(0, sendRes.subscriptionsTried);

        if (sendRes.ok && sendRes.sentCount > 0) {
          result.sent++;
          if (!args.dryRun) {
            await insertDeliveryRow({
              ruleId: rule.id,
              userId: rule.user_id,
              status: 'sent',
              error: null,
              dedupeKey: evalRes.dedupeKey,
            });
          }
          result.fired.push({
            ruleId: rule.id,
            userId: rule.user_id,
            ruleType,
            title: evalRes.title,
            body: evalRes.body,
            dedupeKey: evalRes.dedupeKey,
            subscriptionsTried: sendRes.subscriptionsTried,
            sentCount: sendRes.sentCount,
            failedCount: sendRes.failedCount,
          });
        } else {
          // no subscriptions or all failed
          result.failed++;
          const err = sendRes.error ?? 'push_failed';
          if (!args.dryRun) {
            await insertDeliveryRow({
              ruleId: rule.id,
              userId: rule.user_id,
              status: 'failed',
              error: err,
              dedupeKey: evalRes.dedupeKey,
            });
          }
          result.fired.push({
            ruleId: rule.id,
            userId: rule.user_id,
            ruleType,
            title: evalRes.title,
            body: evalRes.body,
            dedupeKey: evalRes.dedupeKey,
            subscriptionsTried: sendRes.subscriptionsTried,
            sentCount: sendRes.sentCount,
            failedCount: sendRes.failedCount,
            error: err,
          });

          if (err === 'no_subscriptions') {
            result.skipReasons.no_subscriptions = (result.skipReasons.no_subscriptions ?? 0) + 1;
          } else {
            result.skipReasons.push_failed = (result.skipReasons.push_failed ?? 0) + 1;
          }
        }

        continue;
      }

      // Unknown rule type => skip (we keep legacy evaluator in cron route for now)
      result.skipped++;
      result.skipReasons[`unhandled:${ruleType}`] = (result.skipReasons[`unhandled:${ruleType}`] ?? 0) + 1;
    } catch (e) {
      result.ok = false;
      result.failed++;
      const msg = e instanceof Error ? e.message : 'unknown_error';
      result.errors.push(`rule:${rule.id}:${msg}`);
      result.skipReasons.exception = (result.skipReasons.exception ?? 0) + 1;
    }
  }

  result.topSkipReasons = topReasonsCount(result.skipReasons, 8);
  return result;
}

