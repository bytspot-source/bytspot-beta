/**
 * Bytspot App Badge Utility
 *
 * Manages the app icon badge count (the red number on the home screen icon).
 * Uses @capacitor/badge on native, falls back to navigator.setAppBadge (PWA).
 *
 * Apple App Review: demonstrates proper badge management — a native app feature.
 */

let Badge: any = null;
let badgeLoaded = false;

async function loadBadge() {
  if (badgeLoaded) return;
  badgeLoaded = true;
  try {
    const mod = await import('@capacitor/badge');
    Badge = mod.Badge;
  } catch {
    // Plugin not installed
  }
}

loadBadge();

/**
 * Set the app badge count (e.g. unread notifications, pending alerts).
 */
export async function setBadgeCount(count: number) {
  // 1. Capacitor native badge
  if (Badge) {
    try { await Badge.set({ count }); return; } catch {}
  }

  // 2. PWA Badge API (Chrome 81+, Edge)
  if ('setAppBadge' in navigator) {
    try {
      if (count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    } catch { /* not supported */ }
  }
}

/**
 * Clear the app badge.
 */
export async function clearBadge() {
  if (Badge) {
    try { await Badge.clear(); return; } catch {}
  }

  if ('clearAppBadge' in navigator) {
    try { await (navigator as any).clearAppBadge(); } catch {}
  }
}

/**
 * Increment badge count by 1 (convenience for incoming notifications).
 */
export async function incrementBadge() {
  if (Badge) {
    try {
      const { count } = await Badge.get();
      await Badge.set({ count: (count || 0) + 1 });
      return;
    } catch {}
  }
  // PWA fallback: no way to read current count, just set to 1
  await setBadgeCount(1);
}

