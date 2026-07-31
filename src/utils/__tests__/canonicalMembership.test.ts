import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hasPlatinumAccess, type BytspotMembershipSnapshot } from '../insiderCommerce.ts';
import { BYTSPOT_PATCH_TIERS } from '../patchTiers.ts';

function membership(tier: BytspotMembershipSnapshot['tier']): BytspotMembershipSnapshot {
  const label = tier === 'green' ? 'Green' : tier === 'platinum' ? 'Platinum' : 'Black';
  return { tier, label, activatedAt: null, source: 'default' };
}

test('canonical membership contains only Green, Platinum, and Black', () => {
  assert.deepEqual(BYTSPOT_PATCH_TIERS, ['black', 'platinum', 'green']);
});

test('Platinum features fail closed for Green and include Black', () => {
  assert.equal(hasPlatinumAccess(membership('green')), false);
  assert.equal(hasPlatinumAccess(membership('platinum')), true);
  assert.equal(hasPlatinumAccess(membership('black')), true);
});