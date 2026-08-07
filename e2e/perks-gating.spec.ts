import { test, expect, type Page } from '@playwright/test';

/**
 * Platinum membership gating — Verified venues show access UI on the map peek card.
 *  • Green → locked teaser
 *  • Platinum → inline active panel
 */

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

// Non-Verified venue — no hardwarePatch field. Offset ~0.0008° (~90 m) from the
// Verified venue so it stays inside the initial map area and appears as a nearby
// spatial result alongside the verified venue.
const NON_VERIFIED_VENUE = {
  id: 'non-verified-venue-1',
  name: 'Optimist Hall',
  slug: 'optimist-hall',
  address: '950 Marietta St NW',
  lat: TEST_COORDS.lat + 0.0008,
  lng: TEST_COORDS.lng + 0.0008,
  category: 'restaurant',
  imageUrl: null,
  entryType: 'free',
  entryPrice: null,
  crowd: { level: 1, label: 'Chill', waitMins: 0, recordedAt: new Date().toISOString() },
  parking: { totalAvailable: 30, spots: [] },
};

// Stable mocked Stripe Checkout URL — the upgrade-flow spec stubs requests to
// checkout.stripe.com via page.route so the test never actually hits live Stripe.
const MOCK_STRIPE_CHECKOUT_SESSION_ID = 'cs_test_e2e_mock_session_abc123';
const MOCK_STRIPE_CHECKOUT_URL = `https://checkout.stripe.com/c/pay/${MOCK_STRIPE_CHECKOUT_SESSION_ID}`;

// localStorage key used by the mock fetch to read the current premium state on
// every tRPC call. Persisted across page.reload() so tests can simulate
// mid-session subscription state changes (e.g. webhook-driven downgrade).
const PREMIUM_FLAG_KEY = '__BYT_E2E_PREMIUM__';

test.use({
  geolocation: { latitude: TEST_COORDS.lat, longitude: TEST_COORDS.lng },
  permissions: ['geolocation'],
});

async function installMocks(
  page: Page,
  opts: {
    isPremium: boolean;
    venues?: Array<typeof VERIFIED_VENUE | typeof NON_VERIFIED_VENUE>;
    checkoutShape?: 'url' | 'nested-session-id';
  },
) {
  // Disable the PWA service worker — its cache-first fetch handler in
  // public/sw.js intercepts JS module requests once registered, which can
  // cause the test to render a stale MapSection bundle that pre-dates the
  // perks gating block. Stub the registration API to a no-op before any
  // page script runs.
  await page.addInitScript(() => {
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
  });
  const venuesPayload = opts.venues ?? [VERIFIED_VENUE];
  await page.addInitScript(({ venues, coords, initialIsPremium, premiumKey, mockCheckoutUrl, mockCheckoutSessionId, checkoutShape }) => {
    // Seed the persisted premium flag from the test-supplied initial value, but only if
    // the test hasn't already mutated it. This keeps page.reload() round-trips honest:
    // a test that flipped the flag mid-session will see its mutation survive the reload.
    if (localStorage.getItem(premiumKey) === null) {
      localStorage.setItem(premiumKey, String(Boolean(initialIsPremium)));
    }

    const mockPosition = {
      coords: { latitude: coords.lat, longitude: coords.lng, accuracy: 12 },
      timestamp: Date.now(),
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (s: (p: typeof mockPosition) => void) => window.setTimeout(() => s(mockPosition), 30),
        watchPosition: (s: (p: typeof mockPosition) => void) => { window.setTimeout(() => s(mockPosition), 30); return 1; },
        clearWatch: () => undefined,
      },
    });

    // Window-side call tracker. The mock fetch below synthesizes Response objects
    // inline so Playwright's page.waitForRequest can't see the calls — no real
    // network request ever leaves the page. Tests assert on this array via
    // page.evaluate / page.waitForFunction instead.
    // @ts-expect-error test-only window slot
    window.__BYT_E2E_TRPC_CALLS__ = [];

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('nominatim.openstreetmap.org/reverse')) {
        return new Response(JSON.stringify({ address: { city: 'Atlanta' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);

      // Read premium state at fetch-time (not init-time) so reload-driven mutations
      // and same-session writes both propagate to the next subscription.status query.
      const isPremiumNow = localStorage.getItem(premiumKey) === 'true';

      const match = url.match(/\/trpc\/([^?]+)/);
      const procedures = match ? match[1].split(',') : ['unknown'];
      // @ts-expect-error test-only window slot
      (window.__BYT_E2E_TRPC_CALLS__ as string[]).push(...procedures);
      const results = procedures.map((p) => {
        if (p.includes('venues.list')) return { result: { data: { venues } } };
        if (p.includes('subscription.status')) return { result: { data: { isPremium: isPremiumNow } } };
        if (p.includes('subscription.createCheckout')) {
          if (checkoutShape === 'nested-session-id') return { result: { data: { session: { id: mockCheckoutSessionId } } } };
          return { result: { data: { url: mockCheckoutUrl } } };
        }
        if (p.includes('auth.me')) return { result: { data: { referralCount: 0 } } };
        if (p.includes('social.venueCheckins')) return { result: { data: { items: [] } } };
        if (p.includes('venues.getBySlug')) return { result: { data: { crowd: { history: [] } } } };
        if (p.includes('venues.getSimilar')) return { result: { data: { similar: [] } } };
        return { result: { data: null } };
      });
      const payload = procedures.length === 1 ? results[0] : results;
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    class MockEventSource {
      url: string;
      onmessage: ((e: MessageEvent<string>) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      constructor(url: string) {
        this.url = url;
        window.setTimeout(() => {
          this.onmessage?.({ data: JSON.stringify({ type: 'snapshot', venues: [] }) } as MessageEvent<string>);
        }, 0);
      }
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }
    // @ts-expect-error test-only shim
    window.EventSource = MockEventSource;
  }, {
    venues: venuesPayload,
    coords: TEST_COORDS,
    initialIsPremium: opts.isPremium,
    premiumKey: PREMIUM_FLAG_KEY,
    mockCheckoutUrl: MOCK_STRIPE_CHECKOUT_URL,
    mockCheckoutSessionId: MOCK_STRIPE_CHECKOUT_SESSION_ID,
    checkoutShape: opts.checkoutShape ?? 'url',
  });
}

async function seedGuestSession(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_auth_token', 'guest_session');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'guest', name: 'Guest' }));
    localStorage.setItem('bytspot_user_name', 'Guest');
  });
}

async function seedAuthenticatedSession(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_auth_token', 'test-user-token');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'user-1', email: 'booker@test.com', name: 'Test Booker' }));
    localStorage.setItem('bytspot_user_name', 'Test Booker');
  });
}

async function enterMainApp(page: Page) {
  await page.goto('/');
  await seedGuestSession(page);
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
}

async function enterAuthenticatedMainApp(page: Page) {
  await page.goto('/');
  await seedAuthenticatedSession(page);
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
}

/**
 * Resilient post-reload re-entry. Persisted guest-auth state in localStorage
 * skips the splash/auth flow and lands directly on the Home tab. If a cold
 * reload surfaces the landing page anyway, reseed and remount the SPA.
 */
async function ensureMainApp(page: Page) {
  const letsGo = page.getByText("Let's Go");
  const homeTab = page.getByRole('tab', { name: 'Home tab' });
  await Promise.race([
    letsGo.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
    homeTab.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
  ]);
  if (await letsGo.isVisible().catch(() => false)) {
    await seedGuestSession(page);
    await page.goto('/');
  }
  await expect(homeTab).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
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

async function openMapWithLiveVenues(page: Page) {
  const mapTab = page.getByRole('tab', { name: 'Map tab' });

  await robustClick(mapTab);
  await expect(mapTab).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
  await page.locator('.leaflet-container').waitFor({ state: 'attached', timeout: 15_000 });
}

async function openVenueFromSpatialSheet(page: Page, venueName = VERIFIED_VENUE.name) {
  const dataReadyCue = page.getByRole('button', { name: /Open Tap and Scan virtual patch flow/i });
  await expect(dataReadyCue).toContainText(VERIFIED_VENUE.name, { timeout: 15_000 });

  const search = page.getByPlaceholder('Search destination or service type');
  await expect(search).toBeVisible({ timeout: 15_000 });
  await search.fill(venueName);
  await expect(search).toHaveValue(venueName);
  await search.press('Enter');

  const result = page.getByRole('button', { name: new RegExp(venueName, 'i') }).first();
  await expect(result).toBeVisible({ timeout: 15_000 });
  await robustClick(result);
}

test.describe('Platinum gating on Verified venues', () => {
  test('Green member cannot open Traffic Intelligence', async ({ page }) => {
    await installMocks(page, { isPremium: false });
    await enterMainApp(page);
    await openMapWithLiveVenues(page);

    await robustClick(page.getByRole('button', { name: 'Traffic intelligence (Platinum locked)' }));
    await expect(page.getByRole('dialog', { name: 'Unlock Bytspot Platinum' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Traffic Intelligence' })).toHaveCount(0);
  });

  test('Traffic Intelligence closes when Platinum lapses mid-session', async ({ page }) => {
    await installMocks(page, { isPremium: true });
    await enterMainApp(page);
    await openMapWithLiveVenues(page);

    const trafficButton = page.getByRole('button', { name: 'Traffic intelligence', exact: true });
    await expect(trafficButton).toBeVisible({ timeout: 15_000 });
    await robustClick(trafficButton);
    await expect(page.getByRole('dialog', { name: 'Traffic Intelligence' })).toBeVisible();

    await page.evaluate(({ key, eventName }) => {
      localStorage.setItem(key, 'false');
      window.dispatchEvent(new Event(eventName));
    }, { key: PREMIUM_FLAG_KEY, eventName: 'bytspot:commerce-updated' });

    await expect(page.getByRole('dialog', { name: 'Traffic Intelligence' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Traffic intelligence (Platinum locked)' })).toBeVisible();
  });

  test('Green member sees locked teaser and can open the Platinum sheet', async ({ page }) => {
    await installMocks(page, { isPremium: false });
    await enterMainApp(page);
    await openMapWithLiveVenues(page);
    await openVenueFromSpatialSheet(page);

    // The peek card mounts inside a framer-motion AnimatePresence with a spring
    // transition on opacity + translateY — it can take ~2-3s before the outer
    // wrapper reaches opacity:1, so toBeVisible() must allow for that animation
    // to settle. The Verified-specific perks copy is unique to the peek card, so
    // it doesn't collide with strict-mode duplicate text in Home-tab sections.
    await expect(page.getByText('Unlock perks at this Verified venue')).toBeVisible({ timeout: 15_000 });

    const unlockBtn = page.getByRole('button', { name: 'Unlock Bytspot Platinum perks for this venue' });
    await expect(unlockBtn).toBeVisible({ timeout: 5_000 });

    await robustClick(unlockBtn);

    const teaser = page.getByRole('dialog', { name: 'Unlock Bytspot Platinum' });
    await expect(teaser).toBeVisible({ timeout: 5_000 });
    await expect(teaser.getByText('Unlock Verified perks')).toBeVisible();
    // Match exact list-item copy — the dialog's headline paragraph also mentions
    // "discounts, skip-the-line entry, and exclusive Tap / Scan rewards", so a
    // loose regex like /Skip-the-line/i would collide with it under strict mode.
    await expect(teaser.getByText('10% off your tab at every Verified venue')).toBeVisible();
    await expect(teaser.getByText('Skip-the-line at participating partners')).toBeVisible();
    await expect(teaser.getByText('Platinum Tap / Scan access')).toBeVisible();
  });

  test('Platinum member sees canonical active state inline (no teaser)', async ({ page }) => {
    await installMocks(page, { isPremium: true });
    await enterMainApp(page);
    await openMapWithLiveVenues(page);
    await openVenueFromSpatialSheet(page);

    // Same AnimatePresence spring on the peek card — bumped timeout to 15s.
    await expect(page.getByText('PLATINUM · ACTIVE')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('10% off your tab')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unlock Bytspot Platinum perks for this venue' })).toHaveCount(0);
  });

  test('Upgrade CTA invokes subscription.createCheckout and redirects to Stripe', async ({ page }) => {
    // Stub the live Stripe Checkout host so the simulated redirect resolves to a
    // local 200 instead of hitting checkout.stripe.com over the network. We assert
    // on the captured request URL rather than landing on a real Stripe page.
    let capturedCheckoutNavigation: string | null = null;
    await page.route('https://checkout.stripe.com/**', async (route) => {
      capturedCheckoutNavigation = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Stripe (mocked)</title><h1>checkout</h1>',
      });
    });

    await installMocks(page, { isPremium: false });
    await enterMainApp(page);
    await openMapWithLiveVenues(page);
    await openVenueFromSpatialSheet(page);

    const unlockBtn = page.getByRole('button', { name: 'Unlock Bytspot Platinum perks for this venue' });
    await robustClick(unlockBtn);

    const teaser = page.getByRole('dialog', { name: 'Unlock Bytspot Platinum' });
    await expect(teaser).toBeVisible({ timeout: 5_000 });

    // The teaser's primary CTA dispatches the Platinum checkout handler, which awaits
    // trpc.subscription.createCheckout.mutate() and assigns window.location.href
    // to the returned URL. The CTA switches to "Opening checkout…" while the
    // mutation is in flight. Match on the leading "Upgrade" so the regex
    // survives small price/copy tweaks.
    const upgradeCta = teaser.getByRole('button', { name: /^Upgrade/i }).first();
    await expect(upgradeCta).toBeVisible({ timeout: 5_000 });

    // The button is a framer-motion `motion.button` inside an AnimatePresence
    // child; plain Playwright clicks have proven unreliable here (the click
    // either lands on the bottom-nav Map tab below or framer-motion's gesture
    // recognizer swallows the synthesized event). Focus + Enter is the most
    // robust path because React's synthetic event system fires `onClick` for
    // keyboard activation just as it does for pointer events, and framer's
    // pointer-event listeners don't intercept it.
    await upgradeCta.focus();
    await upgradeCta.press('Enter');

    // Wait for window.location.href = MOCK_STRIPE_CHECKOUT_URL to land on the
    // stubbed page. This proves the CTA called subscription.createCheckout: the
    // only mocked path that can produce this exact Stripe URL is the tRPC
    // createCheckout branch in installMocks(). Avoid reading the window-scoped
    // call tracker after this point — top-level navigation replaces the page
    // context, which made this assertion race and pass only on retry.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });
    expect(capturedCheckoutNavigation).not.toBeNull();
    expect(capturedCheckoutNavigation!).toBe(MOCK_STRIPE_CHECKOUT_URL);
  });

  test('Profile Platinum CTA redirects when checkout returns a nested cs_test session id', async ({ page }) => {
    test.skip(process.env.VITE_HIDE_INSIDER_PREMIUM !== 'false', 'Profile Platinum checkout is hidden in the default review configuration.');

    let capturedCheckoutNavigation: string | null = null;
    await page.route('https://checkout.stripe.com/**', async (route) => {
      capturedCheckoutNavigation = route.request().url();
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Stripe (mocked)</title><h1>checkout</h1>',
      });
    });

    await installMocks(page, { isPremium: false, checkoutShape: 'nested-session-id' });
    await enterAuthenticatedMainApp(page);

    await page.getByTestId('open-profile-button').click();
    const subscriptionCard = page.getByTestId('profile-subscription-card');
    await expect(subscriptionCard).toBeVisible({ timeout: 15_000 });

    const profileCheckoutCta = subscriptionCard.getByRole('button', { name: /Continue to Stripe/i });
    await profileCheckoutCta.scrollIntoViewIfNeeded();
    await expect(profileCheckoutCta).toBeVisible({ timeout: 5_000 });
    await profileCheckoutCta.focus();
    await profileCheckoutCta.press('Enter');

    await page.waitForURL(/checkout\.stripe\.com\/c\/pay\/cs_test_e2e_mock_session_abc123/, { timeout: 15_000 });
    expect(capturedCheckoutNavigation).toBe(MOCK_STRIPE_CHECKOUT_URL);
  });

  test('Mid-session downgrade: perks block flips to locked teaser after subscription lapses', async ({ page }) => {
    await installMocks(page, { isPremium: true });
    await enterMainApp(page);
    await openMapWithLiveVenues(page);
    await openVenueFromSpatialSheet(page);

    // Confirm the active-perks state rendered first so the downgrade transition
    // is meaningful (i.e. we're not just observing the guest default).
    await expect(page.getByText('PLATINUM · ACTIVE')).toBeVisible({ timeout: 15_000 });

    // Simulate an entitlement update without reloading the SPA.
    await page.evaluate((key) => {
      localStorage.setItem(key, 'false');
      window.dispatchEvent(new Event('bytspot:commerce-updated'));
    }, PREMIUM_FLAG_KEY);

    await expect(page.getByText('Unlock perks at this Verified venue')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Unlock Bytspot Platinum perks for this venue' })).toBeVisible();
    // Hard guard: the active-perks badge must not leak through after downgrade.
    await expect(page.getByText('PLATINUM · ACTIVE')).toHaveCount(0);
  });

  test('Non-Verified venue: neither active perks nor locked teaser render in the peek card', async ({ page }) => {
    // Render both venues so the spatial sheet has Verified and non-Verified rows
    // simultaneously — this catches selector regressions where the perks block
    // would accidentally key off "any venue" instead of hardwarePatch presence.
    await installMocks(page, {
      isPremium: false,
      venues: [VERIFIED_VENUE, NON_VERIFIED_VENUE],
    });
    await enterMainApp(page);
    await openMapWithLiveVenues(page);
    await openVenueFromSpatialSheet(page, NON_VERIFIED_VENUE.name);

    // The peek card should still open for the non-Verified venue (it shows the
    // venue name, vibe, and entry price) — we just need the perks-specific UI
    // to be entirely absent. Wait for the venue name to confirm the peek
    // mounted before asserting absence (otherwise the negative assertions
    // would race the AnimatePresence enter transition).
    await expect(page.getByText(NON_VERIFIED_VENUE.name).first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('PLATINUM · ACTIVE')).toHaveCount(0);
    await expect(page.getByText('Unlock perks at this Verified venue')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Unlock Bytspot Platinum perks for this venue' })).toHaveCount(0);
  });
});
