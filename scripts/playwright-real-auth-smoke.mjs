import fs from 'fs';
import { chromium } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173';
const email = `augment.auth.${Date.now()}@example.com`;
const password = 'BytspotPass123!';
const name = 'Augment Smoke';
const logPath = 'playwright-real-auth-script.log';
const apiHits = [];
const jsErrors = [];

fs.writeFileSync(logPath, 'START\n');
const log = (message) => fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
process.on('uncaughtException', (error) => {
  log(`uncaughtException ${error instanceof Error ? error.stack || error.message : String(error)}`);
});
process.on('unhandledRejection', (reason) => {
  log(`unhandledRejection ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
});
const hardTimeout = setTimeout(() => {
  log('TIMEOUT');
  process.exit(1);
}, 120_000);

async function openAuth(page) {
  log('open auth');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.evaluate(() => localStorage.setItem('bytspot_onboarding_seen', 'true'));
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.getByText("Let's Go").waitFor({ state: 'visible', timeout: 20_000 });
  log('landing visible');
  await page.getByText("Let's Go").click();
  await page.getByRole('button', { name: 'Continue as Guest' }).waitFor({ state: 'visible', timeout: 15_000 });
  log('auth visible');
}

async function waitForAuthResult(page, label) {
  log(`${label} waiting for result`);
  const homeTab = page.getByRole('tab', { name: 'Home tab' });
  const errorBanner = page.getByText(/Invalid email or password|Connection error|Email already registered|Password must be at least 8 characters|Failed to fetch|Something went wrong/i).first();
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    if (await homeTab.isVisible().catch(() => false)) {
      log(`${label} home visible`);
      return;
    }

    if (await errorBanner.isVisible().catch(() => false)) {
      const text = (await errorBanner.textContent())?.trim() || 'Unknown auth error';
      log(`${label} error ${text}`);
      throw new Error(`${label} error: ${text}`);
    }

    await page.waitForTimeout(500);
  }

  const debugState = await page.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 1200),
    token: localStorage.getItem('bytspot_auth_token'),
    user: localStorage.getItem('bytspot_user'),
    userName: localStorage.getItem('bytspot_user_name'),
  }));
  log(`${label} timeout body ${JSON.stringify(debugState)}`);
  throw new Error(`${label} did not reach Home tab within timeout`);
}

async function verifyMainApp(page, expectedEmail) {
  for (const tab of ['Home', 'Discover', 'Map', 'Concierge']) {
    await page.getByRole('tab', { name: `${tab} tab` }).waitFor({ state: 'visible', timeout: 15_000 });
  }
  const state = await page.evaluate(() => ({
    token: localStorage.getItem('bytspot_auth_token'),
    user: localStorage.getItem('bytspot_user'),
    userName: localStorage.getItem('bytspot_user_name'),
  }));
  if (!state.token || state.token === 'beta_guest') throw new Error('Missing real auth token');
  const user = JSON.parse(state.user || '{}');
  if (user.email !== expectedEmail) throw new Error(`Stored user mismatch: ${user.email || 'none'}`);
  log(`stored user ok ${user.email}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') log(`console.error ${msg.text()}`);
});
page.on('pageerror', (err) => {
  jsErrors.push(err.message);
  log(`pageerror ${err.message}`);
});
page.on('requestfailed', (request) => {
  const url = request.url();
  if (url.includes('/trpc/auth.signup') || url.includes('/trpc/auth.login') || url.includes('/trpc/auth.me')) {
    log(`requestfailed ${request.failure()?.errorText || 'unknown'} ${url}`);
  }
});
page.on('response', (response) => {
  const url = response.url();
  if (response.status() >= 400) {
    log(`http ${response.status()} ${url}`);
  }
  if (url.includes('/trpc/auth.signup') || url.includes('/trpc/auth.login') || url.includes('/trpc/auth.me')) {
    apiHits.push({ url, status: response.status() });
    log(`response ${response.status()} ${url}`);
  }
});

try {
  log('browser launched');
  await openAuth(page);
  await page.getByPlaceholder('Full name').fill(name);
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  log('signup filled');
  await page.locator('form').evaluate((form) => form.requestSubmit());
  log('signup submitted');
  await waitForAuthResult(page, 'signup');
  await verifyMainApp(page, email);

  await page.locator('button:has(svg.lucide-menu)').first().click();
  await page.getByText('Log Out', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  log('profile visible');
  await page.getByText('Log Out', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue as Guest' }).waitFor({ state: 'visible', timeout: 20_000 });
  log('logout returned to auth');

  await page.getByRole('button', { name: 'Log In', exact: true }).first().click();
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  log('login filled');
  await page.locator('form').evaluate((form) => form.requestSubmit());
  log('login submitted');
  await waitForAuthResult(page, 'login');
  await verifyMainApp(page, email);

  for (const tab of ['Discover', 'Map', 'Concierge']) {
    await page.getByRole('tab', { name: `${tab} tab` }).click({ force: true });
    log(`${tab.toLowerCase()} tab clicked`);
  }

  if (!apiHits.some((hit) => hit.url.includes('/trpc/auth.signup') && hit.status === 200)) throw new Error('Signup API 200 not observed');
  if (!apiHits.some((hit) => hit.url.includes('/trpc/auth.login') && hit.status === 200)) throw new Error('Login API 200 not observed');
  if (jsErrors.length > 0) throw new Error(`Page errors: ${jsErrors.join(' | ')}`);

  log('PASS');
  console.log(JSON.stringify({ ok: true, email, apiHits }, null, 2));
} catch (error) {
  log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  await page.screenshot({ path: 'playwright-real-auth-failure.png', fullPage: true }).catch(() => {});
  console.error(JSON.stringify({ ok: false, email, error: error instanceof Error ? error.message : String(error), apiHits, jsErrors }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
