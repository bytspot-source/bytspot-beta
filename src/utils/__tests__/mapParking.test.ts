/**
 * Unit tests for src/utils/mapParking.ts — the tiered parking source merge
 * that replaces the static ATLANTA_PARKING mock in MapSection.
 *
 * Run with:  npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FALLBACK_ATLANTA_PARKING,
  mergeParkingSources,
  placeToParkingSpot,
  stableNumericId,
  venueToParkingSpot,
  type MapParkingSpot,
} from '../mapParking.ts';
import type { ApiVenue } from '../trpc.ts';

const venue = (over: Partial<ApiVenue> & { id: string }): ApiVenue => ({
  id: over.id,
  name: over.name ?? `Venue ${over.id}`,
  category: over.category ?? 'restaurant',
  lat: over.lat ?? 33.78,
  lng: over.lng ?? -84.38,
  parking: over.parking ?? { totalAvailable: 0, spots: [] },
  ...over,
} as ApiVenue);

// ─── stableNumericId ────────────────────────────────────────────────────────

test('stableNumericId: deterministic for the same input', () => {
  assert.equal(stableNumericId('abc'), stableNumericId('abc'));
  assert.notEqual(stableNumericId('abc'), stableNumericId('abd'));
});

test('stableNumericId: keeps clear of fallback id range (1-99)', () => {
  for (const seed of ['venue:v1', 'place:p1', 'venue:long-id-here']) {
    assert.ok(stableNumericId(seed) >= 100_000, `expected ${stableNumericId(seed)} >= 100000`);
  }
});

// ─── venueToParkingSpot ────────────────────────────────────────────────────

test('venueToParkingSpot: returns null when venue has no parking spots', () => {
  const v = venue({ id: 'v1', parking: { totalAvailable: 0, spots: [] } });
  assert.equal(venueToParkingSpot(v), null);
});

test('venueToParkingSpot: returns null when venue lacks lat/lng', () => {
  const v = venue({ id: 'v2', lat: undefined as unknown as number, lng: undefined as unknown as number,
    parking: { totalAvailable: 5, spots: [{ name: 'Lot A', type: 'surface', total: 10, pricePerHr: 4 }] } });
  assert.equal(venueToParkingSpot(v), null);
});

test('venueToParkingSpot: aggregates spots, tags source as vendor', () => {
  const v = venue({
    id: 'v3', name: 'Krog Market', lat: 33.7575, lng: -84.3636,
    parking: { totalAvailable: 12, spots: [
      { name: 'Surface Lot', type: 'surface', total: 20, pricePerHr: 5 },
      { name: 'Garage', type: 'garage', total: 15, pricePerHr: 8 },
    ]},
  });
  const out = venueToParkingSpot(v);
  assert.ok(out);
  assert.equal(out!.source, 'vendor');
  assert.equal(out!.lat, 33.7575);
  assert.equal(out!.lng, -84.3636);
  assert.equal(out!.total, 35);
  assert.equal(out!.available, 12);
  assert.equal(out!.price, 5);
  assert.match(out!.name, /Krog Market/);
});

test('venueToParkingSpot: clamps available to total', () => {
  const v = venue({
    id: 'v4', lat: 33.78, lng: -84.38,
    parking: { totalAvailable: 999, spots: [{ name: 'Lot', type: 'surface', total: 10, pricePerHr: 3 }] },
  });
  const out = venueToParkingSpot(v);
  assert.equal(out!.available, 10); // not 999
});

// ─── placeToParkingSpot ────────────────────────────────────────────────────

test('placeToParkingSpot: tags source as places, zeroes live fields', () => {
  const out = placeToParkingSpot({ placeId: 'gp_xyz', name: 'SP+ Garage', lat: 33.79, lng: -84.39 });
  assert.equal(out.source, 'places');
  assert.equal(out.available, 0);
  assert.equal(out.total, 0);
  assert.equal(out.price, 0);
  assert.equal(out.name, 'SP+ Garage');
});

// ─── mergeParkingSources ───────────────────────────────────────────────────

const vendorA: MapParkingSpot = { ...placeToParkingSpot({ placeId: 'a', name: 'Vendor A', lat: 33.78, lng: -84.38 }), source: 'vendor', id: 100_001 };
const placeNear: MapParkingSpot = placeToParkingSpot({ placeId: 'near', name: 'Near A', lat: 33.78001, lng: -84.38001 });
const placeFar:  MapParkingSpot = placeToParkingSpot({ placeId: 'far',  name: 'Far',    lat: 33.80,    lng: -84.40 });

test('mergeParkingSources: vendor entries always retained', () => {
  const out = mergeParkingSources({ vendor: [vendorA], places: [], fallback: FALLBACK_ATLANTA_PARKING });
  assert.equal(out.length, 1);
  assert.equal(out[0].source, 'vendor');
});

test('mergeParkingSources: places near a vendor pin are dropped', () => {
  const out = mergeParkingSources({ vendor: [vendorA], places: [placeNear, placeFar], fallback: [] });
  // placeNear within ~30m of vendorA → dropped. placeFar kept.
  assert.equal(out.length, 2);
  assert.equal(out.filter(s => s.source === 'places').length, 1);
  assert.equal(out.find(s => s.source === 'places')!.name, 'Far');
});

test('mergeParkingSources: fallback only when both vendor and places are empty', () => {
  const out = mergeParkingSources({ vendor: [], places: [], fallback: FALLBACK_ATLANTA_PARKING });
  assert.equal(out.length, FALLBACK_ATLANTA_PARKING.length);
  assert.ok(out.every(s => s.source === 'fallback'));
});

test('mergeParkingSources: fallback NOT used when vendor or places have entries', () => {
  const out1 = mergeParkingSources({ vendor: [vendorA], places: [], fallback: FALLBACK_ATLANTA_PARKING });
  assert.ok(out1.every(s => s.source !== 'fallback'));

  const out2 = mergeParkingSources({ vendor: [], places: [placeFar], fallback: FALLBACK_ATLANTA_PARKING });
  assert.ok(out2.every(s => s.source !== 'fallback'));
});

test('mergeParkingSources: result is a fresh array (no mutation of inputs)', () => {
  const vendor = [vendorA];
  const places = [placeFar];
  mergeParkingSources({ vendor, places, fallback: [] });
  assert.equal(vendor.length, 1);
  assert.equal(places.length, 1);
});
