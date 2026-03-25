/**
 * Web Push Notification Utilities
 * Uses web-push library for sending push notifications
 */

import 'server-only';
import webpush from 'web-push';

let vapidInitialized = false;

function initializeVapid() {
  if (vapidInitialized) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:no-reply@egyptgoldpro.com';

  if (!publicKey || !privateKey) {
    console.warn('[PUSH] VAPID keys not configured. Push notifications disabled.');
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidInitialized = true;
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function sendPushNotification(
  subscription: PushSubscription,
  payload: { title: string; body: string; url?: string }
): Promise<{ success: boolean; error?: string }> {
  initializeVapid();

  if (!vapidInitialized) {
    return { success: false, error: 'Push notifications not configured' };
  }

  try {
    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: '/brand/logo.png',
      badge: '/brand/logo.png',
      data: {
        url: payload.url || '/',
      },
    });

    await webpush.sendNotification(subscription, notificationPayload);
    return { success: true };
  } catch (error: unknown) {
    // Handle specific error codes
    const status =
      error && typeof error === 'object' && 'statusCode' in error
        ? (error as { statusCode?: number }).statusCode
        : undefined;
    if (status === 410 || status === 404) {
      // Subscription expired or invalid
      return { success: false, error: 'Subscription expired' };
    }
    console.error('[PUSH] Push notification error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to send push notification';
    return {
      success: false,
      error: msg,
    };
  }
}
