/**
 * Collapse instrument — the product object under the measurement duty.
 *
 * A Plan is one hang + how you stop + why you stay, with a source-honest
 * occupancy kind and a checkout bit that is false unless that detector can
 * settle. Clips (room / cottage / stall / place) are detectors, not companies.
 *
 * Legal twin: bytspot-trust-charter.md. Typical ≠ Live is a facts duty (FTC)
 * as well as a product rule. This module does not call Bytspot a fiduciary.
 */

import {
  occupancyKindLabel,
  venueAvailabilityLabel,
} from './occupancyLabel.ts';
import type { MapParkingSpot, ParkingSource } from './mapParking.ts';
import type { UserPreferences } from './personalization.ts';

export type OccupancyKind = 'Live' | 'Typical';

/** How this stall entered the plan. Places/fallback cannot claim live spots. */
export type StallProvenance = ParkingSource;

/** Completed-arrival detectors. Each may become an App Clip. Not five startups. */
export type DetectorKind = 'place' | 'cottage' | 'room' | 'stall';

export type WalkBudget = 'close' | 'medium' | 'far';

export interface HangInput {
  id: string;
  name: string;
  vibeTokens?: string[];
  occupancySource?: string | null;
  waitMins?: number | null;
  occupancyLevel?: number | null;
  availability?: string | null;
  lat?: number;
  lng?: number;
}

export interface StallInput {
  name: string;
  source: StallProvenance;
  walkMinutes: number;
  paid: boolean;
  available?: number | null;
  total?: number | null;
  lat?: number;
  lng?: number;
}

export interface CollapseBasis {
  vibeTokens?: string[];
  walkPreference?: WalkBudget;
  evCharging?: boolean;
  hour?: Date;
}

export interface CollapsePlan {
  hang: {
    id: string;
    name: string;
    vibeTokens: string[];
  };
  stall: {
    name: string;
    source: StallProvenance;
    walkMinutes: number;
    paid: boolean;
  };
  occupancy: {
    kind: OccupancyKind;
    source: string | null;
    label: string;
  };
  detector: DetectorKind;
  canCheckout: boolean;
  because: string;
}

export const WALK_BUDGET_MINUTES: Record<WalkBudget, number> = {
  close: 4,
  medium: 8,
  far: 15,
};

export function walkBudgetMinutes(pref: WalkBudget | undefined): number {
  return WALK_BUDGET_MINUTES[pref ?? 'medium'];
}

export function basisFromPreferences(
  preferences: UserPreferences | undefined,
  hour: Date = new Date(),
): CollapseBasis {
  return {
    vibeTokens: preferences?.vibePreferences?.selectedVibes ?? [],
    walkPreference: preferences?.discoveryPreferences?.walkPreference,
    evCharging: preferences?.parkingPreferences?.evCharging,
    hour,
  };
}

/** Places and fallback stalls are catalog. Only a vendor-written stall may show counts. */
export function stallMayClaimAvailability(source: StallProvenance): boolean {
  return source === 'vendor';
}

export function stallFitsWalkBudget(
  walkMinutes: number,
  pref: WalkBudget | undefined,
): boolean {
  return walkMinutes <= walkBudgetMinutes(pref);
}

/**
 * Checkout is a settle bit, not a marketing bit.
 * A room or cottage may charge only when the caller already has a live path.
 * A stall may charge only when the lot owner wrote the inventory (vendor).
 * A place detector never charges.
 */
export function detectorCanSettle(
  detector: DetectorKind,
  opts: { stallSource?: StallProvenance; settlementReady?: boolean } = {},
): boolean {
  if (!opts.settlementReady) return false;
  if (detector === 'place') return false;
  if (detector === 'stall') return stallMayClaimAvailability(opts.stallSource ?? 'fallback');
  return true;
}

export function explainPlan(input: {
  hangName: string;
  occupancyKind: OccupancyKind;
  occupancyLabel: string;
  stallName: string;
  walkMinutes: number;
  vibeTokens: string[];
}): string {
  const vibe = input.vibeTokens[0];
  const vibeBit = vibe ? `vibe is ${vibe}` : 'no vibe filter';
  const hourBit =
    input.occupancyKind === 'Live'
      ? `a door wrote ${input.occupancyLabel}`
      : `it is usually ${input.occupancyLabel.toLowerCase()} at this hour`;
  return `Because ${hourBit}, ${input.stallName} is ${input.walkMinutes} min walk, and ${vibeBit}.`;
}

export function collapsePlan(input: {
  hang: HangInput;
  stall: StallInput;
  detector?: DetectorKind;
  settlementReady?: boolean;
  basis?: CollapseBasis;
}): CollapsePlan {
  const kind = occupancyKindLabel(input.hang.occupancySource);
  const label = venueAvailabilityLabel({
    source: input.hang.occupancySource,
    waitMins: input.hang.waitMins,
    level: input.hang.occupancyLevel,
    availability: input.hang.availability,
  });
  const detector = input.detector ?? 'place';
  const vibeTokens = input.hang.vibeTokens ?? input.basis?.vibeTokens ?? [];

  return {
    hang: {
      id: input.hang.id,
      name: input.hang.name,
      vibeTokens,
    },
    stall: {
      name: input.stall.name,
      source: input.stall.source,
      walkMinutes: input.stall.walkMinutes,
      paid: input.stall.paid,
    },
    occupancy: {
      kind,
      source: input.hang.occupancySource ?? null,
      label,
    },
    detector,
    canCheckout: detectorCanSettle(detector, {
      stallSource: input.stall.source,
      settlementReady: input.settlementReady,
    }),
    because: explainPlan({
      hangName: input.hang.name,
      occupancyKind: kind,
      occupancyLabel: label,
      stallName: input.stall.name,
      walkMinutes: input.stall.walkMinutes,
      vibeTokens,
    }),
  };
}

/** Pair the nearest stall that fits the walk budget. Vendor beats Places beats fallback. */
export function pairStall(
  hang: { lat?: number; lng?: number },
  stalls: MapParkingSpot[],
  basis?: CollapseBasis,
): StallInput | null {
  const budget = walkBudgetMinutes(basis?.walkPreference);
  const ranked = [...stalls].sort((a, b) => {
    const rank = (s: StallProvenance) => (s === 'vendor' ? 0 : s === 'places' ? 1 : 2);
    const bySource = rank(a.source) - rank(b.source);
    if (bySource !== 0) return bySource;
    return walkMinutesBetween(hang, a) - walkMinutesBetween(hang, b);
  });

  for (const stall of ranked) {
    const walkMinutes = walkMinutesBetween(hang, stall);
    if (walkMinutes > budget) continue;
    if (basis?.evCharging && !stall.hasEVCharging) continue;
    return {
      name: stall.name,
      source: stall.source,
      walkMinutes,
      paid: stall.price > 0,
      available: stallMayClaimAvailability(stall.source) ? stall.available : null,
      total: stallMayClaimAvailability(stall.source) ? stall.total : null,
      lat: stall.lat,
      lng: stall.lng,
    };
  }
  return null;
}

/** ~80 m/min urban walk; unknown coords refuse to invent a stall. */
export function walkMinutesBetween(
  a: { lat?: number; lng?: number },
  b: { lat?: number; lng?: number },
): number {
  if (
    typeof a.lat !== 'number' ||
    typeof a.lng !== 'number' ||
    typeof b.lat !== 'number' ||
    typeof b.lng !== 'number'
  ) {
    return Number.POSITIVE_INFINITY;
  }
  const meters = haversineMeters(a.lat, a.lng, b.lat, b.lng);
  return Math.max(1, Math.round(meters / 80));
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const s = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
