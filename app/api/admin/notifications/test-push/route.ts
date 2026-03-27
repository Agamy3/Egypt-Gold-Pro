/**
 * Admin Test Push Notification Endpoint
 * 
 * POST /api/admin/notifications/test-push
 * Admin-only endpoint to send test push notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminErrorToResponse, AdminAuthError } from '@/lib/auth/admin';
import { sendPushNotification, type PushSubscription } from '@/lib/push';
import db from '@/lib/supabase';
import { ADMIN_BROADCAST_ALL_LIMIT } from '@/lib/admin/broadcast-limits';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface TestPushRequest {
  target: 'me' | 'all' | 'subscriptionId' | 'user';
  subscriptionId?: string;
  /** When target is user, send to all push_subscriptions for this Supabase user id */
  userId?: string;
  title?: string;
  body?: string;
  url?: string;
}

// Simple in-memory rate limiting (per user)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_ME = { max: 5, windowMs: 60 * 1000 }; // 5 per minute
const RATE_LIMIT_ALL = { max: 1, windowMs: 5 * 60 * 1000 }; // 1 per 5 minutes

function checkRateLimit(userId: string, target: 'me' | 'all'): { allowed: boolean; resetIn?: number } {
  const now = Date.now();
  const limit = target === 'me' ? RATE_LIMIT_ME : RATE_LIMIT_ALL;
  const key = `${userId}:${target}`;
  
  const record = rateLimitMap.get(key);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { allowed: true };
  }
  
  if (record.count >= limit.max) {
    const resetIn = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, resetIn };
  }
  
  record.count++;
  return { allowed: true };
}

export async function POST(request: NextRequest) {
  try {
    // Check admin auth (prefer session, allow cron secret as fallback)
    const cronSecret = request.headers.get('x-cron-secret');
    const isCronAuth = cronSecret === process.env.CRON_SECRET;
    
    let user;
    let supabase;
    
    if (isCronAuth) {
      // Cron secret auth - use service role client
      supabase = db.supabase;
      // For cron auth, we'll need to get user from request body or use a default
      // For now, only allow session-based auth for test-push
      return NextResponse.json(
        { ok: false, error: 'Cron secret auth not supported for test-push. Use admin session.' },
        { status: 401 }
      );
    } else {
      // Session-based admin auth
      const authResult = await requireAdmin();
      user = authResult.user;
      supabase = authResult.supabase;
    }

    const body: TestPushRequest = await request.json();
    const { target, subscriptionId, userId: targetUserId, title, body: bodyText, url } = body;

    // Validate target
    if (!['me', 'all', 'subscriptionId', 'user'].includes(target)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid target. Must be "me", "all", "user", or "subscriptionId"' },
        { status: 400 }
      );
    }

    if (target === 'user' && !targetUserId?.trim()) {
      return NextResponse.json({ ok: false, error: 'userId is required when target is "user"' }, { status: 400 });
    }

    // Rate limiting
    const rateLimit = checkRateLimit(user.id, target === 'all' ? 'all' : 'me');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          ok: false, 
          error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.` 
        },
        { status: 429 }
      );
    }

    // Default values
    const notificationTitle = title || 'EgyptGold Pro — Test Notification';
    const notificationBody = bodyText || 'If you can read this, push notifications are working.';
    const notificationUrl = url || '/account/notifications?from=test-push';

    // Subscription ID from DB is BIGSERIAL (number), but we'll handle both
    let subscriptions: Array<{ id: number; user_id: string; endpoint: string; p256dh: string; auth: string }> = [];

    // Fetch subscriptions based on target
    // Use push_subscriptions (matches subscribe endpoint)
    const tableName = 'push_subscriptions';
    
    if (target === 'me') {
      // Get current user's subscriptions (most recent first)
      const { data, error } = await supabase
        .from(tableName)
        .select('id, user_id, endpoint, p256dh, auth')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[TEST-PUSH] Error fetching subscriptions:', error);
        return NextResponse.json({ ok: false, error: 'Failed to fetch subscriptions' }, { status: 500 });
      }

      subscriptions = data || [];
      
      if (subscriptions.length === 0) {
        return NextResponse.json(
          { ok: false, error: 'No active push subscriptions found for your account. Please enable push notifications first.' },
          { status: 404 }
        );
      }
    } else if (target === 'subscriptionId') {
      if (!subscriptionId) {
        return NextResponse.json({ ok: false, error: 'subscriptionId required when target is "subscriptionId"' }, { status: 400 });
      }

      // Use service role for admin queries
      // subscriptionId from request is string, but DB uses number (BIGSERIAL)
      // Convert to number for query
      const subIdNum = Number(subscriptionId);
      if (isNaN(subIdNum) || !isFinite(subIdNum)) {
        return NextResponse.json({ ok: false, error: 'Invalid subscriptionId format' }, { status: 400 });
      }
      
      const { data, error } = await db.supabase
        .from(tableName)
        .select('id, user_id, endpoint, p256dh, auth')
        .eq('id', subIdNum)
        .maybeSingle();

      if (error) {
        console.error('[TEST-PUSH] Error fetching subscription:', error);
        return NextResponse.json({ ok: false, error: 'Failed to fetch subscription' }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json({ ok: false, error: 'Subscription not found or inactive' }, { status: 404 });
      }

      subscriptions = [data];
    } else if (target === 'all') {
      // Admin-only: send to latest N subscriptions
      const { data, error } = await db.supabase
        .from(tableName)
        .select('id, user_id, endpoint, p256dh, auth')
        .order('created_at', { ascending: false })
        .limit(ADMIN_BROADCAST_ALL_LIMIT);

      if (error) {
        console.error('[TEST-PUSH] Error fetching subscriptions:', error);
        return NextResponse.json({ ok: false, error: 'Failed to fetch subscriptions' }, { status: 500 });
      }

      subscriptions = data || [];
      
      if (subscriptions.length === 0) {
        return NextResponse.json({ ok: false, error: 'No active subscriptions found' }, { status: 404 });
      }
    } else if (target === 'user') {
      const { data, error } = await supabase
        .from(tableName)
        .select('id, user_id, endpoint, p256dh, auth')
        .eq('user_id', targetUserId!.trim())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[TEST-PUSH] Error fetching user subscriptions:', error);
        return NextResponse.json({ ok: false, error: 'Failed to fetch subscriptions' }, { status: 500 });
      }

      subscriptions = data || [];

      if (subscriptions.length === 0) {
        return NextResponse.json(
          { ok: false, error: 'No push subscriptions found for that user.' },
          { status: 404 }
        );
      }
    }

    // Send notifications
    const results: Array<{ subscriptionId: string; status: 'sent' | 'failed'; error?: string }> = [];
    let sent = 0;
    let failed = 0;
    let deactivated = 0;

    for (const sub of subscriptions) {
      try {
        const pushSub: PushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        const result = await sendPushNotification(pushSub, {
          title: notificationTitle,
          body: notificationBody,
          url: notificationUrl,
        });

        if (result.success) {
          sent++;
          results.push({ subscriptionId: String(sub.id), status: 'sent' });
          
          // Log to notification_deliveries if table exists (silently fail if not)
          try {
            await db.supabase.from('notification_deliveries').insert({
              user_id: sub.user_id,
              channel: 'webpush',
              status: 'sent',
              created_at: new Date().toISOString(),
            });
          } catch {
            // Table might not exist, ignore
          }
        } else {
          failed++;
          const errorMsg = result.error || 'Unknown error';
          results.push({ subscriptionId: String(sub.id), status: 'failed', error: errorMsg });

          // If subscription expired (404/410), delete it
          if (errorMsg.includes('expired') || errorMsg.includes('410') || errorMsg.includes('404')) {
            try {
              await db.supabase
                .from(tableName)
                .delete()
                .eq('id', sub.id);
              deactivated++;
            } catch (updateError) {
              console.error('[TEST-PUSH] Error deleting expired subscription:', updateError);
            }
          }

          // Log failure to notification_deliveries if table exists
          try {
            await db.supabase.from('notification_deliveries').insert({
              user_id: sub.user_id,
              channel: 'webpush',
              status: 'failed',
              error: errorMsg,
              created_at: new Date().toISOString(),
            });
          } catch {
            // Table might not exist, ignore
          }
        }
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ subscriptionId: String(sub.id), status: 'failed', error: errorMsg });
        console.error('[TEST-PUSH] Error sending to subscription:', sub.id, error);
      }
    }

    const response = NextResponse.json({
      ok: true,
      sent,
      failed,
      deactivated,
      results,
    });

    // Set no-store headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  } catch (error) {
    // Check if it's an AdminAuthError
    if (error instanceof AdminAuthError) {
      return adminErrorToResponse(error);
    }
    console.error('[TEST-PUSH] Error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
