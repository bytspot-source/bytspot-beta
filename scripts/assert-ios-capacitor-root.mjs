import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appDelegatePath = join(process.cwd(), 'ios', 'App', 'App', 'AppDelegate.swift');
const source = readFileSync(appDelegatePath, 'utf8');
const appDelegateBody = source.split('// MARK: - BytspotTier')[0] ?? source;

const required = [
  {
    label: 'AppDelegate launches CAPBridgeViewController as root',
    pattern: /let\s+root\s*=\s*CAPBridgeViewController\s*\(\s*\)/,
  },
  {
    label: 'URL opens are forwarded to Capacitor ApplicationDelegateProxy',
    pattern: /return\s+ApplicationDelegateProxy\.shared\.application\(app,\s*open:\s*url,\s*options:\s*options\)/,
  },
  {
    label: 'Universal links are forwarded to Capacitor ApplicationDelegateProxy',
    pattern: /return\s+ApplicationDelegateProxy\.shared\.application\(application,\s*continue:\s*userActivity,\s*restorationHandler:\s*restorationHandler\)/,
  },
];

const forbidden = [
  {
    label: 'SwiftUI shell must not be the App Store launch root',
    pattern: /UIHostingController\s*\(\s*rootView:\s*BytspotNativeShellView/,
  },
  {
    label: 'NativeBridgeStore must not own AppDelegate release routing',
    pattern: /nativeBridgeStore|NativeBridgeStore\s*\(/,
  },
  {
    label: 'Native patch presentation must not intercept release URL launch',
    pattern: /presentNativePatchExperience\s*\(/,
  },
];

const failures = [];

for (const check of required) {
  if (!check.pattern.test(appDelegateBody)) failures.push(`Missing: ${check.label}`);
}

for (const check of forbidden) {
  if (check.pattern.test(appDelegateBody)) failures.push(`Forbidden: ${check.label}`);
}

if (failures.length > 0) {
  console.error('[ios-capacitor-root] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[ios-capacitor-root] PASS: App Store launch root is full-screen Capacitor React webview.');