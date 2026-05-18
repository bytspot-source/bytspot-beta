import { expect, type Page, test } from '@playwright/test';

const REVIEW_VENUES = [
  {
    id: 'review-venue-1',
    name: 'Review Rooftop',
    slug: 'review-rooftop',
    address: '123 Peachtree St NE',
    lat: 33.789,
    lng: -84.384,
    category: 'bar',
    imageUrl: null,
    entryType: 'free',
    crowd: { level: 2, label: 'Active', waitMins: 4, recordedAt: new Date().toISOString() },
    parking: { totalAvailable: 8, spots: [] },
    hardwarePatch: { id: 'review-patch-123', uid: '04AABBCCDDEE' },
  },
];

async function installReviewMocks(page: Page) {
  await page.addInitScript((venues) => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_auth_token', 'review-consumer-token');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'review-user', email: 'reviewer@example.com', name: 'Apple Reviewer' }));
    localStorage.setItem('bytspot_user_name', 'Apple Reviewer');
    (window as unknown as { __BYT_APP_STORE_CONSUMER_ONLY__?: boolean }).__BYT_APP_STORE_CONSUMER_ONLY__ = true;
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

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
  }, REVIEW_VENUES);
  await page.setViewportSize({ width: 820, height: 1180 });
}

test.describe('Apple Review simulation', () => {
  test.beforeEach(async ({ page }) => {
    await installReviewMocks(page);
  });

  test('iPad reviewer can use Parker home, voice fallback, and legal routes', async ({ page }) => {
    const crowdStreamRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/venues/crowd/stream')) crowdStreamRequests.push(request.url());
    });

    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab', { name: 'Discover tab' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Map tab' })).toBeVisible();
    const serviceRail = page.getByTestId('home-recommended-nearby-rail');
    await expect(serviceRail).toBeVisible();
    await expect(serviceRail).toContainText('Recommended near you');
    await expect(serviceRail).toContainText('Chef Maria’s Table');
    await expect(serviceRail).toContainText('Book for Tonight');
    await expect(serviceRail).not.toContainText(/Valet/i);
    await expect(page.getByTestId('home-priority-planning-section')).toHaveCount(0);
    await expect(page.getByText(/Es =|App Store risk|Compliance level|priority score/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Voice input' })).toBeVisible();
    await page.getByRole('button', { name: 'Voice input' }).click();
    await expect(page.getByRole('status')).toContainText(/Voice input is not available|could not start/i);
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
    expect(crowdStreamRequests).toHaveLength(0);
  });

  test('iPhone reviewer sees consumer cards without tier labels or internal planning UI', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/');

    await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
    const serviceRail = page.getByTestId('home-recommended-nearby-rail');
    await expect(serviceRail).toBeVisible();
    await expect(serviceRail).toContainText('Recommended near you');
    await expect(serviceRail).toContainText('Chef Maria’s Table');
    await expect(serviceRail).toContainText('Zen Haven Mobile Spa');
    await expect(serviceRail).not.toContainText(/Valet/i);
    await expect(page.locator('body')).not.toContainText(/Tier 1|Tier 2|Tier 3|Explorer|Insider Pick|Insider Deal|VIP Only|VIP Valet|VIP Curated|Basic card|Enhanced card|Premium card/i);
    await expect(page.getByTestId('home-priority-planning-section')).toHaveCount(0);
    await expect(page.getByText(/Es =|App Store risk|Compliance level|priority score/i)).toHaveCount(0);

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  });

  test('App Clip or NFC deep link opens Parker map tap/scan flow without internal routes', async ({ page }) => {
    await page.goto('/p/review-patch-123?venue=Review%20Rooftop');
    await expect(page.getByRole('tab', { name: 'Map tab' })).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
    await expect(page.getByText(/Confirm intent to read|Tap \/ Scan needs attention|Tap \/ Scan not supported here/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Provider|Vendor|Admin|Dashboard|Internal Ops/i)).toHaveCount(0);
  });

  for (const path of ['/provider', '/vendor', '/host', '/admin', '/admin/approvals'] as const) {
    test(`${path} stays hidden from Apple Review`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByText(/Provider approvals|Bytspot Admin|Provider business/i)).toHaveCount(0);
    });
  }
});