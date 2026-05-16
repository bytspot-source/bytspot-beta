import { test, expect } from '@playwright/test';
import { buildVerifiedVirtualPatchContext, VIRTUAL_PATCH_CONTEXT_KEY } from '../src/utils/virtualPatch';

const TEST_COORDS = { lat: 33.789, lng: -84.384 };
const PATCH_ID = 'patch-123456';
const PATCH_UID = '04A1B2C3D4E5F6';
const TOKEN_JTI = 'token-jti-12345678';
const VERIFIED_AT = '2026-04-25T18:00:00.000Z';
const VISUAL_PAUSE_MS = 800;

const MOCK_VENUES = [{
  id: 'test-venue-1',
  name: 'The Rooftop Bar',
  slug: 'the-rooftop-bar',
  address: '123 Peachtree St NE',
  lat: TEST_COORDS.lat,
  lng: TEST_COORDS.lng,
  category: 'bar',
  imageUrl: null,
  entryType: 'paid',
  entryPrice: '$22',
  crowd: { level: 3, label: 'Lively', waitMins: 10, recordedAt: VERIFIED_AT },
  parking: { totalAvailable: 5, spots: [] },
  hardwarePatch: { id: PATCH_ID, uid: PATCH_UID },
}];

test.use({
  geolocation: { latitude: TEST_COORDS.lat, longitude: TEST_COORDS.lng },
  permissions: ['geolocation'],
});

async function installVirtualPatchDemoMocks(
  page: import('@playwright/test').Page,
  options: { qrFallback?: boolean; iosWebFallback?: boolean; scannerUnavailable?: boolean } = {},
) {
  await page.addInitScript(({ mockVenues, coords, patchId, patchUid, tokenJti, verifiedAt, qrFallback, iosWebFallback, scannerUnavailable }) => {
    if (iosWebFallback) {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      });
    }

    const mockPosition = {
      coords: { latitude: coords.lat, longitude: coords.lng, accuracy: 12 },
      timestamp: Date.now(),
    };

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: (position: typeof mockPosition) => void) => window.setTimeout(() => success(mockPosition), 30),
        watchPosition: (success: (position: typeof mockPosition) => void) => {
          window.setTimeout(() => success(mockPosition), 30);
          return 1;
        },
        clearWatch: () => undefined,
      },
    });

    if (scannerUnavailable) {
      try { delete (window as Window & { NDEFReader?: unknown }).NDEFReader; } catch { /* browser locked the property */ }
      try { delete (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector; } catch { /* browser locked the property */ }
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, get: () => undefined });
    } else if (qrFallback) {
      class MockNDEFReader {
        onreading: ((event: { message: { records: Array<{ recordType: string; data: Uint8Array }> } }) => void) | null = null;
        onreadingerror: (() => void) | null = null;

        async scan() {
          throw new Error('NFC reader unavailable in this browser session.');
        }
      }

      class MockBarcodeDetector {
        async detect() {
          return [{ rawValue: JSON.stringify({ patchId, uid: patchUid }) }];
        }
      }

      Object.defineProperty(window, 'NDEFReader', { configurable: true, value: MockNDEFReader });
      Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: MockBarcodeDetector });

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => ({
            getTracks: () => [{ stop: () => undefined }],
          }),
        },
      });

      // Force readyState to 4 (HAVE_ENOUGH_DATA) for all <video> elements so
      // the BarcodeDetector loop's `readyState >= 2` gate passes immediately
      // against the mocked stream. We patch at both the prototype level
      // (defensive) AND on every <video> instance as it's inserted into the
      // DOM (authoritative — instance descriptors win over prototype ones).
      try {
        Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
          configurable: true,
          get() { return 4; },
        });
      } catch {
        // Prototype may be locked down in some engines; instance patch below
        // is sufficient on its own.
      }
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value: async function play() { return undefined; },
      });

      const patchVideo = (node: Node) => {
        if (!(node instanceof HTMLVideoElement)) return;
        try {
          Object.defineProperty(node, 'readyState', { configurable: true, get: () => 4 });
        } catch {
          // Already patched.
        }
      };
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          m.addedNodes.forEach((node) => {
            patchVideo(node);
            if (node instanceof Element) {
              node.querySelectorAll('video').forEach(patchVideo);
            }
          });
        }
      });
      // Begin observing once <body> exists.
      const startObserving = () => {
        if (!document.body) {
          window.requestAnimationFrame(startObserving);
          return;
        }
        observer.observe(document.body, { childList: true, subtree: true });
        document.querySelectorAll('video').forEach(patchVideo);
      };
      startObserving();
    } else {
      class MockNDEFReader {
        onreading: ((event: { message: { records: Array<{ recordType: string; data: Uint8Array }> } }) => void) | null = null;
        onreadingerror: (() => void) | null = null;

        async scan() {
          const payload = JSON.stringify({ patchId, uid: patchUid });
          window.setTimeout(() => {
            this.onreading?.({
              message: { records: [{ recordType: 'mime', data: new TextEncoder().encode(payload) }] },
            });
          }, 1200);
        }
      }

      Object.defineProperty(window, 'NDEFReader', { configurable: true, value: MockNDEFReader });
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes('nominatim.openstreetmap.org/reverse')) {
        return new Response(JSON.stringify({ address: { city: 'Atlanta' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

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
        if (procedure.includes('patch.rotatingToken')) return { result: { data: { token: 'demo-rotating-token' } } };
        if (procedure.includes('patch.verifyTap')) {
          return { result: { data: {
            verified: true,
            patch: { id: patchId, uid: patchUid },
            binding: { type: 'booking', id: 'booking-123' },
            token: {
              jti: tokenJti,
              action: 'tap',
              subject: patchId,
              issuedAt: verifiedAt,
              expiresAt: '2026-04-25T18:02:00.000Z',
            },
          } } };
        }
        return { result: { data: null } };
      });

      return new Response(JSON.stringify(procedures.length === 1 ? results[0] : results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }, {
    mockVenues: MOCK_VENUES,
    coords: TEST_COORDS,
    patchId: PATCH_ID,
    patchUid: PATCH_UID,
    tokenJti: TOKEN_JTI,
    verifiedAt: VERIFIED_AT,
    qrFallback: options.qrFallback ?? false,
    iosWebFallback: options.iosWebFallback ?? false,
    scannerUnavailable: options.scannerUnavailable ?? false,
  });
}

async function enterMainApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('bytspot_intro_seen', 'true');
    localStorage.setItem('bytspot_auth_token', 'guest_session');
    localStorage.setItem('bytspot_user', JSON.stringify({ id: 'guest', name: 'Guest' }));
    localStorage.setItem('bytspot_user_name', 'Guest');
  });
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(VISUAL_PAUSE_MS);
}

async function robustClick(locator: import('@playwright/test').Locator) {
  await locator.waitFor({ state: 'attached', timeout: 10_000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await locator.click({ force: true, timeout: 5_000 });
  } catch {
    await locator.evaluate((element: HTMLElement) => element.click());
  }
}

async function openVirtualPatchMapFlow(page: import('@playwright/test').Page) {
  const nearbyQuickAction = page.getByRole('button', { name: /Nearby: What's around/i });
  const mapTab = page.getByRole('tab', { name: 'Map tab' });
  const mapFunctionsDialog = page.getByRole('dialog', { name: 'Map Functions' });
  const liveVenueDataButton = page.getByRole('button', { name: /Live Venue Data/i });
  const tapScanFab = page.getByRole('button', { name: 'Open Tap and Scan virtual patch flow' });

  const nearbyVisible = await nearbyQuickAction.isVisible().catch(() => false);
  if (nearbyVisible) {
    try {
      await robustClick(nearbyQuickAction);
      await expect(tapScanFab).toBeVisible({ timeout: 15_000 });
      await expect(tapScanFab).toContainText('The Rooftop Bar');
      return tapScanFab;
    } catch {
      // Quick-action path was attempted but didn't surface the FAB. Fall
      // through to the explicit Map-tab path below — robustClick already
      // tried both element.click() variants, so re-evaluating here would
      // just hang on a stale locator.
    }
  }

  await robustClick(mapTab);
  const menuVisible = await mapFunctionsDialog.isVisible().catch(() => false);
  if (!menuVisible) {
    await mapTab.evaluate((element: HTMLElement) => element.click());
  }

  await expect(mapFunctionsDialog).toBeVisible({ timeout: 10_000 });

  await robustClick(liveVenueDataButton);
  const stillVisible = await mapFunctionsDialog.isVisible().catch(() => false);
  if (stillVisible) {
    await liveVenueDataButton.evaluate((element: HTMLElement) => element.click());
  }

  await expect(mapFunctionsDialog).toBeHidden({ timeout: 10_000 });

  await expect(tapScanFab).toBeVisible({ timeout: 15_000 });
  await expect(tapScanFab).toContainText('The Rooftop Bar');
  return tapScanFab;
}

test('sticker deep link opens Tap / Scan directly for a fresh guest', async ({ page }) => {
  await installVirtualPatchDemoMocks(page);

  await page.goto(`/patch/${PATCH_ID}?venue=Apple%20Demo`);

  await expect(page).toHaveURL(new RegExp(`/access/${PATCH_ID}$`), { timeout: 15_000 });
  await expect(page.getByText('Scan the Bytspot patch')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Apple Demo', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Apple Demo Venue Services')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('VIP Access Demo')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Start reader' })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bytspot_auth_token'))).toBe('guest_session');
});

test('iOS web fallback stays in valid web access instead of opening invalid app scheme', async ({ page }) => {
  await installVirtualPatchDemoMocks(page, { iosWebFallback: true, scannerUnavailable: true });

  await page.goto(`/patch/${PATCH_ID}?venue=Apple%20Demo`);

  await expect(page).toHaveURL(new RegExp(`/access/${PATCH_ID}$`), { timeout: 15_000 });
  await expect(page.getByText('Scan the Bytspot patch')).toBeVisible({ timeout: 15_000 });
  await robustClick(page.getByRole('button', { name: 'Start reader' }));

  await expect(page.getByText('Safari opened this patch in web access')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Open Bytspot App' })).toHaveCount(0);
  await robustClick(page.getByRole('button', { name: 'Continue in My Access' }));

  await expect(page.getByTestId('profile-access-wallet')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('profile-virtual-patch-card')).toContainText('Apple Demo');
  await expect(page.getByTestId('profile-virtual-patch-card')).toContainText('Wallet standby');
  await expect(page.getByTestId('apple-demo-services-card')).toContainText('Apple Demo Venue Services');
  await expect(page.getByTestId('apple-demo-services-card')).toContainText('Parking Access');
});

test('visual demo: Verified Vibe map to scanner to My Access', async ({ page }) => {
  await installVirtualPatchDemoMocks(page);
  await enterMainApp(page);

  const tapScanFab = await openVirtualPatchMapFlow(page);
  await page.waitForTimeout(VISUAL_PAUSE_MS);

  await robustClick(tapScanFab);
  await expect(page.getByText('Tap / Scan ready')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(VISUAL_PAUSE_MS);

  await robustClick(page.getByRole('button', { name: 'Start Tap / Scan' }));

  // Consent gate (BIPA / CCPA / WA MHMD): the user must affirmatively grant
  // intent-to-read before any sensor (NFC / camera) is started.
  await expect(page.getByText('Confirm intent to read')).toBeVisible({ timeout: 10_000 });
  await robustClick(page.getByRole('button', { name: /Start reader/i }));

  await expect(page.getByText('Tap the Bytspot patch')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(VISUAL_PAUSE_MS * 2);

  await expect(page.getByText('Patch verified')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Continue in My Access' })).toBeVisible();

  const storedContext = await page.evaluate((contextKey) => JSON.parse(localStorage.getItem(contextKey) || 'null'), VIRTUAL_PATCH_CONTEXT_KEY);
  const expectedContext = buildVerifiedVirtualPatchContext(
    {
      method: 'nfc',
      rawValue: JSON.stringify({ patchId: PATCH_ID, uid: PATCH_UID }),
      patchId: PATCH_ID,
      uid: PATCH_UID,
      tokenJti: TOKEN_JTI,
      verifiedAt: VERIFIED_AT,
      binding: { type: 'booking', id: 'booking-123' },
    },
    {
      source: 'map',
      initiatedAt: storedContext?.initiatedAt,
      venueId: MOCK_VENUES[0].id,
      venueName: MOCK_VENUES[0].name,
      patchId: PATCH_ID,
      distanceMeters: storedContext?.distanceMeters,
      capabilities: { nfc: true, qr: false },
    },
  );
  expect(storedContext).toMatchObject(expectedContext);

  await page.waitForTimeout(VISUAL_PAUSE_MS);
  await robustClick(page.getByRole('button', { name: 'Continue in My Access' }));

  const walletScreen = page.getByTestId('profile-access-wallet');
  const virtualPatchCard = page.getByTestId('profile-virtual-patch-card');
  await expect(walletScreen).toBeVisible({ timeout: 15_000 });
  await expect(virtualPatchCard).toBeVisible({ timeout: 10_000 });
  await expect(virtualPatchCard.getByText('Patch verified')).toBeVisible();
  await expect(virtualPatchCard.getByText('Tap verification completed for The Rooftop Bar.')).toBeVisible();
  await expect(virtualPatchCard.getByText('Tap confirmed')).toBeVisible();
  await page.waitForTimeout(VISUAL_PAUSE_MS);
});

test('visual demo: NFC fallback switches to QR and still verifies into My Access', async ({ page }) => {
  await installVirtualPatchDemoMocks(page, { qrFallback: true });
  await enterMainApp(page);

  const tapScanFab = await openVirtualPatchMapFlow(page);
  await robustClick(tapScanFab);

  await expect(page.getByText('Tap / Scan ready')).toBeVisible({ timeout: 10_000 });
  await robustClick(page.getByRole('button', { name: 'Start Tap / Scan' }));

  await expect(page.getByText('Confirm intent to read')).toBeVisible({ timeout: 10_000 });
  await robustClick(page.getByRole('button', { name: /Start reader/i }));

  await expect(page.getByText('Scan the Bytspot patch')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('QR Backup Scanner')).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText('Patch verified')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Continue in My Access' })).toBeVisible();

  const storedContext = await page.evaluate((contextKey) => JSON.parse(localStorage.getItem(contextKey) || 'null'), VIRTUAL_PATCH_CONTEXT_KEY);
  const expectedContext = buildVerifiedVirtualPatchContext(
    {
      method: 'qr',
      rawValue: JSON.stringify({ patchId: PATCH_ID, uid: PATCH_UID }),
      patchId: PATCH_ID,
      uid: PATCH_UID,
      tokenJti: TOKEN_JTI,
      verifiedAt: VERIFIED_AT,
      binding: { type: 'booking', id: 'booking-123' },
    },
    {
      source: 'map',
      initiatedAt: storedContext?.initiatedAt,
      venueId: MOCK_VENUES[0].id,
      venueName: MOCK_VENUES[0].name,
      patchId: PATCH_ID,
      distanceMeters: storedContext?.distanceMeters,
      capabilities: { nfc: true, qr: true },
    },
  );
  expect(storedContext).toMatchObject(expectedContext);

  await robustClick(page.getByRole('button', { name: 'Continue in My Access' }));

  const walletScreen = page.getByTestId('profile-access-wallet');
  const virtualPatchCard = page.getByTestId('profile-virtual-patch-card');
  await expect(walletScreen).toBeVisible({ timeout: 15_000 });
  await expect(virtualPatchCard).toBeVisible({ timeout: 10_000 });
  await expect(virtualPatchCard.getByText('Patch verified')).toBeVisible();
  await expect(virtualPatchCard.getByText('QR verification completed for The Rooftop Bar.')).toBeVisible();
  await expect(virtualPatchCard.getByText('QR confirmed')).toBeVisible();
  await expect(virtualPatchCard.getByText('QR verified')).toBeVisible();
});