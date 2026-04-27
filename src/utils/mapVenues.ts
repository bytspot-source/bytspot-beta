/**
 * Pure helpers for the MapSection venue list.
 * Kept free of React + DOM so they're trivially unit-testable.
 */
import type { ApiVenue } from './trpc';

/** A venue is "Bytspot Verified" when it has a hardware patch bound to it. */
export function hasHardwarePatchInstalled(venue: ApiVenue | null | undefined): boolean {
  return Boolean(venue?.hardwarePatch?.id);
}

export type MapVenueFilterOptions = {
  showVerifiedOnly: boolean;
  vibeFilter: number | null;
  entryFilter: 'free' | 'paid' | null;
  categoryFilter: string | null;
};

/** Category aliases — same map MapSection has used since the category chips shipped. */
export const VENUE_CATEGORY_MAP: Record<string, string[]> = {
  dining:    ['restaurant', 'food', 'dining'],
  nightlife: ['bar', 'club', 'nightlife', 'lounge'],
  coffee:    ['coffee', 'cafe', 'bakery'],
  parks:     ['park', 'outdoor', 'garden'],
};

/**
 * Apply the active map filters (Verified-only, vibe, entry, category) to a
 * venue list. Pure — no side effects.
 */
export function filterMapVenues(
  venues: ApiVenue[],
  opts: MapVenueFilterOptions,
): ApiVenue[] {
  const { showVerifiedOnly, vibeFilter, entryFilter, categoryFilter } = opts;
  return venues.filter((v) => {
    if (showVerifiedOnly && !hasHardwarePatchInstalled(v)) return false;
    if (vibeFilter !== null && (v.crowd?.level ?? 0) !== vibeFilter) return false;
    if (entryFilter !== null && (v.entryType ?? 'free') !== entryFilter) return false;
    if (categoryFilter !== null) {
      const cat = (v.category ?? '').toLowerCase();
      const allowed = VENUE_CATEGORY_MAP[categoryFilter] ?? [categoryFilter];
      if (!allowed.some((a) => cat.includes(a))) return false;
    }
    return true;
  });
}
