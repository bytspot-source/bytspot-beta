import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveConsumerExperienceTier, getConsumerTierProgress, getTieredHomeCards, TIERED_EXPERIENCE_PROFILES } from '../../features/tieredExperience.ts';

describe('tiered Parker experience', () => {
  it('derives Explorer, Insider, and VIP from bookings and activity', () => {
    assert.equal(deriveConsumerExperienceTier({ bookingCount: 0, activityPoints: 0 }), 'explorer');
    assert.equal(deriveConsumerExperienceTier({ bookingCount: 3, activityPoints: 0 }), 'insider');
    assert.equal(deriveConsumerExperienceTier({ bookingCount: 8, activityPoints: 0 }), 'vip');
    assert.equal(deriveConsumerExperienceTier({ bookingCount: 0, activityPoints: 0, hasInsiderMembership: true }), 'insider');
  });

  it('reports clear booking progression labels', () => {
    assert.equal(getConsumerTierProgress({ bookingCount: 0, activityPoints: 0 }).label, '3 more bookings to reach Insider');
    assert.equal(getConsumerTierProgress({ bookingCount: 4, activityPoints: 0 }).label, '4 more bookings to reach VIP');
    assert.equal(getConsumerTierProgress({ bookingCount: 8, activityPoints: 0 }).label, 'VIP active · highest Parker tier');
  });

  it('publishes tier-aware home cards for chef, valet, and cottage experiences', () => {
    const vipCards = getTieredHomeCards('vip');
    assert.deepEqual(vipCards.map((card) => card.id), ['hero-chef-dinner', 'premium-valet', 'cottage-massage']);
    assert.ok(vipCards.some((card) => card.tierBadge.includes('VIP')));
    assert.ok(vipCards.every((card) => card.badge === TIERED_EXPERIENCE_PROFILES.vip.patchVerifiedLabel));
  });
});
