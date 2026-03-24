/**
 * Push Notifications — browser subscription utility
 *
 * Handles:
 * 1. Service worker registration
 * 2. Browser notification permission request
 * 3. VAPID-based PushSubscription creation
 * 4. Sending the subscription to the backend
 */
import { API_BASE_URL } from './trpc';

/** Convert a base64 URL-safe string to a Uint8Array (required by pushManager.subscribe) */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Fetch the VAPID public key from the API */
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/push/vapid-public-key`);
    const data = await res.json();
    return data.key || null;
  } catch {
    console.warn('[push] Failed to fetch VAPID key');
    return null;
  }
}

/** Check if push notifications are supported by this browser */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Get the current Notification permission state */
export function getPermissionState(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

/** Check if the user is already subscribed to push */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}

/**
 * Subscribe the browser to push notifications.
 * Returns true on success, false on failure.
 *
 * Flow:
 * 1. Register service worker (if not already)
 * 2. Request notification permission
 * 3. Create PushSubscription with VAPID key
 * 4. POST subscription to /push/subscribe
 */
export async function subscribeToPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications are not supported in this browser.' };
  }

  // 1. Register SW
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
  } catch {
    return { success: false, error: 'Failed to register service worker.' };
  }

  // 2. Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, error: 'Notification permission was denied.' };
  }

  // 3. Get VAPID key and create subscription
  const vapidKey = await getVapidPublicKey();
  if (!vapidKey) {
    return { success: false, error: 'Could not retrieve push configuration from server.' };
  }

  let subscription: PushSubscription;
  try {
    // Unsubscribe any existing subscription first to avoid duplicates
    const existing = await registration.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create push subscription.' };
  }

  // 4. Send subscription to backend
  try {
    const token = localStorage.getItem('bytspot_auth_token');
    const res = await fetch(`${API_BASE_URL}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!res.ok) throw new Error('Server rejected subscription');
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to register subscription with server.' };
  }
}

/** Unsubscribe from push notifications */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    return true;
  } catch {
    return false;
  }
}

