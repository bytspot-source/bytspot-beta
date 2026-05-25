import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPersonalizedDiscoverCards, getPreferredMapFilters } from '../personalization.ts';

test('getPreferredMapFilters returns category and vibe from explicit saved vibes', () => {
  const result = getPreferredMapFilters({ vibePreferences: { selectedVibes: ['coffee'] } });
  assert.deepEqual(result, { categoryFilter: 'coffee', vibeFilter: 1 });
});

test('getPreferredMapFilters falls back to interests when vibe preferences are missing', () => {
  const result = getPreferredMapFilters({ interests: ['bars', 'cocktails', 'nightlife'] });
  assert.deepEqual(result, { categoryFilter: 'nightlife', vibeFilter: 3 });
});

test('getPreferredMapFilters uses cultural inference when no explicit preferences exist', () => {
  const result = getPreferredMapFilters(undefined, { country: 'Ghana', region: 'West Africa', inferredCuisinePreferences: ['jollof'], inferredVibePreferences: ['afrobeats'] });
  assert.equal(result.categoryFilter, 'dining');
  assert.equal(result.vibeFilter, 2);
});

test('getPersonalizedDiscoverCards moves saved vibe matches to the front', () => {
  const cards = [
    { type: 'fitness', name: 'Iron Gym', distance: '0.3 mi', rating: 4.8 },
    { type: 'coffee', name: 'Quiet Coffee Bar', description: 'espresso brunch cafe', distance: '1.2 mi', rating: 4.6 },
  ];
  const ranked = getPersonalizedDiscoverCards(cards, { interests: [], vibePreferences: { selectedVibes: ['coffee'] } });
  assert.equal(ranked[0].name, 'Quiet Coffee Bar');
});

test('getPersonalizedDiscoverCards can use cultural context as a fallback signal', () => {
  const cards = [
    { type: 'shopping', name: 'Sneaker Market', distance: '0.2 mi', rating: 4.9 },
    { type: 'dining', name: 'Jollof House', description: 'west african food', distance: '1.8 mi', rating: 4.7 },
  ];
  const ranked = getPersonalizedDiscoverCards(cards, undefined, { country: 'Ghana', region: 'West Africa', inferredCuisinePreferences: ['jollof'], inferredVibePreferences: ['afrobeats'] });
  assert.equal(ranked[0].name, 'Jollof House');
});
