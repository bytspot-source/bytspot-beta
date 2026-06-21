import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveConsumerExperienceTier, getConsumerTierProgress, getTieredHomeCards, isServiceDiscoveryHomeCard, TIERED_EXPERIENCE_PROFILES } from '../../features/tieredExperience.ts';

describe('tiered Parker experience', () => {
  it('derives consumer benefit levels from bookings and activity', () => {
    assert.equal(deriveConsumerExperienceTier({ bookingCount: 0, activityPoints: 0 }), 'explorer');
    assert.equal(deriveConsumerExperienceTier({ bookingCount: 3, activityPoints: 0 }), 'insider');
    assert.equal(deriveConsumerExperienceTier({ bookingCount: 8, activityPoints: 0 }), 'vip');
    assert.equal(deriveConsumerExperienceTier({ bookingCount: 0, activityPoints: 0, hasInsiderMembership: true }), 'insider');
  });

  it('reports clear booking progression labels', () => {
    assert.equal(getConsumerTierProgress({ bookingCount: 0, activityPoints: 0 }).label, '3 more bookings to unlock the next perk');
    assert.equal(getConsumerTierProgress({ bookingCount: 4, activityPoints: 0 }).label, '4 more bookings to unlock the next perk');
    assert.equal(getConsumerTierProgress({ bookingCount: 8, activityPoints: 0 }).label, 'Parker progress active');
  });

  it('publishes consumer-safe home cards for chef, valet, and cottage experiences', () => {
    const vipCards = getTieredHomeCards('vip');
    assert.deepEqual(vipCards.map((card) => card.id), ['hero-chef-dinner', 'premium-valet', 'cottage-massage']);
    assert.ok(vipCards.every((card) => !/tier|explorer|insider|vip/i.test(`${card.title} ${card.priceLine} ${card.tierBadge} ${card.cardStyleLabel}`)));
    assert.ok(vipCards.every((card) => card.badge === TIERED_EXPERIENCE_PROFILES.vip.patchVerifiedLabel));
    assert.equal(vipCards.find((card) => card.id === 'cottage-massage')?.title, 'Cottage Industry Services');
  });

  it('routes home service cards to vendor service discovery', () => {
    assert.equal(isServiceDiscoveryHomeCard('hero-chef-dinner'), true);
    assert.equal(isServiceDiscoveryHomeCard('cottage-massage'), true);
    assert.equal(isServiceDiscoveryHomeCard('premium-valet'), false);
  });
});
