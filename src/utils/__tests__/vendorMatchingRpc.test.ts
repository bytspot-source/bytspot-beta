import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enrichPlacesViaRpc,
  matchVendorsViaRpcWithFallback,
  rankDiscoverCardsViaRpcWithFallback,
} from '../vendorMatchingRpc.ts';
import { adaptDiscoverCardToMatchDocument, matchVendorsWithSimplex } from '../vendorMatching.ts';

test('enrichPlacesViaRpc accepts backend places.enrich document responses', async () => {
  const document = adaptDiscoverCardToMatchDocument({ id: 1, type: 'dining', name: 'Broni Home Taste', image: 'food.jpg', distance: '1 mi', description: 'Ghanaian food' });
  const trpc = { places: { enrich: { query: async () => ({ documents: [document] }) } } };

  const result = await enrichPlacesViaRpc(trpc, { query: 'ghanaian food', providers: ['google_places', 'yelp_fusion'] });

  assert.equal(result.source, 'backend');
  assert.equal(result.documents[0].name, 'Broni Home Taste');
});

test('matchVendorsViaRpcWithFallback uses backend vendors.match when available', async () => {
  const document = adaptDiscoverCardToMatchDocument({ id: 2, type: 'coffee', name: 'Quiet Cafe', image: 'coffee.jpg', distance: '0.4 mi' });
  const [localResult] = matchVendorsWithSimplex({ query: 'coffee', documents: [document], limit: 1 });
  const trpc = { vendors: { match: { query: async () => ({ results: [{ ...localResult, score: 999 }] }) } } };

  const result = await matchVendorsViaRpcWithFallback(trpc, { query: 'coffee', documents: [document], limit: 1 });

  assert.equal(result.source, 'backend');
  assert.equal(result.results[0].score, 999);
});

test('matchVendorsViaRpcWithFallback falls back to local Simplex when route is missing', async () => {
  const document = adaptDiscoverCardToMatchDocument({ id: 3, type: 'dining', name: 'Jollof House', image: 'food.jpg', distance: '0.8 mi', description: 'jollof' });

  const result = await matchVendorsViaRpcWithFallback({}, { query: 'jollof', documents: [document], limit: 1 });

  assert.equal(result.source, 'fallback');
  assert.equal(result.results[0].document.name, 'Jollof House');
  assert.ok(result.results[0].matchedTokens.includes('jollof'));
});

test('rankDiscoverCardsViaRpcWithFallback preserves client ordering fallback for Discover', async () => {
  const cards = [
    { id: 1, type: 'parking', name: 'Closest Garage', image: 'garage.jpg', distance: '0.1 mi', description: 'parking' },
    { id: 2, type: 'dining', name: 'Broni Home Taste', image: 'food.jpg', distance: '1.1 mi', description: 'Ghanaian jollof' },
  ] as const;

  const result = await rankDiscoverCardsViaRpcWithFallback({}, [...cards], { query: 'ghanaian jollof' });

  assert.equal(result.source, 'fallback');
  assert.equal(result.cards[0].name, 'Broni Home Taste');
});
