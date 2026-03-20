/**
 * useVenues — fetches real venue data from bytspot-api.onrender.com
 * Uses SSE for real-time crowd updates, falls back to 60s polling
 * Maps API response → DiscoverCard format for existing UI components
 * Enriches each card with real GPS distance when location is available
 */
import { useState, useEffect, useRef } from 'react';
import { trpc, API_BASE_URL, type ApiVenue } from '../trpc';
import type { DiscoverCard, CardType } from '../mockData';
import { resolveVenuePhoto } from '../venuePhoto';

/** Haversine — returns distance in miles between two lat/lng points */
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(miles: number): string {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(1)} mi`;
}

/** Map API category → CardType */
function mapCategory(category: string): CardType {
  const normalized = category.trim().toLowerCase();
  const map: Record<string, CardType> = {
    restaurant: 'dining',
    food: 'dining',
    bar: 'nightlife',
    club: 'nightlife',
    nightlife: 'nightlife',
    entertainment: 'entertainment',
    shopping: 'shopping',
    market: 'shopping',
    valet: 'valet',
    'valet service': 'valet',
    valet_service: 'valet',
    'valet-service': 'valet',
    parking: 'parking',
    garage: 'parking',
    lot: 'parking',
    parking_lot: 'parking',
    'parking lot': 'parking',
    parking_garage: 'parking',
    'parking garage': 'parking',
    park: 'venue',
    fitness: 'fitness',
    gym: 'fitness',
    coffee: 'coffee',
    cafe: 'coffee',
  };
  return map[normalized] || 'venue';
}

/** Map API crowd label → human-friendly availability (level is 1-4) */
function crowdToAvailability(crowd: ApiVenue['crowd']): string {
  if (!crowd) return 'Unknown';
  // Use the label the API already provides: "Chill", "Active", "Busy", "Packed"
  return crowd.label || 'Unknown';
}

/** Convert an ApiVenue → DiscoverCard. Pass userCoords to get a real distance string. */
export function venueToCard(v: ApiVenue, index: number, userCoords?: { lat: number; lng: number }): DiscoverCard {
  const cardType = mapCategory(v.category);
  const image = resolveVenuePhoto({ imageUrl: v.imageUrl, category: v.category, name: v.name });

  let distance = '—';
  if (userCoords && typeof v.lat === 'number' && typeof v.lng === 'number') {
    const miles = haversineMiles(userCoords.lat, userCoords.lng, v.lat, v.lng);
    distance = formatDistance(miles);
  }

  return {
    id: index + 1,
    type: cardType,
    name: v.name,
    image,
    distance,
    rating: 4.5 + Math.random() * 0.5, // placeholder until reviews exist
    availability: crowdToAvailability(v.crowd),
    vibe: v.crowd ? Math.round((5 - v.crowd.level) * 2.5) : undefined, // level 1→10, 2→8, 3→5, 4→3
    description: v.address,
    location: v.address,
    features: v.parking.spots.length > 0
      ? [`${v.parking.totalAvailable} parking spots`, ...v.parking.spots.slice(0, 2).map(p => p.name)]
      : undefined,
    price: v.parking.spots[0] ? `$${v.parking.spots[0].pricePerHr}/hr` : undefined,
    spots: v.parking.totalAvailable || undefined,
    verified: true,
    // Stash the slug for detail lookups
    _slug: v.slug,
    _lat: v.lat,
    _lng: v.lng,
  } as DiscoverCard & { _slug: string; _lat: number; _lng: number };
}

/** Map a Google Places result → DiscoverCard */
const GOOGLE_TYPE_TO_CARD: Record<string, CardType> = {
  restaurant: 'dining', cafe: 'coffee', coffee_shop: 'coffee',
  bar: 'nightlife', night_club: 'nightlife',
  clothing_store: 'shopping', shopping_mall: 'shopping',
  gym: 'fitness', movie_theater: 'entertainment', amusement_park: 'entertainment',
  parking: 'parking',
};

function googleTypeToCardType(types: string[], primaryType: string | null): CardType {
  if (primaryType) {
    const mapped = GOOGLE_TYPE_TO_CARD[primaryType];
    if (mapped) return mapped;
  }
  for (const t of types) {
    const mapped = GOOGLE_TYPE_TO_CARD[t];
    if (mapped) return mapped;
  }
  return 'venue';
}

export function placeToCard(
  p: { placeId: string; name: string; address: string; lat: number; lng: number; rating: number | null; ratingCount: number; types: string[]; primaryType: string | null; photoUrls: string[]; isOpen: boolean | null; websiteUri: string | null; priceLevel: string | null },
  index: number,
  userCoords?: { lat: number; lng: number },
): DiscoverCard {
  const cardType = googleTypeToCardType(p.types, p.primaryType);
  const image = resolveVenuePhoto({ photoUrls: p.photoUrls, category: cardType, name: p.name });

  let distance = '—';
  if (userCoords) {
    const miles = haversineMiles(userCoords.lat, userCoords.lng, p.lat, p.lng);
    distance = formatDistance(miles);
  }

  return {
    id: 20_000 + index,
    type: cardType,
    name: p.name,
    image,
    distance,
    rating: p.rating ?? undefined,
    ratingCount: p.ratingCount,
    description: p.address,
    location: p.address,
    website: p.websiteUri ?? undefined,
    isOpen: p.isOpen,
    placeId: p.placeId,
    photoUrls: p.photoUrls,
    verified: false,
    _lat: p.lat,
    _lng: p.lng,
  } as DiscoverCard;
}

interface UseVenuesResult {
  venues: ApiVenue[];
  cards: DiscoverCard[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  userCoords: { lat: number; lng: number } | null;
  /** Search Google Places and return results as DiscoverCards */
  searchPlaces: (query: string) => Promise<DiscoverCard[]>;
  /** Nearby search via Google Places for a specific type */
  searchNearby: (type?: string) => Promise<DiscoverCard[]>;
  placesLoading: boolean;
}

export function useVenues(): UseVenuesResult {
  const [venues, setVenues] = useState<ApiVenue[]>([]);
  const [cards, setCards] = useState<DiscoverCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const fetchedRef = useRef(false);
  const isMountedRef = useRef(true);
  const latestRequestIdRef = useRef(0);
  const venuesRef = useRef<ApiVenue[]>([]);
  const userCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // ── GPS location ──────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        userCoordsRef.current = coords;
        setUserCoords(coords);
        // Re-enrich existing cards with fresh distances
        if (venuesRef.current.length > 0) {
          setCards(venuesRef.current.map((v, i) => venueToCard(v, i, coords)));
        }
      },
      () => { /* permission denied or unavailable — keep '—' */ },
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 10_000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const fetchVenues = async () => {
    const requestId = ++latestRequestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await trpc.venues.list.query();

      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) {
        return;
      }

      venuesRef.current = res.venues;
      setVenues(res.venues);
      setCards(res.venues.map((v, i) => venueToCard(v, i, userCoordsRef.current ?? undefined)));
      setError(null);
    } catch (err: any) {
      if (!isMountedRef.current || requestId !== latestRequestIdRef.current) return;
      setError(err?.message || 'Failed to load venues');
    }

    setLoading(false);
  };

  useEffect(() => {
    isMountedRef.current = true;

    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchVenues();
    }

    // ── SSE: real-time crowd updates ───────────────────────────
    let es: EventSource | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    try {
      es = new EventSource(`${API_BASE_URL}/venues/crowd/stream`);

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'snapshot') {
            // Merge crowd snapshot into current venues list
            setVenues((prev) => {
              if (!prev.length) return prev;
              const updated = prev.map((v) => {
                const snap = (msg.venues as Array<{ id: string; crowd: ApiVenue['crowd'] }>).find((s) => s.id === v.id);
                return snap ? { ...v, crowd: snap.crowd } : v;
              });
              venuesRef.current = updated;
              setCards(updated.map((v, i) => venueToCard(v, i, userCoordsRef.current ?? undefined)));
              return updated;
            });
          } else if (msg.type === 'update') {
            setVenues((prev) => {
              const updated = prev.map((v) =>
                v.id === msg.venueId ? { ...v, crowd: msg.crowd } : v
              );
              venuesRef.current = updated;
              setCards(updated.map((v, i) => venueToCard(v, i, userCoordsRef.current ?? undefined)));
              return updated;
            });
          }
        } catch { /* malformed message — ignore */ }
      };

      es.onerror = () => {
        // SSE failed — fall back to 60s polling
        es?.close();
        es = null;
        if (!pollInterval) {
          pollInterval = setInterval(() => { fetchVenues(); }, 60_000);
        }
      };
    } catch {
      // Browser doesn't support EventSource — use polling
      pollInterval = setInterval(() => { fetchVenues(); }, 60_000);
    }

    return () => {
      isMountedRef.current = false;
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  // ── Google Places: text search ─────────────────────────
  const searchPlaces = async (query: string): Promise<DiscoverCard[]> => {
    setPlacesLoading(true);
    try {
      const res = await trpc.places.textSearch.query({ query, maxResults: 10 });
      return res.places.map((p, i) => placeToCard(p, i, userCoordsRef.current ?? undefined));
    } catch (err: any) {
      console.error('[searchPlaces]', err?.message);
      return [];
    } finally {
      setPlacesLoading(false);
    }
  };

  // ── Google Places: nearby search ──────────────────────
  const searchNearby = async (type?: string): Promise<DiscoverCard[]> => {
    const coords = userCoordsRef.current ?? { lat: 33.7756, lng: -84.3963 }; // default: Atlanta
    setPlacesLoading(true);
    try {
      const res = await trpc.places.nearbySearch.query({ lat: coords.lat, lng: coords.lng, type, maxResults: 10 });
      return res.places.map((p, i) => placeToCard(p, i, userCoordsRef.current ?? undefined));
    } catch (err: any) {
      console.error('[searchNearby]', err?.message);
      return [];
    } finally {
      setPlacesLoading(false);
    }
  };

  return { venues, cards, loading, error, refresh: fetchVenues, userCoords, searchPlaces, searchNearby, placesLoading };
}

