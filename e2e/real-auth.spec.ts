import { test, expect } from '@playwright/test';
import fs from 'fs';

test('real signup, logout, and login reaches main app', async ({ page }) => {
  test.setTimeout(120_000);

  const logPath = 'real-auth-run.log';
  fs.writeFileSync(logPath, 'START\n');
  const log = (message: string) => fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);

  const email = `augment.auth.${Date.now()}@example.com`;
  const password = 'BytspotPass123!';
  const name = 'Augment Smoke';
  const apiHits: Array<{ url: string; status: number }> = [];
  const pageErrors: string[] = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
    log(`pageerror ${error.message}`);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/trpc/auth.signup') || url.includes('/trpc/auth.login') || url.includes('/trpc/auth.me')) {
      apiHits.push({ url, status: response.status() });
      log(`response ${response.status()} ${url}`);
    }
  });

  const openAuth = async () => {
    log('open auth');
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('bytspot_onboarding_seen', 'true'));
    await page.goto('/');
    await expect(page.getByText("Let's Go")).toBeVisible({ timeout: 20_000 });
    log("landing visible");
    await page.getByText("Let's Go").click();
    await expect(page.getByRole('button', { name: 'Continue as Guest' })).toBeVisible({ timeout: 15_000 });
    log('auth visible');
  };

  const expectLoggedInState = async () => {
    log('verify logged in state');
    for (const tab of ['Home', 'Discover', 'Map', 'Concierge']) {
      await expect(page.getByRole('tab', { name: `${tab} tab` })).toBeVisible({ timeout: 15_000 });
    }

    const storageState = await page.evaluate(() => ({
      token: localStorage.getItem('bytspot_auth_token'),
      user: localStorage.getItem('bytspot_user'),
      userName: localStorage.getItem('bytspot_user_name'),
    }));

    expect(storageState.token).toBeTruthy();
    expect(storageState.token).not.toBe('beta_guest');
    const user = JSON.parse(storageState.user || '{}');
    expect(user.email).toBe(email);
    expect(storageState.userName).toContain('Augment');
    log(`stored user ok ${user.email}`);
  };

  await openAuth();

  log('fill signup');
  await page.getByPlaceholder('Full name').fill(name);
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).requestSubmit());
  log('signup submitted');

  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 20_000 });
  log('signup reached home');
  await expectLoggedInState();

  log('open profile');
  await page.locator('button:has(svg.lucide-menu)').click();
  await expect(page.getByText('Log Out', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Privacy Policy', { exact: true })).toBeVisible();
  log('profile visible');
  await page.getByText('Log Out', { exact: true }).click();

  await expect(page.getByRole('button', { name: 'Continue as Guest' })).toBeVisible({ timeout: 20_000 });
  log('logout returned to auth');

  await page.getByRole('button', { name: 'Log In', exact: true }).first().click();
  log('login mode selected');
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).requestSubmit());
  log('login submitted');

  await expect(page.getByRole('tab', { name: 'Home tab' })).toBeVisible({ timeout: 20_000 });
  log('login reached home');
  await expectLoggedInState();

  await page.getByRole('tab', { name: 'Discover tab' }).click({ force: true });
  await expect(page.getByRole('tab', { name: 'Discover tab' })).toHaveAttribute('aria-selected', 'true');
  log('discover ok');
  await page.getByRole('tab', { name: 'Map tab' }).click({ force: true });
  await expect(page.getByRole('tab', { name: 'Map tab' })).toHaveAttribute('aria-selected', 'true');
  log('map ok');
  await page.getByRole('tab', { name: 'Concierge tab' }).click({ force: true });
  await expect(page.getByRole('tab', { name: 'Concierge tab' })).toHaveAttribute('aria-selected', 'true');
  log('concierge ok');

  expect(apiHits.some((hit) => hit.url.includes('/trpc/auth.signup') && hit.status === 200)).toBeTruthy();
  expect(apiHits.some((hit) => hit.url.includes('/trpc/auth.login') && hit.status === 200)).toBeTruthy();
  expect(pageErrors).toEqual([]);
  log('PASS');
});
