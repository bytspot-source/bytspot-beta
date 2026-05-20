import { expect, type Page, test } from '@playwright/test';

const TEST_COORDS = { lat: 33.789, lng: -84.384 };
const VENDOR_SERVICES = [
  {
    id: 'chef-maria',
    title: '5-Course Italian Dinner at Home',
    description: 'Midtown • Tonight 7:30 PM',
    subtitle: 'Midtown • Tonight 7:30 PM',
    category: 'Private Chef',
    priceCents: 28500,
    currency: 'USD',
    durationMins: 150,
    rating: 4.98,
    bookingCount: 87,
    availableSpots: 4,
    availability: '4 spots left',
    ctaText: 'Book for Tonight →',
    vendor: { id: 'vendor-chef-maria', displayName: 'Chef Maria’s Table', onboardingStatus: 'active' },
    patch: { id: 'patch-chef-maria', uid: '04A1B2C3D4E5F6', label: 'Chef Table' },
    cashFlow: { platformFeeCents: 2280, providerPayoutEstimateCents: 26220, commissionBps: 800 },
  },
  {
    id: 'vip-valet',
    title: 'VIP Door-to-Door Valet',
    description: 'Mercedes S-Class • Professional Chauffeur',
    subtitle: 'Mercedes S-Class • Professional Chauffeur',
    category: 'Premium Valet',
    priceCents: 9500,
    currency: 'USD',
    durationMins: 30,
    rating: 4.9,
    bookingCount: 64,
    etaMinutes: 9,
    availability: 'Arrives in 9 min',
    ctaText: 'Request Valet Now →',
    vendor: { id: 'vendor-black-car-valet', displayName: 'Atlanta Black Car Valet', onboardingStatus: 'active' },
    patch: { id: 'patch-vip-valet', uid: '04F1E2D3C4B5A6', label: 'Valet Desk' },
    cashFlow: { platformFeeCents: 760, providerPayoutEstimateCents: 8740, commissionBps: 800 },
  },
  {
    id: 'zen-massage',
    title: 'Deep Tissue Massage at Your Place',
    description: '60 or 90 minutes • Therapist comes to you',
    subtitle: '60 or 90 minutes • Therapist comes to you',
    category: 'In-Home Massage',
    priceCents: 13500,
    currency: 'USD',
    durationMins: 90,
    rating: 4.95,
    bookingCount: 52,
    etaMinutes: 45,
    availability: 'Next available: 45 min',
    ctaText: 'Book Massage →',
    vendor: { id: 'vendor-zen-haven', displayName: 'Zen Haven Mobile Spa', onboardingStatus: 'active' },
    patch: null,
    cashFlow: { platformFeeCents: 1080, providerPayoutEstimateCents: 12420, commissionBps: 800 },
  },
  {
    id: 'smart-parking', title: 'Reserved Parking Spot + Valet Option', description: '2 blocks from Fox Theatre', subtitle: '2 blocks from Fox Theatre', category: 'Smart Parking', priceCents: 2200, currency: 'USD', durationMins: 360, rating: 4.7, bookingCount: 118, availableSpots: 11, availability: '11 spots left', ctaText: 'Reserve Spot →', vendor: { id: 'vendor-midtown-secure', displayName: 'Midtown Secure Parking', onboardingStatus: 'active' }, patch: null, cashFlow: { platformFeeCents: 176, providerPayoutEstimateCents: 2024, commissionBps: 800 },
  },
  {
    id: 'private-bartender', title: 'Private Cocktail Party Service', description: 'Your home or rooftop • Full setup', subtitle: 'Your home or rooftop • Full setup', category: 'Private Bartender', priceCents: 18000, currency: 'USD', durationMins: 60, rating: 4.97, bookingCount: 43, availableSpots: 3, availability: '3 bartenders available', ctaText: 'Book Bartender →', vendor: { id: 'vendor-craft-pour', displayName: 'Craft & Pour Mobile Bar', onboardingStatus: 'active' }, patch: null, cashFlow: { platformFeeCents: 1440, providerPayoutEstimateCents: 16560, commissionBps: 800 },
  },
  {
    id: 'luxury-transport', title: 'Airport Transfer or Night Out Ride', description: 'Black SUV • Professional Driver', subtitle: 'Black SUV • Professional Driver', category: 'Luxury Transportation', priceCents: 7500, currency: 'USD', durationMins: 45, rating: 4.92, bookingCount: 76, etaMinutes: 18, availability: 'Next available: 18 min', ctaText: 'Book Ride →', vendor: { id: 'vendor-executive-ride', displayName: 'Executive Ride Atlanta', onboardingStatus: 'active' }, patch: null, cashFlow: { platformFeeCents: 600, providerPayoutEstimateCents: 6900, commissionBps: 800 },
  },
  {
    id: 'event-photography', title: 'Private Event & Portrait Photography', description: 'Birthdays, proposals, dinners', subtitle: 'Birthdays, proposals, dinners', category: 'Event Photography', priceCents: 25000, currency: 'USD', durationMins: 120, rating: 5, bookingCount: 39, availability: 'Starting at $250', ctaText: 'Book Photographer →', vendor: { id: 'vendor-moments-elena', displayName: 'Moments by Elena', onboardingStatus: 'active' }, patch: null, cashFlow: { platformFeeCents: 2000, providerPayoutEstimateCents: 23000, commissionBps: 800 },
  },
  {
    id: 'wellness-recovery', title: 'Mobile IV Hydration + Recovery', description: 'At home or hotel • 45 min session', subtitle: 'At home or hotel • 45 min session', category: 'Wellness & Recovery', priceCents: 17900, currency: 'USD', durationMins: 45, rating: 4.96, bookingCount: 58, availability: 'Next slot: Today 6 PM', ctaText: 'Book Recovery Session →', vendor: { id: 'vendor-restore-iv', displayName: 'Restore IV & Recovery', onboardingStatus: 'active' }, patch: null, cashFlow: { platformFeeCents: 1432, providerPayoutEstimateCents: 16468, commissionBps: 800 },
  },
];

const LIVE_VENUES = [
  {
    id: 'venue-standard-garage',
    name: 'Standard API Garage',
    slug: 'standard-api-garage',
    address: '100 Live API Way NE',
    category: 'parking',
    lat: 33.7901,
    lng: -84.3852,
    imageUrl: '',
    entryType: 'free',
    entryPrice: null,
    ticketUrl: null,
    crowd: { level: 3, label: 'Busy', updatedAt: new Date().toISOString(), waitMins: 8 },
    parking: { totalAvailable: 18, spots: [{ name: 'Main Deck', type: 'garage', available: 18, total: 40, pricePerHr: 7 }] },
  },
  {
    id: 'venue-standard-lounge',
    name: 'Standard API Lounge',
    slug: 'standard-api-lounge',
    address: '200 Live API Ave NE',
    category: 'nightlife',
    lat: 33.791,
    lng: -84.386,
    imageUrl: '',
    entryType: 'paid',
    entryPrice: '$20',
    ticketUrl: null,
    crowd: { level: 2, label: 'Active', updatedAt: new Date().toISOString(), waitMins: 4 },
    parking: { totalAvailable: 0, spots: [] },
  },
];

test.use({ geolocation: { latitude: TEST_COORDS.lat, longitude: TEST_COORDS.lng }, permissions: ['geolocation'] });

async function installVendorServiceMocks(page: Page, opts: { failVenues?: boolean } = {}) {
  await page.addInitScript(({ services, venues, failVenues }) => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    if ('serviceWorker' in navigator) {
      try {
        Object.defineProperty(navigator, 'serviceWorker', {
          configurable: true,
          value: { register: () => Promise.reject(new Error('disabled-in-test')), getRegistration: () => Promise.resolve(undefined), getRegistrations: () => Promise.resolve([]), addEventListener: () => undefined, removeEventListener: () => undefined, ready: new Promise(() => undefined) },
        });
      } catch { /* ignore */ }
    }
    const mockPosition = { coords: { latitude: 33.789, longitude: -84.384, accuracy: 12 }, timestamp: Date.now() };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (s: (p: typeof mockPosition) => void) => window.setTimeout(() => s(mockPosition), 20), watchPosition: (s: (p: typeof mockPosition) => void) => { window.setTimeout(() => s(mockPosition), 20); return 1; }, clearWatch: () => undefined },
    });
    class MockEventSource { close() {} addEventListener() {} removeEventListener() {} }
    // @ts-expect-error test-only shim
    window.EventSource = MockEventSource;

    const readJsonBody = (body: BodyInit | null | undefined): unknown => {
      if (typeof body !== 'string') return null;
      try { return JSON.parse(body); } catch { return body; }
    };
    const firstJsonInput = (body: unknown): unknown => {
      if (!body || typeof body !== 'object') return body;
      const record = body as Record<string, any>;
      if ('json' in record) return record.json;
      if (Array.isArray(body)) return firstJsonInput(body[0]);
      const firstValue = record[Object.keys(record)[0]];
      return firstValue && typeof firstValue === 'object' && 'json' in firstValue ? firstValue.json : body;
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('nominatim.openstreetmap.org/reverse')) return new Response(JSON.stringify({ address: { city: 'Atlanta' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);
      const match = url.match(/\/trpc\/([^?]+)/);
      const procedures = match ? match[1].split(',') : ['unknown'];
      const body = readJsonBody(init?.body);
      const results = procedures.map((procedure) => {
        if (procedure.includes('venues.list')) {
          return failVenues
            ? { error: { message: 'venue-api-down', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } } }
            : { result: { data: { venues } } };
        }
        if (procedure.includes('vendors.search')) return { result: { data: { services, count: services.length } } };
        if (procedure.includes('vendors.getByPatch')) return { result: { data: { service: services[0] } } };
        if (procedure.includes('booking.createCheckout')) {
          const jsonInput = firstJsonInput(body) as Record<string, unknown> | null;
          // @ts-expect-error Playwright exposed binding
          window.__recordBookingPayload?.(jsonInput);
          return { result: { data: { url: 'https://checkout.stripe.com/c/pay/cs_test_vendor_service', booking: { id: 'booking-1' } } } };
        }
        if (procedure.includes('auth.signup') || procedure.includes('auth.login')) return { result: { data: { token: 'test-user-token', user: { id: 'user-1', email: 'booker@test.com', name: 'Test Booker' } } } };
        if (procedure.includes('auth.me')) return { result: { data: { referralCount: 0 } } };
        if (procedure.includes('subscription.status')) return { result: { data: { isPremium: false, isVendorPremium: false, isValetPremium: false } } };
        if (procedure.includes('providers.getStatus')) return { result: { data: { host: null } } };
        if (procedure.includes('patch.revocations.list')) return { result: { data: { revokedIds: [], fetchedAt: new Date().toISOString() } } };
        return { result: { data: null } };
      });
      return new Response(JSON.stringify(procedures.length === 1 ? results[0] : results), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  }, { services: VENDOR_SERVICES, venues: LIVE_VENUES, failVenues: Boolean(opts.failVenues) });
}

async function enterMainApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_auth_token', 'guest_session');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'guest', name: 'Guest' }));
    localStorage.setItem('bytspot_user_name', 'Guest');
    localStorage.removeItem('bytspot_virtual_patch_context');
  });
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
}

async function enterAuthenticatedMainApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_auth_token', 'test-user-token');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'user-1', email: 'booker@test.com', name: 'Test Booker' }));
    localStorage.setItem('bytspot_user_name', 'Test Booker');
    localStorage.removeItem('bytspot_virtual_patch_context');
  });
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
}

async function clickHomeRecommendedServiceCta(page: Page, serviceTitle = '5-Course Italian Dinner at Home') {
  const homeRail = page.getByTestId('home-recommended-nearby-rail');
  await expect(homeRail).toBeVisible({ timeout: 15_000 });
  await homeRail.getByTestId('home-recommended-nearby-card').filter({ hasText: serviceTitle }).click({ force: true });
  await expect(page.getByRole('tab', { name: 'Discover tab' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('service-card-rail')).toHaveCount(0);
  const serviceSwipeCard = page.locator('[data-service-focus-id="chef-maria"]');
  await expect(serviceSwipeCard).toBeVisible({ timeout: 15_000 });
  await serviceSwipeCard.getByTestId('service-card-cta').click({ force: true });
}

test('authenticated Home routes a recommendation to the top service swipe card in Discover', async ({ page }) => {
  await installVendorServiceMocks(page);
  await enterAuthenticatedMainApp(page);

  const homeRail = page.getByTestId('home-recommended-nearby-rail');
  await expect(homeRail).toBeVisible({ timeout: 15_000 });
  await expect(homeRail).toContainText('Recommended near you');
  await expect(homeRail).toContainText('Chef Maria’s Table');
  await expect(homeRail).toContainText('87 bookings');
  await expect(homeRail).toContainText('Book for Tonight');
  await expect(homeRail).not.toContainText('Valet Pickup');
  await expect(homeRail).not.toContainText('Cottage Industry');
  await expect(homeRail).not.toContainText('Vendor service');

  const firstHomeServiceCard = homeRail.getByTestId('home-recommended-nearby-card').filter({ hasText: '5-Course Italian Dinner at Home' });
  const vendorBox = await firstHomeServiceCard.getByTestId('home-service-card-vendor').boundingBox();
  const titleBox = await firstHomeServiceCard.getByTestId('home-service-card-title').boundingBox();
  const ctaBoxHome = await firstHomeServiceCard.getByTestId('home-service-card-cta').boundingBox();
  expect(vendorBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(ctaBoxHome).not.toBeNull();
  expect(vendorBox!.y + vendorBox!.height).toBeLessThanOrEqual(titleBox!.y + 2);
  expect(titleBox!.y + titleBox!.height).toBeLessThan(ctaBoxHome!.y);

  await page.getByTestId('home-recommended-nearby-card').filter({ hasText: '5-Course Italian Dinner at Home' }).click({ force: true });
  await expect(page.getByRole('tab', { name: 'Discover tab' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('service-card-rail')).toHaveCount(0);
  await expect(page.getByTestId('service-quick-card-chef-maria')).toHaveCount(0);
  await expect(page.getByTestId('service-booking-sheet')).toHaveCount(0);

  const topServiceCard = page.locator('[data-service-focus-id="chef-maria"]');
  await expect(topServiceCard).toBeVisible({ timeout: 15_000 });
  await expect(topServiceCard).toContainText('Chef Maria’s Table');
  await expect(topServiceCard).toContainText('5-Course Italian Dinner at Home');
  await expect(topServiceCard).toContainText('87 bookings');
  await expect(topServiceCard).not.toContainText('RATING');
  await expect(topServiceCard).not.toContainText('DEMAND');
  await expect(topServiceCard).not.toContainText('4.98 ★ (87 bookings)');
  const cta = topServiceCard.getByTestId('service-card-cta');
  await expect(cta).toBeVisible();
  await expect(cta).toContainText('Book for Tonight');
  const ctaBox = await cta.boundingBox();
  const navBox = await page.getByRole('navigation', { name: 'Main navigation' }).boundingBox();
  expect(ctaBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(ctaBox!.y + ctaBox!.height).toBeLessThan(navBox!.y - 8);
});

test('guest Home hides Recommended near you service recommendations', async ({ page }) => {
  await installVendorServiceMocks(page);
  await enterMainApp(page);

  await expect(page.getByTestId('home-recommended-nearby-rail')).toHaveCount(0);
});

test('guest App Clip patch invoke lands on scanner with local services visible', async ({ page }) => {
  await installVendorServiceMocks(page);
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.goto('/p/review-patch-123?venue=Review%20Rooftop');
  await expect(page.getByRole('tab', { name: 'Map tab' })).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
  await expect(page.getByRole('tab', { name: 'Home tab' })).toHaveAttribute('aria-selected', 'false');
  await expect(page).toHaveURL(/\/access\/review-patch-123/);
  await expect(page.getByText('QR Backup Scanner')).toBeVisible({ timeout: 15_000 });

  const session = await page.evaluate(() => ({
    token: localStorage.getItem('bytspot_auth_token'),
    user: JSON.parse(localStorage.getItem('bytspot_user') || 'null'),
    patchContext: JSON.parse(localStorage.getItem('bytspot_virtual_patch_context') || 'null'),
  }));
  expect(session.token).toBe('guest_session');
  expect(session.user).toMatchObject({ id: 'guest', name: 'Guest' });
  expect(session.patchContext).toMatchObject({ source: 'app-clip', mode: 'patch-invoked', patchId: 'review-patch-123', venueName: 'Review Rooftop' });

  const appClipServices = page.getByTestId('app-clip-local-services-panel');
  await expect(appClipServices).toBeVisible({ timeout: 15_000 });
  await expect(appClipServices).toContainText('Venue Services');
  await expect(appClipServices).toContainText('Verified Entry');
  await expect(appClipServices).toContainText('Concierge Help');
  await expect(appClipServices).not.toContainText('Scanner live');
});

test('authenticated Home shows curated service recommendations when no live services are available', async ({ page }) => {
  await installVendorServiceMocks(page);
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/trpc/vendors.search')) {
        return new Response(JSON.stringify({ result: { data: { services: [], count: 0 } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input as RequestInfo | URL, init);
    };
  });
  await enterAuthenticatedMainApp(page);

  const homeRail = page.getByTestId('home-recommended-nearby-rail');
  await expect(homeRail).toBeVisible({ timeout: 15_000 });
  await expect(homeRail).toContainText('Chef Maria’s Table');
  await expect(homeRail).toContainText('87 bookings');
  await expect(homeRail).toContainText('Atlanta Black Car Valet');
  await expect(homeRail).toContainText('Book for Tonight');
});

test('default Discover does not render duplicated vendor service rails or quick cards', async ({ page }) => {
  await installVendorServiceMocks(page);
  await enterMainApp(page);
  await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });

  await expect(page.getByTestId('discover-swipe-card-1')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('service-card-rail')).toHaveCount(0);
  for (const service of VENDOR_SERVICES) {
    await expect(page.getByTestId(`service-quick-card-${service.id}`)).toHaveCount(0);
  }
});

test('Services filter renders vendor services as the swipe deck only', async ({ page }) => {
  await installVendorServiceMocks(page);
  await enterAuthenticatedMainApp(page);
  await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });
  await page.getByRole('button', { name: '🛎 Services' }).click({ force: true });

  await expect(page.getByTestId('service-card-rail')).toHaveCount(0);
  await expect(page.getByTestId('service-quick-card-chef-maria')).toHaveCount(0);
  const serviceSwipeCard = page.locator('[data-service-focus-id]').first();
  await expect(serviceSwipeCard).toBeVisible({ timeout: 15_000 });
  await expect(serviceSwipeCard).toContainText(/bookings|spots|available/i);
  await expect(serviceSwipeCard).toContainText('Ready to book');
  await expect(serviceSwipeCard).not.toContainText('Bookable vendor service');
  await expect(serviceSwipeCard).not.toContainText('Bookable service');
  await expect(serviceSwipeCard.getByTestId('service-card-cta')).toBeVisible();
});

test('standard API cards remain in the default Discover swipe deck', async ({ page }) => {
  await installVendorServiceMocks(page);
  await enterMainApp(page);
  await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });

  await expect(page.getByTestId('service-card-rail')).toHaveCount(0);
  const standardCard = page.getByTestId('discover-swipe-card-1');
  await expect(standardCard).toBeVisible({ timeout: 15_000 });
  await expect(standardCard).toContainText('Standard API Garage');
  await expect(standardCard).toContainText('18 spots');
  await expect(page.getByTestId('service-quick-card-chef-maria')).toHaveCount(0);
});

test('Discover stays clean during a venue API outage without showing duplicated service cards', async ({ page }) => {
  await installVendorServiceMocks(page, { failVenues: true });
  await enterMainApp(page);
  await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });

  await expect(page.getByTestId('service-card-rail')).toHaveCount(0);
  await expect(page.getByTestId('service-quick-card-chef-maria')).toHaveCount(0);
  await expect(page.getByTestId('service-quick-card-vip-valet')).toHaveCount(0);
  await expect(page.getByText('No spots match this filter.')).toBeVisible({ timeout: 15_000 });
});

test('vendor service discovery card starts booking checkout', async ({ page }) => {
  const bookingPayloads: unknown[] = [];
  await page.exposeFunction('__recordBookingPayload', (payload: unknown) => {
    bookingPayloads.push(payload);
  });
  await installVendorServiceMocks(page);
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({ status: 200, body: '<html><title>Stripe Checkout</title></html>', headers: { 'Content-Type': 'text/html' } }));
  await enterAuthenticatedMainApp(page);
  await clickHomeRecommendedServiceCta(page);
  await expect(page.getByTestId('service-booking-sheet')).toHaveCount(0);

  await expect.poll(() => bookingPayloads).toHaveLength(1);
  expect(bookingPayloads[0]).toMatchObject({ serviceId: 'chef-maria', usePoints: false, metadata: { source: 'discover.service_card', vendorId: 'vendor-chef-maria' } });
  expect((bookingPayloads[0] as any).metadata).toHaveProperty('patchId');
  await expect(page).toHaveURL(/checkout\.stripe\.com\/c\/pay\/cs_test_vendor_service/, { timeout: 10_000 });
});

test('guest Home hides vendor service booking entry instead of calling checkout', async ({ page }) => {
  const bookingPayloads: unknown[] = [];
  await page.exposeFunction('__recordBookingPayload', (payload: unknown) => bookingPayloads.push(payload));
  await installVendorServiceMocks(page);
  await enterMainApp(page);

  await expect(page.getByTestId('home-recommended-nearby-rail')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });
  await expect(page.getByTestId('service-card-rail')).toHaveCount(0);
  await expect(page.getByTestId('service-booking-sheet')).toHaveCount(0);
  expect(bookingPayloads).toHaveLength(0);
});

test('marketplace booking return screens show transaction metadata', async ({ page }) => {
  await page.goto('/booking/success?session_id=cs_test_123&booking_id=booking-123');
  await expect(page.getByText('Checkout received')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('cs_test_123')).toBeVisible();
  await expect(page.getByText('booking-123')).toBeVisible();

  await page.goto('/booking/cancelled');
  await expect(page.getByText('Checkout cancelled')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('No charge was completed.')).toBeVisible();
});