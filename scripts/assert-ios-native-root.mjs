// Release gate: the iOS app is pure native SwiftUI. Capacitor, the React web
// bundle, and any hybrid webview root are forbidden in the App target.
// Replaces the retired assert-ios-capacitor-root.mjs / assert-ios-web-bundle-sync.mjs.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  appDelegate: path.join(root, 'ios/App/App/AppDelegate.swift'),
  nativeShell: path.join(root, 'ios/App/App/NativeShellView.swift'),
  nativeRouting: path.join(root, 'ios/App/App/BytspotNativeRouting.swift'),
  appInfoPlist: path.join(root, 'ios/App/App/Info.plist'),
  project: path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'),
  packageResolved: path.join(root, 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'),
  packageJson: path.join(root, 'package.json'),
  aasa: path.join(root, 'public/.well-known/apple-app-site-association'),
  rootAasa: path.join(root, 'public/apple-app-site-association'),
  reviewNotes: path.join(root, 'APP_REVIEW_NOTES.md'),
};

const read = (label, file) => {
  if (!fs.existsSync(file)) throw new Error(`${label} missing: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
};

const appDelegate = read('AppDelegate', files.appDelegate);
const nativeShell = read('NativeShellView', files.nativeShell);
const nativeRouting = read('BytspotNativeRouting', files.nativeRouting);
const appInfoPlist = read('App Info.plist', files.appInfoPlist);
const project = read('Xcode project', files.project);
const packageResolved = fs.existsSync(files.packageResolved) ? fs.readFileSync(files.packageResolved, 'utf8') : '';
const packageJson = JSON.parse(read('package.json', files.packageJson));
const aasaJson = JSON.parse(read('AASA', files.aasa));
const rootAasaJson = JSON.parse(read('Root AASA alias', files.rootAasa));
const reviewNotes = read('App Review Notes', files.reviewNotes);
const appDelegateBody = appDelegate.split('// MARK: - BytspotTier')[0] ?? appDelegate;

const walkFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const fullPath = path.join(dir, entry.name);
  if (entry.isDirectory()) return walkFiles(fullPath);
  return [fullPath];
});

const appSwiftSources = walkFiles(path.join(root, 'ios/App/App'))
  .filter((file) => file.endsWith('.swift'))
  .map((file) => [path.relative(root, file), fs.readFileSync(file, 'utf8')]);

const aasaPatterns = new Set(
  (aasaJson.applinks?.details ?? []).flatMap((detail) => (detail.components ?? []).map((component) => component['/']))
);
const aasaComponents = aasaJson.applinks?.details?.[0]?.components ?? [];
const expectedAasaComponents = [
  { '/': '/BYT424', '?': { patchId: 'BYT424-*' }, comment: 'Campaign root with serialized patchId query, e.g. /BYT424?patchId=BYT424-0301' },
  { '/': '/BYT*', comment: 'Root NTAG424 DNA production tag links, e.g. /BYT424-0301' },
  { '/': '/p/*', comment: 'Patch verify deep link' },
  { '/': '/access', comment: 'Native Access wallet' },
  { '/': '/access/*', comment: 'Full-app handoff path emitted by App Clip mainAppHandoffURL' },
  { '/': '/patch', comment: 'Compatibility path for older Smart App Banner defaults' },
  { '/': '/patch/*', comment: 'Patch verify deep link alias for NFC/App Clip demos' },
  { '/': '/t/*', comment: 'Production NFC tag serial deep link' },
  { '/': '/v/*', comment: 'Venue deep link' },
  { '/': '/clip', comment: 'App Clip launch path' },
  { '/': '/profile', comment: 'Native profile surface' },
  { '/': '/profile/*', comment: 'Native profile subpaths' },
  { '/': '/map', comment: 'Native map tab' },
  { '/': '/map/*', comment: 'Native map subpaths' },
  { '/': '/discover', comment: 'Native discovery tab' },
  { '/': '/discover/*', comment: 'Native discovery subpaths' },
  { '/': '/venue/*', comment: 'Native venue discovery links' },
  { '/': '/concierge', comment: 'Native concierge tab' },
  { '/': '/concierge/*', comment: 'Native concierge subpaths' },
  { '/': '/booking/*', comment: 'Native booking return paths' },
  { '/': '/privacy', comment: 'Native legal surface' },
  { '/': '/terms', comment: 'Native legal surface' },
  { '/': '/disclaimer', comment: 'Native legal surface' },
  { '/': '/', '?': { patchId: '?*' }, comment: 'Canonical patchId query parameter' },
  { '/': '/', '?': { patch: '?*' }, comment: 'Legacy patch query parameter' },
];
const requiredUniversalLinkPatterns = [
  '/BYT424', '/BYT*', '/p/*', '/access', '/access/*', '/patch', '/patch/*', '/t/*', '/v/*', '/clip',
  '/profile', '/profile/*', '/map', '/map/*', '/discover', '/discover/*', '/venue/*', '/concierge', '/concierge/*',
  '/booking/*', '/privacy', '/terms', '/disclaimer', '/',
];
const allowedUniversalLinkPatterns = new Set(requiredUniversalLinkPatterns);
const forbiddenWebViewSymbols = ['WKWebView', 'WKWebViewConfiguration', 'WKScriptMessageHandler', 'WKUserContentController', 'UIWebView'];
const packageScripts = packageJson.scripts ?? {};

const checks = [
  // Native root is unconditional.
  ['AppDelegate launches SwiftUI native root unconditionally', /UIHostingController\s*\(\s*rootView:\s*BytspotNativeAppRoot\s*\(\s*\)\s*\)/.test(appDelegateBody)],
  ['AppDelegate buffers launch-option deep links', appDelegateBody.includes('publishLaunchOptions(launchOptions)') && appDelegateBody.includes('launchOptions[.url]')],
  ['AppDelegate buffers launch-option universal links', appDelegateBody.includes('launchOptions[.userActivityDictionary]') && appDelegateBody.includes('publishLaunchUserActivityValue')],
  ['Deep links publish through NativeIncomingURLCenter', appDelegateBody.includes('NativeIncomingURLCenter.publish(url, scanSource: .deepLink)')],
  ['Universal links publish through NativeIncomingURLCenter', appDelegateBody.includes('NativeIncomingURLCenter.publish(url, scanSource: .universalLink)')],
  // Capacitor bridge is forbidden.
  ['AppDelegate does not launch CAPBridgeViewController', !appDelegateBody.includes('CAPBridgeViewController')],
  ['AppDelegate does not defer to ApplicationDelegateProxy', !appDelegateBody.includes('ApplicationDelegateProxy')],
  ['No App-target Swift source imports Capacitor', appSwiftSources.every(([, source]) => !/^import Capacitor/m.test(source))],
  ['No App-target Swift source instantiates a Capacitor bridge', appSwiftSources.every(([, source]) => !source.includes('CAPBridgeViewController'))],
  ['No App-target Swift source imports WebKit', appSwiftSources.every(([, source]) => !/^import WebKit/m.test(source))],
  ['No App-target Swift source references webview bridge symbols', appSwiftSources.every(([, source]) => forbiddenWebViewSymbols.every((symbol) => !source.includes(symbol)))],
  ['Native shell resolves legacy hybrid routes natively', nativeShell.includes('openNativeEquivalent(for: route)')],
  ['Native router covers AASA compatibility paths', nativeRouting.includes('path.hasPrefix("v/")') && nativeRouting.includes('path == "clip"') && nativeRouting.includes('path == "patch"')],
  ['Native router covers required Parker paths', nativeRouting.includes('path == "access"') && nativeRouting.includes('path.hasPrefix("booking/")') && nativeRouting.includes('path == "profile"') && nativeRouting.includes('path == "map"') && nativeRouting.includes('path == "discover"') && nativeRouting.includes('path == "concierge"')],
  ['AASA includes every required native universal-link pattern', requiredUniversalLinkPatterns.every((pattern) => aasaPatterns.has(pattern))],
  ['AASA does not advertise unsupported native universal-link patterns', [...aasaPatterns].every((pattern) => allowedUniversalLinkPatterns.has(pattern))],
  ['AASA component matrix exactly matches native route contract', JSON.stringify(aasaComponents) === JSON.stringify(expectedAasaComponents)],
  ['Root AASA alias mirrors well-known AASA', JSON.stringify(rootAasaJson) === JSON.stringify(aasaJson)],
  // The web bundle and Capacitor wiring are excised from the Xcode project.
  ['Xcode project has no CapApp-SPM package dependency', !project.includes('CapApp-SPM')],
  ['Xcode project bundles no capacitor.config.json', !project.includes('capacitor.config.json')],
  ['Xcode project bundles no React web bundle (public/)', !project.includes('/* public */')],
  ['Xcode project bundles no Cordova config.xml', !project.includes('config.xml')],
  ['Xcode project bundles no Capacitor Main.storyboard', !project.includes('Main.storyboard')],
  ['Package.resolved has no Capacitor SwiftPM pins', !packageResolved.toLowerCase().includes('capacitor')],
  ['App Info.plist has no stale Capacitor/WebKit/storyboard keys', !appInfoPlist.includes('CAPACITOR_DEBUG') && !appInfoPlist.includes('WKAppBoundDomains') && !appInfoPlist.includes('UIMainStoryboardFile')],
  ['ios/App/App/public web bundle is deleted', !fs.existsSync(path.join(root, 'ios/App/App/public'))],
  ['ios/App/CapApp-SPM package is deleted', !fs.existsSync(path.join(root, 'ios/App/CapApp-SPM'))],
  ['ios capacitor.config.json is deleted', !fs.existsSync(path.join(root, 'ios/App/App/capacitor.config.json'))],
  ['root capacitor.config.ts remains retired', !fs.existsSync(path.join(root, 'capacitor.config.ts'))],
  ['Root npm has no iOS Capacitor sync/open/run tooling', !Object.keys(packageScripts).some((name) => name.startsWith('cap:')) && !Object.values(packageScripts).some((script) => /npx\s+cap(\s|$)|npx\s+capacitor(\s|$)/.test(script))],
  ['Root npm Capacitor dependency exception is documented as web-only', reviewNotes.includes('The repository root still contains Capacitor npm packages for the separate React web beta')],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error('[ios-native-root] FAIL');
  for (const name of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log(`[ios-native-root] PASS (${checks.length} checks): iOS App target is pure native SwiftUI — no Capacitor, no React web bundle.`);
