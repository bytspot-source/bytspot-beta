import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  basisFromPreferences,
  collapsePlan,
  detectorCanSettle,
  explainPlan,
  pairStall,
  stallMayClaimAvailability,
  walkBudgetMinutes,
} from '../collapsePlan.ts';
import { corridorPlans, MIDTOWN_CORRIDOR } from '../midtownCorridor.ts';
import type { MapParkingSpot } from '../mapParking.ts';

const hang = {
  id: 'patio-1',
  name: 'Chilled Patio',
  vibeTokens: ['chill'],
  lat: 33.7844,
  lng: -84.3862,
};

const vendorStall: MapParkingSpot = {
  id: 1,
  lat: 33.7846,
  lng: -84.3860,
  name: '1380 W Peachtree Garage',
  available: 22,
  total: 45,
  price: 8,
  isPremium: true,
  hasEVCharging: true,
  isCovered: true,
  securityLevel: 'premium',
  hasCameras: true,
  isReserved: false,
  source: 'vendor',
};

const placesStall: MapParkingSpot = {
  ...vendorStall,
  id: 2,
  name: 'Places Lot',
  source: 'places',
  hasEVCharging: false,
  price: 0,
  available: 99,
  total: 99,
};

test('catalog occupancy cannot be Live', () => {
  const plan = collapsePlan({
    hang: { ...hang, occupancySource: 'typical' },
    stall: { name: vendorStall.name, source: 'vendor', walkMinutes: 3, paid: true },
  });
  assert.equal(plan.occupancy.kind, 'Typical');
  assert.match(plan.because, /usually/i);
  assert.equal(plan.canCheckout, false);
});

test('only a door write is Live', () => {
  const plan = collapsePlan({
    hang: { ...hang, occupancySource: 'user_report' },
    stall: { name: vendorStall.name, source: 'vendor', walkMinutes: 3, paid: true },
    detector: 'room',
    settlementReady: true,
  });
  assert.equal(plan.occupancy.kind, 'Live');
  assert.match(plan.because, /door wrote/i);
  assert.equal(plan.canCheckout, true);
});

test('a place detector never settles even if someone set settlementReady', () => {
  assert.equal(detectorCanSettle('place', { settlementReady: true, stallSource: 'vendor' }), false);
  const plan = collapsePlan({
    hang,
    stall: { name: vendorStall.name, source: 'vendor', walkMinutes: 3, paid: true },
    detector: 'place',
    settlementReady: true,
  });
  assert.equal(plan.canCheckout, false);
});

test('a stall Clip cannot settle on Places or fallback inventory', () => {
  assert.equal(stallMayClaimAvailability('places'), false);
  assert.equal(stallMayClaimAvailability('fallback'), false);
  assert.equal(stallMayClaimAvailability('vendor'), true);
  assert.equal(detectorCanSettle('stall', { settlementReady: true, stallSource: 'places' }), false);
  assert.equal(detectorCanSettle('stall', { settlementReady: true, stallSource: 'vendor' }), true);
});

test('pairs vendor stall inside the walk budget and hides Places counts', () => {
  const paired = pairStall(hang, [placesStall, vendorStall], { walkPreference: 'close' });
  assert.ok(paired);
  assert.equal(paired.source, 'vendor');
  assert.equal(paired.available, 22);
  const placesOnly = pairStall(hang, [placesStall], { walkPreference: 'close' });
  assert.ok(placesOnly);
  assert.equal(placesOnly.available, null);
});

test('walk budget is a hard constraint', () => {
  const far: MapParkingSpot = { ...vendorStall, lat: 33.81, lng: -84.41 };
  assert.equal(pairStall(hang, [far], { walkPreference: 'close' }), null);
  assert.ok(walkBudgetMinutes('close') < walkBudgetMinutes('far'));
});

test('Profile basis is the measurement, not a social hub', () => {
  const basis = basisFromPreferences({
    vibePreferences: { selectedVibes: ['chill'] },
    discoveryPreferences: { walkPreference: 'close' },
    parkingPreferences: { evCharging: true },
  });
  assert.deepEqual(basis.vibeTokens, ['chill']);
  assert.equal(basis.walkPreference, 'close');
  const evOnly: MapParkingSpot = { ...vendorStall, hasEVCharging: false };
  assert.equal(pairStall(hang, [evOnly], basis), null);
});

test('ten Midtown doors are Typical, unsettleable catalog, and complete sentences', () => {
  assert.equal(MIDTOWN_CORRIDOR.length, 10);
  const plans = corridorPlans();
  assert.equal(plans.length, 10);
  for (const plan of plans) {
    assert.equal(plan.occupancy.kind, 'Typical');
    assert.equal(plan.canCheckout, false);
    assert.match(plan.because, /min walk/);
  }
  const kinds = new Set(MIDTOWN_CORRIDOR.map((d) => d.kind));
  assert.deepEqual([...kinds].sort(), ['cottage', 'daypart', 'host-capable', 'stall-first']);
});

test('every plan finishes the because sentence', () => {
  const line = explainPlan({
    hangName: 'Chilled Patio',
    occupancyKind: 'Typical',
    occupancyLabel: 'Typical now',
    stallName: '1380 W Peachtree Garage',
    walkMinutes: 3,
    vibeTokens: ['chill'],
  });
  assert.match(line, /3 min walk/);
  assert.match(line, /chill/);
});
