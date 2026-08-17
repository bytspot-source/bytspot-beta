/** Discover card types and empty production seed. */

import type { BytspotProviderSource, BytspotVendorMatchDocument } from '../vendorMatching.ts';

export type CardType = 'parking' | 'venue' | 'valet' | 'coffee' | 'dining' | 'shopping' | 'nightlife' | 'entertainment' | 'fitness' | 'service' | 'boutique_apartment' | 'mobility';
export type DiscoverCardSource = Extract<BytspotProviderSource, 'bytspot_vendor' | 'bytspot_discover' | 'bytspot_curated'>;
export type DiscoverCardControl = 'local' | 'vendor';

export interface DiscoverCard {
  id: number;
  type: CardType;
  name: string;
  image: string;
  distance: string;
  price?: string;
  rating?: number;
  availability?: string;
  spots?: number;
  features?: string[];
  vibe?: number;
  description?: string;
  location?: string;
  serviceLevel?: string;
  response?: string;
  amenities?: string[];
  hours?: string;
  phoneNumber?: string;
  website?: string;
  verified?: boolean;
  popularTimes?: string;
  reviews?: number;
  priceRange?: string;
  promotions?: string[];
  certifications?: string[];
  bio?: string;
  totalServices?: number;
  baseRate?: number;
  responseTime?: string;
  serviceArea?: string;
  entryType?: 'free' | 'paid';
  entryPrice?: string | null;
  ticketUrl?: string | null;
  eventName?: string;
  eventDate?: string;
  eventTime?: string;
  _slug?: string;
  _lat?: number;
  _lng?: number;
  placeId?: string;
  photoUrls?: string[];
  ratingCount?: number;
  isOpen?: boolean | null;
  vendorServiceId?: string;
  vendorId?: string;
  discoverSource?: DiscoverCardSource;
  matchDocument?: BytspotVendorMatchDocument;
  patchId?: string | null;
  patchUid?: string | null;
  serviceCategory?: string;
  serviceSubtitle?: string;
  ctaText?: string;
  bookingCount?: number;
  availableSpots?: number;
  etaMinutes?: number;
  providerPayoutEstimateCents?: number;
  platformFeeCents?: number;
  vendorServiceStatus?: 'active' | 'draft' | 'archived';
  curatedFallback?: boolean;
  control?: DiscoverCardControl;
}

/**
 * A card is Bytspot-controlled (Mode B) only when every controlled-gate signal
 * agrees: a real vendor, a real service or patch, vendor-sourced, and not a
 * curated fixture. Everything else — Google/Apple places, Ticketmaster,
 * Typical catalog, coverage clones, cottage lookalikes — is local (Mode A).
 * Only controlled cards may enter menu / booking / checkout flows.
 */
export function discoverCardControl(card: DiscoverCard): DiscoverCardControl {
  if (card.control) return card.control;
  if (card.curatedFallback === true) return 'local';
  if (card.discoverSource !== 'bytspot_vendor') return 'local';
  if (!card.vendorId) return 'local';
  if (!card.vendorServiceId && !card.patchId) return 'local';
  return 'vendor';
}

export const discoverCards: DiscoverCard[] = [];
