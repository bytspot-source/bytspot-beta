import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DISCOVERY_FALLBACK_RAIL,
  DISCOVERY_RAIL_TOKENS,
  chassisFor,
  isUnmappedCategory,
  railForCategory,
  resolveRail,
  resolveRailFromList,
  unmappedCategories,
} from '../discoveryRails.ts';
import { adaptVendorServiceToMatchDocument } from '../vendorMatching.ts';

const service = (category?: string) =>
  ({
    id: 'svc-1',
    title: 'Broni Home Taste',
    description: null,
    priceCents: 2500,
    currency: 'usd',
    durationMins: 60,
    vendor: { id: 'v-1', displayName: 'Broni', onboardingStatus: 'active' },
    patch: null,
    category,
  }) as never;

test('a category files onto its rail by exact alias, never by keyword', () => {
  assert.equal(railForCategory('dining'), 'eat_drink');
  assert.equal(railForCategory('night_club'), 'nightlife');
  assert.equal(railForCategory('hotel'), 'stay');
  assert.equal(railForCategory('party'), 'celebrate');
  // A title that merely contains a mapped word is not a category.
  assert.equal(railForCategory('the dining room bar & grill'), null);
});

test('every category the live catalogue actually serves is claimed by a rail', () => {
  // Observed from production venues.list. These are not hypothetical: when the
  // contract was first written, `market` and `park` fell through to Explore,
  // which quietly buried Ponce City Market, Krog Street Market, Colony Square
  // and Piedmont Park — four of the twelve live venues. Add a category here
  // when the catalogue starts serving it, and the gate will demand a rail.
  const served = ['market', 'bar', 'restaurant', 'park', 'club'];
  assert.deepEqual(unmappedCategories(served), []);
  assert.equal(resolveRail('market'), 'eat_drink');
  assert.equal(resolveRail('park'), 'experience');
});

test('a rail label or token is accepted as itself', () => {
  assert.equal(railForCategory('Eat & Drink'), 'eat_drink');
  assert.equal(railForCategory('nightlife'), 'nightlife');
  assert.equal(railForCategory('  Stay  '), 'stay');
});

test('an unmapped category lands on Explore rather than hiding the place', () => {
  assert.equal(railForCategory('brunch'), null);
  assert.equal(resolveRail('brunch'), DISCOVERY_FALLBACK_RAIL);
  assert.ok(DISCOVERY_RAIL_TOKENS.includes(DISCOVERY_FALLBACK_RAIL));
  assert.equal(isUnmappedCategory('brunch'), true);
  assert.equal(isUnmappedCategory('dining'), false);
  // Absent is not unmapped: nothing was claimed, so nothing is reportable.
  assert.equal(isUnmappedCategory(undefined), false);
  assert.equal(isUnmappedCategory('   '), false);
});

test('every unclaimed category is reported once, sorted, for the parity gate', () => {
  assert.deepEqual(unmappedCategories(['brunch', 'dining', 'Brunch', 'supperclub', null]), [
    'brunch',
    'supperclub',
  ]);
});

test('a specific rail beats the catch-all when several categories are named', () => {
  assert.equal(resolveRailFromList(['all', 'bar']), 'nightlife');
  assert.equal(resolveRailFromList(['all']), 'explore');
  assert.equal(resolveRailFromList(['unknown-a', 'unknown-b']), DISCOVERY_FALLBACK_RAIL);
  assert.equal(resolveRailFromList([]), DISCOVERY_FALLBACK_RAIL);
});

test('the premium chassis is earned by supply, never by a rail', () => {
  assert.equal(chassisFor('book'), 'premium');
  assert.equal(chassisFor('order'), 'premium');
  assert.equal(chassisFor('request'), 'premium');
  assert.equal(chassisFor('redirect'), 'plain');
  assert.equal(chassisFor('details'), 'plain');
  // A published party carries `details` but supplied admission and capacity.
  assert.equal(chassisFor('details', { isPublishedParty: true }), 'premium');
});

test('a vendor service is filed by its own category', () => {
  const doc = adaptVendorServiceToMatchDocument(service('dining'));
  assert.equal(doc.rail, 'eat_drink');
  assert.equal(doc.unmappedCategories, undefined);
});

test('an unmapped vendor stays visible on Explore and names the gap', () => {
  const doc = adaptVendorServiceToMatchDocument(service('brunch'));
  assert.equal(doc.rail, DISCOVERY_FALLBACK_RAIL);
  assert.deepEqual(doc.unmappedCategories, ['brunch']);
});

test('a display name or patch label never picks the rail', () => {
  // "Broni" and the trust strings are in `categories`, but only the vendor's
  // own category may file the place.
  const doc = adaptVendorServiceToMatchDocument(service(undefined));
  assert.equal(doc.rail, DISCOVERY_FALLBACK_RAIL);
  assert.equal(doc.unmappedCategories, undefined);
});
