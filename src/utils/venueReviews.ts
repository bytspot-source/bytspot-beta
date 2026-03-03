export interface VenueReview {
  venueId: string;
  venueName: string;
  stars: number; // 1-5
  vibe: number; // 1-10
  comment: string;
  createdAt: string; // ISO string
}

export function getVenueReviews(venueId: string): VenueReview[] {
  try {
    return JSON.parse(localStorage.getItem(`bytspot_reviews_${venueId}`) || '[]');
  } catch {
    return [];
  }
}

export function saveVenueReview(review: VenueReview): void {
  const existing = getVenueReviews(review.venueId);
  const updated = [review, ...existing].slice(0, 20);
  localStorage.setItem(`bytspot_reviews_${review.venueId}`, JSON.stringify(updated));
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

