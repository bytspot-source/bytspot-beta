import { expect, type Page, test } from '@playwright/test';

type SubscriptionStatus = {
  isPremium: boolean;
  isVendorPremium: boolean;
  isValetPremium: boolean;
  availablePoints: number;
  subscriptionOffers: Record<string, {
    baseUnitAmountCents: number;
    upgradeDiscountCents: number;
    maxPointsDiscountCents: number;
    finalUnitAmountCents: number;
  }>;
};

const TEST_COORDS = { lat: 33.789, lng: -84.384 };
const VERIFIED_VENUE = {
  id: 'verified-venue-1',
  name: 'The Rooftop Bar',
  slug: 'the-rooftop-bar',
  address: '123 Peachtree St NE',
  lat: TEST_COORDS.lat,
  lng: TEST_COORDS.lng,
  category: 'bar',
  imageUrl: null,
  entryType: 'paid',
  entryPrice: '$22',
  crowd: { level: 3, label: 'Lively', waitMins: 10, recordedAt: new Date().toISOString() },
  parking: { totalAvailable: 5, spots: [] },
  hardwarePatch: { id: 'patch-verified-1', uid: '04A1B2C3D4E5F6' },
};

test.use({ geolocation: { latitude: TEST_COORDS.lat, longitude: TEST_COORDS.lng }, permissions: ['geolocation'] });

const STATUS_GUEST: SubscriptionStatus = {
  isPremium: false,
  isVendorPremium: false,
  isValetPremium: false,
  availablePoints: 1000,
  subscriptionOffers: {
    'insider-premium': { baseUnitAmountCents: 999, upgradeDiscountCents: 0, maxPointsDiscountCents: 949, finalUnitAmountCents: 999 },
    'vendor-premium': { baseUnitAmountCents: 4900, upgradeDiscountCents: 0, maxPointsDiscountCents: 1000, finalUnitAmountCents: 4900 },
    'valet-premium': { baseUnitAmountCents: 1499, upgradeDiscountCents: 0, maxPointsDiscountCents: 1000, finalUnitAmountCents: 1499 },
  },
};

const STATUS_INSIDER: SubscriptionStatus = {
  ...STATUS_GUEST,
  isPremium: true,
  subscriptionOffers: {
    ...STATUS_GUEST.subscriptionOffers,
    'vendor-premium': { baseUnitAmountCents: 4900, upgradeDiscountCents: 999, maxPointsDiscountCents: 1000, finalUnitAmountCents: 3901 },
  },
};

async function installCheckoutMocks(page: Page, status: SubscriptionStatus) {
  await page.addInitScript(({ subscriptionStatus, verifiedVenue }) => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_auth_token', 'guest_session');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'guest', name: 'Guest' }));
    localStorage.setItem('bytspot_user_name', 'Guest');
    localStorage.removeItem('bytspot_provider_premium_entitlement');
    if ('serviceWorker' in navigator) {
      try {
        Object.defineProperty(navigator, 'serviceWorker', {
          configurable: true,
          value: {
            register: () => Promise.reject(new Error('disabled-in-test')),
            getRegistration: () => Promise.resolve(undefined),
            getRegistrations: () => Promise.resolve([]),
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            ready: new Promise(() => undefined),
          },
        });
      } catch { /* ignore */ }
    }
    // @ts-expect-error test-only audit channel
    window.__BYT_E2E_CHECKOUT_PAYLOADS__ = [];

    const mockPosition = { coords: { latitude: 33.789, longitude: -84.384, accuracy: 12 }, timestamp: Date.now() };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (s: (p: typeof mockPosition) => void) => window.setTimeout(() => s(mockPosition), 30),
        watchPosition: (s: (p: typeof mockPosition) => void) => { window.setTimeout(() => s(mockPosition), 30); return 1; },
        clearWatch: () => undefined,
      },
    });

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
      if (url.includes('nominatim.openstreetmap.org/reverse')) {
        return new Response(JSON.stringify({ address: { city: 'Atlanta' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);

      const match = url.match(/\/trpc\/([^?]+)/);
      const procedures = match ? match[1].split(',') : ['unknown'];
      const body = readJsonBody(init?.body);
      const results = procedures.map((procedure) => {
        if (procedure.includes('subscription.status')) return { result: { data: subscriptionStatus } };
        if (procedure.includes('subscription.createCheckout')) {
          const jsonInput = firstJsonInput(body) as Record<string, unknown> | null;
          // @ts-expect-error test-only audit channel
          window.__BYT_E2E_CHECKOUT_PAYLOADS__.push(jsonInput);
          return { result: { data: { url: null, demoMode: false, plan: jsonInput?.plan ?? 'insider-premium' } } };
        }
        if (procedure.includes('providers.getStatus')) {
          return { result: { data: { host: { id: 'host-e2e', status: 'approved', onboardingData: {} } } } };
        }
        if (procedure.includes('venues.list')) return { result: { data: { venues: [verifiedVenue] } } };
        if (procedure.includes('auth.me')) return { result: { data: { referralCount: 0 } } };
        if (procedure.includes('social.venueCheckins')) return { result: { data: { items: [] } } };
        if (procedure.includes('venues.getBySlug')) return { result: { data: { crowd: { history: [] } } } };
        if (procedure.includes('venues.getSimilar')) return { result: { data: { similar: [] } } };
        return { result: { data: null } };
      });
      return new Response(JSON.stringify(procedures.length === 1 ? results[0] : results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }, { subscriptionStatus: status, verifiedVenue: VERIFIED_VENUE });
}

async function enterMainApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
}

async function checkoutPayloads(page: Page) {
  return page.evaluate(() => {
    // @ts-expect-error test-only audit channel
    return window.__BYT_E2E_CHECKOUT_PAYLOADS__ ?? [];
  });
}

async function robustClick(locator: import('@playwright/test').Locator) {
  await locator.waitFor({ state: 'attached', timeout: 10_000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await locator.click({ force: true, timeout: 5_000 });
  } catch {
    await locator.evaluate((el: HTMLElement) => el.click());
  }
}

async function openVerifiedPremiumTeaser(page: Page) {
  const mapTab = page.getByRole('tab', { name: 'Map tab' });
  await robustClick(mapTab);
  await expect(mapTab).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
  await page.locator('.leaflet-container').waitFor({ state: 'attached', timeout: 15_000 });
  const dataReadyCue = page.getByRole('button', { name: /Open Tap and Scan virtual patch flow/i });
  await expect(dataReadyCue).toContainText(VERIFIED_VENUE.name, { timeout: 15_000 });
  const search = page.getByPlaceholder('Search destination or service type');
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill(VERIFIED_VENUE.name);
  await expect(search).toHaveValue(VERIFIED_VENUE.name);
  await search.press('Enter');
  const venueResult = page.getByRole('button', { name: new RegExp(VERIFIED_VENUE.name, 'i') }).first();
  await expect(venueResult).toBeVisible({ timeout: 15_000 });
  await robustClick(venueResult);
  const unlockBtn = page.getByRole('button', { name: 'Unlock Bytspot Premium perks for this venue' });
  await expect(unlockBtn).toBeVisible({ timeout: 15_000 });
  await robustClick(unlockBtn);
  const teaser = page.getByRole('dialog', { name: 'Unlock Bytspot Premium' });
  await expect(teaser).toBeVisible({ timeout: 5_000 });
  return teaser;
}

test.describe('Loyalty subscription checkout proof', () => {
  test('Insider premium teaser sends points and coupon payload', async ({ page }) => {
    await installCheckoutMocks(page, STATUS_GUEST);
    await enterMainApp(page);

    const teaser = await openVerifiedPremiumTeaser(page);
    await expect(teaser.getByText(/Use 1,000 points/)).toBeVisible({ timeout: 10_000 });
    const pointsCheckbox = teaser.getByRole('checkbox');
    await expect(pointsCheckbox).toBeEnabled({ timeout: 5_000 });
    await pointsCheckbox.click();
    await expect(pointsCheckbox).toBeChecked({ timeout: 5_000 });
    await teaser.getByPlaceholder('Coupon code').fill('FIRST1000');
    const upgradeCta = teaser.getByRole('button', { name: /^Upgrade/i }).first();
    await upgradeCta.focus();
    await upgradeCta.press('Enter');

    await expect.poll(() => checkoutPayloads(page)).toHaveLength(1);
    await expect.poll(async () => (await checkoutPayloads(page))[0]).toMatchObject({
      plan: 'insider-premium',
      usePoints: true,
      couponCode: 'FIRST1000',
    });
  });

  test('Provider Premium gate sends ecosystem upgrade checkout payload', async ({ page }) => {
    await installCheckoutMocks(page, STATUS_INSIDER);
    await page.goto('/provider/onboarding');

    const patchesButton = page.getByRole('button', { name: 'Patches' });
    await expect(patchesButton).toBeVisible({ timeout: 15_000 });
    await patchesButton.click();
    const startButton = page.getByRole('button', { name: /Start Provider Premium/i });
    await expect(startButton).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Use 1,000 points/)).toBeVisible({ timeout: 10_000 });
    const pointsCheckbox = page.getByTestId('provider-premium-use-points');
    await pointsCheckbox.check({ force: true });
    await expect(pointsCheckbox).toBeChecked({ timeout: 5_000 });
    await page.getByPlaceholder('Coupon code').first().fill('SAVE1000');
    await startButton.click({ force: true });

    await expect.poll(() => checkoutPayloads(page)).toHaveLength(1);
    await expect.poll(async () => (await checkoutPayloads(page))[0]).toMatchObject({
      plan: 'vendor-premium',
      usePoints: true,
      couponCode: 'SAVE1000',
    });
  });
});
