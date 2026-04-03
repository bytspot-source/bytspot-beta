/**
 * Bytspot Native Share Utility
 *
 * Uses @capacitor/share on native platforms for the OS-level share sheet.
 * Falls back to Web Share API, then clipboard copy.
 *
 * Apple App Review: demonstrates native OS integration (share sheet).
 */

import { toast } from 'sonner@2.0.3';

interface ShareOptions {
  title: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

/**
 * Share content using the best available method:
 * 1. Capacitor native share sheet (iOS/Android)
 * 2. Web Share API (modern mobile browsers)
 * 3. Clipboard fallback (desktop / older browsers)
 */
export async function nativeShare(options: ShareOptions): Promise<boolean> {
  // 1. Try Capacitor native share
  try {
    const { Share } = await import('@capacitor/share');
    await Share.share({
      title: options.title,
      text: options.text,
      url: options.url,
      dialogTitle: options.dialogTitle ?? 'Share via Bytspot',
    });
    return true;
  } catch {
    // Plugin not installed or not on native — try web fallback
  }

  // 2. Try Web Share API
  if (navigator.share) {
    try {
      await navigator.share({
        title: options.title,
        text: options.text,
        url: options.url,
      });
      return true;
    } catch {
      // User cancelled or API error — try clipboard
    }
  }

  // 3. Clipboard fallback
  const shareText = [options.text, options.url].filter(Boolean).join('\n');
  try {
    await navigator.clipboard.writeText(shareText);
    toast.success('Link copied!', { description: 'Share it with your friends' });
    return true;
  } catch {
    toast.error('Could not share', { description: 'Please copy the link manually' });
    return false;
  }
}

/**
 * Share a venue with friends
 */
export function shareVenue(venueName: string, venueId?: string) {
  const url = venueId
    ? `https://bytspot.com/venue/${venueId}`
    : 'https://bytspot.com';
  return nativeShare({
    title: `Check out ${venueName} on Bytspot`,
    text: `🔥 ${venueName} — see live crowd levels, parking & more on Bytspot`,
    url,
  });
}

/**
 * Share referral link
 */
export function shareReferral(referralUrl: string) {
  return nativeShare({
    title: 'Join me on Bytspot',
    text: '🔥 I\'m using Bytspot to find the best spots in the city — live crowds, parking, everything. Use my link:',
    url: referralUrl,
  });
}

