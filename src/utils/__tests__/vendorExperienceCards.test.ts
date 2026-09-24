import test from 'node:test';
import assert from 'node:assert/strict';
import { getRankedDiscoverCardsWithSimplex } from '../vendorMatching.ts';
import { curatedServiceRecommendationCards, savedServiceRequestToCard, vendorInventoryToCard, vendorServiceToCard } from '../vendorExperienceCards.ts';
import { discoverCardCapability, discoverCardControl } from '../mockData/discover.ts';
import { controlFromCapability } from '../bookableProjection.ts';
import { askErrorMessage, askIsLive, askProblems, askTransport, type AskClient } from '../guestAsk.ts';

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

test('discoverCardControl is a pure derivation of discoverCardCapability', () => {
  // A fully-wired vendor card is book → vendor; a Google place is details → local.
  const vendor = { id: 1, type: 'service', name: 'V', image: 'x.jpg', distance: '1 mi', vendorId: 'vendor-1', vendorServiceId: 'svc-1', patchId: 'patch-1', discoverSource: 'bytspot_vendor' } as never;
  const local = { id: 2, type: 'dining', name: 'Local Diner', image: 'x.jpg', distance: '0.3 mi', placeId: 'gp-1' } as never;
  assert.equal(discoverCardCapability(vendor), 'book');
  assert.equal(discoverCardCapability(local), 'details');
  for (const card of [vendor, local]) {
    assert.equal(discoverCardControl(card), controlFromCapability(discoverCardCapability(card)));
  }
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

test('saved virtual-patch requests only earn vendor control when live-vendor backed', () => {
  const base = {
    id: 'req-1',
    kind: 'service' as const,
    vendorName: 'Scanner Vendor',
    serviceName: 'Table Service',
    actionLabel: 'Request',
    status: 'requested' as const,
    requestedAt: new Date().toISOString(),
  };

  // Fallback scanner request with a synthetic vendorId must stay local.
  const fallback = savedServiceRequestToCard({ ...base, vendorId: 'fallback-vendor-1', source: 'fallback' } as never, 0);
  assert.equal(fallback.control, 'local');
  assert.equal(discoverCardControl(fallback), 'local');
  assert.equal(fallback.vendorServiceId, undefined);

  // Venue-scoped request (vendorId = venueId) must stay local.
  const venueScoped = savedServiceRequestToCard({ ...base, id: 'req-2', vendorId: 'venue-77', source: 'venue' } as never, 1);
  assert.equal(venueScoped.control, 'local');
  assert.equal(discoverCardControl(venueScoped), 'local');

  // Live registry request with real vendor + service ids earns vendor control.
  const live = savedServiceRequestToCard({ ...base, id: 'req-3', vendorId: 'vendor-1', serviceId: 'svc-9', source: 'live' } as never, 2);
  assert.equal(live.control, 'vendor');
  assert.equal(live.vendorServiceId, 'svc-9');
});

test('Broni sample identity does not promote curated content to booking or ordering authority', () => {
  const sample = { ...curatedServiceRecommendationCards[0], name: 'Broni Home Taste Restaurant', type: 'dining' as const };
  assert.equal(discoverCardCapability(sample), 'details');
  assert.equal(discoverCardControl(sample), 'local');
});

test('Broni sample requests retain informational status without acquiring a live service identity', () => {
  const card = savedServiceRequestToCard({
    id: 'broni-preview-request', kind: 'vendor-request', vendorName: 'Broni Home Taste Restaurant',
    serviceName: 'Dining request', actionLabel: 'Request', status: 'requested',
    requestedAt: '2026-09-14T00:00:00Z', source: 'fallback',
  }, 0);
  assert.equal(card.vendorId, undefined);
  assert.equal(card.vendorServiceId, undefined);
  assert.equal(card.availability, 'Service requested');
  assert.equal(discoverCardCapability(card), 'details');
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

const inventoryItem = {
  windowId: 'win_1',
  sellerId: 'seller_1',
  sellerName: 'Peach Table Co',
  skuTemplateId: 'dining.table',
  title: 'Chef counter for two',
  domain: 'dining',
  category: 'Dining',
  discoverType: 'dining',
  priceCents: 4500,
  maxGuests: 2,
  durationMins: 90,
  intent: 'request',
  place: { label: 'Midtown', address: '1 Peachtree St NE', lat: 33.78, lng: -84.38 },
  distanceMiles: 1.24,
  coverUrl: 'https://api.test/media/vendor/cov_1',
  galleryUrls: ['https://api.test/media/vendor/gal_1'],
  nextSlot: { startsAt: '2026-09-24T23:00:00.000Z', remaining: 3 },
};

test('vendorInventoryToCard pictures a published window with the seller\'s own cover', () => {
  const card = vendorInventoryToCard(inventoryItem, 0, new Date('2026-09-23T12:00:00Z'));
  assert.ok(card);
  assert.equal(card.image, inventoryItem.coverUrl);
  assert.deepEqual(card.photoUrls, [inventoryItem.coverUrl, 'https://api.test/media/vendor/gal_1']);
  assert.equal(card.type, 'dining');
  assert.equal(card.name, 'Chef counter for two');
  assert.equal(card.price, '$45.00');
  assert.equal(card.distance, '1.2 mi');
  assert.equal(card.availableSpots, 3);
  assert.match(card.availability ?? '', /^Next: /);
  assert.equal(card.vendorId, 'seller_1');
  assert.equal(card.discoverSource, 'bytspot_vendor');
});

test('vendorInventoryToCard falls back to the seller\'s gallery, never to a stock photo', () => {
  const galleryOnly = vendorInventoryToCard({ ...inventoryItem, coverUrl: null }, 0);
  assert.equal(galleryOnly?.image, 'https://api.test/media/vendor/gal_1');
  assert.equal(vendorInventoryToCard({ ...inventoryItem, coverUrl: null, galleryUrls: [] }, 0), null);
});

test('a window card takes asks, so it never enters the checkout path', () => {
  const card = vendorInventoryToCard(inventoryItem, 0);
  assert.ok(card);
  assert.equal(card.vendorServiceId, undefined);
  assert.equal(discoverCardCapability(card), 'details');
  assert.equal(discoverCardControl(card), 'local');
});

test('an unknown discover type lands as a venue rather than an invalid card type', () => {
  assert.equal(vendorInventoryToCard({ ...inventoryItem, discoverType: 'spaceport' }, 0)?.type, 'venue');
});

test('a window card carries the place\'s phone, website and what it can be asked for', () => {
  const card = vendorInventoryToCard(
    {
      ...inventoryItem,
      place: { ...inventoryItem.place, phone: '+14045550123', website: 'https://peachtable.com/' },
      upcomingSlots: [inventoryItem.nextSlot, { startsAt: '2026-09-24T23:30:00.000Z', remaining: 1 }],
    },
    0,
  );
  assert.equal(card?.phoneNumber, '+14045550123');
  assert.equal(card?.website, 'https://peachtable.com/');
  assert.deepEqual(card?.ask, {
    windowId: 'win_1',
    sellerName: 'Peach Table Co',
    maxGuests: 2,
    slots: [inventoryItem.nextSlot, { startsAt: '2026-09-24T23:30:00.000Z', remaining: 1 }],
  });
});

test('a window card without contact details has none, and a non-web link is dropped', () => {
  const card = vendorInventoryToCard({ ...inventoryItem, place: { ...inventoryItem.place, website: 'javascript:alert(1)' } }, 0);
  assert.equal(card?.phoneNumber, undefined);
  assert.equal(card?.website, undefined);
  // Older API responses without upcomingSlots still offer the next one.
  assert.deepEqual(card?.ask?.slots, [inventoryItem.nextSlot]);
  // A window that does not take asks gets no Ask.
  assert.equal(vendorInventoryToCard({ ...inventoryItem, intent: 'none' }, 0)?.ask, undefined);
});

const ask = { windowId: 'win_1', sellerName: 'Peach Table Co', maxGuests: 4, slots: [{ startsAt: '2026-09-24T23:00:00.000Z', remaining: 2 }] };

test('an ask is checked against the card before it is sent', () => {
  const at = ask.slots[0].startsAt;
  assert.deepEqual(askProblems(ask, { partySize: 2, startsAt: at }), []);
  assert.deepEqual(askProblems(ask, { partySize: 5, startsAt: at }), ['This takes up to 4 guests', 'Not enough room at that time']);
  assert.deepEqual(askProblems(ask, { partySize: 3, startsAt: at }), ['Not enough room at that time']);
  assert.deepEqual(askProblems(ask, { partySize: 2, startsAt: '2026-09-25T00:00:00.000Z' }), ['Pick a time']);
  assert.deepEqual(askProblems(ask, { partySize: 0, startsAt: at }), ['How many are coming?']);
});

test('a signed-out guest is told to sign in, not shown a raw error', () => {
  assert.equal(askErrorMessage({ data: { code: 'UNAUTHORIZED' }, message: 'Not authenticated' }), 'Sign in to send a request');
  assert.equal(askErrorMessage({ data: { code: 'CONFLICT' }, message: 'You have already asked here.' }), 'You have already asked here.');
  assert.equal(askErrorMessage(undefined), 'That did not send. Try again');
  assert.equal(askErrorMessage(new TypeError('Failed to fetch')), 'You look offline. Try again');
});

test('the ask transport sends the window, reads back its own request, and accepts', async () => {
  const calls: string[] = [];
  const client: AskClient = {
    demand: {
      ask: { mutate: async (input) => { calls.push(`ask:${JSON.stringify(input)}`); return { id: 'dem_1', state: 'OPEN', expiresAt: 'x' }; } },
      mine: { query: async () => [
        { id: 'dem_0', state: 'OPEN', expiresAt: 'x', offers: [] },
        { id: 'dem_1', state: 'OFFERED', expiresAt: 'x', offers: [] },
      ] },
      acceptOffer: { mutate: async (input) => { calls.push(`accept:${input.offerId}`); return {}; } },
      payOffer: { mutate: async (input) => { calls.push(`pay:${input.offerId}`); return { url: 'https://checkout.stripe.test/s' }; } },
      withdraw: { mutate: async (input) => { calls.push(`withdraw:${input.demandId}`); return {}; } },
    },
  };
  const transport = askTransport(client);
  await transport.send(ask, { partySize: 2, startsAt: ask.slots[0].startsAt, note: '  ' });
  assert.equal(calls[0], `ask:${JSON.stringify({ windowId: 'win_1', partySize: 2, startsAt: ask.slots[0].startsAt })}`);
  const status = await transport.read('dem_1');
  assert.equal(status?.state, 'OFFERED');
  assert.ok(askIsLive(status));
  assert.equal(await transport.read('dem_gone'), undefined);
  assert.ok(!askIsLive({ id: 'd', state: 'EXPIRED', expiresAt: 'x', offers: [] }));
  await transport.accept('off_1');
  assert.equal(calls[1], 'accept:off_1');
  assert.equal(await transport.pay('off_2'), 'https://checkout.stripe.test/s');
  assert.equal(calls[2], 'pay:off_2');
});

test('reopening a card resumes its live ask, and the list says where each one stands', async () => {
  const { liveAskFor, askStateLabel } = await import('../guestAsk.ts');
  const offer = { id: 'o', where: 'Peach Table', startsAt: 'x', durationMins: 60, priceCents: 0, holdExpiresAt: 'x', accepted: false };
  const rows = [
    { id: 'd0', state: 'EXPIRED', expiresAt: 'x', offers: [], targetWindowId: 'win_1' },
    { id: 'd1', state: 'OFFERED', expiresAt: 'x', offers: [offer], targetWindowId: 'win_1' },
    { id: 'd2', state: 'OPEN', expiresAt: 'x', offers: [], targetWindowId: 'win_2' },
    { id: 'd3', state: 'BOOKED', expiresAt: 'x', offers: [{ ...offer, accepted: true }], targetWindowId: 'win_3' },
  ];
  assert.equal(liveAskFor(rows, 'win_1')?.id, 'd1');
  assert.equal(liveAskFor(rows, 'win_3'), undefined);
  assert.equal(askStateLabel(rows[1]), '1 offer to answer');
  assert.equal(askStateLabel(rows[2]), 'Waiting for an answer');
  assert.equal(askStateLabel(rows[3]), 'Booked');
  assert.equal(askStateLabel(rows[0]), 'Closed');
});

test('each offer waiting on the guest is announced once', async () => {
  const { unseenOffers } = await import('../guestAsk.ts');
  const offer = (id: string, accepted = false) => ({ id, where: 'Peach Table', startsAt: 'x', durationMins: 60, priceCents: 0, holdExpiresAt: 'x', accepted });
  const rows = [
    { id: 'd1', state: 'OFFERED', expiresAt: 'x', offers: [offer('o1'), offer('o2')] },
    { id: 'd2', state: 'BOOKED', expiresAt: 'x', offers: [offer('o3', true)] },
    { id: 'd3', state: 'EXPIRED', expiresAt: 'x', offers: [offer('o4')] },
  ];
  assert.deepEqual(unseenOffers(rows, new Set(['o1'])).map(({ offer }) => offer.id), ['o2']);
  assert.deepEqual(unseenOffers(rows, new Set(['o1', 'o2'])), []);
});

test('an offer paid in the app is paid for, not accepted, and says where the payment stands', async () => {
  const { offerAction, askStateLabel } = await import('../guestAsk.ts');
  const base = { id: 'o', where: 'Peach Table', startsAt: 'x', durationMins: 60, priceCents: 4500, holdExpiresAt: 'x', accepted: false };
  // An older API sends no payAt; that is paying at the venue.
  assert.deepEqual(offerAction(base), { kind: 'accept', label: 'Accept' });
  assert.deepEqual(offerAction({ ...base, payAt: 'venue' as const }), { kind: 'accept', label: 'Accept' });
  assert.deepEqual(offerAction({ ...base, payAt: 'bytspot' as const }), { kind: 'pay', label: 'Pay $45.00' });
  const paying = { ...base, payAt: 'bytspot' as const, payment: { state: 'paying' as const } };
  assert.deepEqual(offerAction(paying), { kind: 'pay', label: 'Finish paying' });
  assert.equal(offerAction({ ...base, accepted: true }).kind, 'none');
  assert.equal(askStateLabel({ id: 'd', state: 'OFFERED', expiresAt: 'x', offers: [paying] }), 'Confirming payment');
});

test('the return from Stripe is recognised only for an offer checkout', async () => {
  const { offerCheckoutReturn } = await import('../guestAsk.ts');
  assert.deepEqual(offerCheckoutReturn('?demand=d1&checkout=offer-paid&session_id=cs_1'), { outcome: 'paid', demandId: 'd1' });
  assert.deepEqual(offerCheckoutReturn('?demand=d1&checkout=offer-cancelled'), { outcome: 'cancelled', demandId: 'd1' });
  assert.equal(offerCheckoutReturn('?setup=success'), undefined);
  assert.equal(offerCheckoutReturn(''), undefined);
});
