import { expect, type Page, test } from '@playwright/test';

const TEST_COORDS = { lat: 33.789, lng: -84.384 };
const VENDOR_SERVICES = [
  {
    id: 'svc-vip-arrival',
    title: 'VIP Arrival',
    description: 'Door-to-table escort with verified provider handoff.',
    priceCents: 15000,
    currency: 'USD',
    durationMins: 90,
    vendor: { id: 'vendor-midtown', displayName: 'Midtown Hosts', onboardingStatus: 'active' },
    patch: { id: 'patch-vip', uid: '04A1B2C3D4E5F6', label: 'VIP Booth' },
    cashFlow: { platformFeeCents: 1200, providerPayoutEstimateCents: 13800, commissionBps: 800 },
  },
  {
    id: 'svc-market-table-assist',
    title: 'Night Market Table Assist',
    description: 'Queue handoff and table setup for busy markets.',
    priceCents: 8500,
    currency: 'USD',
    durationMins: 45,
    vendor: { id: 'vendor-market-concierge', displayName: 'Market Concierge Co.', onboardingStatus: 'active' },
    patch: { id: 'patch-market-assist', uid: '04F1E2D3C4B5A6', label: 'Market Desk' },
    cashFlow: { platformFeeCents: 680, providerPayoutEstimateCents: 7820, commissionBps: 800 },
  },
  {
    id: 'svc-private-art-walk',
    title: 'Private Art Walk',
    description: 'Provider-led gallery route with timed entry support.',
    priceCents: 12000,
    currency: 'USD',
    durationMins: 60,
    vendor: { id: 'vendor-culture-loop', displayName: 'Culture Loop ATL', onboardingStatus: 'active' },
    patch: null,
    cashFlow: { platformFeeCents: 960, providerPayoutEstimateCents: 11040, commissionBps: 800 },
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
  await page.goto('/');
  await expect(page.getByText("Let's Go")).toBeVisible({ timeout: 15_000 });
  await page.getByText("Let's Go").click();
  await expect(page.getByText('Continue as Guest')).toBeVisible({ timeout: 10_000 });
  await page.getByText('Continue as Guest').click();
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
}

async function openVendorServiceCard(page: Page, serviceId = 'svc-vip-arrival') {
  await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });
  const serviceCard = page.getByTestId(`vendor-service-quick-card-${serviceId}`);
  await expect(serviceCard).toBeVisible({ timeout: 15_000 });
  await serviceCard.scrollIntoViewIfNeeded();
  await serviceCard.click({ force: true });
  await expect(page.getByTestId('vendor-service-booking-sheet')).toBeVisible({ timeout: 10_000 });
}

test('vendor service discovery cards all render as active and interactable', async ({ page }) => {
  await installVendorServiceMocks(page);
  await enterMainApp(page);
  await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });

  await expect(page.getByTestId('vendor-service-card-rail')).toBeVisible({ timeout: 15_000 });
  for (const service of VENDOR_SERVICES) {
    const quickCard = page.getByTestId(`vendor-service-quick-card-${service.id}`);
    await expect(quickCard).toBeVisible();
    await expect(quickCard).toContainText(service.title);
    await expect(quickCard).toContainText('Active');

    await quickCard.scrollIntoViewIfNeeded();
    await quickCard.click({ force: true });
    const sheet = page.getByTestId('vendor-service-booking-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(service.title)).toBeVisible();
    await sheet.getByRole('button', { name: 'Not now' }).click({ force: true });
    await expect(sheet).toBeHidden();
  }
});

test('standard API cards remain in the default Discover swipe deck', async ({ page }) => {
  await installVendorServiceMocks(page);
  await enterMainApp(page);
  await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });

  await expect(page.getByTestId('vendor-service-card-rail')).toBeVisible({ timeout: 15_000 });
  const standardCard = page.getByTestId('discover-swipe-card-1');
  await expect(standardCard).toBeVisible({ timeout: 15_000 });
  await expect(standardCard).toContainText('Standard API Garage');
  await expect(standardCard).toContainText('18 spots');
  await expect(page.getByTestId('vendor-service-quick-card-svc-vip-arrival')).toBeVisible();
});

test('vendor service discovery survives a venue API outage', async ({ page }) => {
  await installVendorServiceMocks(page, { failVenues: true });
  await enterMainApp(page);
  await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });

  await expect(page.getByTestId('vendor-service-card-rail')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('vendor-service-quick-card-svc-vip-arrival')).toContainText('VIP Arrival');
  await expect(page.getByTestId('vendor-service-quick-card-svc-market-table-assist')).toContainText('Night Market Table Assist');
});

test('vendor service discovery card starts booking checkout', async ({ page }) => {
  const bookingPayloads: unknown[] = [];
  await page.exposeFunction('__recordBookingPayload', (payload: unknown) => {
    bookingPayloads.push(payload);
  });
  await installVendorServiceMocks(page);
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({ status: 200, body: '<html><title>Stripe Checkout</title></html>', headers: { 'Content-Type': 'text/html' } }));
  await enterMainApp(page);
  await page.evaluate(() => localStorage.setItem('bytspot_auth_token', 'test-user-token'));
  await openVendorServiceCard(page);
  await page.getByTestId('vendor-service-checkout-cta').click({ force: true });

  await expect.poll(() => bookingPayloads).toHaveLength(1);
  expect(bookingPayloads[0]).toMatchObject({ serviceId: 'svc-vip-arrival', usePoints: false, metadata: { source: 'discover.service_card', vendorId: 'vendor-midtown', patchId: 'patch-vip' } });
  await expect(page).toHaveURL(/checkout\.stripe\.com\/c\/pay\/cs_test_vendor_service/, { timeout: 10_000 });
});

test('guest vendor service booking prompts sign in instead of calling checkout', async ({ page }) => {
  const bookingPayloads: unknown[] = [];
  await page.exposeFunction('__recordBookingPayload', (payload: unknown) => bookingPayloads.push(payload));
  await installVendorServiceMocks(page);
  await enterMainApp(page);
  await openVendorServiceCard(page);

  await expect(page.getByTestId('vendor-service-checkout-cta')).toContainText('Sign in to book');
  await page.getByTestId('vendor-service-checkout-cta').click({ force: true });

  await expect(page.getByPlaceholder('Email address')).toBeVisible({ timeout: 10_000 });
  expect(bookingPayloads).toHaveLength(0);

  await page.getByPlaceholder('Full name').fill('Test Booker');
  await page.getByPlaceholder('Email address').fill('booker@test.com');
  await page.getByPlaceholder('Password').fill('password123');
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page.getByTestId('vendor-service-booking-sheet')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('vendor-service-checkout-cta')).toContainText('Book with Stripe');
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