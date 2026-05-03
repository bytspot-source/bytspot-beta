import { expect, type Page, test } from '@playwright/test';

const TEST_COORDS = { lat: 33.789, lng: -84.384 };
const VENDOR_SERVICE = {
  id: 'svc-vip-arrival',
  title: 'VIP Arrival',
  description: 'Door-to-table escort with verified provider handoff.',
  priceCents: 15000,
  currency: 'USD',
  durationMins: 90,
  vendor: { id: 'vendor-midtown', displayName: 'Midtown Hosts', onboardingStatus: 'active' },
  patch: { id: 'patch-vip', uid: '04A1B2C3D4E5F6', label: 'VIP Booth' },
  cashFlow: { platformFeeCents: 1200, providerPayoutEstimateCents: 13800, commissionBps: 800 },
};

test.use({ geolocation: { latitude: TEST_COORDS.lat, longitude: TEST_COORDS.lng }, permissions: ['geolocation'] });

async function installVendorServiceMocks(page: Page) {
  await page.addInitScript(({ service }) => {
    localStorage.setItem('bytspot_onboarding_seen', 'true');
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
        if (procedure.includes('venues.list')) return { result: { data: { venues: [] } } };
        if (procedure.includes('vendors.search')) return { result: { data: { services: [service], count: 1 } } };
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
  }, { service: VENDOR_SERVICE });
}

async function enterMainApp(page: Page) {
  await page.goto('/');
  await expect(page.getByText("Let's Go")).toBeVisible({ timeout: 15_000 });
  await page.getByText("Let's Go").click();
  await expect(page.getByText('Continue as Guest')).toBeVisible({ timeout: 10_000 });
  await page.getByText('Continue as Guest').click();
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
}

async function openVendorServiceCard(page: Page) {
  await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });
  await expect(page.getByText('VIP Arrival')).toBeVisible({ timeout: 15_000 });
  await page.getByText('VIP Arrival').click({ force: true });
  await expect(page.getByTestId('vendor-service-booking-sheet')).toBeVisible({ timeout: 10_000 });
}

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