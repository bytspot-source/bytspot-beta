import { test, expect } from '@playwright/test';

/**
 * WS-Social Phase 1 — Find friends (contact graph) visual capture.
 *
 * Seeds a guest session, mocks the social.suggestions tRPC query with a ranked
 * set of contact-graph matches, then navigates Home → Profile → Friends and
 * screenshots the new "Find friends" card on the iPhone 14 (mobile-safari)
 * viewport so the React slice can be verified against the native parity target.
 */

/** Ranked suggestions mirroring the server sort: mutual → contacts-in-common →
 *  shared verified spots → plain source. */
const MOCK_SUGGESTIONS = [
  { userId: 'u-mutual', name: 'Maya Chen', profileImage: null, source: 'apple', mutual: true, mutualContacts: 4, sharedVerifiedVenues: 2 },
  { userId: 'u-common-3', name: 'Devon Parker', profileImage: null, source: 'apple', mutual: false, mutualContacts: 3, sharedVerifiedVenues: 1 },
  { userId: 'u-common-1', name: 'Sofia Russo', profileImage: null, source: 'apple', mutual: false, mutualContacts: 1, sharedVerifiedVenues: 0 },
  { userId: 'u-venue-2', name: 'Liam Brooks', profileImage: null, source: 'apple', mutual: false, mutualContacts: 0, sharedVerifiedVenues: 2 },
  { userId: 'u-source', name: 'Priya Nair', profileImage: null, source: 'google', mutual: false, mutualContacts: 0, sharedVerifiedVenues: 0 },
];

/** Mock tRPC fetch + EventSource so the capture never depends on a live backend. */
async function mockApi(page: import('@playwright/test').Page) {
  await page.addInitScript((suggestions) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);

      const match = url.match(/\/trpc\/([^?]+)/);
      const procedures = match ? match[1].split(',') : ['unknown'];
      const results = procedures.map((procedure) => {
        if (procedure.includes('social.suggestions')) return { result: { data: { items: suggestions } } };
        if (procedure.includes('social.following')) return { result: { data: [] } };
        if (procedure.includes('venues.list')) return { result: { data: { venues: [] } } };
        if (procedure.includes('auth.me')) return { result: { data: { referralCount: 0 } } };
        if (procedure.includes('subscription.status')) return { result: { data: { isPremium: false } } };
        if (procedure.includes('providers.getStatus')) return { result: { data: { host: null } } };
        if (procedure.includes('patch.revocations.list')) return { result: { data: { revokedIds: [], fetchedAt: new Date().toISOString() } } };
        return { result: { data: null } };
      });
      const payload = procedures.length === 1 ? results[0] : results;
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
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
  }, MOCK_SUGGESTIONS);
}

async function getToMainApp(page: import('@playwright/test').Page) {
  await mockApi(page);
  await page.addInitScript((suggestions) => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_auth_token', 'guest_session');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'guest', name: 'Guest' }));
    localStorage.setItem('bytspot_user_name', 'Guest');
    void suggestions;
  }, MOCK_SUGGESTIONS);
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1200);
}

// Pin an iPhone-14-sized mobile viewport so the capture matches the native
// slice regardless of which browser project runs it (chromium or webkit).
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

test.describe('WS-Social Phase 1 — Find friends card', () => {
  test('routes Profile summary cards to the native panel bridge when available', async ({ page }) => {
    await getToMainApp(page);
    await page.evaluate(() => {
      (window as any).__nativeProfilePanelMessages = [];
      (window as any).webkit = {
        messageHandlers: {
          bytspotNativeProfilePanel: {
            postMessage: (payload: unknown) => (window as any).__nativeProfilePanelMessages.push(payload),
          },
        },
      };
    });

    await page.getByRole('button', { name: 'Open profile' }).click({ force: true });

    await page.getByTestId('profile-reservations-summary').evaluate((element) => (element as HTMLElement).click());
    await expect.poll(() => page.evaluate(() => (window as any).__nativeProfilePanelMessages.map((message: any) => message.panel))).toEqual(['reservations']);
    await expect(page.getByTestId('profile-parking-reservations')).toHaveCount(0);

    await page.getByTestId('profile-access-summary').evaluate((element) => (element as HTMLElement).click());
    await expect.poll(() => page.evaluate(() => (window as any).__nativeProfilePanelMessages.map((message: any) => message.panel))).toEqual(['reservations', 'access']);
    await expect(page.getByTestId('profile-access-wallet')).toHaveCount(0);
  });

  test('renders the contact-graph card with ranked suggestions on Profile → Friends', async ({ page }) => {
    await getToMainApp(page);

    // Open the Profile/Account screen.
    await page.getByRole('button', { name: 'Open profile' }).click({ force: true });

    // The major destinations live as top summary cards now, not duplicate menu rows.
    await expect(page.getByTestId('profile-menu-my-access')).toHaveCount(0);
    await expect(page.getByTestId('profile-menu-my-reservations')).toHaveCount(0);

    const accessSummary = page.getByTestId('profile-access-summary');
    await expect(accessSummary).toBeVisible({ timeout: 10_000 });
    await accessSummary.evaluate((element) => (element as HTMLElement).click());
    await expect(page.getByTestId('profile-access-wallet')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /back/i }).click({ force: true });

    const reservationsSummary = page.getByTestId('profile-reservations-summary');
    await expect(reservationsSummary).toBeVisible({ timeout: 10_000 });
    await reservationsSummary.evaluate((element) => (element as HTMLElement).click());
    await expect(page.getByTestId('profile-parking-reservations')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /back/i }).click({ force: true });

    // Navigate into the Friends sub-screen via its menu entry.
    const friendsEntry = page.getByTestId('profile-menu-friends');
    await expect(friendsEntry).toBeVisible({ timeout: 10_000 });
    await friendsEntry.click({ force: true });

    // The Find friends card header + privacy copy must render.
    await expect(page.getByText('Find friends', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/never uploaded or stored/i)).toBeVisible();
    await expect(page.getByText('Sync contacts to find friends')).toBeVisible();

    // Ranked suggestions from the mocked contact graph render with reasons.
    await expect(page.getByText('Maya Chen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Mutual contact').first()).toBeVisible();
    await expect(page.getByText('3 contacts in common')).toBeVisible();
    await expect(page.getByText('1 contact in common')).toBeVisible();
    await expect(page.getByText('2 shared verified spots')).toBeVisible();
    await expect(page.getByText('From your Google contacts')).toBeVisible();
    await expect(page.getByText('MUTUAL').first()).toBeVisible();

    await page.waitForTimeout(600); // settle the card entrance animation
    await page.screenshot({ path: 'test-results/social-find-friends-card.png', fullPage: false });
  });
});
