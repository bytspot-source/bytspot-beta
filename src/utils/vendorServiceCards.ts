import type { DiscoverCard } from './mockData';
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
    'Requested vendor service',
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

  return {
    id: stableNumericId(service.id, 30_000 + index),
    type: 'service',
    name: service.title,
    image: resolveVenuePhoto({ category: 'entertainment', name: service.title }),
    distance: formatMetersDistance(opts.distanceMeters),
    price,
    description: service.description ?? `Service by ${service.vendor.displayName}`,
    location: service.vendor.displayName,
    features: [
      'Bookable vendor service',
      service.vendor.displayName,
      ...(service.durationMins ? [`${service.durationMins} min`] : []),
      ...(patchVerified ? ['Patch-verified'] : []),
      ...(service.vendor.onboardingStatus === 'active' ? ['Connect-ready provider'] : []),
    ],
    verified: patchVerified,
    entryType: 'paid',
    entryPrice: price,
    availability: 'Available',
    vendorServiceId: service.id,
    vendorId: service.vendor.id,
    patchId: service.patch?.id ?? null,
    patchUid: service.patch?.uid ?? null,
    platformFeeCents: service.cashFlow?.platformFeeCents,
    providerPayoutEstimateCents: service.cashFlow?.providerPayoutEstimateCents,
    vendorServiceStatus: 'active',
  } as DiscoverCard;
}