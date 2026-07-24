import { expect, test } from '@playwright/test';

test.describe('App Store consumer-only gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('bytspot_intro_seen', 'true');
      (window as unknown as { __BYT_APP_STORE_CONSUMER_ONLY__?: boolean }).__BYT_APP_STORE_CONSUMER_ONLY__ = true;
    });
  });

  for (const path of ['/provider', '/provider/onboarding', '/vendor', '/host', '/admin', '/admin/approvals', '/valet', '/valet/dashboard', '/marketing', '/marketing/assets'] as const) {
    test(`${path} redirects to Parker home`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByTestId('provider-landing-root')).toHaveCount(0);
      await expect(page.getByText(/Provider approvals/i)).toHaveCount(0);
    });
  }

  test('Parker consumer routes remain available', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  });

  test('app-store manifest is consumer-only', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response?.ok()).toBe(true);
    const manifest = await page.locator('body').textContent();
    expect(manifest).toContain('Bytspot');
    expect(manifest).not.toMatch(/provider|vendor|host|valet|admin|marketing|onboarding/i);
  });
});