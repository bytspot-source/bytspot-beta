// One-off provider walkthrough screenshot capture.
// Usage: node scripts/capture-provider.mjs (preview server must be on :4173)
// Saves PNGs into provider-walkthrough/{iphone,ipad}/.

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE = 'http://127.0.0.1:4173';
const VIEWPORTS = [
  { id: 'iphone', width: 393, height: 852 },
  { id: 'ipad', width: 820, height: 1180 },
];
const VIEWS = [
  { id: 'overview', label: 'Dashboard' },
  { id: 'listings', label: 'My Listings' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'patches', label: 'Patches' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'settings', label: 'Settings' },
];

const VENDOR_NAME = 'Midtown Hosts';
const VENDOR_REF = { id: 'vendor-1', displayName: VENDOR_NAME, onboardingStatus: 'active' };

function makeService({ id, title, description, priceCents, durationMins, patch }) {
  const platformFeeCents = Math.round(priceCents * 0.08);
  return {
    id, title, description, priceCents, currency: 'USD', durationMins, status: 'active',
    updatedAt: new Date('2026-05-03T12:10:00.000Z').toISOString(),
    vendor: VENDOR_REF, patch,
    cashFlow: { grossCents: priceCents, platformFeeCents, providerPayoutEstimateCents: priceCents - platformFeeCents, commissionBps: 800 },
  };
}

const PROVIDER_SERVICES = [
  makeService({ id: 'svc-1', title: 'VIP Arrival', description: 'Door-to-table escort with patch verified access', priceCents: 15000, durationMins: 90, patch: { id: 'patch-1', uid: '04A1B2C3D4E5F6', label: 'VIP Booth' } }),
  makeService({ id: 'svc-2', title: 'Rooftop Cabana', description: 'Reserved skyline cabana with bottle service', priceCents: 22000, durationMins: 120, patch: { id: 'patch-2', uid: '04A1B2C3D4E5F7', label: 'Cabana 7' } }),
  makeService({ id: 'svc-3', title: 'Late-Night Driver', description: 'On-call vetted driver between 10pm and 3am', priceCents: 8500, durationMins: 60, patch: null }),
];

// Local-time ISO so the calendar's local-day grouping maps the booking to the
// intended day across all timezones (no trailing Z).
function localIsoOffset(daysFromToday, hours, minutes) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function bookingFor(service, opts) {
  const cf = service.cashFlow;
  return {
    id: opts.id, status: opts.status, startsAt: opts.startsAt, endsAt: opts.endsAt ?? null,
    priceCents: service.priceCents, currency: 'USD',
    guest: { displayName: opts.guestName },
    patch: service.patch ? { id: service.patch.id, label: service.patch.label } : null,
    service: { id: service.id, title: service.title, priceCents: service.priceCents, currency: 'USD' },
    cashFlow: cf,
  };
}

// 3 bookings spread across today / yesterday / 2 days ago with mixed statuses.
const PROVIDER_BOOKINGS = [
  bookingFor(PROVIDER_SERVICES[0], { id: 'booking-1', status: 'confirmed', startsAt: localIsoOffset(0, 18, 30), endsAt: localIsoOffset(0, 20, 0), guestName: 'Avery Chen' }),
  bookingFor(PROVIDER_SERVICES[1], { id: 'booking-2', status: 'pending', startsAt: localIsoOffset(-1, 21, 0), endsAt: localIsoOffset(-1, 23, 0), guestName: 'Jordan Patel' }),
  bookingFor(PROVIDER_SERVICES[2], { id: 'booking-3', status: 'cancelled', startsAt: localIsoOffset(-2, 23, 30), endsAt: localIsoOffset(-2, 0, 30), guestName: 'Morgan Reyes' }),
];

async function installMocks(context) {
  await context.addInitScript(({ services, bookings }) => {
    localStorage.setItem('bytspot_auth_token', 'walkthrough-token');
    localStorage.setItem('bytspot_onboarding_seen', 'true');
    localStorage.setItem('bytspot_user_name', 'Midtown Hosts');
    localStorage.setItem('bytspot_provider_role', 'owner');
    localStorage.setItem('bytspot_provider_business_mode', 'standard');
    localStorage.setItem('bytspot_provider_is_cottage', 'false');
    localStorage.setItem('bytspot_provider_business_name', 'Midtown Hosts');

    window.__BYT_E2E_TRPC_CALLS__ = [];
    window.__BYT_E2E_VENDOR_SERVICES__ = services;
    window.__BYT_E2E_VENDOR_BOOKINGS__ = bookings;
    window.__BYT_E2E_TRPC_MOCKS__ = {
      'vendors.syncOnboarding': {
        vendor: { id: 'vendor-1', displayName: 'Midtown Hosts', stripeAccountId: 'acct_123', onboardingStatus: 'active', updatedAt: new Date().toISOString() },
        account: { id: 'acct_123', chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, disabledReason: null },
      },
      'providers.getStatus': {
        host: {
          id: 'host-walkthrough', status: 'approved',
          onboardingData: {
            businessInfo: { legalName: 'Midtown Hosts', taxId: '123456789', address: { street: '123 Main Street', city: 'New York', state: 'NY', zipCode: '10001' } },
            listing: { location: { address: '123 Main Street, New York, NY 10001', coordinates: { lat: 40.7128, lng: -74.006 } } },
            payout: { stripeConnect: { status: 'active', onboardingStarted: true } },
          },
        },
      },
      'subscription.status': { isPremium: true, isVendorPremium: true, isValetPremium: false, availablePoints: 0, subscriptionOffers: {} },
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes('/trpc/')) return originalFetch(input, init);
      const match = url.match(/\/trpc\/([^?]+)/);
      const procedures = match ? match[1].split(',') : ['unknown'];
      const results = procedures.map((procedure) => {
        window.__BYT_E2E_TRPC_CALLS__?.push({ procedure, input: null });
        if (procedure.includes('vendors.listBookings')) {
          return { result: { data: { bookings: window.__BYT_E2E_VENDOR_BOOKINGS__ ?? [] } } };
        }
        if (procedure.includes('vendors.listServices') || procedure.includes('vendors.list')) {
          return { result: { data: { vendor: window.__BYT_E2E_TRPC_MOCKS__?.['vendors.syncOnboarding']?.vendor, services: window.__BYT_E2E_VENDOR_SERVICES__ ?? [] } } };
        }
        const key = Object.keys(window.__BYT_E2E_TRPC_MOCKS__ ?? {}).find((name) => procedure.includes(name));
        return { result: { data: key ? window.__BYT_E2E_TRPC_MOCKS__?.[key] : null } };
      });
      return new Response(JSON.stringify(procedures.length === 1 ? results[0] : results), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  }, { services: PROVIDER_SERVICES, bookings: PROVIDER_BOOKINGS });
}

async function captureForViewport(browser, vp) {
  const outDir = resolve(`provider-walkthrough/${vp.id}`);
  await mkdir(outDir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await installMocks(context);
  const page = await context.newPage();
  page.on('pageerror', (err) => console.warn(`[${vp.id}] pageerror:`, err.message));

  await page.goto(`${BASE}/provider/connect/return`, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  // Wait for the dashboard shell to mount. The "Host Dashboard" h1 lives in the
  // mobile header AND desktop sidebar, so it is always visible once HostApp
  // resolves to dashboard mode.
  try {
    await page.getByRole('heading', { name: 'Host Dashboard' }).first().waitFor({ timeout: 20_000 });
  } catch (err) {
    console.warn(`[${vp.id}] dashboard shell did not mount:`, err.message);
    await page.screenshot({ path: resolve(outDir, '00-debug-no-shell.png'), fullPage: true });
    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.warn(`[${vp.id}] body excerpt:`, bodyText.slice(0, 400).replace(/\s+/g, ' '));
    await context.close();
    return;
  }
  await page.waitForTimeout(700);

  // Capture the landing/overview first
  await page.screenshot({ path: resolve(outDir, '00-overview-on-arrival.png'), fullPage: true });

  const isDesktopWidth = vp.width >= 1024;

  for (let i = 0; i < VIEWS.length; i++) {
    const view = VIEWS[i];
    try {
      if (!isDesktopWidth) {
        // Open mobile drawer (Menu icon button is the first button in the mobile header)
        await page.locator('button').filter({ has: page.locator('svg.lucide-menu') }).first().click({ timeout: 3_000 }).catch(() => undefined);
        await page.waitForTimeout(250);
      }
      const button = page.getByRole('button', { name: view.label, exact: true }).first();
      await button.click({ timeout: 5_000 });
      await page.waitForTimeout(600);
      const num = String(i + 1).padStart(2, '0');
      await page.screenshot({ path: resolve(outDir, `${num}-${view.id}.png`), fullPage: true });
      console.log(`[${vp.id}] captured ${view.id}`);
    } catch (err) {
      console.warn(`[${vp.id}] could not capture ${view.id}:`, err.message);
    }
  }

  await context.close();
}

const HEADED = process.env.HEADED === '1' || process.argv.includes('--headed');
const SLOWMO = Number(process.env.SLOWMO ?? (HEADED ? 250 : 0));
const browser = await chromium.launch({ headless: !HEADED, slowMo: SLOWMO });
try {
  for (const vp of VIEWPORTS) {
    console.log(`\n=== Capturing ${vp.id} (${vp.width}x${vp.height}) ===`);
    await captureForViewport(browser, vp);
  }
  console.log('\nDone. Output: provider-walkthrough/{iphone,ipad}/');
} finally {
  await browser.close();
}
