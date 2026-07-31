import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { POINT_ACTIONS } from '../gamification.ts';
import { BYTSPOT_PATCH_TIERS } from '../patchTiers.ts';

test('check-in is the only client points earning action', () => {
  assert.deepEqual(Object.keys(POINT_ACTIONS), ['VENUE_CHECKIN']);
  assert.equal(POINT_ACTIONS.VENUE_CHECKIN.points, 10);
});

test('points do not define or promote membership tiers', () => {
  const source = readFileSync(new URL('../gamification.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /MembershipTier|TierInfo|getUserTier|getNextTierInfo|TIERS/);
  assert.doesNotMatch(source, /bronze|silver|gold/i);
});

test('canonical Bytspot tiers remain Green, Platinum, and Black', () => {
  assert.deepEqual([...BYTSPOT_PATCH_TIERS].sort(), ['black', 'green', 'platinum']);
});