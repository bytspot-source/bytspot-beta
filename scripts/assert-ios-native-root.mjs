// Release gate: the iOS app is pure native SwiftUI. Capacitor, the React web
// bundle, and any hybrid webview root are forbidden in the App target.
// Replaces the retired assert-ios-capacitor-root.mjs / assert-ios-web-bundle-sync.mjs.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  appDelegate: path.join(root, 'ios/App/App/AppDelegate.swift'),
  nativeShell: path.join(root, 'ios/App/App/NativeShellView.swift'),
  project: path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'),
};

const read = (label, file) => {
  if (!fs.existsSync(file)) throw new Error(`${label} missing: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
};

const appDelegate = read('AppDelegate', files.appDelegate);
const nativeShell = read('NativeShellView', files.nativeShell);
const project = read('Xcode project', files.project);
const appDelegateBody = appDelegate.split('// MARK: - BytspotTier')[0] ?? appDelegate;

const appSwiftSources = fs
  .readdirSync(path.join(root, 'ios/App/App'))
  .filter((name) => name.endsWith('.swift'))
  .map((name) => [name, fs.readFileSync(path.join(root, 'ios/App/App', name), 'utf8')]);

const checks = [
  // Native root is unconditional.
  ['AppDelegate launches SwiftUI native root unconditionally', /UIHostingController\s*\(\s*rootView:\s*BytspotNativeAppRoot\s*\(\s*\)\s*\)/.test(appDelegateBody)],
  ['Deep links publish through NativeIncomingURLCenter', appDelegateBody.includes('NativeIncomingURLCenter.publish(url, scanSource: .deepLink)')],
  ['Universal links publish through NativeIncomingURLCenter', appDelegateBody.includes('NativeIncomingURLCenter.publish(url, scanSource: .universalLink)')],
  // Capacitor bridge is forbidden.
  ['AppDelegate does not launch CAPBridgeViewController', !appDelegateBody.includes('CAPBridgeViewController')],
  ['AppDelegate does not defer to ApplicationDelegateProxy', !appDelegateBody.includes('ApplicationDelegateProxy')],
  ['No App-target Swift source imports Capacitor', appSwiftSources.every(([, source]) => !/^import Capacitor/m.test(source))],
  ['No App-target Swift source instantiates a Capacitor bridge', appSwiftSources.every(([, source]) => !source.includes('CAPBridgeViewController'))],
  ['Native shell resolves legacy hybrid routes natively', nativeShell.includes('openNativeEquivalent(for: route)')],
  // The web bundle and Capacitor wiring are excised from the Xcode project.
  ['Xcode project has no CapApp-SPM package dependency', !project.includes('CapApp-SPM')],
  ['Xcode project bundles no capacitor.config.json', !project.includes('capacitor.config.json')],
  ['Xcode project bundles no React web bundle (public/)', !project.includes('/* public */')],
  ['Xcode project bundles no Cordova config.xml', !project.includes('config.xml')],
  ['Xcode project bundles no Capacitor Main.storyboard', !project.includes('Main.storyboard')],
  ['ios/App/App/public web bundle is deleted', !fs.existsSync(path.join(root, 'ios/App/App/public'))],
  ['ios/App/CapApp-SPM package is deleted', !fs.existsSync(path.join(root, 'ios/App/CapApp-SPM'))],
  ['ios capacitor.config.json is deleted', !fs.existsSync(path.join(root, 'ios/App/App/capacitor.config.json'))],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error('[ios-native-root] FAIL');
  for (const name of failed) console.error(`- ${name}`);
  process.exit(1);
}

console.log(`[ios-native-root] PASS (${checks.length} checks): iOS App target is pure native SwiftUI — no Capacitor, no React web bundle.`);
