import { getLocationKind, type BookableLocationKindId } from '../utils/bookableTemplates.ts';
import { fulfillmentForLocationKind } from '../utils/bookableTemplates.ts';

/**
 * How exactly a provider claims to have located an address.
 *
 * This is the field that decides whether a pin is usable, and it is the one
 * most geocoding integrations throw away. Every provider returns *something*
 * for almost any input: ask for a street that does not exist and you get the
 * centre of the town, with no error. Storing that lat/lng as a restaurant's pin
 * puts it a mile from the door, and nothing downstream can tell.
 */
export type GeocodePrecision = 'rooftop' | 'street' | 'locality' | 'region';

const PRECISION_RANK: Record<GeocodePrecision, number> = {
  rooftop: 3,
  street: 2,
  locality: 1,
  region: 0,
};

export interface GeocodeCandidate {
  /** The address as the provider understands it, which is what the vendor confirms. */
  formatted: string;
  lat: number;
  lng: number;
  precision: GeocodePrecision;
  /** Providers that return one save us guessing from the coordinate. */
  timezone?: string;
}

/**
 * The precision a kind needs, which is not the same for all of them.
 *
 * When the guest travels, the pin is a destination they navigate to, so a town
 * centroid is a wrong answer wearing a right one's clothes. When the vendor
 * travels, the pin is the centre of a radius measured in miles, and a centroid
 * is a legitimate answer — a visiting provider should not have to publish their
 * street to say which town they work in.
 */
export function requiredPrecisionFor(kind: BookableLocationKindId): GeocodePrecision {
  return fulfillmentForLocationKind(kind) === 'vendorTravels' ? 'locality' : 'street';
}

export function precisionSufficientFor(kind: BookableLocationKindId, precision: GeocodePrecision): boolean {
  return PRECISION_RANK[precision] >= PRECISION_RANK[requiredPrecisionFor(kind)];
}

/**
 * Every reason a candidate cannot become this location's pin. Checked before
 * the vendor can choose it, so an unusable result is visibly refused rather
 * than silently producing a pin in the wrong place.
 */
export function candidateBlockers(kind: BookableLocationKindId, candidate: GeocodeCandidate): string[] {
  if (!getLocationKind(kind)) return [`${kind} is not a location kind`];

  const blockers: string[] = [];
  if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) {
    blockers.push('That result has no usable coordinate');
  } else if (Math.abs(candidate.lat) > 90 || Math.abs(candidate.lng) > 180) {
    blockers.push('That result is not a real coordinate');
  } else if (candidate.lat === 0 && candidate.lng === 0) {
    // Null Island. Every provider emits it eventually, and it is always a
    // failed lookup that forgot to say so.
    blockers.push('That result came back empty');
  }

  if (!precisionSufficientFor(kind, candidate.precision)) {
    blockers.push(
      requiredPrecisionFor(kind) === 'street'
        ? 'Guests navigate to this pin, so it needs a street address, not just a town'
        : 'That is too broad to measure a travel radius from',
    );
  }
  return blockers;
}

export function acceptableCandidates(
  kind: BookableLocationKindId,
  candidates: GeocodeCandidate[],
): GeocodeCandidate[] {
  return candidates.filter((candidate) => candidateBlockers(kind, candidate).length === 0);
}

/**
 * A single exact match may be applied without asking. Anything else is a
 * question for the vendor: two candidates means the provider guessed, and a
 * merely street-level match on a rooftop-capable query often means it fell back
 * to the road rather than the building.
 */
export function autoApplicable(
  kind: BookableLocationKindId,
  candidates: GeocodeCandidate[],
): GeocodeCandidate | undefined {
  const usable = acceptableCandidates(kind, candidates);
  if (usable.length !== 1) return undefined;
  return usable[0].precision === 'rooftop' ? usable[0] : undefined;
}

function isPrecision(value: unknown): value is GeocodePrecision {
  return typeof value === 'string' && value in PRECISION_RANK;
}

/**
 * Only the fields we asked for, and a precision we recognise.
 *
 * An unknown precision is dropped rather than defaulted: defaulting it high
 * would accept a vague result as exact, and defaulting it low would silently
 * hide a good one. A result we cannot grade is a result we cannot use.
 */
export function reviveCandidates(raw: unknown): GeocodeCandidate[] {
  if (!Array.isArray(raw)) return [];
  const candidates: GeocodeCandidate[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    if (!isPrecision(item.precision)) continue;
    if (typeof item.formatted !== 'string') continue;
    const lat = Number(item.lat);
    const lng = Number(item.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    candidates.push({
      formatted: item.formatted,
      lat,
      lng,
      precision: item.precision,
      timezone: typeof item.timezone === 'string' ? item.timezone : undefined,
    });
  }
  // Best first, so the vendor's eye lands on the most exact match.
  return candidates.sort((a, b) => PRECISION_RANK[b.precision] - PRECISION_RANK[a.precision]);
}

/**
 * What the vendor typed is not what gets stored. The provider's formatted
 * address is the one the pin actually refers to, so storing the raw input would
 * let the label and the coordinate describe different places.
 *
 * A visiting provider keeps the pin and discards the address: they are usually
 * working from home, and publishing that is a harm the radius does not require.
 */
export function pinFrom(
  kind: BookableLocationKindId,
  candidate: GeocodeCandidate,
): { lat: number; lng: number; address?: string; timezone?: string } {
  const publishesAddress = getLocationKind(kind)?.requiresAddress ?? false;
  return {
    lat: candidate.lat,
    lng: candidate.lng,
    address: publishesAddress ? candidate.formatted : undefined,
    timezone: candidate.timezone,
  };
}
