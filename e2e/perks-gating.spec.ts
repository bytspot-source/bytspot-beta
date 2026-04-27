import { test, expect, type Page } from '@playwright/test';

/**
 * Member Perks gating — Verified venues show perks UI on the map peek card.
 *  • Guest / non-premium → locked teaser → tapping opens PremiumTeaserSheet
 *  • Premium subscriber  → inline "MEMBER PERKS · ACTIVE" panel
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
// Verified venue so it (a) stays inside Leaflet's tight initial viewport
// around the user and (b) renders as a distinct marker that can be selected
// via :not(:has(.byt-verified-glow)). Anything further (e.g. +0.005°, ~500 m)
// risks falling outside the rendered tile area at the default zoom level.
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
const MOCK_STRIPE_CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_e2e_mock_session_abc123';

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
  opts: { isPremium: boolean; venues?: Array<typeof VERIFIED_VENUE | typeof NON_VERIFIED_VENUE> },
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
  await page.addInitScript(({ venues, coords, initialIsPremium, premiumKey, mockCheckoutUrl }) => {
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
        if (p.includes('subscription.createCheckout')) return { result: { data: { url: mockCheckoutUrl } } };
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
  });
}

async function enterMainApp(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('bytspot_onboarding_seen', 'true'));
  await page.goto('/');
  await expect(page.getByText("Let's Go")).toBeVisible({ timeout: 15_000 });
  await page.getByText("Let's Go").click();
  await expect(page.getByText('Continue as Guest')).toBeVisible({ timeout: 10_000 });
  await page.getByText('Continue as Guest').click();
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);
}

/**
 * Resilient post-reload re-entry. After `page.reload()`, the SPA's persisted
 * guest-auth state in localStorage skips the splash + "Continue as Guest"
 * flow and lands directly on the Home tab. enterMainApp() can't handle that
 * because it hard-asserts on "Let's Go". This helper races both states and
 * walks the splash only when it actually appears.
 */
async function ensureMainApp(page: Page) {
  const letsGo = page.getByText("Let's Go");
  const homeTab = page.getByRole('tab', { name: 'Home tab' });
  await Promise.race([
    letsGo.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
    homeTab.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
  ]);
  if (await letsGo.isVisible().catch(() => false)) {
    await letsGo.click();
    await expect(page.getByText('Continue as Guest')).toBeVisible({ timeout: 10_000 });
    await page.getByText('Continue as Guest').click();
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
  const dialog = page.getByRole('dialog', { name: 'Map Functions' });
  const liveVenueData = page.getByRole('button', { name: /Live Venue Data/i });

  await robustClick(mapTab);
  if (!(await dialog.isVisible().catch(() => false))) {
    await mapTab.evaluate((el: HTMLElement) => el.click());
  }
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // The Map Functions dialog is a scrollable Radix sheet — the Live Venue Data
  // button often renders below the fold, which is why a plain click({ force: true })
  // still throws "Element is outside of the viewport". robustClick falls back
  // to a raw HTMLElement.click() that bypasses Playwright's viewport guard.
  await robustClick(liveVenueData);
  if (await dialog.isVisible().catch(() => false)) {
    await liveVenueData.evaluate((el: HTMLElement) => el.click());
  }
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  await page.locator('.leaflet-container').waitFor({ state: 'attached', timeout: 15_000 });
}

async function clickVerifiedMarker(page: Page) {
  // Verified vibe markers carry a `.byt-verified-glow` element inside the Leaflet
  // DivIcon and a "BYT" text badge. The DivIcon container is exposed as a button
  // by Leaflet (role="button" on `.leaflet-marker-icon`), with accessible name
  // assembled from the inner text — for our verified paid venue that's "✓ BYT $22".
  const verifiedMarker = page.locator('.leaflet-marker-icon:has(.byt-verified-glow)').first();
  await expect(verifiedMarker).toBeVisible({ timeout: 15_000 });
  await verifiedMarker.scrollIntoViewIfNeeded().catch(() => {});

  // Leaflet's marker click handler listens for a full mousedown + mouseup + click
  // sequence dispatched on the icon element. A plain Playwright click sometimes
  // doesn't trigger the React-side `setPeekVenue` because Leaflet swallows the
  // synthesized event. Dispatch the full sequence at the marker's visual center
  // and also issue an mouse-coords click as a belt-and-braces fallback so the
  // peek card opens reliably across CI and local runs.
  const box = await verifiedMarker.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await verifiedMarker.evaluate((el: HTMLElement, [x, y]: [number, number]) => {
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
    }, [cx, cy]);
    // Fallback: real mouse click at the same coords if the dispatch didn't take.
    if (!(await page.locator('text=Tap-ready').isVisible().catch(() => false))) {
      await page.mouse.click(cx, cy);
    }
  } else {
    await verifiedMarker.evaluate((el: HTMLElement) => el.click());
  }
}

test.describe('Member Perks gating on Verified venues', () => {
  test('Guest sees locked teaser and tapping it opens the PremiumTeaserSheet', async ({ page }) => {
    await installMocks(page, { isPremium: false });
    await enterMainApp(page);
    await openMapWithLiveVenues(page);
    await clickVerifiedMarker(page);

    // The peek card mounts inside a framer-motion AnimatePresence with a spring
    // transition on opacity + translateY — it can take ~2-3s before the outer
    // wrapper reaches opacity:1, so toBeVisible() must allow for that animation
    // to settle. The Verified-specific perks copy is unique to the peek card, so
    // it doesn't collide with strict-mode duplicate text in Home-tab sections.
    await expect(page.getByText('Unlock perks at this Verified venue')).toBeVisible({ timeout: 15_000 });

    const unlockBtn = page.getByRole('button', { name: 'Unlock Bytspot Premium perks for this venue' });
    await expect(unlockBtn).toBeVisible({ timeout: 5_000 });

    await robustClick(unlockBtn);

    const teaser = page.getByRole('dialog', { name: 'Unlock Bytspot Premium' });
    await expect(teaser).toBeVisible({ timeout: 5_000 });
    await expect(teaser.getByText('Unlock Verified perks')).toBeVisible();
    // Match exact list-item copy — the dialog's headline paragraph also mentions
    // "discounts, skip-the-line entry, and exclusive Tap / Scan rewards", so a
    // loose regex like /Skip-the-line/i would collide with it under strict mode.
    await expect(teaser.getByText('10% off your tab at every Verified venue')).toBeVisible();
    await expect(teaser.getByText('Skip-the-line at participating partners')).toBeVisible();
    await expect(teaser.getByText('Member-only Tap / Scan rewards')).toBeVisible();
  });

  test('Premium subscriber sees "MEMBER PERKS · ACTIVE" inline (no teaser)', async ({ page }) => {
    await installMocks(page, { isPremium: true });
    await enterMainApp(page);
    await openMapWithLiveVenues(page);
    await clickVerifiedMarker(page);

    // Same AnimatePresence spring on the peek card — bumped timeout to 15s.
    await expect(page.getByText('MEMBER PERKS · ACTIVE')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('10% off your tab')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unlock Bytspot Premium perks for this venue' })).toHaveCount(0);
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
    await clickVerifiedMarker(page);

    const unlockBtn = page.getByRole('button', { name: 'Unlock Bytspot Premium perks for this venue' });
    await robustClick(unlockBtn);

    const teaser = page.getByRole('dialog', { name: 'Unlock Bytspot Premium' });
    await expect(teaser).toBeVisible({ timeout: 5_000 });

    // The teaser's primary CTA dispatches handleUpgradeToPremium, which awaits
    // trpc.subscription.createCheckout.mutate() and assigns window.location.href
    // to the returned URL. Current copy is "Upgrade · $9.99 / month"; switching
    // to "Opening checkout…" while the mutation is in flight. Match on the
    // leading "Upgrade" so the regex survives small price/copy tweaks.
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

    // The mock fetch in installMocks synthesizes Response objects inside the page
    // (no real HTTP request leaves the document) so page.waitForRequest can never
    // see the call. Instead, every tRPC procedure name is pushed into a
    // window-scoped tracker — wait for createCheckout to land there.
    await page.waitForFunction(
      () => {
        // @ts-expect-error test-only window slot
        const calls = (window.__BYT_E2E_TRPC_CALLS__ as string[] | undefined) ?? [];
        return calls.some((p) => p.includes('subscription.createCheckout'));
      },
      undefined,
      { timeout: 15_000 },
    );

    // Wait for window.location.href = MOCK_STRIPE_CHECKOUT_URL to land on the
    // stubbed page. page.waitForURL is the right primitive here — it observes
    // the top-level frame navigation triggered by the location assignment.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });
    expect(capturedCheckoutNavigation).not.toBeNull();
    expect(capturedCheckoutNavigation!).toBe(MOCK_STRIPE_CHECKOUT_URL);
  });

  test('Mid-session downgrade: perks block flips to locked teaser after subscription lapses', async ({ page }) => {
    await installMocks(page, { isPremium: true });
    await enterMainApp(page);
    await openMapWithLiveVenues(page);
    await clickVerifiedMarker(page);

    // Confirm the active-perks state rendered first so the downgrade transition
    // is meaningful (i.e. we're not just observing the guest default).
    await expect(page.getByText('MEMBER PERKS · ACTIVE')).toBeVisible({ timeout: 15_000 });

    // Simulate a webhook-driven subscription lapse. The state-driven mock fetch
    // re-reads localStorage[PREMIUM_FLAG_KEY] on every tRPC call, so flipping
    // the flag and forcing a refetch (here via reload) makes the next
    // subscription.status response return isPremium:false without rebuilding
    // the page-init script.
    await page.evaluate((key) => localStorage.setItem(key, 'false'), PREMIUM_FLAG_KEY);
    await page.reload();

    // After reload the persisted guest-auth state usually skips the splash and
    // lands directly on the Home tab, but a cold reload can still surface
    // "Let's Go". ensureMainApp races both states so the test is robust either
    // way.
    await ensureMainApp(page);
    await openMapWithLiveVenues(page);
    await clickVerifiedMarker(page);

    await expect(page.getByText('Unlock perks at this Verified venue')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Unlock Bytspot Premium perks for this venue' })).toBeVisible();
    // Hard guard: the active-perks badge must not leak through after downgrade.
    await expect(page.getByText('MEMBER PERKS · ACTIVE')).toHaveCount(0);
  });

  test('Non-Verified venue: neither active perks nor locked teaser render in the peek card', async ({ page }) => {
    // Render both venues so the map has a Verified and a non-Verified marker
    // simultaneously — this catches selector regressions where the perks block
    // would accidentally key off "any venue" instead of hardwarePatch presence.
    await installMocks(page, {
      isPremium: false,
      venues: [VERIFIED_VENUE, NON_VERIFIED_VENUE],
    });
    await enterMainApp(page);
    await openMapWithLiveVenues(page);

    // Venue markers all carry `.byt-marker-in` inside their Leaflet DivIcon
    // (set by createVibeMarkerIcon); parking, community report, event, and the
    // user-location markers do not. Anchoring on `.byt-marker-in` first
    // restricts the match to venue markers, then `:not(:has(.byt-verified-glow))`
    // picks out the non-Verified one specifically.
    const nonVerifiedMarker = page
      .locator('.leaflet-marker-icon:has(.byt-marker-in):not(:has(.byt-verified-glow))')
      .first();
    await expect(nonVerifiedMarker).toBeVisible({ timeout: 15_000 });

    const box = await nonVerifiedMarker.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await nonVerifiedMarker.evaluate((el: HTMLElement, [x, y]: [number, number]) => {
        const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      }, [cx, cy]);
      if (!(await page.locator(`text=${NON_VERIFIED_VENUE.name}`).isVisible().catch(() => false))) {
        await page.mouse.click(cx, cy);
      }
    }

    // The peek card should still open for the non-Verified venue (it shows the
    // venue name, vibe, and entry price) — we just need the perks-specific UI
    // to be entirely absent. Wait for the venue name to confirm the peek
    // mounted before asserting absence (otherwise the negative assertions
    // would race the AnimatePresence enter transition).
    await expect(page.getByText(NON_VERIFIED_VENUE.name).first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText('MEMBER PERKS · ACTIVE')).toHaveCount(0);
    await expect(page.getByText('Unlock perks at this Verified venue')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Unlock Bytspot Premium perks for this venue' })).toHaveCount(0);
  });
});
