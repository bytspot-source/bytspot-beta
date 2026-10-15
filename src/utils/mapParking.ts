/**
 * Pure helpers for assembling the MapSection parking layer from a tiered
 * data strategy:
 *
 *   1. Vendor-reported  — venues from trpc.venues.list whose `parking.spots`
 *      array is non-empty. Source of truth for live availability and pricing.
 *   2. Google Places    — discovery-only results from trpc.places.nearbySearch
 *      with `type: parking`. Live availability is unknown so fields are zeroed
 *      and consumers should treat them as "third-party listings".
 *
 * There is no bundled list: with neither source, the map has no parking pins.
 *
 * Helpers are deliberately pure and side-effect free so they can be unit
 * tested without rendering MapSection or hitting the network.
 */
import type { ApiVenue } from './trpc';

export type AvailabilityStatus = 'available' | 'limited' | 'full';
export type SecurityLevel = 'basic' | 'standard' | 'premium';
export type EVConnectorType = 'tesla' | 'ccs' | 'chademo' | 'j1772';

/** Source bucket — the UI uses this to decide which copy to show. */
export type ParkingSource = 'vendor' | 'places' | 'fallback';

export interface MapParkingSpot {
  id: number;
  lat: number;
  lng: number;
  name: string;
  available: number;
  total: number;
  price: number; // dollars per hour, 0 means unknown
  isPremium: boolean;
  hasEVCharging: boolean;
  evConnectorTypes?: EVConnectorType[];
  isCovered: boolean;
  securityLevel: SecurityLevel;
  hasCameras: boolean;
  isReserved: boolean;
  /** Origin of this row — vendor wins, places fills gaps. */
  source: ParkingSource;
}

/** djb2-style stable hash so a string id maps to a stable positive integer. */
export function stableNumericId(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i += 1) h = ((h * 33) ^ seed.charCodeAt(i)) >>> 0;
  return (h % 9_000_000) + 100_000; // keep clear of fallback ids 1-99
}

/**
 * Aggregate one venue's `parking.spots[]` into a single MapParkingSpot pinned
 * at the venue's lat/lng. Spots in the public API don't carry per-spot coords,
 * so a venue with multiple sub-lots collapses into one marker for now.
 */
export function venueToParkingSpot(venue: ApiVenue): MapParkingSpot | null {
  const v = venue as ApiVenue & {
    parking?: { totalAvailable?: number; spots?: Array<{ name?: string; type?: string; total?: number; pricePerHr?: number | null }> };
  };
  const spots = v.parking?.spots ?? [];
  if (spots.length === 0) return null;
  if (typeof v.lat !== 'number' || typeof v.lng !== 'number') return null;

  const total = spots.reduce((sum, s) => sum + (s.total ?? 0), 0);
  const available = Math.min(total, v.parking?.totalAvailable ?? 0);
  const firstPrice = spots.find(s => typeof s.pricePerHr === 'number')?.pricePerHr ?? 0;

  return {
    id: stableNumericId(`venue:${v.id}`),
    lat: v.lat, lng: v.lng,
    name: spots[0]?.name ? `${v.name} — ${spots[0].name}` : v.name,
    available, total: total || available || 0,
    price: firstPrice ?? 0,
    isPremium: false, hasEVCharging: false, isCovered: false,
    securityLevel: 'standard', hasCameras: false, isReserved: false,
    source: 'vendor',
  };
}

/** Map a Google Places "parking" result into a discovery-only marker. */
export interface PlacesParkingResult {
  placeId: string; name: string; lat: number; lng: number;
}
export function placeToParkingSpot(place: PlacesParkingResult): MapParkingSpot {
  return {
    id: stableNumericId(`place:${place.placeId}`),
    lat: place.lat, lng: place.lng, name: place.name,
    available: 0, total: 0, price: 0,
    isPremium: false, hasEVCharging: false, isCovered: false,
    securityLevel: 'standard', hasCameras: false, isReserved: false,
    source: 'places',
  };
}

/** Two markers within ~30 m collapse — preference goes to the lower tier index. */
const PROXIMITY_DEG = 0.00027; // ~30 m at Atlanta latitude
function nearby(a: MapParkingSpot, b: MapParkingSpot): boolean {
  return Math.abs(a.lat - b.lat) < PROXIMITY_DEG && Math.abs(a.lng - b.lng) < PROXIMITY_DEG;
}

/**
 * Merge tiered parking sources. Vendor entries are always kept. Places entries
 * are kept only when they don't overlap a vendor pin.
 */
export function mergeParkingSources(opts: {
  vendor: MapParkingSpot[];
  places: MapParkingSpot[];
}): MapParkingSpot[] {
  const { vendor, places } = opts;
  const out: MapParkingSpot[] = [...vendor];
  for (const p of places) {
    if (!out.some(existing => nearby(existing, p))) out.push(p);
  }
  return out;
}
