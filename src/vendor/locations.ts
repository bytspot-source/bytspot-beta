import {
  etaKindAllowsFulfillment,
  fulfillmentForLocationKind,
  getBookableLocations,
  getLocationKind,
  locationCanPublish,
  locationKindsForDomain,
  type BookableDomainId,
  type BookableEtaKind,
  type BookableFulfillment,
  type BookableLocationKindId,
  type BookableLocationState,
} from '../utils/bookableTemplates.ts';

/** A PIN a SELLER holds. The same PIN the guest is sent to. */
export interface VendorLocation {
  id: string;
  label: string;
  kind: BookableLocationKindId;
  state: BookableLocationState;
  /** Absent only for a visiting provider, who is not publishing an address. */
  address?: string;
  lat: number;
  lng: number;
  /** Only meaningful when the vendor is the one travelling. */
  radiusMiles?: number;
  timezone?: string;
}

export interface LocationPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MILES = 3958.7613;

/** Great-circle distance, which is close enough for a service radius. */
export function distanceMiles(from: LocationPoint, to: LocationPoint): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function fulfillmentFor(location: VendorLocation): BookableFulfillment {
  return fulfillmentForLocationKind(location.kind) ?? 'guestTravels';
}

/**
 * Reach is asymmetric, which is the whole reason kind exists. When the vendor
 * travels, their radius is the limit. When the guest travels, the guest's own
 * search radius is, and the vendor's radius is irrelevant.
 */
export function isWithinReach(
  location: VendorLocation,
  guest: LocationPoint,
  guestRadiusMiles: number,
): boolean {
  const miles = distanceMiles(location, guest);
  if (fulfillmentFor(location) === 'vendorTravels') {
    const { radiusMiles, maxRadiusMiles } = getBookableLocations().defaults;
    return miles <= Math.min(location.radiusMiles ?? radiusMiles, maxRadiusMiles);
  }
  return miles <= guestRadiusMiles;
}

/**
 * Everything wrong with a location on its own terms, before any Bookable is
 * pointed at it. Split out from publishing because setup has to check a location
 * it is still building, when no domain has been chosen yet: duplicating the
 * rules is how the two would come to disagree.
 */
export function locationSetupBlockers(location: VendorLocation): string[] {
  const kind = getLocationKind(location.kind);
  if (!kind) return [`${location.kind} is not a location kind`];

  const blockers: string[] = [];
  if (kind.requiresAddress && !location.address?.trim()) blockers.push('Needs a street address');
  if (kind.requiresRadius && !location.radiusMiles) blockers.push('Needs a travel radius');
  if (kind.requiresRadius && location.radiusMiles) {
    const { maxRadiusMiles } = getBookableLocations().defaults;
    if (location.radiusMiles > maxRadiusMiles) blockers.push(`Radius cannot exceed ${maxRadiusMiles} miles`);
  }
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) blockers.push('Needs a pin on the map');
  if (Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) blockers.push('Pin is not a real coordinate');
  return blockers;
}

/** Every reason a location cannot back published inventory, not just the first. */
export function locationPublishBlockers(location: VendorLocation, domain: BookableDomainId): string[] {
  const kind = getLocationKind(location.kind);
  if (!kind) return [`${location.kind} is not a location kind`];

  const blockers: string[] = [];
  if (!locationCanPublish(location.state)) blockers.push(`Location is ${location.state.toLowerCase()}, not active`);
  if (!locationKindsForDomain(domain).some((item) => item.id === kind.id)) {
    blockers.push(`A ${domain} bookable cannot operate from a ${kind.id} location`);
  }
  blockers.push(...locationSetupBlockers(location));
  return blockers;
}

/**
 * The timing-geography cross-check, applied to a real pair. A template that
 * promises a dispatch ETA cannot be published from a location the guest travels
 * to, because there is nothing moving to give an ETA for.
 */
export function locationSupportsEtaKind(location: VendorLocation, etaKind: BookableEtaKind): boolean {
  return etaKindAllowsFulfillment(etaKind, fulfillmentFor(location));
}

export function activeLocations(locations: VendorLocation[]): VendorLocation[] {
  return locations.filter((location) => locationCanPublish(location.state));
}
