import { expect, type Page, test } from '@playwright/test';

type SyncOnboardingResponse = {
  vendor?: {
    id: string;
    displayName: string;
    stripeAccountId: string | null;
    onboardingStatus: string;
    updatedAt: string;
  } | null;
  account?: {
    id: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    disabledReason?: string | null;
  } | null;
};

const VENDOR_NAME = 'Midtown Hosts';
const STRIPE_CONNECT_URL = 'https://connect.stripe.com/setup/e/acct_test_onboarding';

const notConnectedSync: SyncOnboardingResponse = {
  vendor: { id: 'vendor-1', displayName: VENDOR_NAME, stripeAccountId: null, onboardingStatus: 'pending', updatedAt: new Date().toISOString() },
  account: null,
};

const payoutsEnabledSync: SyncOnboardingResponse = {
  vendor: { id: 'vendor-1', displayName: VENDOR_NAME, stripeAccountId: 'acct_123', onboardingStatus: 'active', updatedAt: new Date().toISOString() },
  account: { id: 'acct_123', chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, disabledReason: null },
};

const actionRequiredSync: SyncOnboardingResponse = {
  vendor: { id: 'vendor-1', displayName: VENDOR_NAME, stripeAccountId: 'acct_123', onboardingStatus: 'pending', updatedAt: new Date().toISOString() },
  account: { id: 'acct_123', chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: false, disabledReason: 'requirements.past_due' },
};

declare global {
  interface Window {
    __BYT_E2E_TRPC_MOCKS__?: Record<string, unknown>;
    __BYT_E2E_TRPC_CALLS__?: Array<{ procedure: string; input: unknown }>;
    __recordStartOnboarding?: (payload: unknown) => void;
  }
}

async function installVendorOnboardingMocks(page: Page, syncResult: SyncOnboardingResponse) {
  await page.addInitScript(({ vendorName, sync, connectUrl }) => {
    localStorage.setItem('bytspot_auth_token', 'vendor-test-token');
    localStorage.setItem('bytspot_onboarding_seen', 'true');
    localStorage.setItem('bytspot_user_name', vendorName);
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'user-1', name: vendorName, businessName: vendorName }));

    if ('serviceWorker' in navigator) {
      try {
        Object.defineProperty(navigator, 'serviceWorker', {
          configurable: true,
          value: { register: () => Promise.reject(new Error('disabled-in-test')), getRegistration: () => Promise.resolve(undefined), getRegistrations: () => Promise.resolve([]), addEventListener: () => undefined, removeEventListener: () => undefined, ready: new Promise(() => undefined) },
        });
      } catch { /* ignore */ }
    }

    window.__BYT_E2E_TRPC_CALLS__ = [];
    window.__BYT_E2E_TRPC_MOCKS__ = {
      'vendors.syncOnboarding': sync,
      'vendors.startOnboarding': {
        url: connectUrl,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        vendor: { id: 'vendor-1', displayName: vendorName, stripeAccountId: 'acct_123', onboardingStatus: 'pending', updatedAt: new Date().toISOString() },
      },
      'providers.getStatus': { host: { id: 'host-e2e', status: 'approved', onboardingData: {} } },
      'subscription.status': { isPremium: true, isVendorPremium: true, isValetPremium: false, availablePoints: 0, subscriptionOffers: {} },
    };

    const readJsonBody = (body: BodyInit | null | undefined): unknown => {
      if (typeof body !== 'string') return null;
      try { return JSON.parse(body); } catch { return body; }
    };
    const firstJsonInput = (body: unknown): unknown => {
      if (!body || typeof body !== 'object') return body;
      const record = body as Record<string, any>;
      if ('json' in record) return record.json;
      if (Array.isArray(body)) return firstJsonInput(body[0]);
      const firstValue = record[Object.keys(record)[0]];
      return firstValue && typeof firstValue === 'object' && 'json' in firstValue ? firstValue.json : body;
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes('/trpc/')) return originalFetch(input as RequestInfo | URL, init);
      const match = url.match(/\/trpc\/([^?]+)/);
      const procedures = match ? match[1].split(',') : ['unknown'];
      const body = readJsonBody(init?.body);
      const jsonInput = firstJsonInput(body);
      const results = procedures.map((procedure) => {
        window.__BYT_E2E_TRPC_CALLS__?.push({ procedure, input: jsonInput });
        if (procedure.includes('vendors.startOnboarding')) window.__recordStartOnboarding?.(jsonInput);
        const key = Object.keys(window.__BYT_E2E_TRPC_MOCKS__ ?? {}).find((name) => procedure.includes(name));
        return { result: { data: key ? window.__BYT_E2E_TRPC_MOCKS__?.[key] : null } };
      });
      return new Response(JSON.stringify(procedures.length === 1 ? results[0] : results), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  }, { vendorName: VENDOR_NAME, sync: syncResult, connectUrl: STRIPE_CONNECT_URL });
}

async function openConnectReturn(page: Page) {
  await page.goto('/provider/connect/return');
  await expect(page.getByTestId('stripe-connect-payout-panel')).toBeVisible({ timeout: 15_000 });
}

test.describe('Vendor Stripe Connect onboarding', () => {
  test('shows not connected payout state and starts Stripe onboarding with vendor display name', async ({ page }) => {
    const startPayloads: unknown[] = [];
    let capturedStripeUrl: string | null = null;
    await page.exposeFunction('__recordStartOnboarding', (payload: unknown) => startPayloads.push(payload));
    await page.route('https://connect.stripe.com/**', async (route) => {
      capturedStripeUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe Connect</h1>' });
    });
    await installVendorOnboardingMocks(page, notConnectedSync);
    await openConnectReturn(page);

    await expect(page.getByTestId('stripe-connect-status-badge')).toHaveText('Not Connected');
    await expect(page.getByTestId('stripe-connect-onboarding-cta')).toContainText('Connect Stripe for Payouts');

    await page.getByTestId('stripe-connect-onboarding-cta').click();

    await expect.poll(() => startPayloads).toHaveLength(1);
    expect(startPayloads[0]).toMatchObject({ displayName: VENDOR_NAME, refreshPath: '/provider/connect/refresh', returnPath: '/provider/connect/return' });
    await expect.poll(() => capturedStripeUrl).toBe(STRIPE_CONNECT_URL);
  });

  test('syncs active Stripe return state and displays payouts enabled', async ({ page }) => {
    await installVendorOnboardingMocks(page, payoutsEnabledSync);
    await openConnectReturn(page);

    const badge = page.getByTestId('stripe-connect-status-badge');
    await expect(badge).toHaveText('Payouts Enabled');
    await expect(badge).toHaveClass(/text-emerald-100/);
  });

  test('shows action required when Stripe payouts are disabled', async ({ page }) => {
    await installVendorOnboardingMocks(page, actionRequiredSync);
    await openConnectReturn(page);

    const badge = page.getByTestId('stripe-connect-status-badge');
    await expect(badge).toHaveText('Action Required');
    await expect(badge).toHaveClass(/text-amber-100/);
  });
});