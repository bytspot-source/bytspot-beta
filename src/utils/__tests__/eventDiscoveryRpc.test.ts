import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EVENT_DISCOVERY_RPC_CONTRACT,
  loadEventsViaRpc,
  normalizeEventRow,
  normalizeEventsResponse,
} from '../eventDiscoveryRpc.ts';

test('event discovery contract locks Ticketmaster behind events.list', () => {
  assert.equal(EVENT_DISCOVERY_RPC_CONTRACT.route, 'events.list');
  assert.equal(EVENT_DISCOVERY_RPC_CONTRACT.provider, 'ticketmaster');
});

test('normalizeEventRow accepts raw Ticketmaster Discovery API shape', () => {
  const event = normalizeEventRow({
    id: 'tm-ghana-match',
    name: 'Ghana Matchday Live',
    url: 'https://tickets.example.com/tm-ghana-match',
    dates: { start: { localDate: '2026-07-18', localTime: '20:00:00' } },
    classifications: [{ segment: { name: 'Sports' }, genre: { name: 'Soccer' } }],
    priceRanges: [{ min: 50, max: 120, currency: 'USD' }],
    images: [{ url: 'https://images.example.com/match.jpg' }],
    _embedded: { venues: [{ name: 'Mercedes-Benz Stadium' }] },
  });

  assert.equal(event?.id, 'tm-ghana-match');
  assert.equal(event?.title, 'Ghana Matchday Live');
  assert.equal(event?.venue, 'Mercedes-Benz Stadium');
  assert.equal(event?.time, '8:00 PM');
  assert.equal(event?.category, 'sports');
  assert.equal(event?.price, '$50');
});

test('normalizeEventsResponse accepts backend normalized and raw embedded events', () => {
  const normalized = normalizeEventsResponse({ events: [{ id: 'evt-1', title: 'Jazz Night', venue: 'City Winery', category: 'concert', price: '$25', image: 'jazz.jpg' }] });
  const raw = normalizeEventsResponse({ _embedded: { events: [{ id: 'tm-1', name: 'Comedy Show', classifications: [{ segment: { name: 'Comedy' } }] }] } });

  assert.equal(normalized[0].title, 'Jazz Night');
  assert.equal(raw[0].category, 'comedy');
});

test('loadEventsViaRpc prefers events.list and falls back safely', async () => {
  let inputSeen: unknown;
  const backend = await loadEventsViaRpc({
    events: { list: { query: async (input) => { inputSeen = input; return { events: [{ id: 'tm-2', name: 'Afrobeats Night' }] }; } } },
  }, { city: 'Atlanta', limit: 4 });
  const fallback = await loadEventsViaRpc({}, {}, [{ id: 'fallback-1', title: 'Curated Night', venue: 'Midtown', date: 'Tonight', time: '8:00 PM', category: 'concert', emoji: '🎵', price: 'Free', image: 'fallback.jpg' }]);

  assert.deepEqual(inputSeen, { providers: ['ticketmaster', 'bytspot_curated'], city: 'Atlanta', limit: 4 });
  assert.equal(backend.source, 'backend');
  assert.equal(backend.events[0].title, 'Afrobeats Night');
  assert.equal(fallback.source, 'fallback');
  assert.equal(fallback.events[0].id, 'fallback-1');
});

test('loadEventsViaRpc does not let callers override backend-owned event providers', async () => {
  let inputSeen: unknown;
  await loadEventsViaRpc({
    events: { list: { query: async (input) => { inputSeen = input; return { events: [{ id: 'tm-3', name: 'Locked Provider Night' }] }; } } },
  }, { providers: ['bytspot_curated'], city: 'Atlanta' });

  assert.deepEqual(inputSeen, { providers: ['ticketmaster', 'bytspot_curated'], city: 'Atlanta' });
});