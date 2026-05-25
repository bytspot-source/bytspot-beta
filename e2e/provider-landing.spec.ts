import { expect, type Page, test } from '@playwright/test';

// Phase 1 acceptance: the Provider shell renders on /provider plus legacy aliases without
// requiring Parker home code, on the 393px target viewport, with full a11y semantics.

const STRIPE_CONNECT_URL = 'https://connect.stripe.com/setup/e/acct_provider_onboarding_test';
const PROVIDER_PAYOUT_DRAFT_STORAGE_KEY = 'bytspot_provider_payout_draft';

async function installProviderLandingMocks(page: Page) {
  await page.addInitScript(({ connectUrl }) => {
    // Skip onboarding gates so the path-level route handler runs unimpeded.
    localStorage.setItem('bytspot_intro_seen', 'true');
    (window as any).__BYT_GOOGLE_CLIENT_ID__ = 'google-web-client-id';
    (window as any).__BYT_GOOGLE_AUTHORIZED_ORIGINS__ = window.location.origin;
    let googleCredentialCallback: ((response: { credential?: string }) => void) | null = null;
    (window as any).google = {
      accounts: {
        id: {
          initialize: (config: { callback: (response: { credential?: string }) => void }) => { googleCredentialCallback = config.callback; },
          prompt: () => googleCredentialCallback?.({ credential: 'mock-google-id-token' }),
          renderButton: (element: HTMLElement) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Continue with Google';
            button.setAttribute('data-testid', 'mock-google-signin');
            button.onclick = () => googleCredentialCallback?.({ credential: 'mock-google-id-token' });
            element.appendChild(button);
          },
          cancel: () => undefined,
        },
      },
    };

    const providerMockState = { syncOnboardingCalls: 0, saveProviderProgressCalls: 0, lastProviderProgressRequest: null as any };
    (window as any).__BYT_PROVIDER_MOCK_STATE__ = providerMockState;

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
      const results = procedures.map((procedure) => {
        if (procedure.includes('auth.signup') || procedure.includes('auth.login') || procedure.includes('auth.googleSignIn')) {
          return {
            result: {
              data: {
                token: 'provider-onboarding-token',
                user: { id: 'user-provider-1', email: procedure.includes('auth.googleSignIn') ? 'google.vendor@bytspot.test' : 'phase4.provider@bytspot.test', name: 'Phase Provider' },
                isNewUser: procedure.includes('auth.googleSignIn'),
              },
            },
          };
        }
        if (procedure.includes('vendors.startOnboarding')) {
          const override = (window as any).__BYT_PROVIDER_START_ONBOARDING_RESPONSE__;
          if (override) {
            return { result: { data: override } };
          }
          return {
            result: {
              data: {
                url: connectUrl,
                expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
                vendor: { id: 'vendor-1', displayName: 'Bytspot Events LLC', stripeAccountId: 'acct_provider_123', onboardingStatus: 'pending' },
              },
            },
          };
        }
        if (procedure.includes('vendors.syncOnboarding')) {
          providerMockState.syncOnboardingCalls += 1;
          return {
            result: {
              data: {
                vendor: { id: 'vendor-1', displayName: 'Bytspot Events LLC', stripeAccountId: 'acct_provider_123', onboardingStatus: 'active', providerRole: 'owner', groups: [] },
                account: { id: 'acct_provider_123', chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, disabledReason: null },
                providerRole: 'owner',
              },
            },
          };
        }
        if (procedure.includes('providers.getStatus')) {
          return { result: { data: (window as any).__BYT_PROVIDER_INITIAL_HOST_STATUS__ ?? { host: null, valet: null } } };
        }
        if (procedure.includes('providers.saveHostProgress')) {
          providerMockState.saveProviderProgressCalls += 1;
          try {
            const body = (init as any)?.body;
            providerMockState.lastProviderProgressRequest = body ? JSON.parse(String(body)) : null;
          } catch {
            providerMockState.lastProviderProgressRequest = null;
          }
          return { result: { data: { profile: { id: 'host-1', status: 'draft', currentStep: 9 } } } };
        }
        return { result: { data: null } };
      });
      const payload = procedures.length === 1 ? results[0] : results;
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  }, { connectUrl: STRIPE_CONNECT_URL });
}

async function expectOnboardingStep(page: Page, step: number) {
  await expect(page.getByTestId('provider-onboarding-root')).toHaveAttribute('data-current-step', String(step), { timeout: 15_000 });
  await expect(page.getByTestId('provider-onboarding-progress')).toContainText(`Step ${step} of 10`);
}

async function continueOnboarding(page: Page) {
  const cta = page.getByTestId('provider-onboarding-continue');
  await cta.scrollIntoViewIfNeeded();
  await cta.click();
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
      await expect(page.getByTestId('provider-start-cta')).toHaveAccessibleName('Start Venue Provider onboarding');

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

  for (const path of ['/provider', '/vendor', '/host'] as const) {
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

      // Default selection is "Parking Provider" (aria-checked + visible CTA label).
      await expect(page.getByTestId('provider-role-tile-parking')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('provider-start-cta')).toHaveAccessibleName('Start Parking Provider onboarding');

      // No horizontal overflow at 393px.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      if (path === '/host') {
        await expect(page).toHaveURL(/\/provider$/);
      }
    });
  }

  test('keyboard arrow navigation moves selection through role tiles', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/provider');
    await expect(page.getByTestId('provider-landing-root')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('provider-role-tile-parking').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('provider-role-tile-venue')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('provider-start-cta')).toHaveAccessibleName('Start Venue Provider onboarding');

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

    // Don't follow the route into ProviderApp here — just confirm the navigation contract.
    await page.getByTestId('provider-start-cta').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/provider/onboarding');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_provider_role'))).toBe('event');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_provider_entry_source'))).toBe('provider-route');
  });

  test('legacy /host/onboarding alias renders Provider onboarding', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/host/onboarding');
    await expect(page).toHaveURL(/\/provider\/onboarding$/);
    await expectOnboardingStep(page, 1);
  });

  test('runs the selected Provider role through onboarding and redirects to Stripe Connect', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/provider');
    await expect(page.getByTestId('provider-landing-root')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('provider-role-tile-event').click();
    await page.getByTestId('provider-start-cta').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/provider/onboarding');

    await expectOnboardingStep(page, 1);
    await page.getByTestId('provider-account-email').fill('phase4.provider@bytspot.test');
    await page.getByTestId('provider-account-phone').fill('4155550142');
    await page.getByTestId('provider-account-password').fill('securepass123');
    await page.getByTestId('provider-account-terms').check();
    await continueOnboarding(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_auth_token'))).toBe('provider-onboarding-token');

    await expectOnboardingStep(page, 2);
    await expect(page.getByTestId('provider-onboarding-type-event')).toHaveAttribute('aria-pressed', 'true');
    await continueOnboarding(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_provider_selected_type'))).toBe('event');
    await expect.poll(() => page.evaluate(() => JSON.stringify((window as any).__BYT_PROVIDER_MOCK_STATE__?.lastProviderProgressRequest ?? ''))).toContain('"providerType":"event"');
    await expect.poll(() => page.evaluate(() => JSON.stringify((window as any).__BYT_PROVIDER_MOCK_STATE__?.lastProviderProgressRequest ?? ''))).toContain('"hostType":"event"');

    await expectOnboardingStep(page, 3);
    await page.getByTestId('provider-business-legal-name').fill('Bytspot Events LLC');
    await page.getByTestId('provider-business-contact-name').fill('Jordan Provider');
    await page.getByTestId('provider-business-contact-title').fill('Operations Lead');
    await page.getByTestId('provider-business-street').fill('100 Festival Way');
    await page.getByTestId('provider-business-city').fill('Detroit');
    await page.getByTestId('provider-business-state').fill('MI');
    await page.getByTestId('provider-business-zip').fill('48226');
    await page.getByTestId('provider-business-spots').fill('60');
    await page.getByTestId('provider-business-tax-id').fill('38-1234567');
    await continueOnboarding(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_provider_business_name'))).toBe('Bytspot Events LLC');

    await expectOnboardingStep(page, 4);
    await page.getByTestId('provider-listing-address').fill('100 Festival Way Lot B');
    await page.getByTestId('provider-listing-notes').fill('Use the north gate near the blue tower.');
    await page.getByTestId('provider-listing-spot-type-covered').click();
    await page.getByTestId('provider-listing-size-large').click();
    await page.getByTestId('provider-listing-amenity-security').click();
    await continueOnboarding(page);

    await expectOnboardingStep(page, 5);
    await page.getByTestId('provider-onboarding-back').click();
    await expectOnboardingStep(page, 4);
    await expect(page.getByTestId('provider-listing-address')).toHaveValue('100 Festival Way Lot B');
    await expect(page.getByTestId('provider-listing-notes')).toHaveValue('Use the north gate near the blue tower.');
    await continueOnboarding(page);

    await expectOnboardingStep(page, 5);
    await page.getByTestId('provider-pricing-hourly').fill('18');
    await page.getByTestId('provider-pricing-daily').fill('80');
    await page.getByTestId('provider-pricing-monthly').fill('320');
    await page.getByTestId('provider-pricing-dynamic').click();
    await continueOnboarding(page);

    await expectOnboardingStep(page, 6);
    await page.getByTestId('provider-availability-min-booking').selectOption('2');
    await page.getByTestId('provider-availability-policy-moderate').click();
    await continueOnboarding(page);

    await expectOnboardingStep(page, 7);
    await page.getByTestId('provider-verification-id-upload').click();
    await page.getByTestId('provider-verification-license-upload').click();
    await continueOnboarding(page);

    await expectOnboardingStep(page, 8);
    await expect(page.getByTestId('provider-payout-account-holder')).toHaveValue('Bytspot Events LLC');
    let capturedStripeUrl: string | null = null;
    await page.route('https://connect.stripe.com/**', async (route) => {
      capturedStripeUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe Connect</h1>' });
    });
    await Promise.all([
      page.waitForURL(STRIPE_CONNECT_URL),
      page.getByTestId('provider-stripe-connect-cta').click(),
    ]);
    await expect.poll(() => capturedStripeUrl).toBe(STRIPE_CONNECT_URL);
    await expect(page).toHaveURL(STRIPE_CONNECT_URL);
  });

  test('lets an existing vendor sign in from onboarding without phone or terms blocking the flow', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/vendor');
    await expect(page.getByTestId('provider-landing-root')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('provider-role-tile-venue').click();
    await page.getByTestId('provider-start-cta').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/provider/onboarding');

    await expectOnboardingStep(page, 1);
    await page.getByTestId('provider-account-mode-signin').click();
    await expect(page.getByRole('heading', { name: 'Sign In to Provider' })).toBeVisible();
    await expect(page.getByTestId('provider-account-phone')).toHaveCount(0);
    await expect(page.getByTestId('provider-account-terms')).toHaveCount(0);

    await page.getByTestId('provider-account-email').fill('existing.vendor@bytspot.test');
    await page.getByTestId('provider-account-password').fill('securepass123');
    await continueOnboarding(page);

    await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_auth_token'))).toBe('provider-onboarding-token');
    await expectOnboardingStep(page, 2);
    await expect(page.getByTestId('provider-onboarding-type-venue')).toHaveAttribute('aria-pressed', 'true');
  });

  test('lets a provider continue onboarding with Google Sign-In', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/vendor');
    await expect(page.getByTestId('provider-landing-root')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('provider-role-tile-venue').click();
    await page.getByTestId('provider-start-cta').click();
    await expectOnboardingStep(page, 1);

    await page.getByTestId('google-signin-button').click();

    await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_auth_token'))).toBe('provider-onboarding-token');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bytspot_user') || '{}').email)).toBe('google.vendor@bytspot.test');
    await expectOnboardingStep(page, 2);
  });

  test('shows approved provider dashboard state when mandatory metadata and Stripe Connect are active', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.addInitScript(() => {
      localStorage.setItem('bytspot_provider_review_state', JSON.stringify({
        status: 'approved',
        label: 'Approved',
        reasons: [],
        checks: { businessLegalName: true, taxId: true, verifiedAddress: true, stripeConnectActive: true },
        updatedAt: '2026-05-04T00:00:00.000Z',
      }));
    });

    await page.goto('/provider/connect/return');
    await expect(page.getByTestId('provider-dashboard-review-state')).toContainText('Approved', { timeout: 15_000 });
    await expect(page.getByText('Your marketplace is approved and ready for bookings.')).toBeVisible();
  });

  test('syncs Stripe Connect return into draft onboarding and advances past payout setup', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.addInitScript(({ payoutDraftKey }) => {
      localStorage.setItem('bytspot_auth_token', 'provider-onboarding-token');
      localStorage.setItem(payoutDraftKey, JSON.stringify({
        bankAccount: { accountHolder: 'Bytspot Events LLC', routingNumber: '123456789', accountNumber: '987654321', accountType: 'checking' },
        schedule: 'weekly',
        stripeConnect: { displayName: 'Bytspot Events LLC', onboardingStarted: true, accountId: 'acct_provider_123', status: 'pending' },
      }));
      (window as any).__BYT_PROVIDER_INITIAL_HOST_STATUS__ = {
        host: {
          id: 'host-1',
          status: 'draft',
          currentStep: 8,
          submittedAt: null,
          onboardingData: {
            hostType: 'event',
            businessInfo: { legalName: 'Bytspot Events LLC', contactName: 'Jordan Provider', address: { street: '100 Festival Way', city: 'Detroit', state: 'MI', zipCode: '48226' }, taxId: '38-1234567', numberOfSpots: 60 },
            listing: { location: { address: '100 Festival Way Lot B', coordinates: { lat: 42.3314, lng: -83.0458 }, notes: 'Use north gate.' } },
          },
        },
        valet: null,
      };
    }, { payoutDraftKey: PROVIDER_PAYOUT_DRAFT_STORAGE_KEY });

    await page.goto('/provider/connect/return');
    await expectOnboardingStep(page, 9);
    await expect(page.getByRole('heading', { name: 'Review & Submit' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__BYT_PROVIDER_MOCK_STATE__?.syncOnboardingCalls ?? 0)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => (window as any).__BYT_PROVIDER_MOCK_STATE__?.saveProviderProgressCalls ?? 0)).toBeGreaterThan(0);
  });

  test('shows active Stripe payout state from saved Provider onboarding progress', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.addInitScript(() => {
      localStorage.setItem('bytspot_auth_token', 'provider-onboarding-token');
      (window as any).__BYT_PROVIDER_INITIAL_HOST_STATUS__ = {
        host: {
          id: 'host-1',
          status: 'draft',
          currentStep: 8,
          submittedAt: null,
          onboardingData: {
            providerType: 'event',
            hostType: 'event',
            businessInfo: { legalName: 'Bytspot Events LLC', contactName: 'Jordan Provider', address: { street: '100 Festival Way', city: 'Detroit', state: 'MI', zipCode: '48226' }, taxId: '38-1234567', numberOfSpots: 60 },
            payout: {
              bankAccount: { accountHolder: 'Bytspot Events LLC', routingNumber: '123456789', accountNumber: '987654321', accountType: 'checking' },
              schedule: 'weekly',
              stripeConnect: { displayName: 'Bytspot Events LLC', onboardingStarted: true, accountId: 'acct_provider_123', status: 'active' },
            },
          },
        },
        valet: null,
      };
    });

    await page.goto('/provider/onboarding');
    await expectOnboardingStep(page, 8);
    await expect(page.getByTestId('provider-stripe-connect-status-badge')).toContainText('Active');
    await expect(page.getByTestId('provider-stripe-connect-status')).toContainText('Stripe payouts are active');
    await expect(page.getByTestId('provider-stripe-connect-notice')).toContainText('Stripe verified your payout account');
    await expect(page.getByTestId('provider-onboarding-continue')).toBeEnabled();
  });

  test('shows a recoverable Step 8 error when Stripe link generation returns no URL', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.addInitScript(() => {
      localStorage.setItem('bytspot_auth_token', 'provider-onboarding-token');
      (window as any).__BYT_PROVIDER_START_ONBOARDING_RESPONSE__ = { url: '', message: 'Stripe onboarding is temporarily unavailable.' };
      (window as any).__BYT_PROVIDER_INITIAL_HOST_STATUS__ = {
        host: {
          id: 'host-1',
          status: 'draft',
          currentStep: 8,
          submittedAt: null,
          onboardingData: {
            providerType: 'event',
            hostType: 'event',
            businessInfo: { legalName: 'Bytspot Events LLC', contactName: 'Jordan Provider', address: { street: '100 Festival Way', city: 'Detroit', state: 'MI', zipCode: '48226' }, taxId: '38-1234567', numberOfSpots: 60 },
          },
        },
        valet: null,
      };
    });

    await page.goto('/provider/onboarding');
    await expectOnboardingStep(page, 8);
    await page.getByTestId('provider-payout-routing').fill('123456789');
    await page.getByTestId('provider-payout-account-number').fill('987654321');
    await page.getByTestId('provider-stripe-connect-cta').click();
    await expect(page.getByTestId('provider-stripe-connect-notice')).toContainText('Stripe onboarding is temporarily unavailable.');
    await expect(page.getByTestId('provider-stripe-connect-notice')).toHaveAttribute('role', 'alert');
    await expect(page.getByTestId('provider-stripe-connect-status-badge')).toContainText('Not started');
    await expect(page.getByTestId('provider-onboarding-continue')).toBeDisabled();
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
