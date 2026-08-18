/**
 * Bytspot Push Subscription Utility
 *
 * Native (Capacitor) APNs is the only live path. Web / PWA push is retired.
 */

import { trpc } from './trpc';

const STORAGE_KEY = 'bytspot_push_subscribed';

/** Detect if we're running inside a Capacitor native shell */
function isNativeApp(): boolean {
  return typeof (window as any).Capacitor !== 'undefined' &&
    (window as any).Capacitor.isNativePlatform?.() === true;
}

/** Returns true if push is supported and permission already granted */
export function isPushEnabled(): boolean {
  if (isNativeApp()) return localStorage.getItem(STORAGE_KEY) === 'true';
  return false;
}

/**
 * Request permission and subscribe to push notifications.
 * Native APNs only — web push always fails closed.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (isNativeApp()) return subscribeNative();
  return false;
}

/** Call once on app load to re-register existing subscriptions */
export async function ensurePushSubscribed(): Promise<void> {
  if (!localStorage.getItem(STORAGE_KEY)) return;
  if (!isNativeApp()) return;
  await subscribeToPush().catch(() => {});
}

async function subscribeNative(): Promise<boolean> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') return false;

    PushNotifications.addListener('registration', async (token) => {
      await trpc.push.subscribe.mutate({ deviceToken: token.value, platform: 'ios' } as any);
      localStorage.setItem(STORAGE_KEY, 'true');
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push-native] registration error:', err);
    });

    await PushNotifications.register();
    return true;
  } catch (err) {
    console.warn('[push-native] subscription failed:', err);
    return false;
  }
}
