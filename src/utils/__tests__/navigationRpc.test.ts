import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NAVIGATION_RPC_CONTRACT,
  geocodeViaRpc,
  loadNavigationRoutesViaRpc,
  normalizeGeocodeResults,
  normalizeNavigationRoutes,
} from '../navigationRpc.ts';

test('navigation adapter contract locks map route names and providers', () => {
  assert.equal(NAVIGATION_RPC_CONTRACT.routes.route, 'navigation.route');
  assert.equal(NAVIGATION_RPC_CONTRACT.routes.eta, 'navigation.eta');
  assert.equal(NAVIGATION_RPC_CONTRACT.routes.geocode, 'navigation.geocode');
  assert.deepEqual(NAVIGATION_RPC_CONTRACT.providers, ['google_maps', 'apple_maps', 'bytspot_curated']);
});

test('normalizeNavigationRoutes accepts Google Directions style routes', () => {
  const routes = normalizeNavigationRoutes({ routes: [{ summary: 'I-75 N', legs: [{ distance: { text: '2.1 mi' }, duration: { text: '8 mins' } }], overview_polyline: { points: 'abc123' } }] });
  assert.equal(routes[0].provider, 'google_maps');
  assert.equal(routes[0].summary, 'I-75 N');
  assert.equal(routes[0].distanceLabel, '2.1 mi');
  assert.equal(routes[0].durationLabel, '8 mins');
  assert.equal(routes[0].polyline, 'abc123');
});

test('loadNavigationRoutesViaRpc prevents caller provider override', async () => {
  let inputSeen: unknown;
  const result = await loadNavigationRoutesViaRpc({
    navigation: { route: { query: async (input) => { inputSeen = input; return { routes: [{ id: 'r1', summary: 'Fastest', distanceLabel: '1 mi', durationLabel: '4 min' }] }; } } },
  }, { origin: { address: 'A' }, destination: { address: 'B' }, providers: ['apple_maps'] });

  assert.equal(result.source, 'backend');
  assert.deepEqual((inputSeen as { providers: string[] }).providers, ['google_maps', 'apple_maps', 'bytspot_curated']);
});

test('geocodeViaRpc normalizes Google geocode results and falls back safely', async () => {
  const backend = await geocodeViaRpc({
    navigation: { geocode: { query: async () => ({ results: [{ place_id: 'gp1', formatted_address: 'Colony Square', geometry: { location: { lat: 33.7878, lng: -84.3832 } } }] }) } },
  }, { query: 'Colony Square' });
  const fallback = await geocodeViaRpc({}, { query: 'x' }, [{ id: 'fallback', provider: 'bytspot_curated', label: 'Fallback', lat: 1, lng: 2 }]);

  assert.equal(backend.results[0].placeId, 'gp1');
  assert.deepEqual(normalizeGeocodeResults({ places: [{ id: 'p1', label: 'Place', lat: '3', lng: '4' }] })[0], { id: 'p1', provider: 'google_maps', label: 'Place', lat: 3, lng: 4 });
  assert.equal(fallback.source, 'fallback');
  assert.equal(fallback.results[0].provider, 'bytspot_curated');
});