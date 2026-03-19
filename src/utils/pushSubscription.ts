/**
 * Bytspot Push Subscription Utility
 *
 * Supports TWO paths:
 * 1. **Native (Capacitor)** — uses @capacitor/push-notifications for APNs token
 * 2. **Web (PWA)** — uses Web Push via service-worker PushManager + VAPID
 *
 * The correct path is chosen automatically at runtime.
 */

import { trpc } from './trpc';

const STORAGE_KEY = 'bytspot_push_subscribed';

/** Detect if we're running inside a Capacitor native shell */
function isNativeApp(): boolean {
  return typeof (window as any).Capacitor !== 'undefined' &&
    (window as any).Capacitor.isNativePlatform?.() === true;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Returns true if push is supported and permission already granted */
export function isPushEnabled(): boolean {
  if (isNativeApp()) return localStorage.getItem(STORAGE_KEY) === 'true';
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    Notification.permission === 'granted' &&
    localStorage.getItem(STORAGE_KEY) === 'true'
  );
}

/**
 * Request permission and subscribe to push notifications.
 * Automatically picks native (APNs) or web (VAPID) path.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (isNativeApp()) return subscribeNative();
  return subscribeWeb();
}

/** Call once on app load to re-register existing subscriptions */
export async function ensurePushSubscribed(): Promise<void> {
  if (!localStorage.getItem(STORAGE_KEY)) return;
  if (!isNativeApp() && Notification.permission !== 'granted') return;
  await subscribeToPush().catch(() => {});
}

// ── Native (Capacitor) path ────────────────────────────────────────────────

async function subscribeNative(): Promise<boolean> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') return false;

    // Listen for the APNs token
    PushNotifications.addListener('registration', async (token) => {
      console.log('[push-native] APNs token:', token.value);
      // Send APNs device token to backend
      await trpc.push.subscribe.mutate({ deviceToken: token.value, platform: 'ios' } as any);
      localStorage.setItem(STORAGE_KEY, 'true');
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push-native] registration error:', err);
    });

    // Trigger registration
    await PushNotifications.register();
    return true;
  } catch (err) {
    console.warn('[push-native] subscription failed:', err);
    return false;
  }
}

// ── Web (PWA) path ─────────────────────────────────────────────────────────

async function subscribeWeb(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;

    // Fetch VAPID public key from backend via tRPC
    const { key } = await trpc.push.vapidPublicKey.query();
    const applicationServerKey = urlBase64ToUint8Array(key);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    // Send subscription to backend via tRPC
    await trpc.push.subscribe.mutate({ subscription: subscription.toJSON() as any });

    localStorage.setItem(STORAGE_KEY, 'true');
    return true;
  } catch (err) {
    console.warn('[push-web] subscription failed:', err);
    return false;
  }
}

