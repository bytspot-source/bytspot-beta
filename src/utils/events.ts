import { trpc } from './trpc';
import { loadEventsViaRpc, type AppEvent } from './eventDiscoveryRpc';

export type { AppEvent, EventCategory } from './eventDiscoveryRpc';
export { EVENT_DISCOVERY_RPC_CONTRACT } from './eventDiscoveryRpc';

// ─── Sync — read cached events from localStorage ───────────────────
const EVENTS_CACHE_KEY = 'bytspot_events_cache';

export function getCachedEvents(): AppEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

// ─── Async — fetch from API, sync to localStorage ──────────────────
export async function getEventsAsync(category?: string): Promise<AppEvent[]> {
  const fallbackEvents = getCachedEvents();
  const result = await loadEventsViaRpc(trpc, category ? { category } : {}, fallbackEvents);
  try {
    const events = result.events;
    if (result.source === 'backend') localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(events));
    return events;
  } catch {
    return result.events.length > 0 ? result.events : fallbackEvents;
  }
}

