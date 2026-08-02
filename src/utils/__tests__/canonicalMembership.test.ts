import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readFileSync } from 'node:fs';
import { getBytspotMembership, hasPlatinumAccess, type BytspotMembershipSnapshot } from '../insiderCommerce.ts';
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

test('legacy local membership is removed and cannot elevate Green', () => {
  const removed: string[] = [];
  const storage = { removeItem: (key: string) => removed.push(key) };
  assert.equal(getBytspotMembership(storage).tier, 'green');
  assert.deepEqual(removed, ['bytspot_insider_membership', 'bytspot_membership']);
});

test('the checkout success URL cannot promote membership without backend status', () => {
  const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  const successRoute = appSource.slice(appSource.indexOf("path.includes('/premium/success')"), appSource.indexOf("path.includes('/premium/cancelled')"));
  assert.doesNotMatch(successRoute, /syncBytspotMembershipFromSubscription\(true\)/);
  assert.match(successRoute, /Confirming your membership with Bytspot/);
});