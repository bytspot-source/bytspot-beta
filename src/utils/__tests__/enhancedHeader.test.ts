import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCityBadge } from '../cityBadge.ts';

test('formatCityBadge keeps home location labels compact and human-readable', () => {
  assert.equal(formatCityBadge('City of Atlanta'), 'Atlanta');
  assert.equal(formatCityBadge('Atlanta Metropolitan Area'), 'Atlanta');
  assert.equal(formatCityBadge('Atlanta, Georgia, United States'), 'Atlanta');
  assert.equal(formatCityBadge('Accra (Greater Accra)'), 'Accra');
  assert.equal(formatCityBadge('A very long city name'), 'A very long…');
  assert.equal(formatCityBadge(''), 'Nearby');
});
