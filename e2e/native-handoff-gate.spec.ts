import { expect, test } from '@playwright/test';

/**
 * The web surface is a kill-switch plus four legal pages. Everything the old
 * Playwright smoke suite drove — Map, provider, vendor, Google sign-in — is a
 * retired PWA, so this gate protects what actually ships instead.
 */

const LEGAL_PATHS = ['/privacy', '/terms', '/disclaimer', '/support'] as const;

test.describe('Retired PWA stays retired', () => {
  for (const path of ['/', '/map', '/provider', '/vendor', '/host'] as const) {
    test(`${path} renders the native handoff, not the web app`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('[data-native-handoff]')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Download on the App Store' })).toHaveAttribute('href', 'https://apps.apple.com/app/id6761876421');
      // Off iPhone a bytspot:// link can never open anything.
      await expect(page.getByRole('link', { name: 'Open in Bytspot' })).toHaveCount(0);
      await expect(page.locator('#root')).toContainText('Bytspot is available on iPhone.');
      await expect(page.locator('#root')).not.toContainText(/old (web|React) app/);
    });
  }

  test('A party link keeps its own Smart App Banner rather than the homepage default', async ({ page }) => {
    await page.goto('/party/test-party-id');
    // iOS reads the first banner, which the handoff rewrites per URL; the
    // static homepage default stays behind it.
    await expect(page.locator('meta[name="apple-itunes-app"]').first())
      .toHaveAttribute('content', /app-argument=\S*\/party\/test-party-id$/);
  });
});

test.describe('On iPhone', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 },
  });

  test('Open in Bytspot opens the app, and falls back to the App Store when it does not open', async ({ page }) => {
    await page.goto('/');
    const open = page.getByRole('link', { name: 'Open in Bytspot' });
    await expect(open).toHaveAttribute('href', 'bytspot://home');
    // The app is not installed here, so the scheme goes nowhere and the page stays visible.
    await page.route('https://apps.apple.com/**', (route) => route.fulfill({ status: 200, body: 'app store' }));
    await open.click();
    await page.waitForURL('https://apps.apple.com/app/id6761876421', { timeout: 5000 });
  });
});

test('/admin boots Bytspot Admin instead of the handoff', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Bytspot Admin' })).toBeVisible();
  await expect(page.locator('[data-native-handoff]')).toHaveCount(0);
  await expect(page.locator('meta[name="apple-itunes-app"]')).toHaveCount(0);
});

test.describe('Legal pages still load', () => {
  for (const path of LEGAL_PATHS) {
    test(`${path} boots React instead of the handoff`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('#root')).not.toBeEmpty();
      await expect(page.locator('[data-native-handoff]')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }

  test('A trailing slash resolves to the page, not the retired app', async ({ page }) => {
    await page.goto('/privacy/');
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.locator('[data-native-handoff]')).toHaveCount(0);
  });
});
