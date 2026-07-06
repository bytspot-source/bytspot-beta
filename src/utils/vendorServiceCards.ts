import type { DiscoverCard } from './mockData';
import { adaptVendorServiceToMatchDocument } from './vendorMatching.ts';
import { resolveVenuePhoto } from './venuePhoto.ts';
import type { VirtualPatchSavedServiceRequest } from './virtualPatch';

export type VendorDiscoveryService = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  durationMins: number | null;
  vendor: { id: string; displayName: string; onboardingStatus: string };
  patch: { id: string; uid: string; label: string | null } | null;
  cashFlow?: { platformFeeCents: number; providerPayoutEstimateCents: number; commissionBps: number };
  category?: string;
  subtitle?: string;
  rating?: number;
  bookingCount?: number;
  availableSpots?: number;
  etaMinutes?: number;
  availability?: string;
  ctaText?: string;
};

function formatDistance(miles: number): string {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(1)} mi`;
}

function formatMetersDistance(meters?: number | null): string {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return '—';
  return formatDistance(meters / 1609.344);
}

function stableNumericId(value: string, offset: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return offset + Math.abs(hash % 90_000);
}

function formatPrice(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export const curatedServiceRecommendationCards: DiscoverCard[] = [
  ['chef-maria', 'Chef Maria’s Table', '5-Course Italian Dinner at Home', 'Midtown • Tonight 7:30 PM', 4.98, 87, '$285/person', '4 spots left', 'Book for Tonight →', 'Private Chef', 4, undefined],
  ['vip-valet', 'Atlanta Black Car Valet', 'VIP Door-to-Door Valet', 'Mercedes S-Class • Professional Chauffeur', 4.9, 64, '$95', 'Arrives in 9 min', 'Request Valet Now →', 'Premium Valet', undefined, 9],
  ['zen-massage', 'Zen Haven Mobile Spa', 'Deep Tissue Massage at Your Place', '60 or 90 minutes • Therapist comes to you', 4.95, 52, '$135', 'Next available: 45 min', 'Book Massage →', 'In-Home Massage', undefined, 45],
  ['smart-parking', 'Midtown Secure Parking', 'Reserved Parking Spot + Valet Option', '2 blocks from Fox Theatre', 4.7, 118, '$22 for 6hrs', 'Live', 'Reserve Spot →', 'Smart Parking', 11, undefined],
  ['private-bartender', 'Craft & Pour Mobile Bar', 'Private Cocktail Party Service', 'Your home or rooftop • Full setup', 4.97, 43, '$180/hr', '3 bartenders available', 'Book Bartender →', 'Private Bartender', 3, undefined],
  ['luxury-transport', 'Executive Ride Atlanta', 'Airport Transfer or Night Out Ride', 'Black SUV • Professional Driver', 4.92, 76, '$75–$120', 'Next available: 18 min', 'Book Ride →', 'Luxury Transportation', undefined, 18],
  ['event-photography', 'Moments by Elena', 'Private Event & Portrait Photography', 'Birthdays, proposals, dinners', 5, 39, 'Starting at $250', 'Limited evening slots', 'Book Photographer →', 'Event Photography', undefined, undefined],
  ['wellness-recovery', 'Restore IV & Recovery', 'Mobile IV Hydration + Recovery', 'At home or hotel • 45 min session', 4.96, 58, '$179', 'Next slot: Today 6 PM', 'Book Recovery Session →', 'Wellness & Recovery', undefined, undefined],
].map(([id, vendor, title, subtitle, rating, bookingCount, price, availability, ctaText, category, spots, eta], index) => ({
  id: stableNumericId(String(id), 50_000 + index),
  type: 'service',
  name: String(title),
  image: resolveVenuePhoto({ category: String(category), name: `${vendor} ${title}` }),
  distance: index < 4 ? ['1.2 mi', '0.8 mi', '2.1 mi', '0.4 mi'][index] : 'Nearby',
  price: String(price),
  rating: Number(rating),
  bookingCount: Number(bookingCount),
  availability: String(availability),
  availableSpots: typeof spots === 'number' ? spots : undefined,
  etaMinutes: typeof eta === 'number' ? eta : undefined,
  description: String(subtitle),
  location: String(vendor),
  serviceSubtitle: String(subtitle),
  serviceCategory: String(category),
  ctaText: String(ctaText),
  features: [String(vendor), `${bookingCount} bookings`, String(category)],
  verified: true,
  entryType: 'paid',
  entryPrice: String(price),
  vendorServiceId: String(id),
  vendorId: `vendor-${String(id)}`,
  vendorServiceStatus: 'active',
    curatedFallback: true,
}) as DiscoverCard);

function formatRequestStatus(status: VirtualPatchSavedServiceRequest['status']): string {
  if (status === 'booked') return 'Booking requested';
  if (status === 'check-in') return 'Check-in requested';
  if (status === 'called') return 'Vendor called';
  return 'Service requested';
}

export function savedServiceRequestToCard(
  request: VirtualPatchSavedServiceRequest,
  index: number,
): DiscoverCard {
  const rating = request.rating ? Number.parseFloat(request.rating) : undefined;
  const image = request.vendorPhoto && /^https?:\/\//i.test(request.vendorPhoto)
    ? request.vendorPhoto
    : resolveVenuePhoto({ category: request.vendorCategory ?? 'service', name: `${request.vendorName} ${request.serviceName}` });
  const statusLabel = formatRequestStatus(request.status);
  const features = [
    'Requested local service',
    request.vendorCategory,
    request.eta,
    request.venueName ? `From ${request.venueName}` : null,
    request.booking?.partySize ? `${request.booking.partySize} guests` : null,
  ].filter((feature): feature is string => Boolean(feature));

  return {
    id: stableNumericId(request.id, 40_000 + index),
    type: 'service',
    name: request.serviceName,
    image,
    distance: request.distance ?? '—',
    rating: typeof rating === 'number' && Number.isFinite(rating) ? rating : undefined,
    availability: statusLabel,
    description: [request.vendorName, request.vendorCategory, request.availability].filter(Boolean).join(' · '),
    location: request.vendorName,
    features,
    verified: false,
    vendorServiceId: request.id,
    vendorId: request.vendorId ?? undefined,
    vendorServiceStatus: 'active',
  } as DiscoverCard;
}

export function vendorServiceToCard(
  service: VendorDiscoveryService,
  index: number,
  opts: { patchVerified?: boolean; distanceMeters?: number | null } = {},
): DiscoverCard {
  const patchVerified = opts.patchVerified || !!service.patch;
  const price = formatPrice(service.priceCents, service.currency || 'USD');
  const image = resolveVenuePhoto({ category: 'entertainment', name: service.title });
  const distanceMeters = typeof opts.distanceMeters === 'number' && Number.isFinite(opts.distanceMeters) ? opts.distanceMeters : undefined;
  const matchDocument = {
    ...adaptVendorServiceToMatchDocument(service, { verified: patchVerified, distanceMeters }),
    media: [{
      id: `vendor:${service.id}:photo:0`,
      source: 'bytspot_vendor' as const,
      kind: 'image' as const,
      url: image,
      altText: `${service.title} service photo`,
      priority: 50,
    }],
  };

  return {
    id: stableNumericId(service.id, 30_000 + index),
    type: 'service',
    name: service.title,
    image,
    distance: formatMetersDistance(opts.distanceMeters),
    price,
    rating: service.rating,
    bookingCount: service.bookingCount,
    availableSpots: service.availableSpots,
    etaMinutes: service.etaMinutes,
    description: service.description ?? `Service by ${service.vendor.displayName}`,
    location: service.vendor.displayName,
    serviceSubtitle: service.subtitle ?? service.description ?? undefined,
    serviceCategory: service.category,
    ctaText: service.ctaText,
    features: [
      service.vendor.displayName,
      ...(service.bookingCount ? [`${service.bookingCount} bookings`] : []),
      ...(service.durationMins ? [`${service.durationMins} min`] : []),
      ...(patchVerified ? ['Patch-verified'] : []),
      ...(service.vendor.onboardingStatus === 'active' ? ['Connect-ready provider'] : []),
    ],
    verified: patchVerified,
    entryType: 'paid',
    entryPrice: price,
    availability: service.availability ?? (service.availableSpots ? `${service.availableSpots} spots left` : 'Available'),
    vendorServiceId: service.id,
    vendorId: service.vendor.id,
    discoverSource: 'bytspot_vendor',
    matchDocument,
    patchId: service.patch?.id ?? null,
    patchUid: service.patch?.uid ?? null,
    platformFeeCents: service.cashFlow?.platformFeeCents,
    providerPayoutEstimateCents: service.cashFlow?.providerPayoutEstimateCents,
    vendorServiceStatus: 'active',
  } as DiscoverCard;
}