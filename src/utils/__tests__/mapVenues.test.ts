/**
 * Unit tests for src/utils/mapVenues.ts.
 *
 * Run with the project's test:unit script:
 *   npm run test:unit
 *
 * Uses Node's built-in test runner + assert; no vitest/jest required.
 * Node >= 22.6 strips TypeScript syntax automatically.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { filterMapVenues, hasHardwarePatchInstalled, isBikeStation } from '../mapVenues.ts';
import type { ApiVenue } from '../trpc.ts';

// Minimal venue factory — only the fields filterMapVenues looks at.
const venue = (over: Partial<ApiVenue> & { id: string }): ApiVenue =>
  ({
    id: over.id,
    name: over.name ?? `Venue ${over.id}`,
    category: over.category ?? 'restaurant',
    entryType: over.entryType ?? 'free',
    crowd: over.crowd ?? { level: 1 },
    hardwarePatch: over.hardwarePatch,
    // anything else MapSection touches at render time isn't read by the filter
  } as ApiVenue);

const NONE = { showVerifiedOnly: false, vibeFilter: null, entryFilter: null, categoryFilter: null } as const;

const verifiedDiningCalm = venue({
  id: 'v1', category: 'Restaurant', entryType: 'free', crowd: { level: 0 },
  hardwarePatch: { id: 'hp-1' } as ApiVenue['hardwarePatch'],
});
const unverifiedDiningCalm = venue({ id: 'v2', category: 'restaurant' });
const verifiedNightlifePaid = venue({
  id: 'v3', category: 'Cocktail Bar', entryType: 'paid', crowd: { level: 2 },
  hardwarePatch: { id: 'hp-2' } as ApiVenue['hardwarePatch'],
});
const unverifiedCoffee = venue({ id: 'v4', category: 'Cafe', crowd: { level: 1 } });
const verifiedPark = venue({
  id: 'v5', category: 'Park', crowd: { level: 0 },
  hardwarePatch: { id: 'hp-3' } as ApiVenue['hardwarePatch'],
});

const ALL = [verifiedDiningCalm, unverifiedDiningCalm, verifiedNightlifePaid, unverifiedCoffee, verifiedPark];

test('hasHardwarePatchInstalled — true only when patch.id is set', () => {
  assert.equal(hasHardwarePatchInstalled(verifiedDiningCalm), true);
  assert.equal(hasHardwarePatchInstalled(unverifiedDiningCalm), false);
  assert.equal(hasHardwarePatchInstalled(null), false);
  assert.equal(hasHardwarePatchInstalled(undefined), false);
  assert.equal(hasHardwarePatchInstalled(venue({ id: 'x', hardwarePatch: { id: '' } as ApiVenue['hardwarePatch'] })), false);
});

test('filterMapVenues — no filters returns the full list (identity-preserving)', () => {
  assert.deepEqual(filterMapVenues(ALL, NONE).map(v => v.id), ALL.map(v => v.id));
});

test('filterMapVenues — showVerifiedOnly drops venues without a hardware patch', () => {
  const out = filterMapVenues(ALL, { ...NONE, showVerifiedOnly: true });
  assert.deepEqual(out.map(v => v.id), ['v1', 'v3', 'v5']);
  assert.ok(out.every(hasHardwarePatchInstalled), 'every result must be Verified');
});

test('filterMapVenues — showVerifiedOnly + categoryFilter intersect (Verified dining only)', () => {
  const out = filterMapVenues(ALL, { ...NONE, showVerifiedOnly: true, categoryFilter: 'dining' });
  assert.deepEqual(out.map(v => v.id), ['v1']);
});

test('filterMapVenues — vibeFilter matches crowd.level exactly', () => {
  const calm = filterMapVenues(ALL, { ...NONE, vibeFilter: 0 });
  assert.deepEqual(calm.map(v => v.id).sort(), ['v1', 'v5']);
  const buzzing = filterMapVenues(ALL, { ...NONE, vibeFilter: 2 });
  assert.deepEqual(buzzing.map(v => v.id), ['v3']);
});

test('filterMapVenues — entryFilter "paid" only keeps paid venues', () => {
  const out = filterMapVenues(ALL, { ...NONE, entryFilter: 'paid' });
  assert.deepEqual(out.map(v => v.id), ['v3']);
});

test('filterMapVenues — entryFilter "free" treats missing entryType as free', () => {
  const noTypeVenue = venue({ id: 'v6' });
  delete (noTypeVenue as { entryType?: string }).entryType;
  const out = filterMapVenues([noTypeVenue, verifiedNightlifePaid], { ...NONE, entryFilter: 'free' });
  assert.deepEqual(out.map(v => v.id), ['v6']);
});

test('filterMapVenues — categoryFilter aliases (nightlife matches "Cocktail Bar")', () => {
  const nightlife = filterMapVenues(ALL, { ...NONE, categoryFilter: 'nightlife' });
  assert.deepEqual(nightlife.map(v => v.id), ['v3']);
  const coffee = filterMapVenues(ALL, { ...NONE, categoryFilter: 'coffee' });
  assert.deepEqual(coffee.map(v => v.id), ['v4']);
  const parks = filterMapVenues(ALL, { ...NONE, categoryFilter: 'parks' });
  assert.deepEqual(parks.map(v => v.id), ['v5']);
});

test('filterMapVenues — categoryFilter falls back to literal token when not aliased', () => {
  const literal = filterMapVenues(ALL, { ...NONE, categoryFilter: 'park' });
  assert.deepEqual(literal.map(v => v.id), ['v5']);
});

test('filterMapVenues — empty input yields empty output for any filter combo', () => {
  assert.deepEqual(filterMapVenues([], { ...NONE, showVerifiedOnly: true, categoryFilter: 'dining' }), []);
});

test('filterMapVenues — pure: does not mutate the input array', () => {
  const before = ALL.slice();
  filterMapVenues(ALL, { ...NONE, showVerifiedOnly: true });
  assert.deepEqual(ALL, before);
});

// ─── isBikeStation ─────────────────────────────────────────────────────────────

test('isBikeStation — null/undefined safe', () => {
  assert.equal(isBikeStation(null), false);
  assert.equal(isBikeStation(undefined), false);
});

test('isBikeStation — vendor categories: bike-share, ebike-station', () => {
  assert.equal(isBikeStation(venue({ id: 'b1', category: 'bike-share' })), true);
  assert.equal(isBikeStation(venue({ id: 'b2', category: 'ebike-station' })), true);
  assert.equal(isBikeStation(venue({ id: 'b3', category: 'EBike Station' })), true);
});

test('isBikeStation — Google Places types: bicycle_store, bike_rental, bike_share_station', () => {
  for (const type of ['bicycle_store', 'bike_rental', 'bike_share_station']) {
    // Build inline because the local venue() factory whitelist strips `types`.
    const v = { id: `gp-${type}`, name: 'Place', category: 'unknown', types: [type] } as ApiVenue;
    assert.equal(isBikeStation(v), true, `expected ${type} to be a bike station`);
  }
});

test('isBikeStation — non-bike venues return false', () => {
  assert.equal(isBikeStation(venue({ id: 'r1', category: 'restaurant' })), false);
  assert.equal(isBikeStation(venue({ id: 'p1', category: 'park' })), false);
  assert.equal(isBikeStation(venue({ id: 'c1', category: 'coffee' })), false);
});
