/**
 * Phase 1 inventory — ten Midtown situations, handwritten.
 *
 * Not a city atlas. Not Live. Each row is a situation where someone is about
 * to drive without a world. Occupancy is Typical until a door writes.
 * Stalls are named so a human can walk them; Places/fallback never settle.
 */

import { collapsePlan, type CollapsePlan, type DetectorKind, type StallInput } from './collapsePlan.ts';

export interface CorridorDoor {
  id: string;
  hangName: string;
  kind: 'cottage' | 'daypart' | 'stall-first' | 'host-capable';
  vibeTokens: string[];
  lat: number;
  lng: number;
  detector: DetectorKind;
  stall: StallInput;
  whyHere: string;
}

export const MIDTOWN_CORRIDOR: CorridorDoor[] = [
  {
    id: 'door-patio-10th',
    hangName: '10th Street patio',
    kind: 'daypart',
    vibeTokens: ['chill'],
    lat: 33.7818,
    lng: -84.3880,
    detector: 'place',
    stall: { name: 'Midtown Promenade lot', source: 'fallback', walkMinutes: 4, paid: true },
    whyHere: 'After-work hang before anyone starts the car.',
  },
  {
    id: 'door-coffee-peachtree',
    hangName: 'Peachtree coffee counter',
    kind: 'daypart',
    vibeTokens: ['work'],
    lat: 33.7844,
    lng: -84.3862,
    detector: 'place',
    stall: { name: '1380 W Peachtree Garage', source: 'fallback', walkMinutes: 3, paid: true },
    whyHere: 'Morning plan: laptop + a stall you already accepted.',
  },
  {
    id: 'door-fitness-arts',
    hangName: 'Arts Center hour',
    kind: 'daypart',
    vibeTokens: ['crew'],
    lat: 33.7893,
    lng: -84.3878,
    detector: 'place',
    stall: { name: 'Arts Center deck', source: 'fallback', walkMinutes: 5, paid: true },
    whyHere: 'Day-part stay, not a night out.',
  },
  {
    id: 'door-cottage-westmid',
    hangName: 'West Midtown cottage counter',
    kind: 'cottage',
    vibeTokens: ['culture'],
    lat: 33.7872,
    lng: -84.4120,
    detector: 'cottage',
    stall: { name: 'Howell Mill curb / lot', source: 'fallback', walkMinutes: 6, paid: false },
    whyHere: 'Kit lives on the counter. Detector = cottage Clip.',
  },
  {
    id: 'door-cottage-buford',
    hangName: 'Buford Highway cottage',
    kind: 'cottage',
    vibeTokens: ['culture'],
    lat: 33.8210,
    lng: -84.3320,
    detector: 'cottage',
    stall: { name: 'Plaza lot (hand-listed)', source: 'fallback', walkMinutes: 2, paid: false },
    whyHere: 'Arrival OS, not nightlife. Same operator, different hang.',
  },
  {
    id: 'door-cottage-edgewood',
    hangName: 'Edgewood cottage',
    kind: 'cottage',
    vibeTokens: ['chill', 'culture'],
    lat: 33.7546,
    lng: -84.3462,
    detector: 'cottage',
    stall: { name: 'Edgewood Ave lot', source: 'fallback', walkMinutes: 4, paid: true },
    whyHere: 'Third cottage so the kit family is a corridor, not a one-off.',
  },
  {
    id: 'door-stall-colony',
    hangName: 'Colony Square hang',
    kind: 'stall-first',
    vibeTokens: ['chill'],
    lat: 33.7852,
    lng: -84.3845,
    detector: 'stall',
    stall: { name: 'Colony Square Garage', source: 'fallback', walkMinutes: 1, paid: true },
    whyHere: 'When the outcome is the stall. Parking Clip, not a parking company.',
  },
  {
    id: 'door-stall-fox',
    hangName: 'Fox evening',
    kind: 'stall-first',
    vibeTokens: ['crew'],
    lat: 33.7727,
    lng: -84.3876,
    detector: 'stall',
    stall: { name: 'Fox Theatre Parking', source: 'fallback', walkMinutes: 2, paid: true },
    whyHere: 'Show night: collapse the stall before the block is a search bar.',
  },
  {
    id: 'door-host-colony',
    hangName: 'Colony room (when a host writes)',
    kind: 'host-capable',
    vibeTokens: ['crew'],
    lat: 33.7852,
    lng: -84.3845,
    detector: 'room',
    stall: { name: 'Colony Square Garage', source: 'fallback', walkMinutes: 2, paid: true },
    whyHere: 'Same pin as the hang. Live only after publish.',
  },
  {
    id: 'door-host-10th',
    hangName: '10th Street room (when a host writes)',
    kind: 'host-capable',
    vibeTokens: ['chill'],
    lat: 33.7818,
    lng: -84.3880,
    detector: 'room',
    stall: { name: 'Midtown Promenade lot', source: 'fallback', walkMinutes: 4, paid: true },
    whyHere: 'Second host-capable door. Do not publish until the kit is on the counter.',
  },
];

export function corridorPlan(door: CorridorDoor, settlementReady = false): CollapsePlan {
  return collapsePlan({
    hang: {
      id: door.id,
      name: door.hangName,
      vibeTokens: door.vibeTokens,
      occupancySource: 'typical',
      lat: door.lat,
      lng: door.lng,
    },
    stall: door.stall,
    detector: door.detector,
    settlementReady,
  });
}

export function corridorPlans(): CollapsePlan[] {
  return MIDTOWN_CORRIDOR.map((door) => corridorPlan(door));
}
