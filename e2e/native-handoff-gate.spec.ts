import { expect, test } from '@playwright/test';

/**
 * The web surface is a kill-switch plus four legal pages. Everything the old
 * Playwright smoke suite drove — Map, provider, vendor, Google sign-in — is a
 * retired PWA, so this gate protects what actually ships instead.
 */

const LEGAL_PATHS = ['/privacy', '/terms', '/disclaimer', '/support'] as const;

test.describe('Retired PWA stays retired', () => {
  for (const path of ['/', '/map', '/provider', '/vendor', '/host', '/admin'] as const) {
    test(`${path} renders the native handoff, not the web app`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByText('Native only')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open Bytspot' })).toBeVisible();
      await expect(page.locator('#root')).toContainText('never loads the old React app');
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

test.describe('Legal pages still load', () => {
  for (const path of LEGAL_PATHS) {
    test(`${path} boots React instead of the handoff`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('#root')).not.toBeEmpty();
      await expect(page.getByText('Native only')).toHaveCount(0);
    });
  }

  test('A trailing slash resolves to the page, not the retired app', async ({ page }) => {
    await page.goto('/privacy/');
    await expect(page.locator('#root')).not.toBeEmpty();
    await expect(page.getByText('Native only')).toHaveCount(0);
  });
});
