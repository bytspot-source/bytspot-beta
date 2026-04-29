/**
 * Pure helpers for the MapSection venue list.
 * Kept free of React + DOM so they're trivially unit-testable.
 */
import type { ApiVenue } from './trpc';

/** A venue is "Bytspot Verified" when it has a hardware patch bound to it. */
export function hasHardwarePatchInstalled(venue: ApiVenue | null | undefined): boolean {
  return Boolean(venue?.hardwarePatch?.id);
}

/**
 * Tokens identifying an eBike / bike-share station. Matches both vendor-onboarded
 * categories (`bike-share`, `ebike-station`) and Google Places types
 * (`bicycle_store`, `bike_rental`, `bike_share_station`).
 */
const BIKE_STATION_TOKENS = [
  'bike-share', 'bike_share', 'bikeshare',
  'ebike-station', 'ebike_station', 'ebike',
  'bicycle_store', 'bike_rental', 'bike_share_station',
];

/** True when a venue represents an eBike or bike-share station. */
export function isBikeStation(venue: ApiVenue | null | undefined): boolean {
  if (!venue) return false;
  const cat = String(venue.category ?? '').toLowerCase();
  if (BIKE_STATION_TOKENS.some((t) => cat.includes(t))) return true;
  const types = Array.isArray(venue.types) ? (venue.types as string[]) : [];
  return types.some((t) => BIKE_STATION_TOKENS.includes(String(t).toLowerCase()));
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
