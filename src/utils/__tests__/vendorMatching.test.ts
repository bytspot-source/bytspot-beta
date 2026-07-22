import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adaptDiscoverCardToMatchDocument,
  adaptGooglePlaceToMatchDocument,
  adaptVendorServiceToMatchDocument,
  adaptYelpBusinessToMatchDocument,
  buildVendorInvertedIndex,
  getRankedDiscoverCardsWithSimplex,
  markCuratedFallbackDiscoverCards,
  matchVendorsWithSimplex,
  PLACE_ENRICH_RPC_CONTRACT,
  rankDiscoverCardsWithSimplex,
  VENDOR_MATCH_RPC_CONTRACT,
} from '../vendorMatching.ts';

test('provider adapters normalize Google and Yelp into the same match document shape', () => {
  const google = adaptGooglePlaceToMatchDocument({
    placeId: 'places/broni',
    displayName: { text: 'Broni Home Taste' },
    formattedAddress: '123 Peachtree St, Atlanta, GA',
    types: ['restaurant', 'ghanaian_restaurant'],
    rating: 4.8,
    userRatingCount: 128,
    currentOpeningHours: { openNow: true },
    location: { latitude: 33.75, longitude: -84.39 },
    photos: [{ photoUri: 'https://example.com/broni.jpg', widthPx: 1200, heightPx: 800 }],
  });

  const yelp = adaptYelpBusinessToMatchDocument({
    id: 'ak-1',
    name: 'Akwaaba Lounge',
    url: 'https://yelp.example/ak-1',
    image_url: 'https://example.com/lounge.jpg',
    rating: 4.6,
    review_count: 72,
    price: '$$',
    is_closed: false,
    categories: [{ alias: 'nightlife', title: 'Nightlife' }],
    coordinates: { latitude: 33.76, longitude: -84.38 },
  });

  assert.equal(google.source, 'google_places');
  assert.equal(google.media[0].source, 'google_places');
  assert.equal(google.isOpen, true);
  assert.ok(google.tags.includes('ghana'));
  assert.equal(yelp.source, 'yelp_fusion');
  assert.equal(yelp.priceLevel, 2);
  assert.equal(yelp.isOpen, true);
});

test('inverted index maps intent tokens to weighted vendor documents', () => {
  const docs = [
    adaptDiscoverCardToMatchDocument({ id: 1, type: 'dining', name: 'Jollof House', image: 'food.jpg', distance: '0.5 mi', description: 'Ghanaian comfort food' }),
    adaptDiscoverCardToMatchDocument({ id: 2, type: 'parking', name: 'Secure Garage', image: 'garage.jpg', distance: '0.2 mi', description: 'Reserved parking' }),
  ];
  const index = buildVendorInvertedIndex(docs);

  assert.equal(index.postings.get('jollof')?.has(docs[0].id), true);
  assert.equal(index.postings.get('parking')?.has(docs[1].id), true);
  assert.equal(index.postings.get('jollof')?.has(docs[1].id), false);
});

test('Simplex matcher ranks vendor/user cultural matches before generic nearby results', () => {
  const vendor = adaptVendorServiceToMatchDocument({
    id: 'svc-broni',
    title: 'Broni Home Taste Menu',
    description: 'Ghanaian jollof, banku, tilapia, pickup or delivery',
    priceCents: 1500,
    currency: 'USD',
    durationMins: 30,
    vendor: { id: 'vendor-broni', displayName: 'Broni Home Taste', onboardingStatus: 'active' },
    patch: { id: 'patch-broni', uid: '04A1', label: 'Kitchen verified' },
    category: 'Dining',
    rating: 4.9,
    bookingCount: 93,
    availability: 'Available now',
  }, { distanceMeters: 1400, verified: true });

  const parking = adaptDiscoverCardToMatchDocument({
    id: 7,
    type: 'parking',
    name: 'Closest Garage',
    image: 'garage.jpg',
    distance: '0.1 mi',
    description: 'Reserved covered parking',
    rating: 4.9,
    verified: true,
  });

  const ranked = matchVendorsWithSimplex({
    query: 'ghanaian jollof dinner',
    preferences: { cuisineAffinities: ['ghanaian', 'jollof'], vibePreferences: { selectedVibes: ['afrobeats'] } },
    culturalContext: { country: 'Ghana', region: 'West Africa', inferredCuisinePreferences: ['jollof'], inferredVibePreferences: ['afrobeats'] },
    documents: [parking, vendor],
    limit: 2,
  });

  assert.equal(ranked[0].document.id, vendor.id);
  assert.equal(ranked[0].document.source, 'bytspot_vendor');
  assert.equal(ranked[0].document.vendorServiceId, 'svc-broni');
  assert.equal(ranked[0].document.vendorId, 'vendor-broni');
  assert.ok(ranked[0].matchedTokens.includes('jollof'));
  assert.ok(ranked[0].simplex.lambdaSim > ranked[1].simplex.lambdaSim);
  assert.equal(VENDOR_MATCH_RPC_CONTRACT.route, 'vendors.match');
  assert.equal(PLACE_ENRICH_RPC_CONTRACT.route, 'places.enrich');
});

test('Discover card adapter preserves source-specific attribution and provider identity', () => {
  const curated = adaptDiscoverCardToMatchDocument({
    id: 42,
    type: 'service',
    name: 'Curated Chef Pick',
    image: 'chef.jpg',
    distance: 'Nearby',
    description: 'Internal fallback dinner service',
    serviceCategory: 'Private Chef',
    features: ['Chef table', 'Fallback fixture'],
    curatedFallback: true,
  });
  const generic = adaptDiscoverCardToMatchDocument({ id: 43, type: 'coffee', name: 'Generic Cafe', image: 'coffee.jpg', distance: '0.3 mi' });
  const vendor = adaptDiscoverCardToMatchDocument({
    id: 44,
    type: 'service',
    name: 'Live Vendor Card',
    image: 'service.jpg',
    distance: '1 mi',
    vendorServiceId: 'svc-live',
    vendorId: 'vendor-live',
    serviceCategory: 'Dining',
  });

  assert.equal(curated.source, 'bytspot_curated');
  assert.equal(curated.attribution?.label, 'Bytspot curated');
  assert.ok(curated.tags.includes('curated'));
  assert.equal(generic.source, 'bytspot_discover');
  assert.equal(vendor.source, 'bytspot_vendor');
  assert.equal(vendor.vendorServiceId, 'svc-live');
  assert.equal(vendor.vendorId, 'vendor-live');
  assert.ok(vendor.tags.includes('live'));
});

test('Home fallback fixture cards are explicitly marked as curated before ranking', () => {
  const [homeFallback] = markCuratedFallbackDiscoverCards([{
    id: 61_001,
    type: 'coffee',
    name: 'Morning Coffee Walk',
    image: 'coffee.jpg',
    distance: '0.4 mi',
    description: 'Low-key cafés and brunch spots within a quick walk.',
    location: 'Near you',
    features: ['Coffee', 'Brunch', 'Quick walk'],
  }]);
  const document = adaptDiscoverCardToMatchDocument(homeFallback);

  assert.equal(homeFallback.curatedFallback, true);
  assert.equal(homeFallback.discoverSource, 'bytspot_curated');
  assert.equal(document.source, 'bytspot_curated');
  assert.equal(document.attribution?.label, 'Bytspot curated');
});

test('rankDiscoverCardsWithSimplex powers Discover ordering from onboarding tokens', () => {
  const cards = [
    { id: 1, type: 'parking', name: 'Closest Garage', image: 'garage.jpg', distance: '0.1 mi', description: 'Covered parking', rating: 4.9, verified: true },
    { id: 2, type: 'dining', name: 'Broni Home Taste', image: 'food.jpg', distance: '1.0 mi', description: 'Ghanaian jollof comfort food', rating: 4.8, verified: true },
  ] as const;

  const ranked = rankDiscoverCardsWithSimplex([...cards], {
    query: 'food ghanaian jollof date night',
    preferences: { cuisineAffinities: ['ghanaian'], vibePreferences: { selectedVibes: ['food'] } },
  });

  assert.equal(ranked[0].name, 'Broni Home Taste');
});

test('getRankedDiscoverCardsWithSimplex returns score details for Home Tailored Pick explainability', () => {
  const ranked = getRankedDiscoverCardsWithSimplex([
    { id: 1, type: 'coffee', name: 'Quiet Cafe', image: 'coffee.jpg', distance: '0.3 mi', description: 'coffee work friendly', rating: 4.5 },
  ], { query: 'coffee work' });

  assert.equal(ranked[0].card.name, 'Quiet Cafe');
  assert.ok(ranked[0].result.score > 0);
  assert.ok(ranked[0].result.matchedTokens.includes('coffee'));
});
