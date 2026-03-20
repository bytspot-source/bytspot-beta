import { trpc } from './trpc';

export interface VenueReview {
  venueId: string;
  venueName: string;
  stars: number; // 1-5
  vibe: number; // 1-10
  comment: string;
  createdAt: string; // ISO string
}

// ─── Sync (localStorage) — instant UI reads ────────────────────────
export function getVenueReviews(venueId: string): VenueReview[] {
  try {
    return JSON.parse(localStorage.getItem(`bytspot_reviews_${venueId}`) || '[]');
  } catch {
    return [];
  }
}

export function hasReviewedVenue(venueId: string): boolean {
  return getVenueReviews(venueId).length > 0;
}

export function getAverageRating(
  venueId: string
): { stars: number; vibe: number; count: number } | null {
  const reviews = getVenueReviews(venueId);
  if (reviews.length === 0) return null;
  const stars = reviews.reduce((a, r) => a + r.stars, 0) / reviews.length;
  const vibe = reviews.reduce((a, r) => a + r.vibe, 0) / reviews.length;
  return {
    stars: Math.round(stars * 10) / 10,
    vibe: Math.round(vibe * 10) / 10,
    count: reviews.length,
  };
}

// ─── Mutation — optimistic localStorage + fire-and-forget API call ──
export function saveVenueReview(review: VenueReview): void {
  // Optimistic local update
  const existing = getVenueReviews(review.venueId);
  const updated = [review, ...existing].slice(0, 20);
  localStorage.setItem(`bytspot_reviews_${review.venueId}`, JSON.stringify(updated));

  // Fire-and-forget API call (authenticated users only)
  const token = localStorage.getItem('bytspot_auth_token');
  if (token) {
    trpc.reviews.add.mutate({
      venueId: review.venueId,
      stars: review.stars,
      vibe: review.vibe,
      comment: review.comment,
    }).catch(() => {});
  }
}

// ─── Async — fetch from API, sync to localStorage ──────────────────
export async function getVenueReviewsAsync(venueId: string): Promise<VenueReview[]> {
  try {
    const res = await trpc.reviews.list.query({ venueId });
    const reviews: VenueReview[] = res.items.map((r) => ({
      venueId: r.venueId,
      venueName: r.userName, // best we have from API
      stars: r.stars,
      vibe: r.vibe,
      comment: r.comment,
      createdAt: r.createdAt,
    }));
    localStorage.setItem(`bytspot_reviews_${venueId}`, JSON.stringify(reviews));
    return reviews;
  } catch {
    return getVenueReviews(venueId);
  }
}

export async function getAverageRatingAsync(
  venueId: string
): Promise<{ stars: number; vibe: number; count: number } | null> {
  try {
    const stats = await trpc.reviews.stats.query({ venueId });
    if (stats.count === 0) return null;
    return {
      stars: stats.avgStars ?? 0,
      vibe: stats.avgVibe ?? 0,
      count: stats.count,
    };
  } catch {
    return getAverageRating(venueId);
  }
}

