import { expect, test, type Locator, type Page } from '@playwright/test';

const MOCK_VENUES = [
  {
    id: 'station-colony-square',
    name: 'Colony Square',
    slug: 'colony-square',
    address: '1197 Peachtree St NE',
    lat: 33.7878,
    lng: -84.3832,
    category: 'market',
    imageUrl: null,
    hardwarePatch: { id: 'patch-colony-square' },
    crowd: { level: 4, label: 'Packed', waitMins: 7, recordedAt: new Date().toISOString() },
    parking: { totalAvailable: 12, spots: [] },
  },
];

async function mockConsumerApis(page: Page) {
  await page.addInitScript((mockVenues) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);

      const match = url.match(/\/trpc\/([^?]+)/);
      const procedures = match ? match[1].split(',') : ['unknown'];
      const results = procedures.map((procedure) => {
        if (procedure.includes('venues.list')) return { result: { data: { venues: mockVenues } } };
        if (procedure.includes('subscription.status')) return { result: { data: { isPremium: false } } };
        if (procedure.includes('auth.me')) return { result: { data: { referralCount: 0 } } };
        if (procedure.includes('providers.getStatus')) return { result: { data: { host: null } } };
        if (procedure.includes('patch.revocations.list')) return { result: { data: { revokedIds: [] } } };
        if (procedure.includes('social.venueCheckins')) return { result: { data: { items: [] } } };
        return { result: { data: null } };
      });

      return new Response(JSON.stringify(procedures.length === 1 ? results[0] : results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }, MOCK_VENUES);
}

async function openMapTab(page: Page) {
  await mockConsumerApis(page);
  await page.addInitScript(() => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_auth_token', 'guest_session');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'guest', name: 'Guest' }));
    localStorage.setItem('bytspot_user_name', 'Guest');
  });
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible();
  await page.getByRole('tab', { name: 'Map tab' }).click();
  await expect(page.getByRole('tab', { name: 'Map tab' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('dialog', { name: 'Map Functions' })).toBeHidden();
}

async function topOf(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!.y;
}

async function activateHiddenControl(locator: Locator) {
  await locator.evaluate((node) => (node as HTMLElement).click());
}

test.describe('Map Spatial Intelligence sheet', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test('partnered mode owns the viewport and can dismiss back to browse', async ({ page }) => {
    await openMapTab(page);

    await expect(page.getByTestId('spatial-intelligence-sheet')).toBeHidden();
    await expect(page.getByTestId('tap-scan-fab')).toBeVisible();
    await expect(page.getByTestId('map-horizontal-filter-rail')).toBeHidden();
    await expect(page.getByTestId('orange-navigation-fab')).toBeHidden();
    await expect(page.getByPlaceholder('Search destination or service type')).toBeVisible();
    await expect(page.getByTestId('map-right-action-stack')).toHaveCSS('pointer-events', 'auto');

    await activateHiddenControl(page.getByTestId('partnered-vendors-patch-button'));

    const sheet = page.getByTestId('spatial-intelligence-sheet');
    const toggle = page.getByTestId('spatial-sheet-toggle');
    await expect(sheet).toBeVisible();
    await expect(page.getByText('Partnered Tap Zones')).toBeVisible();
    await expect(page.getByText('Colony Square').first()).toBeVisible();
    await expect(sheet).toContainText('Crowd Level · Packed');
    await expect(sheet).toContainText('7 min wait');
    await expect(page.getByTestId('smart-parking-live-rail')).toBeHidden();
    await expect(page.getByText(/Parking ·/)).toBeHidden();
    await expect(page.getByTestId('tap-scan-fab')).toBeHidden();
    await expect(page.getByTestId('map-horizontal-filter-rail')).toBeHidden();
    await expect(page.getByTestId('orange-navigation-fab')).toBeHidden();
    await expect(page.getByPlaceholder('Search destination or service type')).toBeHidden();
    const expandedTop = await topOf(sheet);
    await expect(page.getByTestId('tap-scan-fab')).toBeHidden();

    await toggle.click();
    await page.waitForTimeout(500);
    const peekTop = await topOf(sheet);
    expect(peekTop).toBeGreaterThan(expandedTop + 70);

    await toggle.click();
    await page.waitForTimeout(500);
    const reexpandedTop = await topOf(sheet);
    expect(reexpandedTop).toBeLessThan(peekTop - 70);

    await page.getByTestId('close-nearby-intelligence-sheet').click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Partnered Tap Zones')).toBeHidden();
    await expect(page.getByTestId('tap-scan-fab')).toBeVisible();
  });

  test('consolidates all filters and overlays into the Map Layers menu', async ({ page }) => {
    await openMapTab(page);
    const rightActionStack = page.getByTestId('map-right-action-stack');
    await expect(page.getByTestId('map-horizontal-filter-rail')).toBeHidden();
    await expect(rightActionStack).toHaveCSS('pointer-events', 'auto');

    await activateHiddenControl(page.locator('button[aria-label="Map layers"]'));
    const layersMenu = page.getByTestId('map-layers-menu');
    await expect(layersMenu).toBeVisible();
    await expect(rightActionStack).toHaveCSS('pointer-events', 'auto');
    await expect(rightActionStack).toHaveCSS('opacity', '1');
    await expect(layersMenu).not.toContainText('checkbox');
    await expect(page.getByRole('checkbox', { name: /Tap Zones/ })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Verified partners only/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Entry/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: /Category/ })).toHaveAttribute('aria-expanded', 'false');

    await page.getByRole('button', { name: /Entry/ }).click();
    const freeEntry = page.getByRole('checkbox', { name: /Free/ });
    await expect(freeEntry).toBeVisible();
    await freeEntry.click();
    await expect(freeEntry).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: /Category/ }).click();
    const diningCategory = page.getByRole('checkbox', { name: /Dining/ });
    await expect(diningCategory).toBeVisible();
    await diningCategory.click();
    await expect(diningCategory).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: /Vibe/ }).click();
    const chillVibe = page.getByRole('checkbox', { name: /Chill/ });
    const activeVibe = page.getByRole('checkbox', { name: /Active/ });
    await expect(chillVibe).toBeVisible();
    await expect(activeVibe).toBeVisible();
    await chillVibe.click();
    await expect(chillVibe).toHaveAttribute('aria-checked', 'true');
    await activeVibe.click();
    await expect(activeVibe).toHaveAttribute('aria-checked', 'true');
    await expect(chillVibe).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('button', { name: /Live info/ }).click();
    await page.getByRole('checkbox', { name: /Traffic/ }).click();
    await expect(layersMenu).toBeHidden();
    await expect(page.getByText('Traffic Intel')).toBeVisible();
    await expect(page.getByPlaceholder('Search destination or service type')).toBeHidden();
    await expect(page.getByTestId('tap-scan-fab')).toBeHidden();
    await expect(rightActionStack).toHaveCSS('pointer-events', 'none');
    await expect(rightActionStack).toHaveAttribute('aria-hidden', 'true');
  });

  test('keeps dropped-location request mode focused on service intent', async ({ page }) => {
    await openMapTab(page);

    await page.locator('.leaflet-container').click({ button: 'right' });
    await expect(page.getByText('Request Service at This Location')).toBeVisible();
    await expect(page.getByText('Dropped request pin')).toBeHidden();
    await expect(page.getByRole('radio', { name: /White-Glove Valet Pickup/ })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Private Chef Delivery/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Concierge Request/ })).toBeVisible();
    await expect(page.getByTestId('orange-navigation-fab')).toBeHidden();
    await expect(page.getByTestId('tap-scan-fab')).toBeHidden();

    const rightActionStack = page.getByTestId('map-right-action-stack');
    await expect(rightActionStack).toHaveCSS('pointer-events', 'none');
    await expect(rightActionStack).toHaveCSS('opacity', '0');
    await expect(rightActionStack).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('map-layers-menu')).toBeHidden();
  });

  test('secondary Map tools expose Service Here at the current location', async ({ page }) => {
    await openMapTab(page);

    await page.getByRole('tab', { name: 'Map tab' }).click();
    await expect(page.getByRole('dialog', { name: 'Map Functions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My Location' })).toBeHidden();
    await page.getByRole('button', { name: 'Service Here' }).click();

    const requestFlow = page.getByTestId('dropped-location-request-flow');
    await expect(requestFlow).toBeVisible();
    await expect(requestFlow).toContainText('Request Service at This Location');
    await expect(requestFlow).toContainText('White-Glove Valet Pickup');
    await expect(page.getByPlaceholder('Search destination or service type')).toBeHidden();
  });

  test('hides right action stack while Traffic Intelligence panel is active', async ({ page }) => {
    await openMapTab(page);

    const rightActionStack = page.getByTestId('map-right-action-stack');
    await expect(rightActionStack).toHaveCSS('pointer-events', 'auto');

    await activateHiddenControl(page.getByTestId('traffic-intelligence-fab'));
    const trafficPanel = page.getByTestId('traffic-intelligence-panel');
    await expect(trafficPanel).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Traffic Intelligence' })).toBeVisible();
    await expect(rightActionStack).toHaveCSS('pointer-events', 'none');
    await expect(rightActionStack).toHaveCSS('opacity', '0');
    await expect(rightActionStack).toHaveAttribute('aria-hidden', 'true');

    const html = await trafficPanel.evaluate((node) => node.outerHTML);
    expect(html).not.toMatch(/bg-\[#1C1C1E\]\/95|bg-\[#0B0B0F\]\/96|bg-\[#080A10\]\/92/);
    expect(html).not.toMatch(/bg-black\/20|bg-white\/10|bg-white\/\[0\.05\]|backdrop-blur/);
    expect(html).not.toMatch(/border-white\/16|border-white\/18|text-white\/(55|58|65|70)/);
  });

  test('renders LIVE hotspot markers when live event or heatmap layers are active', async ({ page }) => {
    await openMapTab(page);

    await expect(page.locator('.leaflet-marker-icon').filter({ hasText: 'LIVE' }).first()).toBeVisible();
  });

  test('uses high-contrast Spatial sheet surfaces without muddy translucent panel classes', async ({ page }) => {
    await openMapTab(page);
    await activateHiddenControl(page.getByTestId('partnered-vendors-patch-button'));

    const html = await page.getByTestId('spatial-sheet-surface').evaluate((node) => node.outerHTML);
    expect(html).not.toMatch(/bg-\[#1C1C1E\]\/95|bg-\[#0B0B0F\]\/96|bg-\[#080A10\]\/92/);
    expect(html).not.toMatch(/bg-black\/20|bg-white\/10|bg-white\/\[0\.05\]|backdrop-blur/);
    expect(html).not.toMatch(/border-white\/16|border-white\/18|text-white\/(55|58|65|70)/);
  });
});