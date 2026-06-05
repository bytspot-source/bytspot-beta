import { expect, type Page, test } from '@playwright/test';

const MOCK_VENUES = [
  {
    id: 'launch-venue-1',
    name: 'Launch Rooftop',
    slug: 'launch-rooftop',
    address: '123 Peachtree St NE',
    lat: 33.789,
    lng: -84.384,
    category: 'bar',
    imageUrl: null,
    entryType: 'free',
    crowd: { level: 2, label: 'Active', waitMins: 4, recordedAt: new Date().toISOString() },
    parking: { totalAvailable: 8, spots: [] },
  },
];

async function installCapacitorLaunchMocks(page: Page) {
  await page.addInitScript((venues) => {
    const win = window as Window & typeof globalThis & {
      CapacitorCustomPlatform?: { name: string };
      __BYT_APP_STORE_CONSUMER_ONLY__?: boolean;
      __bytspotGeoCalls?: { getCurrentPosition: number; watchPosition: number };
    };

    win.CapacitorCustomPlatform = { name: 'ios' };
    win.__BYT_APP_STORE_CONSUMER_ONLY__ = true;
    win.__bytspotGeoCalls = { getCurrentPosition: 0, watchPosition: 0 };
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_auth_token', 'guest_session');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'guest', name: 'Guest' }));
    localStorage.setItem('bytspot_user_name', 'Guest');
    localStorage.removeItem('bytspot_native_tab');
    localStorage.removeItem('bytspot_native_focus');

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: () => { win.__bytspotGeoCalls!.getCurrentPosition += 1; },
        watchPosition: () => { win.__bytspotGeoCalls!.watchPosition += 1; return 1; },
        clearWatch: () => {},
      },
    });

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);
      const procedures = (url.match(/\/trpc\/([^?]+)/)?.[1] ?? '').split(',');
      const results = procedures.map((procedure) => {
        if (procedure.includes('venues.list')) return { result: { data: { venues } } };
        if (procedure.includes('auth.me')) return { result: { data: { referralCount: 0 } } };
        if (procedure.includes('subscription.status')) return { result: { data: { isPremium: false } } };
        if (procedure.includes('providers.getStatus')) return { result: { data: { host: null, valet: null } } };
        if (procedure.includes('patch.revocations.list')) return { result: { data: { revokedIds: [], fetchedAt: new Date().toISOString() } } };
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

    class MockEventSource {
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      constructor() {
        window.setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'snapshot', venues: [] }) } as MessageEvent<string>), 0);
      }
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }

    // @ts-expect-error test-only EventSource shim
    window.EventSource = MockEventSource;
  }, MOCK_VENUES);
}

test.describe('Capacitor main app launch', () => {
  test.beforeEach(async ({ page }) => {
    await installCapacitorLaunchMocks(page);
  });

  test('opens the React root as a full-screen app without native bridge chrome', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/');

    await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Back to native')).toHaveCount(0);
    await expect(page.getByText(/Full Home|Discover Web Features|Map Web Tools|Full Profile/i)).toHaveCount(0);

    const launchState = await page.evaluate(() => {
      const root = document.getElementById('root')?.getBoundingClientRect();
      return {
        rootWidth: Math.round(root?.width ?? 0),
        rootHeight: Math.round(root?.height ?? 0),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        nativeTab: localStorage.getItem('bytspot_native_tab'),
        geoCalls: (window as typeof window & { __bytspotGeoCalls?: { getCurrentPosition: number; watchPosition: number } }).__bytspotGeoCalls,
      };
    });

    expect(launchState.rootWidth).toBeGreaterThanOrEqual(launchState.viewportWidth - 1);
    expect(launchState.rootHeight).toBeGreaterThanOrEqual(launchState.viewportHeight - 1);
    expect(launchState.scrollWidth).toBeLessThanOrEqual(launchState.viewportWidth + 1);
    expect(launchState.nativeTab).toBeNull();
    expect(launchState.geoCalls).toEqual({ getCurrentPosition: 0, watchPosition: 0 });
  });

  test('routes launch URLs inside React instead of presenting the SwiftUI bridge', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/map');

    await expect(page.getByRole('tab', { name: 'Map tab' })).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
    await expect(page.getByText('Back to native')).toHaveCount(0);
    await expect(page.getByText(/Discover Web Features|Map Web Tools/i)).toHaveCount(0);

    const geoCalls = await page.evaluate(() => (window as typeof window & { __bytspotGeoCalls?: { getCurrentPosition: number; watchPosition: number } }).__bytspotGeoCalls);
    expect(geoCalls).toEqual({ getCurrentPosition: 0, watchPosition: 0 });
  });
});