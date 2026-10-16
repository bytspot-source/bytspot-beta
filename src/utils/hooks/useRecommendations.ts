import { useEffect, useState } from 'react';
import { trpc } from '../trpc';

export interface RecommendationAnswers { vibe?: string; walk?: string; group?: string }

export interface Recommendation {
  id: string;
  kind: 'venue' | 'place';
  slug: string | null;
  placeId: string | null;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  walkMinutes: number;
  category: string | null;
  rating: number | null;
  ratingCount: number;
  priceLevel: string | null;
  isOpen: boolean | null;
  photoUrl: string | null;
  photoAttribution: string | null;
  websiteUri: string | null;
  crowd: { level: number; label: string; source: string | null } | null;
  /** Why it was picked, from the place's own data. */
  reasons: string[];
}

export interface RecommendationsState {
  forYou: Recommendation[];
  explore: Recommendation[];
  placesSource: 'none' | 'google' | 'google-stale' | 'unavailable' | null;
  loading: boolean;
}

const EMPTY: RecommendationsState = { forYou: [], explore: [], placesSource: null, loading: false };

export function readQuizAnswers(): RecommendationAnswers {
  try {
    const raw = localStorage.getItem('bytspot_quiz_answers');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** The reasons worth showing under a name: the vibe match is implied by the section. */
export function recommendationDetail(item: Pick<Recommendation, 'reasons'>): string {
  return item.reasons.filter((r) => !r.startsWith('Fits ') && !r.startsWith('Good for ')).join(' · ');
}

/**
 * Places picked for the guest from their answers and position. Nothing is
 * requested without a real position: no city is assumed.
 */
export function useRecommendations(
  coords: { lat: number; lng: number } | null,
  answers: RecommendationAnswers,
  enabled = true,
): RecommendationsState {
  const [state, setState] = useState<RecommendationsState>(EMPTY);
  const lat = coords ? Number(coords.lat.toFixed(3)) : null;
  const lng = coords ? Number(coords.lng.toFixed(3)) : null;
  const { vibe, walk, group } = answers;

  useEffect(() => {
    if (!enabled || lat === null || lng === null) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    trpc.places.recommend
      .query({ lat, lng, vibe, walk, group, hour: new Date().getHours() })
      .then((r: Omit<RecommendationsState, 'loading'>) => {
        if (!cancelled) setState({ forYou: r.forYou ?? [], explore: r.explore ?? [], placesSource: r.placesSource ?? null, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ ...EMPTY, placesSource: 'unavailable' });
      });
    return () => { cancelled = true; };
  }, [enabled, lat, lng, vibe, walk, group]);

  return state;
}
