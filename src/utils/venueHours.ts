/** Venue hours & open/closed status utility */

export interface VenueHours {
  open: number;   // 24h hour, e.g. 17 = 5pm
  close: number;  // 24h hour, e.g. 2 = 2am next day (>24 means next day)
  days: number[]; // 0=Sun … 6=Sat
}

// Default hours by category — can be overridden per venue
const CATEGORY_HOURS: Record<string, VenueHours> = {
  bar:           { open: 17, close: 26, days: [0,1,2,3,4,5,6] },
  nightlife:     { open: 20, close: 26, days: [3,4,5,6] },
  restaurant:    { open: 11, close: 22, days: [0,1,2,3,4,5,6] },
  dining:        { open: 11, close: 22, days: [0,1,2,3,4,5,6] },
  coffee:        { open:  7, close: 19, days: [0,1,2,3,4,5,6] },
  shopping:      { open: 10, close: 21, days: [0,1,2,3,4,5,6] },
  entertainment: { open: 12, close: 24, days: [0,1,2,3,4,5,6] },
  fitness:       { open:  6, close: 22, days: [0,1,2,3,4,5,6] },
  default:       { open: 10, close: 22, days: [0,1,2,3,4,5,6] },
};

export function getVenueHours(category: string): VenueHours {
  return CATEGORY_HOURS[category] || CATEGORY_HOURS.default;
}

export function isVenueOpen(category: string): boolean {
  const now = new Date();
  const h = now.getHours();
  const day = now.getDay();
  const hrs = getVenueHours(category);
  if (!hrs.days.includes(day)) return false;
  const normalizedClose = hrs.close > 24 ? hrs.close - 24 : hrs.close;
  if (hrs.close > 24) {
    // closes after midnight: open if h >= open OR h < normalizedClose
    return h >= hrs.open || h < normalizedClose;
  }
  return h >= hrs.open && h < hrs.close;
}

export function getClosesSoonText(category: string): string | null {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const hrs = getVenueHours(category);
  const closeHour = hrs.close > 24 ? hrs.close - 24 : hrs.close;
  const minutesUntilClose = (closeHour * 60) - (h * 60 + m);
  if (minutesUntilClose > 0 && minutesUntilClose <= 60) {
    return `Closes in ${minutesUntilClose}m`;
  }
  return null;
}

export function getOpenStatusText(category: string): { label: string; color: string } {
  if (!isVenueOpen(category)) {
    const hrs = getVenueHours(category);
    const openStr = hrs.open >= 12 ? `${hrs.open - 12}pm` : `${hrs.open}am`;
    return { label: `Opens ${openStr}`, color: 'text-white/40' };
  }
  const soon = getClosesSoonText(category);
  if (soon) return { label: soon, color: 'text-orange-400' };
  return { label: 'Open Now', color: 'text-green-400' };
}

// ── Trending: check-in velocity tracking ────────────────────────────────────

const TRENDING_KEY = 'bytspot_trending_checkins';

interface CheckinRecord {
  venueId: string;
  venueName: string;
  ts: number;
}

export function recordTrendingCheckin(venueId: string, venueName: string) {
  try {
    const records: CheckinRecord[] = JSON.parse(localStorage.getItem(TRENDING_KEY) || '[]');
    records.push({ venueId, venueName, ts: Date.now() });
    // Keep only last 200 records
    localStorage.setItem(TRENDING_KEY, JSON.stringify(records.slice(-200)));
  } catch { /* ignore */ }
}

export function getTrendingVenueIds(windowMs = 60 * 60 * 1000): Map<string, number> {
  try {
    const cutoff = Date.now() - windowMs;
    const records: CheckinRecord[] = JSON.parse(localStorage.getItem(TRENDING_KEY) || '[]');
    const counts = new Map<string, number>();
    records.filter(r => r.ts > cutoff).forEach(r => {
      counts.set(r.venueId, (counts.get(r.venueId) || 0) + 1);
    });
    return counts;
  } catch {
    return new Map();
  }
}

