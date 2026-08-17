import test from 'node:test';
import assert from 'node:assert/strict';
import { getRankedDiscoverCardsWithSimplex } from '../vendorMatching.ts';
import { curatedServiceRecommendationCards, vendorServiceToCard } from '../vendorServiceCards.ts';
import { discoverCardControl } from '../mockData/discover.ts';

test('vendorServiceToCard maps patch-verified services into paid discover cards', () => {
  const card = vendorServiceToCard({
    id: 'svc-1',
    title: 'VIP Arrival',
    description: 'Door-to-table escort',
    priceCents: 15000,
    currency: 'USD',
    durationMins: 90,
    vendor: { id: 'vendor-1', displayName: 'Midtown Hosts', onboardingStatus: 'active' },
    patch: { id: 'patch-1', uid: '04A1B2C3D4E5F6', label: 'VIP Booth' },
    cashFlow: { platformFeeCents: 1200, providerPayoutEstimateCents: 13800, commissionBps: 800 },
  }, 0, { patchVerified: true, distanceMeters: 96 });

  assert.equal(card.type, 'service');
  assert.equal(card.entryType, 'paid');
  assert.equal(card.entryPrice, '$150.00');
  assert.equal(card.vendorServiceStatus, 'active');
  assert.equal(card.vendorServiceId, 'svc-1');
  assert.equal(card.vendorId, 'vendor-1');
  assert.equal(card.discoverSource, 'bytspot_vendor');
  assert.equal(card.matchDocument?.source, 'bytspot_vendor');
  assert.equal(card.matchDocument?.vendorServiceId, 'svc-1');
  assert.equal(card.matchDocument?.vendorId, 'vendor-1');
  assert.ok(card.matchDocument?.categories.includes('VIP Booth'));
  assert.ok(card.matchDocument?.tags.includes('midtown'));
  assert.equal(card.matchDocument?.media[0]?.source, 'bytspot_vendor');
  assert.equal(card.patchId, 'patch-1');
  assert.equal(card.verified, true);
  assert.ok(card.features?.includes('Patch-verified'));
  assert.ok(card.features?.includes('Connect-ready provider'));
  assert.equal(card.platformFeeCents, 1200);
  assert.equal(card.control, 'vendor');
  assert.equal(discoverCardControl(card), 'vendor');
});

test('discoverCardControl keeps curated fixtures and local places out of vendor mode', () => {
  for (const curated of curatedServiceRecommendationCards) {
    assert.equal(curated.control, 'local');
    assert.equal(discoverCardControl(curated), 'local', `${curated.name} must not earn Book chrome`);
  }
  // Google place shape: no vendor fields at all.
  assert.equal(discoverCardControl({ id: 20_001, type: 'dining', name: 'Local Diner', image: 'x.jpg', distance: '0.3 mi', placeId: 'gp-1' } as never), 'local');
  // vendorId without a service or patch is still local.
  assert.equal(discoverCardControl({ id: 9, type: 'service', name: 'Half-wired vendor', image: 'x.jpg', distance: '1 mi', vendorId: 'vendor-9', discoverSource: 'bytspot_vendor' } as never), 'local');
});

test('Simplex ranking consumes attached live vendor match documents without generic card flattening', () => {
  const vendorCard = vendorServiceToCard({
    id: 'svc-vip-booth',
    title: 'VIP Booth Arrival',
    description: 'Host escort and reserved lounge access',
    priceCents: 12000,
    currency: 'USD',
    durationMins: 60,
    vendor: { id: 'vendor-midtown-hosts', displayName: 'Midtown Hosts', onboardingStatus: 'active' },
    patch: { id: 'patch-vip', uid: '04VIP', label: 'VIP Booth' },
    category: 'Nightlife',
    availability: 'Available tonight',
    rating: 4.9,
    bookingCount: 44,
  }, 0, { patchVerified: true, distanceMeters: 600 });
  const genericCard = { id: 7, type: 'parking', name: 'Closest Garage', image: 'garage.jpg', distance: '0.1 mi', description: 'covered parking' } as const;

  const [top] = getRankedDiscoverCardsWithSimplex([genericCard, vendorCard], { query: 'midtown hosts vip booth nightlife' });

  assert.equal(top.card, vendorCard);
  assert.equal(top.result.document.source, 'bytspot_vendor');
  assert.equal(top.result.document.vendorId, 'vendor-midtown-hosts');
  assert.ok(top.result.matchedTokens.includes('booth'));
});
