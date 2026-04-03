/**
 * Bytspot Native Haptics Utility
 *
 * Uses @capacitor/haptics on native (iOS/Android) for rich tactile feedback.
 * Falls back to navigator.vibrate on web / when the plugin isn't installed.
 *
 * Apple App Review: demonstrates native device integration beyond a web wrapper.
 */

let Haptics: any = null;
let ImpactStyle: any = null;
let NotificationType: any = null;
let hapticsLoaded = false;

/** Lazy-load the Capacitor Haptics plugin (no-op on web) */
async function loadHaptics() {
  if (hapticsLoaded) return;
  hapticsLoaded = true;
  try {
    const mod = await import('@capacitor/haptics');
    Haptics = mod.Haptics;
    ImpactStyle = mod.ImpactStyle;
    NotificationType = mod.NotificationType;
  } catch {
    // Plugin not installed — will use web fallback
  }
}

// Kick off the lazy load immediately so it's ready by first interaction
loadHaptics();

/** Web fallback vibration */
function vibrateFallback(ms: number = 10) {
  try {
    if ('vibrate' in navigator) navigator.vibrate(ms);
  } catch { /* ignore */ }
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Light impact — use for button taps, tab switches, card swipes
 */
export async function impactLight() {
  if (Haptics) {
    try { await Haptics.impact({ style: ImpactStyle.Light }); return; } catch {}
  }
  vibrateFallback(10);
}

/**
 * Medium impact — use for confirming actions (save spot, check-in)
 */
export async function impactMedium() {
  if (Haptics) {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); return; } catch {}
  }
  vibrateFallback(20);
}

/**
 * Heavy impact — use for destructive or significant actions (delete, reserve)
 */
export async function impactHeavy() {
  if (Haptics) {
    try { await Haptics.impact({ style: ImpactStyle.Heavy }); return; } catch {}
  }
  vibrateFallback(30);
}

/**
 * Success notification — use after completing an action (reservation confirmed, login)
 */
export async function notifySuccess() {
  if (Haptics) {
    try { await Haptics.notification({ type: NotificationType.Success }); return; } catch {}
  }
  vibrateFallback(15);
}

/**
 * Warning notification — use for caution states (venue packed, slow connection)
 */
export async function notifyWarning() {
  if (Haptics) {
    try { await Haptics.notification({ type: NotificationType.Warning }); return; } catch {}
  }
  vibrateFallback(25);
}

/**
 * Error notification — use for failures (payment failed, network error)
 */
export async function notifyError() {
  if (Haptics) {
    try { await Haptics.notification({ type: NotificationType.Error }); return; } catch {}
  }
  vibrateFallback(40);
}

/**
 * Selection changed — use for picker scrolls, toggle changes, slider moves
 */
export async function selectionChanged() {
  if (Haptics) {
    try { await Haptics.selectionChanged(); return; } catch {}
  }
  vibrateFallback(5);
}

