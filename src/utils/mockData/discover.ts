/** Discover card types and empty production seed. */

import type { BytspotProviderSource, BytspotVendorMatchDocument } from '../vendorMatching.ts';

export type CardType = 'parking' | 'venue' | 'valet' | 'coffee' | 'dining' | 'shopping' | 'nightlife' | 'entertainment' | 'fitness' | 'service' | 'boutique_apartment';
export type DiscoverCardSource = Extract<BytspotProviderSource, 'bytspot_vendor' | 'bytspot_discover' | 'bytspot_curated'>;

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
}

export const discoverCards: DiscoverCard[] = [];
