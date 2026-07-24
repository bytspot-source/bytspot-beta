import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');

const forbidden = [
  { label: 'provider route/copy', pattern: /provider\s+(dashboard|service|approval|application|business)|become\s+a\s+provider|\/provider(\/|["'?#]|$)/i },
  { label: 'vendor route/copy', pattern: /vendor\s+(status|workspace|service)|vendor-service|\/vendor(\/|["'?#]|$)/i },
  { label: 'host route/copy', pattern: /host\s+onboarding|become\s+a\s+host|\/host(\/|["'?#]|$)/i },
  { label: 'admin route/copy', pattern: /bytspot\s+admin|admin\s+password|admin-gated|\/admin(\/|["'?#]|$)/i },
  { label: 'dashboard copy', pattern: /founder\s+dashboard|provider\s+dashboard/i },
  { label: 'onboarding', pattern: /onboarding/i },
  { label: 'beta', pattern: /beta/i },
  { label: 'internal copy', pattern: /internal\s+(ops|operator|route|tool|validation|operations)|restricted\s+access/i },
  { label: 'staff copy', pattern: /\bstaff\b/i },
  { label: 'debug copy', pattern: /debugger|debug\s+(mode|panel|tool|route|console)/i },
  { label: 'blocked route', pattern: /\/(provider|vendor|host|admin|marketing|valet)(\/|["'?#]|$)/i },
];

const thirdPartyAsset = /^(assets\/)?(framework-react|motion-kit|charts-kit|maps-kit|icon-kit|ui-radix|api-client|web-)/;
const textualExtensions = new Set(['', '.html', '.js', '.css', '.json', '.webmanifest', '.txt', '.xml', '.svg']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function excerpt(text, index) {
  const start = Math.max(0, index - 90);
  const end = Math.min(text.length, index + 140);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

if (!fs.existsSync(distDir)) {
  console.error('[app-store-purity] dist/ does not exist. Run the App Store build first.');
  process.exit(1);
}

const files = walk(distDir).filter((file) => textualExtensions.has(path.extname(file).toLowerCase()));
const failures = [];

for (const file of files) {
  const rel = path.relative(distDir, file).replace(/\\/g, '/');
  if (thirdPartyAsset.test(rel)) continue;
  for (const rule of forbidden) {
    const nameMatch = rel.match(rule.pattern);
    if (nameMatch) failures.push({ file: rel, label: rule.label, excerpt: rel });
  }
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    const match = text.match(rule.pattern);
    if (match?.index !== undefined) failures.push({ file: rel, label: rule.label, excerpt: excerpt(text, match.index) });
  }
}

if (failures.length) {
  console.error(`[app-store-purity] Found ${failures.length} forbidden App Store build leak(s):`);
  for (const failure of failures.slice(0, 30)) {
    console.error(`- ${failure.file} :: ${failure.label} :: ${failure.excerpt}`);
  }
  process.exit(1);
}

console.log(`[app-store-purity] PASS: ${files.length} built files scanned with zero forbidden leaks.`);