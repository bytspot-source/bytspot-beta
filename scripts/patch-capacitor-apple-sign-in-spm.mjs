import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageSwift = resolve(__dirname, '../node_modules/@capacitor-community/apple-sign-in/Package.swift');

if (!existsSync(packageSwift)) {
  console.log('[apple-sign-in-spm] Package.swift not found; skipping.');
  process.exit(0);
}

const original = readFileSync(packageSwift, 'utf8');
const patched = original.replace(
  '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "7.0.0")',
  '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")',
);

if (patched === original) {
  console.log('[apple-sign-in-spm] Capacitor SwiftPM dependency already compatible or pattern not found.');
} else {
  writeFileSync(packageSwift, patched);
  console.log('[apple-sign-in-spm] Patched @capacitor-community/apple-sign-in for Capacitor 8 SwiftPM.');
}