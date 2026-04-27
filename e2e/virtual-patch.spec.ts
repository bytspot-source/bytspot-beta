import { test, expect } from '@playwright/test';
import {
  buildVerifiedVirtualPatchContext,
  decodeNativeNdefRecord,
  getNativeNfcRawValue,
  parseScannedPatchPayload,
  VIRTUAL_PATCH_CONTEXT_KEY,
} from '../src/utils/virtualPatch';

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
];

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

      return new Response(JSON.stringify(procedures.length === 1 ? results[0] : results), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }, MOCK_VENUES);
}

test.describe('Virtual Patch', () => {
  test('parses QR and native NFC payload helpers', () => {
    expect(parseScannedPatchPayload('ABC.DEF.GHI', 'fallback-id')).toMatchObject({
      token: 'ABC.DEF.GHI',
      patchId: 'fallback-id',
    });

    expect(parseScannedPatchPayload('{"patchId":"patch-123","uid":"04:A1:B2:C3:D4:E5:F6","readCounter":"7"}')).toMatchObject({
      patchId: 'patch-123',
      uid: '04A1B2C3D4E5F6',
      readCounter: 7,
    });

    expect(parseScannedPatchPayload('https://bytspot.com/patch?patchId=patch-999&uid=04A1B2C3D4E5F6&counter=3')).toMatchObject({
      patchId: 'patch-999',
      uid: '04A1B2C3D4E5F6',
      readCounter: 3,
    });

    expect(decodeNativeNdefRecord({
      type: [84],
      payload: [2, 101, 110, 66, 89, 84, 83, 80, 79, 84],
    })).toBe('BYTSPOT');

    expect(decodeNativeNdefRecord({
      type: [85],
      payload: [4, 98, 121, 116, 115, 112, 111, 116, 46, 99, 111, 109],
    })).toBe('https://bytspot.com');

    expect(getNativeNfcRawValue({
      tag: {
        ndefMessage: [{ type: [84], payload: [2, 101, 110, 80, 65, 84, 67, 72] }],
      },
    })).toBe('PATCH');

    expect(getNativeNfcRawValue({
      tag: { id: [0x04, 0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6] },
    })).toBe('04A1B2C3D4E5F6');
  });

  test('verified virtual patch appears in Profile → My Access', async ({ page }) => {
    await mockVenuesApi(page);

    const verifiedContext = buildVerifiedVirtualPatchContext(
      {
        method: 'nfc',
        rawValue: '04A1B2C3D4E5F6',
        patchId: 'patch-123456',
        uid: '04A1B2C3D4E5F6',
        tokenJti: 'token-jti-12345678',
        verifiedAt: '2026-04-25T18:00:00.000Z',
        binding: { type: 'booking', id: 'booking-123' },
      },
      {
        source: 'map',
        initiatedAt: '2026-04-25T17:59:00.000Z',
        venueId: 'test-venue-1',
        venueName: 'The Rooftop Bar',
        patchId: 'patch-123456',
        distanceMeters: 42,
        capabilities: { nfc: true, qr: true },
      },
    );

    await page.addInitScript(({ context, contextKey }) => {
      localStorage.setItem('bytspot_onboarding_seen', 'true');
      localStorage.setItem('bytspot_profile_focus', 'tickets');
      localStorage.setItem(contextKey, JSON.stringify(context));
    }, { context: verifiedContext, contextKey: VIRTUAL_PATCH_CONTEXT_KEY });

    await page.goto('/');
    await expect(page.getByText("Let's Go")).toBeVisible({ timeout: 15_000 });
    await page.getByText("Let's Go").click();
    await expect(page.getByText('Continue as Guest')).toBeVisible({ timeout: 10_000 });
    await page.getByText('Continue as Guest').click();
    await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('open-profile-button').click();

    const walletScreen = page.getByTestId('profile-access-wallet');
    await expect(walletScreen).toBeVisible({ timeout: 10_000 });

    const virtualPatchCard = page.getByTestId('profile-virtual-patch-card');
    await expect(virtualPatchCard).toBeVisible({ timeout: 10_000 });
    await expect(virtualPatchCard.getByText('Patch verified')).toBeVisible();
    await expect(virtualPatchCard.getByText('Tap verification completed for The Rooftop Bar.')).toBeVisible();
    await expect(virtualPatchCard.getByText('Tap confirmed')).toBeVisible();
    await expect(virtualPatchCard.getByText('NFC ready')).toBeVisible();
    await expect(virtualPatchCard.getByText('QR ready')).toBeVisible();
    await expect(virtualPatchCard.getByText('Patch 123456')).toBeVisible();
    await expect(virtualPatchCard.getByText(/Verified/)).toBeVisible();
  });
});