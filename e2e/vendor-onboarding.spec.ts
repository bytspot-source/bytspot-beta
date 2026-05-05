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
const PROVIDER_SERVICE = {
  id: 'svc-1',
  title: 'VIP Arrival',
  description: 'Door-to-table escort with patch verified access',
  priceCents: 15000,
  currency: 'USD',
  durationMins: 90,
  status: 'active',
  updatedAt: new Date('2026-05-03T12:10:00.000Z').toISOString(),
  vendor: { id: 'vendor-1', displayName: VENDOR_NAME, onboardingStatus: 'active' },
  patch: { id: 'patch-1', uid: '04A1B2C3D4E5F6', label: 'VIP Booth' },
  cashFlow: { grossCents: 15000, platformFeeCents: 1200, providerPayoutEstimateCents: 13800, commissionBps: 800 },
};

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
    __BYT_E2E_VENDOR_SERVICES__?: Array<typeof PROVIDER_SERVICE>;
    __recordStartOnboarding?: (payload: unknown) => void;
  }
}

async function installVendorOnboardingMocks(
  page: Page,
  syncResult: SyncOnboardingResponse,
  access?: { role?: 'owner' | 'manager' | 'staff'; businessMode?: 'standard' | 'cottage' },
  options?: { services?: Array<typeof PROVIDER_SERVICE>; bookings?: unknown[]; authToken?: string },
) {
  await page.addInitScript(({ vendorName, sync, connectUrl, providerRole, providerBusinessMode, service, services, bookings, authToken }) => {
    localStorage.setItem('bytspot_auth_token', authToken);
    localStorage.setItem('bytspot_onboarding_seen', 'true');
    localStorage.setItem('bytspot_user_name', vendorName);
    localStorage.setItem('bytspot_provider_role', providerRole);
    localStorage.setItem('bytspot_provider_business_mode', providerBusinessMode);
    localStorage.setItem('bytspot_provider_is_cottage', String(providerBusinessMode === 'cottage'));
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'user-1', name: vendorName, businessName: vendorName, providerRole, providerBusinessMode }));

    if ('serviceWorker' in navigator) {
      try {
        Object.defineProperty(navigator, 'serviceWorker', {
          configurable: true,
          value: { register: () => Promise.reject(new Error('disabled-in-test')), getRegistration: () => Promise.resolve(undefined), getRegistrations: () => Promise.resolve([]), addEventListener: () => undefined, removeEventListener: () => undefined, ready: new Promise(() => undefined) },
        });
      } catch { /* ignore */ }
    }

    window.__BYT_E2E_TRPC_CALLS__ = [];
    window.__BYT_E2E_VENDOR_SERVICES__ = (services ?? [service]) as typeof window.__BYT_E2E_VENDOR_SERVICES__;
    window.__BYT_E2E_TRPC_MOCKS__ = {
      'vendors.syncOnboarding': sync,
      'vendors.listBookings': { bookings: bookings ?? [] },
      'vendors.startOnboarding': {
        url: connectUrl,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        vendor: { id: 'vendor-1', displayName: vendorName, stripeAccountId: 'acct_123', onboardingStatus: 'pending', updatedAt: new Date().toISOString() },
      },
      'providers.getStatus': {
        host: {
          id: 'host-e2e',
          status: 'approved',
          onboardingData: {
            businessInfo: {
              legalName: vendorName,
              taxId: '123456789',
              address: { street: '123 Main Street', city: 'New York', state: 'NY', zipCode: '10001' },
            },
            listing: {
              location: { address: '123 Main Street, New York, NY 10001', coordinates: { lat: 40.7128, lng: -74.006 } },
            },
            payout: { stripeConnect: { status: 'active', onboardingStarted: true } },
          },
        },
      },
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
        if (procedure.includes('vendors.listServices')) return { result: { data: { vendor: sync.vendor, services: window.__BYT_E2E_VENDOR_SERVICES__ ?? [] } } };
        if (procedure.includes('vendors.updateService')) {
          const inputRecord = (jsonInput ?? {}) as Record<string, any>;
          const current = (window.__BYT_E2E_VENDOR_SERVICES__ ?? [service])[0];
          const updated = {
            ...current,
            title: inputRecord.title ?? current.title,
            description: inputRecord.description ?? current.description,
            priceCents: inputRecord.priceCents ?? current.priceCents,
            durationMins: inputRecord.durationMins ?? current.durationMins,
            updatedAt: new Date().toISOString(),
            cashFlow: {
              ...current.cashFlow,
              grossCents: inputRecord.priceCents ?? current.priceCents,
              providerPayoutEstimateCents: Math.round((inputRecord.priceCents ?? current.priceCents) * 0.92),
            },
          };
          window.__BYT_E2E_VENDOR_SERVICES__ = [updated];
          return { result: { data: { service: updated } } };
        }
        const key = Object.keys(window.__BYT_E2E_TRPC_MOCKS__ ?? {}).find((name) => procedure.includes(name));
        return { result: { data: key ? window.__BYT_E2E_TRPC_MOCKS__?.[key] : null } };
      });
      return new Response(JSON.stringify(procedures.length === 1 ? results[0] : results), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  }, {
    vendorName: VENDOR_NAME,
    sync: syncResult,
    connectUrl: STRIPE_CONNECT_URL,
    providerRole: access?.role ?? 'owner',
    providerBusinessMode: access?.businessMode ?? 'standard',
    service: PROVIDER_SERVICE,
    services: options?.services ?? null,
    bookings: options?.bookings ?? null,
    authToken: options?.authToken ?? 'vendor-test-token',
  });
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

  test('curates dashboard navigation for manager cottage businesses', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVendorOnboardingMocks(page, notConnectedSync, { role: 'manager', businessMode: 'cottage' });
    await page.goto('/provider/connect/return');

    await expect(page.getByText('Manager · Cottage')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'My Listings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bookings', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Earnings', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Background Configuration/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Your cottage business is ready for bookings.' })).toBeVisible();
  });

  test('limits staff to operational dashboard without revenue visibility', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVendorOnboardingMocks(page, notConnectedSync, { role: 'staff', businessMode: 'standard' });
    await page.goto('/provider/connect/return');

    await expect(page.getByText('Staff · Standard')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Bookings', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My Listings', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Earnings', exact: true })).toHaveCount(0);
    await expect(page.getByText('Operational role')).toBeVisible();
    await expect(page.getByText('Staff', { exact: true })).toBeVisible();
    await expect(page.getByText('$24,580')).toHaveCount(0);
  });

  test('lets owners edit live vendor service metadata from My Listings', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVendorOnboardingMocks(page, payoutsEnabledSync);
    await page.goto('/provider/connect/return');

    await page.getByRole('button', { name: 'My Listings' }).click();
    await expect(page.getByTestId('provider-services-panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('provider-service-card-svc-1')).toContainText('VIP Arrival');

    await page.getByTestId('provider-service-edit-svc-1').click();
    await expect(page.getByTestId('provider-service-edit-modal')).toBeVisible();
    await page.getByTestId('service-title-input').fill('VIP Arrival Plus');
    await page.getByTestId('service-description-input').fill('Updated provider handoff');
    await page.getByTestId('service-price-input').fill('175.00');
    await page.getByTestId('service-duration-input').fill('120');
    await page.getByTestId('save-service-button').click();

    await expect(page.getByTestId('provider-service-edit-modal')).toBeHidden();
    await expect(page.getByTestId('provider-service-card-svc-1')).toContainText('VIP Arrival Plus');
    await expect(page.getByTestId('provider-service-card-svc-1')).toContainText('$175.00');
    const calls = await page.evaluate(() => window.__BYT_E2E_TRPC_CALLS__ ?? []);
    expect(calls.some((call) => call.procedure.includes('vendors.updateService') && (call.input as any)?.priceCents === 17500)).toBeTruthy();
  });

  test('settings role and business mode controls refresh dashboard access immediately', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVendorOnboardingMocks(page, payoutsEnabledSync);
    await page.goto('/provider/connect/return');

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Owner · Standard')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('provider-role-staff').click();
    await expect(page.getByText('Staff · Standard')).toBeVisible();
    await expect(page.getByRole('button', { name: 'My Listings', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Earnings', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('provider-role-staff')).toHaveClass(/bg-cyan/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_provider_role'))).toBe('staff');

    await page.getByTestId('provider-role-owner').click();
    await page.getByTestId('provider-mode-cottage').click();
    await expect(page.getByText('Owner · Cottage')).toBeVisible();
    await expect(page.getByRole('button', { name: 'My Listings' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_provider_business_mode'))).toBe('cottage');
  });

  test('Patches dashboard links a new patch to a live service from inventory', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVendorOnboardingMocks(page, payoutsEnabledSync);
    // Reset any patches a prior test in the same browser context might have stored.
    await page.addInitScript(() => localStorage.removeItem('bytspot_provider_patches'));
    await page.goto('/provider/connect/return');

    await page.getByRole('button', { name: 'Patches', exact: true }).click();
    await expect(page.getByTestId('provider-patches-form')).toBeVisible({ timeout: 15_000 });

    const select = page.getByTestId('provider-patches-service-select');
    await expect(select).toBeEnabled();
    // Confirm the live service is offered as an option.
    await expect(select.locator('option', { hasText: 'VIP Arrival' })).toHaveCount(1);
    await select.selectOption({ label: 'VIP Arrival' });

    // Preview URL must update with the &service= query param the moment the
    // service is selected, before the patch is even established.
    await expect(page.getByTestId('provider-patches-preview-url')).toContainText('&service=svc-1');

    await page.getByTestId('provider-patches-establish').click();

    const card = page.getByTestId('provider-patches-card').first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId('provider-patches-card-service')).toHaveText('VIP Arrival');
    await expect(card).toContainText('&service=svc-1');

    // Round-trip the localStorage write so the linkage survives reloads.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bytspot_provider_patches') ?? '[]'));
    expect(Array.isArray(stored)).toBe(true);
    expect(stored[0]).toMatchObject({ serviceId: 'svc-1', serviceTitle: 'VIP Arrival' });
    expect(stored[0].url).toContain('&service=svc-1');
  });
});

test.describe('Provider calendar empty-state ladder', () => {
  // Build today's ISO string in the page's local time so the calendar's
  // default selectedDate (todayIso) lines up with mocked booking dates.
  const isoForToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const openCalendar = async (page: Page) => {
    await page.goto('/provider/connect/return');
    await expect(page.getByTestId('stripe-connect-payout-panel')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await expect(page.getByTestId('provider-calendar-selected-card')).toBeVisible({ timeout: 15_000 });
  };

  test('shows the unauth empty state when the dashboard loads with a beta_guest token', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVendorOnboardingMocks(page, payoutsEnabledSync, undefined, { authToken: 'beta_guest' });
    await openCalendar(page);

    await expect(page.getByTestId('provider-calendar-empty-unauth')).toBeVisible();
    await expect(page.getByTestId('provider-calendar-empty-unauth')).toContainText('Sign in to view the live schedule');
    await expect(page.getByTestId('provider-calendar-bookings-list')).toHaveCount(0);
    await expect(page.getByTestId('provider-calendar-empty-no-services')).toHaveCount(0);
    await expect(page.getByTestId('provider-calendar-empty-no-bookings')).toHaveCount(0);
  });

  test('shows the no-services empty state when the vendor has not published any services', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVendorOnboardingMocks(page, payoutsEnabledSync, undefined, { services: [], bookings: [] });
    await openCalendar(page);

    await expect(page.getByTestId('provider-calendar-empty-no-services')).toBeVisible();
    await expect(page.getByTestId('provider-calendar-empty-no-services')).toContainText('No active services yet');
    await expect(page.getByTestId('provider-calendar-bookings-list')).toHaveCount(0);
    await expect(page.getByTestId('provider-calendar-empty-unauth')).toHaveCount(0);
    await expect(page.getByTestId('provider-calendar-empty-no-bookings')).toHaveCount(0);
  });

  test('shows the no-bookings empty state when services exist but the booking feed is empty', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVendorOnboardingMocks(page, payoutsEnabledSync, undefined, { bookings: [] });
    await openCalendar(page);

    await expect(page.getByTestId('provider-calendar-empty-no-bookings')).toBeVisible();
    await expect(page.getByTestId('provider-calendar-empty-no-bookings')).toContainText('No bookings scheduled');
    await expect(page.getByTestId('provider-calendar-empty-no-bookings')).toContainText('1 active service is available');
    await expect(page.getByTestId('provider-calendar-bookings-list')).toHaveCount(0);
    await expect(page.getByTestId('provider-calendar-empty-unauth')).toHaveCount(0);
    await expect(page.getByTestId('provider-calendar-empty-no-services')).toHaveCount(0);
  });

  test('renders live bookings, day markers, and selected-date rows when the booking feed has data', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const todayIso = isoForToday();
    // Use a local-time string (no trailing `Z`) so the browser's `formatIso`
    // (which reads getFullYear/getMonth/getDate locally) maps the booking to
    // `todayIso` regardless of the machine's UTC offset.
    const startsAt = `${todayIso}T18:30:00`;
    const liveBooking = {
      id: 'booking-1',
      startsAt,
      endsAt: `${todayIso}T20:00:00`,
      status: 'confirmed',
      priceCents: 15000,
      currency: 'USD',
      guest: { displayName: 'Avery Hart' },
      patch: { id: 'patch-1', label: 'VIP Booth' },
      service: { id: 'svc-1', title: 'VIP Arrival', priceCents: 15000, currency: 'USD' },
    };
    await installVendorOnboardingMocks(page, payoutsEnabledSync, undefined, { bookings: [liveBooking] });
    await openCalendar(page);

    await expect(page.getByTestId('provider-calendar-bookings-list')).toBeVisible();
    await expect(page.getByTestId('provider-calendar-marker-' + todayIso)).toBeVisible();
    await expect(page.getByTestId('provider-calendar-booking-booking-1')).toBeVisible();
    await expect(page.getByTestId('provider-calendar-booking-title-booking-1')).toHaveText('VIP Arrival');
    await expect(page.getByTestId('provider-calendar-booking-status-booking-1')).toHaveText(/confirmed/i);
    await expect(page.getByTestId('provider-calendar-selected-summary')).toContainText('1 booking');
    await expect(page.getByTestId('provider-calendar-empty-no-bookings')).toHaveCount(0);
    await expect(page.getByTestId('provider-calendar-empty-unauth')).toHaveCount(0);
  });
});

test.describe('Provider earnings empty-state ladder', () => {
  // Today's local-time ISO so the 'completed today' booking lands in the
  // current month bucket regardless of the runner's UTC offset.
  const localIso = (offsetDays = 0, hours = 18, minutes = 30) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  };

  const openEarnings = async (page: Page) => {
    await page.goto('/provider/connect/return');
    await expect(page.getByTestId('stripe-connect-payout-panel')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Earnings', exact: true }).click();
    await expect(page.getByTestId('provider-earnings-review-state')).toBeVisible({ timeout: 15_000 });
  };

  test('shows the unauth empty state when the dashboard loads with a beta_guest token', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVendorOnboardingMocks(page, payoutsEnabledSync, undefined, { authToken: 'beta_guest' });
    await openEarnings(page);

    await expect(page.getByTestId('provider-earnings-empty-unauth')).toBeVisible();
    await expect(page.getByTestId('provider-earnings-empty-unauth')).toContainText('Sign in to view earnings');
    await expect(page.getByTestId('provider-earnings-stats')).toHaveCount(0);
    await expect(page.getByTestId('provider-earnings-empty-no-services')).toHaveCount(0);
    await expect(page.getByTestId('provider-earnings-empty-no-bookings')).toHaveCount(0);
  });

  test('shows the no-services empty state when the vendor has not published any services', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVendorOnboardingMocks(page, payoutsEnabledSync, undefined, { services: [], bookings: [] });
    await openEarnings(page);

    await expect(page.getByTestId('provider-earnings-empty-no-services')).toBeVisible();
    await expect(page.getByTestId('provider-earnings-empty-no-services')).toContainText('No active services yet');
    await expect(page.getByTestId('provider-earnings-stats')).toHaveCount(0);
    await expect(page.getByTestId('provider-earnings-empty-unauth')).toHaveCount(0);
    await expect(page.getByTestId('provider-earnings-empty-no-bookings')).toHaveCount(0);
  });

  test('shows the no-bookings empty state when services exist but the booking feed is empty', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await installVendorOnboardingMocks(page, payoutsEnabledSync, undefined, { bookings: [] });
    await openEarnings(page);

    await expect(page.getByTestId('provider-earnings-empty-no-bookings')).toBeVisible();
    await expect(page.getByTestId('provider-earnings-empty-no-bookings')).toContainText('No bookings yet');
    await expect(page.getByTestId('provider-earnings-stats')).toBeVisible();
    // With no bookings, stats should show zero totals
    await expect(page.getByTestId('provider-earnings-value-pending')).toHaveText('$0');
    await expect(page.getByTestId('provider-earnings-next-payout-value')).toHaveText('$0');
  });

  test('aggregates cashFlow into stat cards and the next-payout total when bookings carry data', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // confirmed today (pending payout, $138 estimate) +
    // completed today (settled, $138 -> total + this month) +
    // cancelled (excluded entirely).
    const bookings = [
      {
        id: 'booking-confirmed', status: 'confirmed', startsAt: localIso(0, 18, 30), endsAt: localIso(0, 20, 0),
        priceCents: 15000, currency: 'USD', guest: { displayName: 'Avery Hart' },
        service: { id: 'svc-1', title: 'VIP Arrival', priceCents: 15000, currency: 'USD' },
        cashFlow: { grossCents: 15000, platformFeeCents: 1200, providerPayoutEstimateCents: 13800, commissionBps: 800 },
      },
      {
        id: 'booking-completed', status: 'completed', startsAt: localIso(0, 12, 0), endsAt: localIso(0, 13, 30),
        priceCents: 15000, currency: 'USD', guest: { displayName: 'Jordan Patel' },
        service: { id: 'svc-1', title: 'VIP Arrival', priceCents: 15000, currency: 'USD' },
        cashFlow: { grossCents: 15000, platformFeeCents: 1200, providerPayoutEstimateCents: 13800, commissionBps: 800 },
      },
      {
        id: 'booking-cancelled', status: 'cancelled', startsAt: localIso(-1, 9, 0), endsAt: localIso(-1, 10, 0),
        priceCents: 8500, currency: 'USD', guest: { displayName: 'Morgan Reyes' },
        service: { id: 'svc-1', title: 'Late-Night Driver', priceCents: 8500, currency: 'USD' },
        cashFlow: { grossCents: 8500, platformFeeCents: 680, providerPayoutEstimateCents: 7820, commissionBps: 800 },
      },
    ];
    await installVendorOnboardingMocks(page, payoutsEnabledSync, undefined, { bookings });
    await openEarnings(page);

    await expect(page.getByTestId('provider-earnings-stats')).toBeVisible();
    await expect(page.getByTestId('provider-earnings-empty-no-bookings')).toHaveCount(0);
    // $138 from the single completed booking.
    await expect(page.getByTestId('provider-earnings-value-this-month')).toHaveText('$138');
    await expect(page.getByTestId('provider-earnings-value-pending')).toHaveText('$138');
    await expect(page.getByTestId('provider-earnings-next-payout-value')).toHaveText('$138');
    await expect(page.getByTestId('provider-earnings-next-payout')).toContainText('Across 1 confirmed booking');
  });
});
