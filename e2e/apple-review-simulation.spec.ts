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
    localStorage.setItem('bytspot_auth_token', 'guest_session');
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
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('tab', { name: 'Discover tab' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Map tab' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Voice input' })).toBeVisible();
    await page.getByRole('button', { name: 'Voice input' }).click();
    await expect(page.getByRole('status')).toContainText(/Voice input is not available|could not start/i);
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
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