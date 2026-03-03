/**
 * useVenues — fetches real venue data from bytspot-api.onrender.com
 * Uses SSE for real-time crowd updates, falls back to 60s polling
 * Maps API response → DiscoverCard format for existing UI components
 */
import { useState, useEffect, useRef } from 'react';
import { venuesApi, type ApiVenue, API_BASE_URL } from '../api';
import type { DiscoverCard, CardType } from '../mockData';
import { getVenuePrimaryPhoto } from '../venuePhoto';

/** Map API category → CardType */
function mapCategory(category: string): CardType {
  const map: Record<string, CardType> = {
    restaurant: 'dining',
    food: 'dining',
    bar: 'nightlife',
    club: 'nightlife',
    nightlife: 'nightlife',
    entertainment: 'entertainment',
    shopping: 'shopping',
    market: 'shopping',
    park: 'venue',
    fitness: 'fitness',
    gym: 'fitness',
    coffee: 'coffee',
    cafe: 'coffee',
  };
  return map[category] || 'venue';
}

/** Map API crowd label → human-friendly availability (level is 1-4) */
function crowdToAvailability(crowd: ApiVenue['crowd']): string {
  if (!crowd) return 'Unknown';
  // Use the label the API already provides: "Chill", "Active", "Busy", "Packed"
  return crowd.label || 'Unknown';
}

/** Convert an ApiVenue → DiscoverCard */
export function venueToCard(v: ApiVenue, index: number): DiscoverCard {
  const cardType = mapCategory(v.category);
  const image = v.imageUrl || getVenuePrimaryPhoto(v.category, v.name);

  return {
    id: index + 1,
    type: cardType,
    name: v.name,
    image,
    distance: '—', // will be enriched by nearby endpoint
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
}

export function useVenues(): UseVenuesResult {
  const [venues, setVenues] = useState<ApiVenue[]>([]);
  const [cards, setCards] = useState<DiscoverCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  const venuesRef = useRef<ApiVenue[]>([]);

  const fetchVenues = async () => {
    setLoading(true);
    setError(null);
    const res = await venuesApi.getAll();
    if (res.success && res.data?.venues) {
      venuesRef.current = res.data.venues;
      setVenues(res.data.venues);
      setCards(res.data.venues.map((v, i) => venueToCard(v, i)));
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
              setCards(updated.map((v, i) => venueToCard(v, i)));
              return updated;
            });
          } else if (msg.type === 'update') {
            setVenues((prev) => {
              const updated = prev.map((v) =>
                v.id === msg.venueId ? { ...v, crowd: msg.crowd } : v
              );
              venuesRef.current = updated;
              setCards(updated.map((v, i) => venueToCard(v, i)));
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

  return { venues, cards, loading, error, refresh: fetchVenues };
}

