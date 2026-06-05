import { Capacitor } from '@capacitor/core';

/** True when React is running inside the native iOS Capacitor shell. */
export function isNativeIOSApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

export function hasBrowserGeolocation(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Automatic browser geolocation inside WKWebView prompts as "localhost".
 * Suppress passive/background requests in native iOS; explicit user actions can
 * still request location until a native geolocation plugin is wired.
 */
export function canUseAutomaticBrowserGeolocation(): boolean {
  return hasBrowserGeolocation() && !isNativeIOSApp();
}