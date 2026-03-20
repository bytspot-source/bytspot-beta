import { trpc } from './trpc';

export type EventCategory =
  | 'concert'
  | 'rooftop'
  | 'happyhour'
  | 'comedy'
  | 'art'
  | 'food'
  | 'sports';

export interface AppEvent {
  id: string;
  title: string;
  venue: string;
  date: string;
  time: string;
  category: EventCategory;
  emoji: string;
  price: string;
  image: string;
  url?: string;
}

// ─── Static fallback (used for instant render before API responds) ──
export const TONIGHT_EVENTS: AppEvent[] = [
  { id: 'evt1', title: 'Jazz & Blues Night', venue: 'City Winery Atlanta', date: 'Tonight', time: '8:00 PM', category: 'concert', emoji: '🎷', price: '$25', image: 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600' },
  { id: 'evt2', title: 'Rooftop Thursdays', venue: 'Ponce City Market', date: 'Tonight', time: '7:00 PM', category: 'rooftop', emoji: '🌃', price: 'Free', image: 'https://images.unsplash.com/photo-1560448204-603b3fc33ddc?w=600' },
  { id: 'evt3', title: 'Happy Hour Specials', venue: 'Stats Brewpub', date: 'Tonight', time: '4–7 PM', category: 'happyhour', emoji: '🍺', price: '$5 drafts', image: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=600' },
  { id: 'evt4', title: 'Stand-Up Comedy', venue: 'Laughing Skull Lounge', date: 'Tonight', time: '9:30 PM', category: 'comedy', emoji: '😂', price: '$15', image: 'https://images.unsplash.com/photo-1527224538127-2104bb71c51b?w=600' },
  { id: 'evt5', title: 'Art Walk Midtown', venue: 'MOCA GA', date: 'Tonight', time: '6:00 PM', category: 'art', emoji: '🎨', price: 'Free', image: 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=600' },
  { id: 'evt6', title: 'Sunday Brunch Party', venue: 'The Optimist', date: 'Sunday', time: '11:00 AM', category: 'food', emoji: '🥂', price: '$45', image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600' },
];

// ─── Sync — read cached events from localStorage ───────────────────
const EVENTS_CACHE_KEY = 'bytspot_events_cache';

export function getCachedEvents(): AppEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return TONIGHT_EVENTS;
}

// ─── Async — fetch from API, sync to localStorage ──────────────────
export async function getEventsAsync(category?: string): Promise<AppEvent[]> {
  try {
    const res = await trpc.events.list.query(category ? { category } : {});
    const events: AppEvent[] = (res.events as AppEvent[]).map((e) => ({
      ...e,
      category: (e.category ?? 'concert') as EventCategory,
    }));
    localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(events));
    return events;
  } catch {
    return getCachedEvents();
  }
}

