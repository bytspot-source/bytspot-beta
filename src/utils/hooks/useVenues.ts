/**
 * useVenues — fetches real venue data from bytspot-api.onrender.com
 * Maps API response → DiscoverCard format for existing UI components
 */
import { useState, useEffect, useRef } from 'react';
import { venuesApi, type ApiVenue } from '../api';
import type { DiscoverCard, CardType } from '../mockData';

// Category images (Unsplash fallbacks when API imageUrl is null)
const CATEGORY_IMAGES: Record<string, string> = {
  restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
  bar: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800',
  entertainment: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
  shopping: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800',
  park: 'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=800',
  fitness: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
  coffee: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
  nightlife: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800',
  default: 'https://images.unsplash.com/photo-1496568816309-51d7c20e3b21?w=800',
};

/** Map API category → CardType */
function mapCategory(category: string): CardType {
  const map: Record<string, CardType> = {
    restaurant: 'dining',
    bar: 'nightlife',
    entertainment: 'entertainment',
    shopping: 'shopping',
    park: 'venue',
    fitness: 'fitness',
    coffee: 'coffee',
    nightlife: 'nightlife',
  };
  return map[category] || 'venue';
}

/** Map API crowd label → human-friendly availability */
function crowdToAvailability(crowd: ApiVenue['crowd']): string {
  if (!crowd) return 'Unknown';
  if (crowd.level <= 30) return 'Not Busy';
  if (crowd.level <= 60) return 'Moderate';
  if (crowd.level <= 80) return 'Busy';
  return 'Very Busy';
}

/** Convert an ApiVenue → DiscoverCard */
export function venueToCard(v: ApiVenue, index: number): DiscoverCard {
  const cardType = mapCategory(v.category);
  const image = v.imageUrl || CATEGORY_IMAGES[v.category] || CATEGORY_IMAGES.default;

  return {
    id: index + 1,
    type: cardType,
    name: v.name,
    image,
    distance: '—', // will be enriched by nearby endpoint
    rating: 4.5 + Math.random() * 0.5, // placeholder until reviews exist
    availability: crowdToAvailability(v.crowd),
    vibe: v.crowd ? Math.round((100 - v.crowd.level) / 10) : undefined,
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

  const fetchVenues = async () => {
    setLoading(true);
    setError(null);

    const res = await venuesApi.getAll();

    if (res.success && res.data?.venues) {
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
  }, []);

  return { venues, cards, loading, error, refresh: fetchVenues };
}

