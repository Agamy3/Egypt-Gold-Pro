import { getServerClient } from '@/lib/supabase/server';
import { sendPushNotification } from '@/lib/push';
import { runNotificationCycle, type UserNotificationRuleRow } from './runNotificationCycle';
jest.mock('@/lib/supabase/server', () => ({ getServerClient: jest.fn() }));
jest.mock('@/lib/push', () => ({ sendPushNotification: jest.fn() }));
const rule = (id: number): UserNotificationRuleRow => ({ id, user_id: 'test-user', rule_type: 'local_pct_change', country: 'EG', karat: 21, side: 'buy', currency: 'EGP', direction: 'above', threshold: 1000, cooldown_minutes: 10, enabled: true });

test('two identical price rules use two history reads total and refresh on the next cycle', async () => {
  const from = jest.fn((table: string) => {
    expect(table).toBe('market_snapshots_norm'); // supplied rules need no second rule query
    const query: any = {};
    for (const method of ['select', 'eq', 'lte', 'order', 'limit']) query[method] = jest.fn(() => query);
    query.maybeSingle = jest.fn(async () => ({ data: { price: 100, created_at: '2026-10-16T11:59:00Z', source: 'banklive' }, error: null }));
    return query;
  });
  (getServerClient as jest.Mock).mockReturnValue({ from });
  const input = { dryRun: true, now: new Date('2026-10-16T12:00:00Z'), rules: [rule(1), rule(2)] };
  const result = await runNotificationCycle(input);
  expect(result.ok).toBe(true);
  expect(result.evaluated).toBe(2);
  expect(result.triggered).toBe(0);
  expect(result.skipReasons.below_threshold).toBe(2);
  expect(from).toHaveBeenCalledTimes(2);
  expect(sendPushNotification).not.toHaveBeenCalled();
  await runNotificationCycle(input);
  expect(from).toHaveBeenCalledTimes(4);
});

test('a supplied empty rule list causes no rule query or notifications', async () => {
  const from = jest.fn();
  (getServerClient as jest.Mock).mockReturnValue({ from });
  const result = await runNotificationCycle({ dryRun: true, rules: [] });
  expect(result.rulesLoaded).toBe(0);
  expect(from).not.toHaveBeenCalled();
  expect(sendPushNotification).not.toHaveBeenCalled();
});
