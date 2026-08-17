/**
 * Corridor inventory — forty Atlanta situations, handwritten.
 *
 * Ten is the kit count you can walk and film. Forty is the first catalog
 * Home/Discover may rank. Eighty Live pins would be a lying atlas.
 *
 * Sports and event-collage sit in the same operator as a patio: hang + stall
 * + because. Occupancy is Typical until a door writes. Ticketmaster/Places
 * may later *name* a night; they may not mark it Live or settle a stall.
 */

import { collapsePlan, type CollapsePlan, type DetectorKind, type StallInput } from './collapsePlan.ts';

export type CorridorKind =
  | 'cottage'
  | 'daypart'
  | 'stall-first'
  | 'host-capable'
  | 'sport'
  | 'event';

export interface CorridorDoor {
  id: string;
  hangName: string;
  kind: CorridorKind;
  vibeTokens: string[];
  lat: number;
  lng: number;
  detector: DetectorKind;
  stall: StallInput;
  whyHere: string;
}

const door = (
  id: string,
  hangName: string,
  kind: CorridorKind,
  vibeTokens: string[],
  lat: number,
  lng: number,
  detector: DetectorKind,
  stall: StallInput,
  whyHere: string,
): CorridorDoor => ({ id, hangName, kind, vibeTokens, lat, lng, detector, stall, whyHere });

const stall = (name: string, walkMinutes: number, paid = true): StallInput => ({
  name,
  source: 'fallback',
  walkMinutes,
  paid,
});

/** First ten — kit subset. Walk these before encoding anything. */
export const MIDTOWN_CORRIDOR: CorridorDoor[] = [
  door('door-patio-10th', '10th Street patio', 'daypart', ['chill'], 33.7818, -84.3880, 'place', stall('Midtown Promenade lot', 4), 'After-work hang before anyone starts the car.'),
  door('door-coffee-peachtree', 'Peachtree coffee counter', 'daypart', ['work'], 33.7844, -84.3862, 'place', stall('1380 W Peachtree Garage', 3), 'Morning plan: laptop + a stall you already accepted.'),
  door('door-fitness-arts', 'Arts Center hour', 'daypart', ['crew'], 33.7893, -84.3878, 'place', stall('Arts Center deck', 5), 'Day-part stay, not a night out.'),
  door('door-cottage-westmid', 'West Midtown cottage counter', 'cottage', ['culture'], 33.7872, -84.4120, 'cottage', stall('Howell Mill curb / lot', 6, false), 'Kit lives on the counter. Detector = cottage Clip.'),
  door('door-cottage-buford', 'Buford Highway cottage', 'cottage', ['culture'], 33.8210, -84.3320, 'cottage', stall('Plaza lot (hand-listed)', 2, false), 'Arrival OS, not nightlife. Same operator, different hang.'),
  door('door-cottage-edgewood', 'Edgewood cottage', 'cottage', ['chill', 'culture'], 33.7546, -84.3462, 'cottage', stall('Edgewood Ave lot', 4), 'Third cottage so the kit family is a corridor, not a one-off.'),
  door('door-stall-colony', 'Colony Square hang', 'stall-first', ['chill'], 33.7852, -84.3845, 'stall', stall('Colony Square Garage', 1), 'When the outcome is the stall. Parking Clip, not a parking company.'),
  door('door-stall-fox', 'Fox evening', 'stall-first', ['crew'], 33.7727, -84.3876, 'stall', stall('Fox Theatre Parking', 2), 'Show night: collapse the stall before the block is a search bar.'),
  door('door-host-colony', 'Colony room (when a host writes)', 'host-capable', ['crew'], 33.7852, -84.3845, 'room', stall('Colony Square Garage', 2), 'Same pin as the hang. Live only after publish.'),
  door('door-host-10th', '10th Street room (when a host writes)', 'host-capable', ['chill'], 33.7818, -84.3880, 'room', stall('Midtown Promenade lot', 4), 'Second host-capable door. Do not publish until the kit is on the counter.'),
];

/** Sports + event collage + more hangs. Typical catalog, not trending-live. */
const ATLANTA_EXPANSION: CorridorDoor[] = [
  door('door-sport-mbs', 'Mercedes-Benz Stadium night', 'sport', ['crew'], 33.7553, -84.4006, 'place', stall('GWCC Red / Silver Deck', 8), 'Falcons / United / big bowl. Collapse the stall before Downtown is a search bar.'),
  door('door-sport-sfa', 'State Farm Arena night', 'sport', ['crew'], 33.7573, -84.3963, 'place', stall('Center Deck on COP Drive', 5), 'Hawks or a show. Official decks, not invented spots.'),
  door('door-sport-truist', 'Truist Park / Battery night', 'sport', ['crew'], 33.8907, -84.4680, 'place', stall('Battery Orange / Delta deck', 4), 'Braves. Waze already routes the lot — we issue the plan before I-75.'),
  door('door-sport-bobby-dodd', 'Bobby Dodd / Tech Saturday', 'sport', ['crew'], 33.7724, -84.3928, 'place', stall('Fowler Street lots', 6), 'College Saturday. Same atom: hang is the game, stall is named.'),
  door('door-sport-united', 'Atlanta United match day', 'sport', ['crew'], 33.7553, -84.4012, 'place', stall('Home Depot Backyard / Silver Deck', 10), 'Match day walk. Not Live crowd — Typical game-night shape.'),
  door('door-sport-peach-bowl', 'Peach Bowl / SEC weekend', 'sport', ['crew'], 33.7555, -84.4008, 'place', stall('MBS official lots', 9), 'Once-a-year collapse. Catalog, not a ticket marketplace.'),
  door('door-event-fox-show', 'Fox Theatre curtain', 'event', ['crew'], 33.7726, -84.3856, 'place', stall('Fox Theatre Parking', 2), 'Event collage: the show is the hang. Same stall as Fox evening.'),
  door('door-event-tabernacle', 'Tabernacle night', 'event', ['crew'], 33.7588, -84.3915, 'place', stall('LAZ 100 Luckie Street', 4), 'Downtown room. Premier parking is theirs; we name the walk, we do not sell their deck.'),
  door('door-event-roxy', 'Coca-Cola Roxy night', 'event', ['crew'], 33.8895, -84.4675, 'place', stall('Battery Orange / Delta deck', 3), 'Across from Truist. Game day and show night share the stall.'),
  door('door-event-terminal-west', 'Terminal West night', 'event', ['chill', 'crew'], 33.7847, -84.4135, 'place', stall('King Plow Arts Center deck', 2), 'Westside room. Deck is $12 on show nights — Typical, not our checkout.'),
  door('door-event-symphony', 'Symphony Hall night', 'event', ['chill'], 33.7893, -84.3848, 'place', stall('Woodruff Arts Center Garage', 3), 'Arts Center evening. ASO already sells prepaid parking; we do not pretend to.'),
  door('door-event-variety', 'Variety Playhouse night', 'event', ['chill', 'crew'], 33.7639, -84.3494, 'place', stall('Euclid Avenue lots', 3), 'Little Five Points collage piece.'),
  door('door-event-eastern', 'The Eastern night', 'event', ['crew'], 33.7465, -84.3460, 'place', stall('Memorial Drive lots', 4), 'Eastside room on the collage.'),
  door('door-event-masquerade', 'Masquerade night', 'event', ['crew'], 33.7710, -84.3647, 'place', stall('North Avenue deck', 6), 'Heaven / Purgatory / Hell — one pin, one stall.'),
  door('door-event-alliance', 'Alliance Theatre night', 'event', ['chill'], 33.7895, -84.3845, 'place', stall('Woodruff Arts Center Garage', 3), 'Same garage as Symphony. Different hang, same walk.'),
  door('door-event-center-stage', 'Center Stage Midtown', 'event', ['crew'], 33.7815, -84.3805, 'place', stall('10th / Juniper deck', 4), 'Midtown room on the collage, walkable from the patio door.'),
  door('door-event-ponce-evening', 'Ponce City Market evening', 'event', ['chill', 'crew'], 33.7725, -84.3655, 'place', stall('Ponce City Market deck', 2), 'BeltLine hang that becomes a night. Typical, not Packed.'),
  door('door-event-piedmont-fest', 'Piedmont Park festival weekend', 'event', ['crew'], 33.7851, -84.3733, 'place', stall('10th Street lots', 8), 'When the park is the hang. Stall is the plan, not a live count.'),
  door('door-day-ponce-coffee', 'Ponce City Market coffee', 'daypart', ['work', 'chill'], 33.7726, -84.3654, 'place', stall('Ponce City Market deck', 2), 'Morning on the BeltLine. Same pin as the evening, different hour.'),
  door('door-day-krog', 'Krog Street Market', 'daypart', ['chill', 'culture'], 33.7567, -84.3639, 'place', stall('Krog / Elizabeth lots', 3), 'Eastside day-part stay.'),
  door('door-day-beltline', 'Eastside BeltLine trailhead', 'daypart', ['chill', 'crew'], 33.7720, -84.3610, 'place', stall('Ponce / North Highland lots', 5), 'Walk is the hang. Stall still has to be named.'),
  door('door-day-piedmont-am', 'Piedmont Park morning', 'daypart', ['chill'], 33.7850, -84.3735, 'place', stall('10th Street lots', 6), 'Morning park. Not a festival claim.'),
  door('door-day-atlantic', 'Atlantic Station hang', 'daypart', ['chill', 'work'], 33.7925, -84.3960, 'place', stall('Atlantic Station decks', 3), 'North-of-Midtown day plan.'),
  door('door-cottage-inman', 'Inman Park cottage', 'cottage', ['culture', 'chill'], 33.7570, -84.3525, 'cottage', stall('North Highland curb / lot', 4, false), 'Fourth cottage so culture is a corridor, not a token.'),
  door('door-cottage-poncey', 'Poncey-Highland cottage', 'cottage', ['culture'], 33.7732, -84.3528, 'cottage', stall('North Highland lots', 3, false), 'Kit-capable counter on the eastside.'),
  door('door-stall-battery', 'Battery hang (stall-first)', 'stall-first', ['crew'], 33.8900, -84.4685, 'stall', stall('Battery Orange / Delta deck', 1), 'When the outcome is the stall on a game or Roxy night.'),
  door('door-stall-tabernacle', 'Luckie Street stall', 'stall-first', ['crew'], 33.7589, -84.3914, 'stall', stall('LAZ 100 Luckie Street', 1), 'Downtown detector: you needed to stop before the room.'),
  door('door-host-fox', 'Fox room (when a host writes)', 'host-capable', ['crew'], 33.7727, -84.3856, 'room', stall('Fox Theatre Parking', 2), 'Same pin as the curtain. Live only after publish.'),
  door('door-host-battery', 'Battery room (when a host writes)', 'host-capable', ['crew'], 33.8901, -84.4684, 'room', stall('Battery Orange / Delta deck', 2), 'Same pin as Truist / Roxy. Do not publish a packed room you did not write.'),
  door('door-event-high', 'High Museum evening', 'event', ['chill'], 33.7900, -84.3856, 'place', stall('Woodruff Arts Center Garage', 2), 'Event collage on the Arts Center campus. Same garage as Symphony — different hang.'),
];

export const ATLANTA_CORRIDOR: CorridorDoor[] = [...MIDTOWN_CORRIDOR, ...ATLANTA_EXPANSION];

export const KIT_DOOR_COUNT = MIDTOWN_CORRIDOR.length;
export const CATALOG_DOOR_COUNT = ATLANTA_CORRIDOR.length;

export function corridorPlan(doorRow: CorridorDoor, settlementReady = false): CollapsePlan {
  return collapsePlan({
    hang: {
      id: doorRow.id,
      name: doorRow.hangName,
      vibeTokens: doorRow.vibeTokens,
      occupancySource: 'typical',
      lat: doorRow.lat,
      lng: doorRow.lng,
    },
    stall: doorRow.stall,
    detector: doorRow.detector,
    settlementReady,
  });
}

export function corridorPlans(doors: CorridorDoor[] = MIDTOWN_CORRIDOR): CollapsePlan[] {
  return doors.map((row) => corridorPlan(row));
}

export function catalogPlans(): CollapsePlan[] {
  return corridorPlans(ATLANTA_CORRIDOR);
}
