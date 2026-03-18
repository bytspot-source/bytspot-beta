/**
 * Bytspot Push Subscription Utility
 * Subscribes the user to Web Push notifications using the backend VAPID public key.
 */

import { trpc } from './trpc';

const STORAGE_KEY = 'bytspot_push_subscribed';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/** Returns true if push is supported and permission already granted */
export function isPushEnabled(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    Notification.permission === 'granted' &&
    localStorage.getItem(STORAGE_KEY) === 'true'
  );
}

/**
 * Request permission and subscribe to push notifications.
 * Fetches the VAPID public key from the API, creates a PushSubscription,
 * and POSTs it to /push/subscribe.
 */
export async function subscribeToPush(): Promise<boolean> {
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
    console.warn('[push] subscription failed:', err);
    return false;
  }
}

/** Call once on app load to re-register existing subscriptions */
export async function ensurePushSubscribed(): Promise<void> {
  if (!localStorage.getItem(STORAGE_KEY)) return;
  if (Notification.permission !== 'granted') return;
  // Silently re-subscribe to refresh the endpoint if needed
  await subscribeToPush().catch(() => {});
}

