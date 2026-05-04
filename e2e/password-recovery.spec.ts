import { expect, test } from '@playwright/test';

test.describe('password recovery routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
  });

  test('login screen links to the forgot-password route', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /let's go/i }).click({ timeout: 15_000 });
    await page.getByRole('button', { name: /log in/i }).click();

    const forgotLink = page.getByTestId('forgot-password-link');
    await expect(forgotLink).toBeVisible();
    await expect(forgotLink).toHaveAttribute('href', '/#/forgot-password');
    // Navigate to the recovery route via a real (non hash-only) navigation so App.tsx
    // re-evaluates window.location on a fresh render; hash-only goto from '/' is treated
    // as in-page by Chromium and does not trigger React to remount the route branch.
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /forgot your password/i })).toBeVisible();
  });

  test('forgot-password form posts to /auth/forgot and shows generic success', async ({ page }) => {
    let requestedBody: unknown = null;
    await page.route('**/auth/forgot', async (route) => {
      requestedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'If an account exists for that email, a reset link has been sent.' }),
      });
    });

    await page.goto('/#/forgot-password');
    await page.getByPlaceholder('Email address').fill('Recover@Example.com');
    await page.getByTestId('password-recovery-submit').click();

    await expect(page.getByRole('status')).toContainText(/reset link has been sent/i);
    expect(requestedBody).toEqual({ email: 'Recover@Example.com' });
  });

  test('hash reset-password route posts token and password to /auth/reset', async ({ page }) => {
    let requestedBody: unknown = null;
    await page.route('**/auth/reset', async (route) => {
      requestedBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    await page.goto('/#/reset-password?token=test-reset-token-1234567890');
    await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible();
    await page.getByPlaceholder('New password', { exact: true }).fill('NewPassword123!');
    await page.getByPlaceholder('Confirm new password').fill('NewPassword123!');
    await page.getByTestId('password-recovery-submit').click();

    await expect(page.getByRole('status')).toContainText(/password has been reset/i);
    expect(requestedBody).toEqual({ token: 'test-reset-token-1234567890', password: 'NewPassword123!' });
  });

  test('reset-password route validates matching passwords before calling API', async ({ page }) => {
    let called = false;
    await page.route('**/auth/reset', async (route) => {
      called = true;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/#/reset-password?token=test-reset-token-1234567890');
    await page.getByPlaceholder('New password', { exact: true }).fill('NewPassword123!');
    await page.getByPlaceholder('Confirm new password').fill('DifferentPassword123!');
    await page.getByTestId('password-recovery-submit').click();

    await expect(page.getByRole('alert')).toContainText(/passwords do not match/i);
    expect(called).toBe(false);
  });
});
