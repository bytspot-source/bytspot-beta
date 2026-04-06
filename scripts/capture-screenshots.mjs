/**
 * App Store Screenshot Capture Script
 * Captures key screens at iPhone 15 Pro Max (1290x2796) and iPhone 11 Pro Max (1242x2688)
 * Usage: npx playwright install chromium && node scripts/capture-screenshots.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE_URL = 'https://bytspot-beta-app.onrender.com';
const OUTPUT_DIR = './screenshots';

// iPhone 15 Pro Max: 1290x2796 physical = 430x932 CSS @ 3x
// iPhone 11 Pro Max: 1242x2688 physical = 414x896 CSS @ 3x
const DEVICES = [
  { name: '6.7inch', width: 430, height: 932, scale: 3 },
  { name: '6.5inch', width: 414, height: 896, scale: 3 },
];

async function captureScreens(page, prefix) {
  const TIMEOUT = 120000; // 2min — Render free tier cold starts

  // 1. Landing page
  console.log(`  ⏳ Loading landing page...`);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUTPUT_DIR}/${prefix}_01_landing.png` });
  console.log(`  ✅ ${prefix}_01_landing`);

  // 2. Click CTA to get to auth screen
  try {
    const ctaBtn = page.getByRole('button', { name: /get started|explore|sign up|join/i }).first();
    await ctaBtn.click({ timeout: 5000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUTPUT_DIR}/${prefix}_02_auth.png` });
    console.log(`  ✅ ${prefix}_02_auth`);
  } catch { console.log(`  ⚠️ No CTA found, skipping auth screen`); }

  // 3. Skip auth — inject mock token and reload
  await page.evaluate(() => {
    localStorage.setItem('bytspot_auth_token', 'screenshot-session');
  });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUTPUT_DIR}/${prefix}_03_home.png` });
  console.log(`  ✅ ${prefix}_03_home`);

  // 4. Scroll to show venue cards
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUTPUT_DIR}/${prefix}_04_venues.png` });
  console.log(`  ✅ ${prefix}_04_venues`);

  // 5. Try clicking bottom nav tabs
  for (const [tabText, filename] of [['Discover', '05_discover'], ['Map', '06_map']]) {
    try {
      const tab = page.locator(`text=${tabText}`).first();
      await tab.click({ timeout: 3000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUTPUT_DIR}/${prefix}_${filename}.png` });
      console.log(`  ✅ ${prefix}_${filename}`);
    } catch { console.log(`  ⚠️ ${tabText} tab not found`); }
  }
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  for (const device of DEVICES) {
    console.log(`\n📱 Capturing ${device.name} (${device.width}x${device.height} @ ${device.scale}x)...`);

    const context = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.scale,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });

    const page = await context.newPage();
    await captureScreens(page, device.name);
    await context.close();
  }

  await browser.close();
  console.log(`\n🎉 All screenshots saved to ${OUTPUT_DIR}/`);
}

main().catch(console.error);
