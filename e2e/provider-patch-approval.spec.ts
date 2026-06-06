import { expect, type Page, type Route, test } from '@playwright/test';

const VENDOR_NAME = 'Midtown Hosts';
const PROVIDER_EMAIL = 'provider@test.com';
const SERVICE_ID = 'svc-1';

type ProviderStatus = 'pending' | 'approved';
type PatchRecord = {
  id: string;
  uid: string;
  label: string;
  venueName: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  status: string;
  readCounter: number;
  serviceId: string | null;
  serviceTitle: string | null;
};

function base64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fakeAdminJwt() {
  return `e2e.${base64Url({ email: 'ops@test.com', groups: ['BYTSPOT_ADMIN'], exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

function firstJsonInput(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const record = body as Record<string, unknown>;
  if ('json' in record) return firstJsonInput(record.json);
  if (Array.isArray(body)) return firstJsonInput(body[0]);
  const firstValue = record[Object.keys(record)[0]];
  if (firstValue && typeof firstValue === 'object' && 'json' in (firstValue as Record<string, unknown>)) {
    return firstJsonInput((firstValue as Record<string, unknown>).json);
  }
  return record;
}

async function readTrpcInput(route: Route): Promise<Record<string, unknown>> {
  const request = route.request();
  const rawBody = request.postData();
  if (rawBody) {
    try { return firstJsonInput(JSON.parse(rawBody)); } catch { return {}; }
  }
  const rawInput = new URL(request.url()).searchParams.get('input');
  if (!rawInput) return {};
  try { return firstJsonInput(JSON.parse(rawInput)); } catch { return {}; }
}

function providerOnboardingData(status: ProviderStatus) {
  const approved = status === 'approved';
  return {
    businessInfo: {
      legalName: VENDOR_NAME,
      taxId: approved ? '123456789' : '',
      address: { street: '123 Main Street', city: 'Atlanta', state: 'GA', zipCode: '30303' },
    },
    listing: { location: { address: '123 Main Street, Atlanta, GA 30303', coordinates: { lat: 33.749, lng: -84.388 } } },
    payout: { stripeConnect: { status: approved ? 'active' : 'pending', onboardingStarted: true } },
  };
}

async function installLifecycleMocks(page: Page) {
  const state: { providerStatus: ProviderStatus; patches: PatchRecord[]; approveCalls: Record<string, unknown>[] } = {
    providerStatus: 'pending',
    patches: [],
    approveCalls: [],
  };
  const adminToken = fakeAdminJwt();
  const service = {
    id: SERVICE_ID,
    title: 'VIP Arrival',
    description: 'Door-to-table escort with patch verified access',
    category: 'Transportation',
    priceCents: 15000,
    currency: 'USD',
    durationMins: 90,
    maxGuests: 4,
    patchRequired: true,
    status: 'active',
    updatedAt: new Date('2026-05-03T12:10:00.000Z').toISOString(),
    vendor: { id: 'vendor-1', displayName: VENDOR_NAME, onboardingStatus: 'active' },
    patch: null,
  };

  await page.addInitScript(({ token, vendorName }) => {
    const path = window.location.pathname;
    if (path === '/admin/approvals') {
      localStorage.setItem('bytspot_auth_token', token);
      return;
    }
    if (path.startsWith('/p/') || path.startsWith('/patch/') || path.startsWith('/access/')) {
      localStorage.removeItem('bytspot_auth_token');
      localStorage.removeItem('bytspot_user');
      localStorage.setItem('bytspot_intro_seen', 'true');
      return;
    }
    localStorage.setItem('bytspot_auth_token', 'provider-test-token');
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_user_name', vendorName);
    localStorage.setItem('bytspot_provider_role', 'owner');
    localStorage.setItem('bytspot_provider_business_mode', 'standard');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'user-1', name: vendorName, businessName: vendorName, providerRole: 'owner' }));
  }, { token: adminToken, vendorName: VENDOR_NAME });

  await page.route('**/trpc/**', async (route) => {
    const url = route.request().url();
    const match = url.match(/\/trpc\/([^?]+)/);
    const procedures = match ? decodeURIComponent(match[1]).split(',') : ['unknown'];
    const input = await readTrpcInput(route);
    const vendor = { id: 'vendor-1', displayName: VENDOR_NAME, stripeAccountId: 'acct_123', onboardingStatus: state.providerStatus === 'approved' ? 'active' : 'pending', providerRole: 'owner', updatedAt: new Date().toISOString() };
    const applications = state.providerStatus === 'pending' ? [{ id: 'host-1', userId: 'user-1', status: 'pending', currentStep: 4, submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), user: { email: PROVIDER_EMAIL, name: VENDOR_NAME }, vendor }] : [];
    const resultFor = (procedure: string) => {
      if (procedure.includes('providers.getStatus')) return { host: { id: 'host-1', userId: 'user-1', status: state.providerStatus, currentStep: 4, onboardingData: providerOnboardingData(state.providerStatus) } };
      if (procedure.includes('vendors.syncOnboarding')) return { providerRole: 'owner', vendor, account: { id: 'acct_123', chargesEnabled: true, payoutsEnabled: state.providerStatus === 'approved', detailsSubmitted: state.providerStatus === 'approved', disabledReason: null } };
      if (procedure.includes('vendors.listServices')) return { vendor, services: [service] };
      if (procedure.includes('vendors.listBookings')) return { bookings: [] };
      if (procedure.includes('vendors.listPatches')) return { vendor, patches: state.patches };
      if (procedure.includes('vendors.search')) return { services: [] };
      if (procedure.includes('subscription.status')) return { isPremium: true, isVendorPremium: true, isValetPremium: false, availablePoints: 0, subscriptionOffers: {} };
      if (procedure.includes('admin.listPendingProviderApplications')) return { applications };
      if (procedure.includes('admin.approveProviderApplication')) { state.approveCalls.push(input); state.providerStatus = 'approved'; state.patches = state.patches.map((patch) => ({ ...patch, status: 'approved' })); return { host: { id: 'host-1', status: 'approved' }, vendor: { ...vendor, onboardingStatus: 'active' } }; }
      if (procedure.includes('patch.resolve')) return { type: 'CONSUMER_ACCESS', patch: state.patches[0] ?? null, vendor, service, providerRole: null };
      if (procedure.includes('vendors.createPatch')) {
        const patchId = `patch-e2e-${Date.now().toString(36)}`;
        const serviceId = typeof input.serviceId === 'string' ? input.serviceId : null;
        const patch: PatchRecord = { id: patchId, uid: '04A1B2C3D4E5F6', label: typeof input.label === 'string' ? input.label : 'Main Entrance', venueName: VENDOR_NAME, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), url: `https://bytspot.app/p/${patchId}?patch=${patchId}&venue=${encodeURIComponent(VENDOR_NAME)}${serviceId ? `&service=${serviceId}` : ''}`, status: 'pending_admin_review', readCounter: 0, serviceId, serviceTitle: serviceId === SERVICE_ID ? 'VIP Arrival' : null };
        state.patches = [patch, ...state.patches];
        return { vendor, patch };
      }
      return null;
    };
    const results = procedures.map((procedure) => ({ result: { data: resultFor(procedure) } }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(procedures.length === 1 ? results[0] : results) });
  });
  return state;
}

test('Provider creates patch → Admin approves → Provider sees approved state → Customer opens patch URL', async ({ page }) => {
  const state = await installLifecycleMocks(page);

  await page.goto('/provider/connect/return');
  await expect(page.getByTestId('provider-dashboard-review-state')).toContainText('Pending Verification', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Patches', exact: true }).click();
  await page.getByTestId('provider-patches-service-select').selectOption({ label: 'VIP Arrival' });
  await expect(page.getByTestId('provider-patches-preview-url')).toContainText(`&service=${SERVICE_ID}`);
  await page.getByTestId('provider-patches-establish').click();
  const providerPatchCard = page.getByTestId('provider-patches-card').first();
  await expect(providerPatchCard).toBeVisible();
  await expect(providerPatchCard.getByTestId('provider-patches-card-service')).toHaveText('VIP Arrival');
  expect(state.patches).toHaveLength(1);
  const createdPatch = state.patches[0];

  await page.goto('/admin/approvals');
  await expect(page.getByRole('heading', { name: 'Pending Provider Approvals' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(PROVIDER_EMAIL)).toBeVisible();
  await page.getByRole('button', { name: /Seed Stripe ready/i }).click();
  await page.getByRole('button', { name: /Approve Provider/i }).click();
  await expect(page.getByText('No pending provider applications.')).toBeVisible();
  expect(state.providerStatus).toBe('approved');
  expect(state.approveCalls[0]).toMatchObject({ userId: 'user-1', activateVendor: true, markStripeConnectReady: true });

  await page.goto('/provider/connect/return');
  await expect(page.getByTestId('provider-dashboard-review-state')).toContainText('Approved', { timeout: 15_000 });
  await expect(page.getByText('Your marketplace is approved and ready for bookings.')).toBeVisible();
  await page.getByRole('button', { name: 'Patches', exact: true }).click();
  await expect(page.getByTestId('provider-patches-card').first()).toContainText(createdPatch.id);

  await page.goto(`/p/${createdPatch.id}?patch=${createdPatch.id}&venue=${encodeURIComponent(VENDOR_NAME)}&service=${SERVICE_ID}`);
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/p/${createdPatch.id}`);
  await expect(page.getByTestId('app-clip-local-services-panel')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Available Local Services')).toBeVisible();
});