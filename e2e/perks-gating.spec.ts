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

test.use({
  geolocation: { latitude: TEST_COORDS.lat, longitude: TEST_COORDS.lng },
  permissions: ['geolocation'],
});

async function installMocks(page: Page, opts: { isPremium: boolean }) {
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
  await page.addInitScript(({ venue, coords, isPremium }) => {
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

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('nominatim.openstreetmap.org/reverse')) {
        return new Response(JSON.stringify({ address: { city: 'Atlanta' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);

      const match = url.match(/\/trpc\/([^?]+)/);
      const procedures = match ? match[1].split(',') : ['unknown'];
      const results = procedures.map((p) => {
        if (p.includes('venues.list')) return { result: { data: { venues: [venue] } } };
        if (p.includes('subscription.status')) return { result: { data: { isPremium } } };
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
  }, { venue: VERIFIED_VENUE, coords: TEST_COORDS, isPremium: opts.isPremium });
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
});
