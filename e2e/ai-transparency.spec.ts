import { test, expect } from '@playwright/test';

/**
 * E2E coverage for the AI Transparency notice surfaced from the map filter
 * bar. Three assertions:
 *   1. Sparkle button is rendered next to the All Vibes chip.
 *   2. Tapping it opens the dialog and the title references AI / Bytspot AI.
 *   3. Dismissing via "Got it" hides the dialog.
 *
 * Mocks are intentionally minimal: only the tRPC surfaces required to land
 * on the Map tab with at least one venue rendered. NFC / camera APIs are
 * not stubbed since the notice surface is independent of the patch flow.
 */

const TEST_COORDS = { lat: 33.789, lng: -84.384 };

const MOCK_VENUES = [{
  id: 'ai-test-venue-1',
  name: 'Bytspot Verified Demo',
  slug: 'bytspot-verified-demo',
  address: '123 Peachtree St NE',
  lat: TEST_COORDS.lat,
  lng: TEST_COORDS.lng,
  category: 'cafe',
  imageUrl: null,
  entryType: 'free',
  entryPrice: null,
  crowd: { level: 2, label: 'Active', waitMins: 0, recordedAt: '2026-04-25T18:00:00.000Z' },
  parking: { totalAvailable: 8, spots: [] },
  hardwarePatch: { id: 'patch-ai-1', uid: '04A1B2C3D4E5F6', verifiedVenue: true },
}];

test.use({
  geolocation: { latitude: TEST_COORDS.lat, longitude: TEST_COORDS.lng },
  permissions: ['geolocation'],
});

async function installMapMocks(page: import('@playwright/test').Page) {
  await page.addInitScript(({ mockVenues, coords }) => {
    const mockPosition = {
      coords: { latitude: coords.lat, longitude: coords.lng, accuracy: 12 },
      timestamp: Date.now(),
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: (position: typeof mockPosition) => void) => window.setTimeout(() => success(mockPosition), 30),
        watchPosition: (success: (position: typeof mockPosition) => void) => {
          window.setTimeout(() => success(mockPosition), 30);
          return 1;
        },
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
      const results = procedures.map((procedure) => {
        if (procedure.includes('venues.list')) return { result: { data: { venues: mockVenues } } };
        if (procedure.includes('auth.me')) return { result: { data: { referralCount: 0 } } };
        if (procedure.includes('subscription.status')) return { result: { data: { isPremium: false } } };
        if (procedure.includes('social.venueCheckins')) return { result: { data: { items: [] } } };
        return { result: { data: null } };
      });

      return new Response(JSON.stringify(procedures.length === 1 ? results[0] : results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }, { mockVenues: MOCK_VENUES, coords: TEST_COORDS });
}

async function enterMapTab(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('bytspot_onboarding_seen', 'true'));
  await page.goto('/');
  await expect(page.getByText("Let's Go")).toBeVisible({ timeout: 15_000 });
  await page.getByText("Let's Go").click();
  await expect(page.getByText('Continue as Guest')).toBeVisible({ timeout: 10_000 });
  await page.getByText('Continue as Guest').click();

  const mapTab = page.getByRole('tab', { name: 'Map tab' });
  await expect(mapTab).toBeVisible({ timeout: 15_000 });
  await mapTab.click({ force: true });

  // The Map Functions menu may surface; if it does, dismiss to expose the
  // filter bar. Mirrors the dual-attempt pattern in
  // virtual-patch-visual-demo.spec.ts — Playwright's first click occasionally
  // races the AnimatePresence mount, so we fall back to a direct DOM click.
  const mapFunctionsDialog = page.getByRole('dialog', { name: 'Map Functions' });
  if (await mapFunctionsDialog.isVisible().catch(() => false)) {
    const liveVenueDataButton = page.getByRole('button', { name: /Live Venue Data/i });
    await liveVenueDataButton.click({ force: true }).catch(() => {});
    if (await mapFunctionsDialog.isVisible().catch(() => false)) {
      await liveVenueDataButton.evaluate((el: HTMLElement) => el.click()).catch(() => {});
    }
    await expect(mapFunctionsDialog).toBeHidden({ timeout: 10_000 });
  }
}

async function robustClick(locator: import('@playwright/test').Locator) {
  await locator.waitFor({ state: 'attached', timeout: 10_000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await locator.click({ force: true, timeout: 5_000 });
  } catch {
    await locator.evaluate((element: HTMLElement) => element.click());
  }
}

/**
 * Framer Motion's `whileTap` listens on pointer events and occasionally
 * captures the gesture before React's synthetic onClick fires under
 * Playwright. Dispatch the full pointer sequence + native click to make
 * sure the React handler runs deterministically across chromium/webkit.
 */
async function pointerTap(locator: import('@playwright/test').Locator) {
  await locator.waitFor({ state: 'attached', timeout: 10_000 });
  await locator.evaluate((element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerType: 'mouse' };
    element.dispatchEvent(new PointerEvent('pointerdown', opts));
    element.dispatchEvent(new PointerEvent('pointerup', opts));
    element.dispatchEvent(new MouseEvent('click', opts));
  });
}

test('AI Transparency notice opens from the filter-bar sparkle and dismisses cleanly', async ({ page }) => {
  await installMapMocks(page);
  await enterMapTab(page);

  // 1. Sparkle button is rendered next to All Vibes.
  const sparkleButton = page.getByRole('button', { name: 'How Bytspot AI works' });
  await expect(sparkleButton).toBeVisible({ timeout: 15_000 });

  // The notice itself is not in the DOM until the user opens it. Filter the
  // dialog to the AI notice title-region to disambiguate from the optional
  // Map Functions dialog that may already exist in the tree.
  const dialog = page.getByRole('dialog').filter({ hasText: 'What we read' });
  await expect(dialog).toHaveCount(0);

  // 2. Tapping opens the dialog with the expected title and operational copy.
  // Same robustClick fallback the existing visual-demo spec relies on, since
  // the map filter row sometimes intercepts pointer events on first paint.
  await pointerTap(sparkleButton);
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toContainText('How Bytspot AI works');
  await expect(dialog).toContainText('Signals we use');
  // Restates the staff-decides-service invariant from efficiencyScore.ts.
  await expect(dialog).toContainText(/Staff decide service/i);

  // 3. "Got it" closes the dialog. AnimatePresence unmounts on exit.
  await robustClick(dialog.getByRole('button', { name: 'Got it' }));
  await expect(dialog).toBeHidden({ timeout: 10_000 });
});
