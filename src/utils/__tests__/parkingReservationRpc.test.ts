import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PARKING_RESERVATION_RPC_CONTRACT,
  normalizeParkingListings,
  normalizeParkingQuotes,
  normalizeParkingReservations,
  reserveParkingViaRpc,
  searchParkingViaRpc,
} from '../parkingReservationRpc.ts';

test('parking adapter contract locks marketplace route names and providers', () => {
  assert.equal(PARKING_RESERVATION_RPC_CONTRACT.routes.search, 'parking.search');
  assert.equal(PARKING_RESERVATION_RPC_CONTRACT.routes.quote, 'parking.quote');
  assert.equal(PARKING_RESERVATION_RPC_CONTRACT.routes.reserve, 'parking.reserve');
  assert.equal(PARKING_RESERVATION_RPC_CONTRACT.routes.availability, 'parking.availability');
  assert.deepEqual(PARKING_RESERVATION_RPC_CONTRACT.providers, ['spothero', 'parkwhiz', 'parkmobile', 'bytspot_vendor', 'google_places']);
});

test('parking normalizers accept listing quote and reservation provider rows', () => {
  const listings = normalizeParkingListings({ listings: [{ facilityId: 'lot-1', facilityName: 'Colony Garage', provider: 'parkwhiz', price: '$12', status: 'available' }] });
  const quotes = normalizeParkingQuotes({ quoteId: 'q1', listingId: 'lot-1', totalCents: 1200, provider: 'spothero' });
  const reservations = normalizeParkingReservations({ reservationId: 'res1', quoteId: 'q1', status: 'confirmed', code: 'ABC123', provider: 'parkmobile' });

  assert.equal(listings[0].title, 'Colony Garage');
  assert.equal(listings[0].reservable, true);
  assert.equal(quotes[0].totalLabel, '$12');
  assert.equal(reservations[0].confirmationCode, 'ABC123');
});

test('searchParkingViaRpc prevents caller provider override and falls back', async () => {
  let inputSeen: unknown;
  const backend = await searchParkingViaRpc({
    parking: { search: { query: async (input) => { inputSeen = input; return { listings: [{ id: 'p1', title: 'Smart Garage', priceLabel: '$9', available: true }] }; } } },
  }, { providers: ['google_places'], limit: 2 });
  const fallback = await searchParkingViaRpc({}, {}, [{ id: 'fb', provider: 'google_places', title: 'Fallback Lot', priceLabel: 'TBA', availabilityLabel: 'Unknown', available: true, reservable: false }]);

  assert.equal(backend.source, 'backend');
  assert.deepEqual((inputSeen as { providers: string[] }).providers, ['spothero', 'parkwhiz', 'parkmobile', 'bytspot_vendor', 'google_places']);
  assert.equal(fallback.source, 'fallback');
  assert.equal(fallback.listings[0].id, 'fb');
});

test('reserveParkingViaRpc supports mutation style procedures', async () => {
  const result = await reserveParkingViaRpc({
    parking: { reserve: { mutate: async () => ({ reservationId: 'res2', listingId: 'lot-2', quoteId: 'q2', status: 'confirmed' }) } },
  }, { listingId: 'lot-2', quoteId: 'q2', idempotencyKey: 'idem-2' });

  assert.equal(result.reservations[0].id, 'res2');
  assert.equal(result.reservations[0].status, 'confirmed');
});