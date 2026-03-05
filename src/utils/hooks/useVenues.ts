/**
 * useVenues — fetches real venue data from bytspot-api.onrender.com
 * Uses SSE for real-time crowd updates, falls back to 60s polling
 * Maps API response → DiscoverCard format for existing UI components
 * Enriches each card with real GPS distance when location is available
 */
import { useState, useEffect, useRef } from 'react';
import { venuesApi, type ApiVenue, API_BASE_URL } from '../api';
import type { DiscoverCard, CardType } from '../mockData';
import { getVenuePrimaryPhoto } from '../venuePhoto';

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
  const image = v.imageUrl || getVenuePrimaryPhoto(v.category, v.name);

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

interface UseVenuesResult {
  venues: ApiVenue[];
  cards: DiscoverCard[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  userCoords: { lat: number; lng: number } | null;
}

export function useVenues(): UseVenuesResult {
  const [venues, setVenues] = useState<ApiVenue[]>([]);
  const [cards, setCards] = useState<DiscoverCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const fetchedRef = useRef(false);
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
    setLoading(true);
    setError(null);
    const res = await venuesApi.getAll();
    if (res.success && res.data?.venues) {
      venuesRef.current = res.data.venues;
      setVenues(res.data.venues);
      setCards(res.data.venues.map((v, i) => venueToCard(v, i, userCoordsRef.current ?? undefined)));
    } else {
      setError(res.error?.message || 'Failed to load venues');
    }
    setLoading(false);
  };

  useEffect(() => {
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
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  return { venues, cards, loading, error, refresh: fetchVenues, userCoords };
}

