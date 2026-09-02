import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeLocations,
  distanceMiles,
  fulfillmentFor,
  isWithinReach,
  locationPublishBlockers,
  locationSupportsEtaKind,
  type VendorLocation,
} from '../locations.ts';
import {
  canRunLocationOperation,
  etaKindAllowsFulfillment,
  getBookableLocations,
  listBookableTemplates,
  locationCanPublish,
  locationKindsForDomain,
} from '../../utils/bookableTemplates.ts';

const MIDTOWN: VendorLocation = {
  id: 'loc_fixed',
  label: 'Midtown',
  kind: 'fixed',
  state: 'ACTIVE',
  address: '1 Peachtree St',
  lat: 33.7866,
  lng: -84.3833,
};

const MOBILE: VendorLocation = {
  id: 'loc_visiting',
  label: 'Mobile massage',
  kind: 'visiting',
  state: 'ACTIVE',
  lat: 33.7866,
  lng: -84.3833,
  radiusMiles: 10,
};

test('a location is a PIN a seller holds, not a new core noun', () => {
  const locations = getBookableLocations();
  assert.equal(locations.derivesFrom, 'PIN');
  assert.equal(locations.heldBy, 'SELLER');

  // Kind is the only thing that decides who travels.
  assert.equal(fulfillmentFor(MIDTOWN), 'guestTravels');
  assert.equal(fulfillmentFor(MOBILE), 'vendorTravels');
  for (const kind of locations.kinds) {
    if (kind.fulfillment === 'vendorTravels') {
      assert.equal(kind.requiresRadius, true, `${kind.id} travels but has no radius`);
    }
  }
});

test('reach is asymmetric, which is the whole reason kind exists', () => {
  const near = { lat: 33.8, lng: -84.39 };
  const far = { lat: 34.5, lng: -84.39 };

  // Guest travels: their own radius decides, and the vendor's is irrelevant.
  assert.equal(isWithinReach(MIDTOWN, near, 5), true);
  assert.equal(isWithinReach(MIDTOWN, far, 5), false);
  assert.equal(isWithinReach(MIDTOWN, far, 100), true);

  // Vendor travels: their radius decides, and the guest's is irrelevant.
  assert.equal(isWithinReach(MOBILE, near, 1), true);
  assert.equal(isWithinReach(MOBILE, far, 999), false);
  assert.equal(isWithinReach({ ...MOBILE, radiusMiles: 60 }, far, 1), true);

  // A radius past the contract ceiling is clamped, not honoured.
  const { maxRadiusMiles } = getBookableLocations().defaults;
  const beyond = { lat: 33.7866 + (maxRadiusMiles + 20) / 69, lng: -84.3833 };
  assert.equal(isWithinReach({ ...MOBILE, radiusMiles: 5000 }, beyond, 1), false);

  // Distance is symmetric even though reach is not.
  assert.equal(
    Math.round(distanceMiles(MIDTOWN, near)),
    Math.round(distanceMiles(near, MIDTOWN)),
  );
  assert.equal(distanceMiles(MIDTOWN, MIDTOWN), 0);
});

test('an address is a publish requirement, not a profile detail', () => {
  assert.deepEqual(locationPublishBlockers(MIDTOWN, 'dining'), []);

  // Every state but ACTIVE stops inventory dead.
  for (const state of getBookableLocations().states) {
    const blockers = locationPublishBlockers({ ...MIDTOWN, state }, 'dining');
    assert.equal(blockers.length === 0, state === 'ACTIVE', `${state} publish behaviour is wrong`);
    assert.equal(locationCanPublish(state), state === 'ACTIVE');
  }

  // A fixed location needs a street address; a visiting one needs a radius.
  assert.deepEqual(locationPublishBlockers({ ...MIDTOWN, address: '  ' }, 'dining'), ['Needs a street address']);
  assert.deepEqual(locationPublishBlockers({ ...MOBILE, radiusMiles: undefined }, 'wellness'), [
    'Needs a travel radius',
  ]);
  assert.ok(locationPublishBlockers({ ...MOBILE, radiusMiles: 5000 }, 'wellness').some((item) => item.includes('exceed')));

  // A pin that is not a coordinate is not a pin.
  assert.ok(locationPublishBlockers({ ...MIDTOWN, lat: Number.NaN }, 'dining').includes('Needs a pin on the map'));
  assert.ok(locationPublishBlockers({ ...MIDTOWN, lat: 200 }, 'dining').includes('Pin is not a real coordinate'));

  // Blockers are collected, so a vendor fixes everything in one pass.
  assert.equal(locationPublishBlockers({ ...MIDTOWN, state: 'DRAFT', address: '' }, 'dining').length, 2);
});

test('a domain can only operate from a kind that makes sense for it', () => {
  // A dining room is fixed; it cannot become a visiting service.
  assert.deepEqual(locationKindsForDomain('dining').map((kind) => kind.id), ['fixed']);
  assert.ok(locationPublishBlockers(MOBILE, 'dining').some((item) => item.includes('cannot operate from')));

  // Wellness and green genuinely carry both, rather than being forced into one.
  assert.deepEqual(locationKindsForDomain('wellness').map((kind) => kind.id), ['fixed', 'visiting']);
  assert.deepEqual(locationKindsForDomain('green').map((kind) => kind.id), ['visiting', 'fixed']);
  assert.deepEqual(locationPublishBlockers(MOBILE, 'wellness'), []);
  assert.deepEqual(locationPublishBlockers(MIDTOWN, 'wellness'), []);

  // Parking is a zone and a ride is mobile, and the first kind is the default.
  assert.equal(locationKindsForDomain('stall')[0].id, 'zone');
  assert.equal(locationKindsForDomain('automotive')[0].id, 'mobile');
});

test('a dispatch ETA only means something when the vendor is the one moving', () => {
  assert.equal(etaKindAllowsFulfillment('dispatch', 'vendorTravels'), true);
  assert.equal(etaKindAllowsFulfillment('dispatch', 'guestTravels'), false);
  assert.equal(etaKindAllowsFulfillment('readiness', 'guestTravels'), true);
  assert.equal(etaKindAllowsFulfillment('readiness', 'vendorTravels'), false);
  // Policy and none say nothing about who travels, so both are legal.
  assert.equal(etaKindAllowsFulfillment('none', 'guestTravels'), true);
  assert.equal(etaKindAllowsFulfillment('none', 'vendorTravels'), true);

  assert.equal(locationSupportsEtaKind(MIDTOWN, 'dispatch'), false);
  assert.equal(locationSupportsEtaKind(MOBILE, 'dispatch'), true);

  // Applied to the real catalog: every template's ETA must be servable from at
  // least one kind its own domain is allowed to use.
  for (const template of listBookableTemplates()) {
    const servable = locationKindsForDomain(template.domain).some((kind) =>
      etaKindAllowsFulfillment(template.timing.etaKind, kind.fulfillment),
    );
    assert.ok(servable, `${template.id} promises a ${template.timing.etaKind} ETA no location kind can serve`);
  }
});

test('activating a location needs SELL and a state that allows it', () => {
  assert.equal(canRunLocationOperation('owner', 'ACTIVATE_LOCATION', 'DRAFT'), true);
  assert.equal(canRunLocationOperation('manager', 'ACTIVATE_LOCATION', 'PAUSED'), true);

  // A door or staff seat cannot bring inventory online.
  assert.equal(canRunLocationOperation('staff', 'ACTIVATE_LOCATION', 'DRAFT'), false);
  assert.equal(canRunLocationOperation('door', 'PAUSE_LOCATION', 'ACTIVE'), false);
  assert.equal(canRunLocationOperation('serviceProvider', 'ACTIVATE_LOCATION', 'DRAFT'), false);

  // Already active is not activatable, and closed is terminal.
  assert.equal(canRunLocationOperation('owner', 'ACTIVATE_LOCATION', 'ACTIVE'), false);
  for (const operation of getBookableLocations().operations) {
    assert.equal(canRunLocationOperation('owner', operation.id, 'CLOSED'), false);
  }

  assert.deepEqual(
    activeLocations([MIDTOWN, { ...MOBILE, state: 'DRAFT' }]).map((item) => item.id),
    ['loc_fixed'],
  );
});
