import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  IOS_INSTALL_STEPS,
  createInstallController,
  installHeadline,
  isIosDevice,
  isStandaloneDisplay,
  resolveInstallState,
  type BeforeInstallPromptEvent,
} from '../installPrompt.ts';

const IPAD_OS_13_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const MAC_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

test('an iPad reporting itself as a Mac is still treated as iOS', () => {
  // iPadOS 13+ lies in its user agent, and it is the tablet a vendor is most
  // likely to own, so touch points are the only thing separating the two.
  assert.equal(isIosDevice(IPAD_OS_13_UA, 5), true);
  assert.equal(isIosDevice(MAC_SAFARI_UA, 0), false);
  assert.equal(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5), true);
  assert.equal(isIosDevice(ANDROID_CHROME_UA, 5), false);
});

test('each browser gets the only install path it actually supports', () => {
  const androidTablet = resolveInstallState({ hasDeferredPrompt: true, isStandalone: false, isIos: false });
  assert.equal(androidTablet, 'promptable');

  // iOS never fires beforeinstallprompt, so a button would be a dead end.
  const iPad = resolveInstallState({ hasDeferredPrompt: false, isStandalone: false, isIos: true });
  assert.equal(iPad, 'manual-ios');
  assert.equal(installHeadline(iPad), 'Add to Home Screen');
  assert.equal(IOS_INSTALL_STEPS.length, 3);

  assert.equal(resolveInstallState({ hasDeferredPrompt: true, isStandalone: true, isIos: false }), 'installed');
  assert.equal(resolveInstallState({ hasDeferredPrompt: false, isStandalone: true, isIos: true }), 'installed');
  assert.equal(resolveInstallState({ hasDeferredPrompt: false, isStandalone: false, isIos: false }), 'unavailable');
});

test('an installed window is detected on both standalone signals', () => {
  assert.equal(isStandaloneDisplay(true, undefined), true);
  assert.equal(isStandaloneDisplay(false, true), true);
  assert.equal(isStandaloneDisplay(false, false), false);
  assert.equal(isStandaloneDisplay(false, undefined), false);
});

test('the deferred prompt is kept, used once, and never reused', async () => {
  const controller = createInstallController();
  let prevented = 0;
  let prompted = 0;
  let notified = 0;
  controller.subscribe(() => {
    notified += 1;
  });

  assert.equal(controller.hasPrompt(), false);
  assert.equal(await controller.promptToInstall(), 'unavailable');

  const event = {
    preventDefault: () => {
      prevented += 1;
    },
    prompt: async () => {
      prompted += 1;
    },
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  } as unknown as BeforeInstallPromptEvent;

  controller.capture(event);
  // Without preventDefault Chrome shows its own mini-infobar instead of ours.
  assert.equal(prevented, 1);
  assert.equal(controller.hasPrompt(), true);

  assert.equal(await controller.promptToInstall(), 'accepted');
  assert.equal(prompted, 1);
  // Chrome rejects a second prompt() on the same event, so it must be gone.
  assert.equal(controller.hasPrompt(), false);
  assert.equal(await controller.promptToInstall(), 'unavailable');
  assert.equal(prompted, 1);
  assert.ok(notified >= 2);
});

test('the vendor service worker is a real worker, not the consumer kill-switch', () => {
  const vendorSw = readFileSync(new URL('../../../vendor/public/sw.js', import.meta.url), 'utf8');
  const consumerSw = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');

  // The consumer worker exists to unregister itself; copying it would make the
  // vendor console uninstallable and wipe its offline shell.
  assert.match(consumerSw, /registration\.unregister/);
  assert.doesNotMatch(vendorSw, /registration\.unregister/);
  // An install prompt requires a fetch handler.
  assert.match(vendorSw, /addEventListener\('fetch'/);
  // Stale inventory is worse than an honest failure.
  assert.match(vendorSw, /\/api\//);
});

test('the vendor manifest installs standalone with maskable icons', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../../vendor/public/manifest.webmanifest', import.meta.url), 'utf8'),
  );

  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.name, 'Bytspot Vendor');
  assert.ok(manifest.start_url.startsWith('/'));

  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
  assert.ok(sizes.includes('192x192'));
  assert.ok(sizes.includes('512x512'));
  // Android crops a non-maskable icon into a plain circle.
  assert.ok(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable'));
});

test('the vendor console never advertises the consumer iPhone app', () => {
  const html = readFileSync(new URL('../../../vendor/index.html', import.meta.url), 'utf8');

  // A Smart App Banner here would push a vendor to the guest app.
  assert.doesNotMatch(html, /apple-itunes-app/);
  assert.match(html, /rel="manifest"/);
  // Without this an installed iPad icon still opens inside Safari chrome.
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="robots" content="noindex/);
});
