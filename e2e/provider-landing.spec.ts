import { expect, type Page, test } from '@playwright/test';

// Phase 3 acceptance: the Provider shell renders on /provider and /vendor without
// requiring Parker home code, on the 393px target viewport, with full a11y semantics.

async function installProviderLandingMocks(page: Page) {
  await page.addInitScript(() => {
    // Skip onboarding gates so the path-level route handler runs unimpeded.
    localStorage.setItem('bytspot_onboarding_seen', 'true');

    // Block service-worker registration so PWA install logic stays deterministic.
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

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);
      const match = url.match(/\/trpc\/([^?]+)/);
      const procedures = match ? match[1].split(',') : ['unknown'];
      const results = procedures.map(() => ({ result: { data: null } }));
      const payload = procedures.length === 1 ? results[0] : results;
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  });
}

test.describe('Provider landing route', () => {
  test.beforeEach(async ({ page }) => {
    await installProviderLandingMocks(page);
  });

  test('renders responsive iPhone and iPad layouts without overflow', async ({ page }) => {
    const viewports = [
      { name: 'iPhone', width: 393, height: 852, expectsTabletGrid: false },
      { name: 'iPad', width: 820, height: 1180, expectsTabletGrid: true },
    ];
    const measuredIconWidths: number[] = [];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/provider');
      await expect(page.getByTestId('provider-landing-root')).toBeVisible({ timeout: 15_000 });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${viewport.name} should not scroll sideways`).toBeLessThanOrEqual(0);

      await expect(page.getByTestId('provider-role-tile-parking')).toHaveAttribute('aria-checked', 'true');
      const parkingIcon = await page.getByTestId('provider-role-icon-parking').boundingBox();
      expect(parkingIcon?.width, `${viewport.name} role icon width`).toBeGreaterThan(24);
      measuredIconWidths.push(parkingIcon?.width ?? 0);

      await page.getByTestId('provider-role-tile-venue').click();
      await expect(page.getByTestId('provider-role-tile-venue')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('provider-start-cta')).toHaveAccessibleName('Start Venue Vendor onboarding');

      if (viewport.expectsTabletGrid) {
        const [parking, venue] = await Promise.all([
          page.getByTestId('provider-role-tile-parking').boundingBox(),
          page.getByTestId('provider-role-tile-venue').boundingBox(),
        ]);
        expect(parking?.y).toBeCloseTo(venue?.y ?? 0, 0);
        expect((venue?.x ?? 0) - (parking?.x ?? 0)).toBeGreaterThan(120);
      }
    }

    expect(measuredIconWidths[1], 'iPad role icon should scale up from iPhone').toBeGreaterThan(measuredIconWidths[0]);
  });

  for (const path of ['/provider', '/vendor'] as const) {
    test(`${path} renders the Provider shell at 393px`, async ({ page }) => {
      await page.setViewportSize({ width: 393, height: 852 });
      await page.goto(path);

      const root = page.getByTestId('provider-landing-root');
      await expect(root).toBeVisible({ timeout: 15_000 });

      // Single h1 (heading hierarchy) with the marketing headline.
      await expect(page.getByRole('heading', { level: 1, name: /Onboard fast\. Start earning\./ })).toBeVisible();

      // The role group is a proper radiogroup with four radios.
      const radiogroup = page.getByRole('radiogroup', { name: /Choose what you want to launch/i });
      await expect(radiogroup).toBeVisible();
      await expect(radiogroup.getByRole('radio')).toHaveCount(4);

      // Default selection is "Parking Host" (aria-checked + visible CTA label).
      await expect(page.getByTestId('provider-role-tile-parking')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('provider-start-cta')).toHaveAccessibleName('Start Parking Host onboarding');

      // No horizontal overflow at 393px.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('keyboard arrow navigation moves selection through role tiles', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/provider');
    await expect(page.getByTestId('provider-landing-root')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('provider-role-tile-parking').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('provider-role-tile-venue')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('provider-start-cta')).toHaveAccessibleName('Start Venue Vendor onboarding');

    await page.keyboard.press('End');
    await expect(page.getByTestId('provider-role-tile-service')).toHaveAttribute('aria-checked', 'true');

    await page.keyboard.press('Home');
    await expect(page.getByTestId('provider-role-tile-parking')).toHaveAttribute('aria-checked', 'true');
  });

  test('clicking Start CTA navigates to /provider/onboarding and persists the selected role', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/provider');
    await expect(page.getByTestId('provider-landing-root')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('provider-role-tile-event').click();
    await expect(page.getByTestId('provider-role-tile-event')).toHaveAttribute('aria-checked', 'true');

    // Don't follow the route into HostApp here — just confirm the navigation contract.
    await page.getByTestId('provider-start-cta').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/provider/onboarding');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_provider_role'))).toBe('event');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_provider_entry_source'))).toBe('provider-route');
  });

  test('back-to-Parker control is announced for screen readers', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/vendor');
    await expect(page.getByTestId('provider-landing-root')).toBeVisible({ timeout: 15_000 });

    const back = page.getByTestId('provider-back-cta');
    await expect(back).toBeVisible();
    await expect(back).toHaveAccessibleName(/Back to Parker consumer app/i);

    await back.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  });
});
