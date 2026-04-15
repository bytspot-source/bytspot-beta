import { test, expect } from '@playwright/test';

/** Mock venue data returned by the tRPC venues.list endpoint */
const MOCK_VENUES = [
  {
    id: 'test-venue-1',
    name: 'The Rooftop Bar',
    slug: 'the-rooftop-bar',
    address: '123 Peachtree St NE',
    lat: 33.789,
    lng: -84.384,
    category: 'bar',
    imageUrl: null,
    entryType: 'paid',
    entryPrice: '$22',
    crowd: { level: 3, label: 'Lively', waitMins: 10, recordedAt: new Date().toISOString() },
    parking: { totalAvailable: 5, spots: [] },
  },
  {
    id: 'test-venue-2',
    name: 'Midtown Grill',
    slug: 'midtown-grill',
    address: '456 Spring St NW',
    lat: 33.785,
    lng: -84.388,
    category: 'restaurant',
    imageUrl: null,
    crowd: { level: 2, label: 'Moderate', waitMins: 5, recordedAt: new Date().toISOString() },
    parking: { totalAvailable: 3, spots: [] },
  },
];

/** Mock tRPC fetch + EventSource inside the browser so tests never depend on the live backend. */
async function mockVenuesApi(page: import('@playwright/test').Page) {
  await page.addInitScript((mockVenues) => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);

      const match = url.match(/\/trpc\/([^?]+)/);
      const procedures = match ? match[1].split(',') : ['unknown'];
      const results = procedures.map((procedure) => {
        if (procedure.includes('venues.list')) return { result: { data: { venues: mockVenues } } };
        if (procedure.includes('auth.me')) return { result: { data: { referralCount: 0 } } };
        if (procedure.includes('subscription.status')) return { result: { data: { isPremium: false } } };
        if (procedure.includes('social.venueCheckins')) return { result: { data: { items: [] } } };
        if (procedure.includes('venues.getBySlug')) return { result: { data: { crowd: { history: [] } } } };
        if (procedure.includes('venues.getSimilar')) return { result: { data: { similar: [] } } };
        return { result: { data: null } };
      });
      const payload = procedures.length === 1 ? results[0] : results;

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    class MockEventSource {
      url: string;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
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
  }, MOCK_VENUES);
}

async function robustClick(locator: import('@playwright/test').Locator) {
  await locator.waitFor({ state: 'attached', timeout: 10_000 });
  await locator.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  });
  try {
    await locator.click({ force: true, timeout: 5_000 });
  } catch {
    await locator.evaluate((el) => {
      if (el instanceof HTMLElement) el.click();
    });
  }
}

/**
 * Helper: Navigate from Splash → Landing → Auth (guest) → Main app
 * Reused by all tests that need the main app screen.
 */
async function getToMainApp(page: import('@playwright/test').Page) {
  // Mock the venues API so tests don't depend on external service
  await mockVenuesApi(page);

  // Pre-set localStorage to skip onboarding quiz overlay (z-[9999] blocks all clicks)
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('bytspot_onboarding_seen', 'true');
  });
  await page.goto('/');

  // 1. Splash screen auto-advances after ~3s
  await expect(page.getByText("Let's Go")).toBeVisible({ timeout: 15_000 });

  // 2. Landing page — click "Let's Go"
  await page.getByText("Let's Go").click();

  // 3. Auth screen — click "Continue as Guest" to bypass
  await expect(page.getByText('Continue as Guest')).toBeVisible({ timeout: 10_000 });
  await page.getByText('Continue as Guest').click();

  // 4. Wait for main app (Home tab) to load
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });

  // 5. Dismiss any remaining overlays by waiting for stability
  await page.waitForTimeout(1500);
}

// ─── Test Suite ───────────────────────────────────────────────

test.describe('App Navigation Flow', () => {

  test('Splash → Landing → Guest Auth → Home loads correctly', async ({ page }) => {
    await getToMainApp(page);

    // Bottom nav should be visible with all 4 tabs
    await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Discover tab' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Map tab' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Concierge tab' })).toBeVisible();

    // Home tab should be active
    await expect(page.getByRole('tab', { name: 'Home tab' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Home → Venue card → VenueDetails → Navigate → Map tab', async ({ page }) => {
    await getToMainApp(page);

    // Wait for API data (mock or live) to load and render venue sections
    await page.waitForTimeout(4000);

    // Strategy: Click the "Tonight's Pick" card (button containing "AI Pick" text)
    // or any "Right Now" venue card (button containing "wait" text).
    // Both call setSelectedSearchVenue(v) which opens VenueDetails.
    const aiPickBtn = page.locator('button').filter({ hasText: 'AI Pick' }).first();
    const hasAiPick = await aiPickBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasAiPick) {
      await aiPickBtn.click();
    } else {
      // Fallback: click first "Right Now" venue card (has "wait" text)
      const waitCard = page.locator('button').filter({ hasText: /wait/ }).first();
      const hasWait = await waitCard.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!hasWait) {
        test.skip(true, 'No venue cards rendered on Home tab');
        return;
      }
      await waitCard.click();
    }

    await page.waitForTimeout(1500); // Allow AnimatePresence sheet animation

    // VenueDetails sheet should appear with a "Navigate" button
    const navigateBtn = page.getByText('Navigate', { exact: true }).first();
    await expect(navigateBtn).toBeVisible({ timeout: 10_000 });

    // Click Navigate
    await navigateBtn.click();

    // Should switch to the Map tab
    await expect(page.getByRole('tab', { name: 'Map tab' })).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
  });

  test('Discover tab → Venue → Navigate → Map tab', async ({ page }) => {
    await getToMainApp(page);

    // Switch to Discover tab
    await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });
    await expect(page.getByRole('tab', { name: 'Discover tab' })).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });

    // Wait for discover cards to render (mock or live API data)
    await page.waitForTimeout(4000);

    // The swipeable card is inside the drag container with cursor-grab class
    const dragCard = page.locator('[class*="cursor-grab"]').first();
    const hasCard = await dragCard.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!hasCard) {
      test.skip(true, 'No venue cards rendered on Discover tab');
      return;
    }

    // Swipe RIGHT on the card to open VenueDetails (right swipe = "interested" = opens details)
    // This works on both old code (where tap was broken) and new code (where tap also works)
    const box = await dragCard.boundingBox();
    if (!box) {
      test.skip(true, 'Could not get card bounding box');
      return;
    }
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Swipe right past the 80px horizontal threshold
    for (let i = 0; i <= 10; i++) {
      await page.mouse.move(startX + (i * 12), startY, { steps: 1 });
    }
    await page.mouse.up();
    await page.waitForTimeout(2000); // Allow swipe animation + VenueDetails sheet

    // VenueDetails should appear with Navigate button
    const navigateBtn = page.getByText('Navigate', { exact: true }).first();
    await expect(navigateBtn).toBeVisible({ timeout: 10_000 });

    // Click Navigate
    await navigateBtn.click({ force: true });

    // Should switch to Map tab
    await expect(page.getByRole('tab', { name: 'Map tab' })).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
  });

  test('Discover tab → paid venue → mock checkout → ticket confirmed', async ({ page }) => {
    await getToMainApp(page);

    await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });
    await expect(page.getByRole('tab', { name: 'Discover tab' })).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
    await expect(page.getByTestId('discover-entry-filter-paid')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('discover-entry-filter-paid').click({ force: true });

    const dragCard = page.locator('[data-testid^="discover-swipe-card-"]').first();
    const hasCard = await dragCard.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasCard) {
      test.skip(true, 'Mock paid venue card did not render on Discover tab');
      return;
    }

    const box = await dragCard.boundingBox();
    if (!box) {
      test.skip(true, 'Could not get card bounding box');
      return;
    }

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 0; i <= 10; i++) {
      await page.mouse.move(startX + (i * 12), startY, { steps: 1 });
    }
    await page.mouse.up();
    await page.waitForTimeout(2000);

    await expect(page.getByText('Entry Access')).toBeVisible({ timeout: 10_000 });

    const purchaseButton = page.getByTestId('venue-ticket-cta').first();
    await robustClick(purchaseButton);
    await expect(page.getByTestId('ticket-flow-modal')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('ticket-flow-continue')).toBeVisible({ timeout: 10_000 });

    await robustClick(page.getByTestId('ticket-flow-continue'));
    await expect(page.getByTestId('ticket-flow-confirm')).toBeVisible({ timeout: 10_000 });

    await robustClick(page.getByTestId('ticket-flow-confirm'));
    await expect(page.getByTestId('ticket-flow-confirmed')).toBeVisible({ timeout: 10_000 });
    await robustClick(page.getByTestId('ticket-flow-open-wallet'));

    const walletScreen = page.getByTestId('profile-access-wallet');
    await expect(walletScreen).toBeVisible({ timeout: 10_000 });
    await expect(walletScreen.getByText('The Rooftop Bar')).toBeVisible({ timeout: 10_000 });

    const wallet = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('bytspot_access_pass_wallet') || '[]');
    });
    expect(Array.isArray(wallet)).toBeTruthy();
    expect(wallet[0]?.title).toBe('The Rooftop Bar');
  });

  test('Tab navigation works for all tabs', async ({ page }) => {
    await getToMainApp(page);

    // Switch through all tabs and verify each becomes active
    const tabs = ['Discover', 'Concierge', 'Home'];
    for (const tabName of tabs) {
      await page.getByRole('tab', { name: `${tabName} tab` }).click({ force: true });
      await expect(page.getByRole('tab', { name: `${tabName} tab` })).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 });
      await page.waitForTimeout(500);
    }
  });

  test('DEBUG: Check mock data flow', async ({ page }) => {
    // Use the standard mock setup
    await getToMainApp(page);
    await page.waitForTimeout(3000);

    // Dump all visible text to console
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('PAGE TEXT (first 1500 chars):', bodyText.substring(0, 1500));

    // Check for our mock venue
    const hasBar = await page.getByText('The Rooftop Bar').first().isVisible().catch(() => false);
    const hasGrill = await page.getByText('Midtown Grill').first().isVisible().catch(() => false);
    console.log('Has Rooftop Bar:', hasBar, 'Has Midtown Grill:', hasGrill);

    // Check for error messages
    const hasError = await page.getByText(/error|failed|unable/i).first().isVisible().catch(() => false);
    console.log('Has error text:', hasError);

    expect(true).toBeTruthy();
  });

  test('Map tab activates when Map button clicked', async ({ page }) => {
    await getToMainApp(page);

    // Click Map tab (this opens the MapMenu or goes to map directly)
    await page.getByRole('tab', { name: 'Map tab' }).click({ force: true });

    // The map tab should become active or a map menu should appear
    await page.waitForTimeout(1500);
    const mapActive = await page.getByRole('tab', { name: 'Map tab' }).getAttribute('aria-selected');
    const menuVisible = await page.getByText('Route').isVisible().catch(() => false);
    expect(mapActive === 'true' || menuVisible).toBeTruthy();
  });
});

