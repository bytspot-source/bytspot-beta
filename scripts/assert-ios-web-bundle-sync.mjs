import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const iosPublicDir = path.join(root, 'ios/App/App/public');
const distIndex = path.join(distDir, 'index.html');
const iosIndex = path.join(iosPublicDir, 'index.html');

const read = (label, file) => {
  if (!fs.existsSync(file)) {
    console.error(`[ios-web-bundle-sync] ${label} missing: ${path.relative(root, file)}`);
    process.exit(1);
  }
  return fs.readFileSync(file, 'utf8');
};

const normalize = (value) => value.replace(/\\/g, '/');
const extractAssetRefs = (html) => [
  ...new Set([...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+)"/g)].map((match) => normalize(match[1]))),
].sort();

const exists = (base, rel) => fs.existsSync(path.join(base, rel));
const listMissing = (base, refs) => refs.filter((ref) => !exists(base, ref));

const distRefs = extractAssetRefs(read('dist index', distIndex));
const iosRefs = extractAssetRefs(read('iOS public index', iosIndex));
const distMissing = listMissing(distDir, distRefs);
const iosMissing = listMissing(iosPublicDir, iosRefs);
const missingIndexRefs = [
  ...(!distRefs.length ? ['dist/index.html has no script/link asset references'] : []),
  ...(!iosRefs.length ? ['ios/App/App/public/index.html has no script/link asset references'] : []),
];
const onlyInDist = distRefs.filter((ref) => !iosRefs.includes(ref));
const onlyInIos = iosRefs.filter((ref) => !distRefs.includes(ref));

const fail = (title, rows) => {
  if (!rows.length) return;
  console.error(`[ios-web-bundle-sync] ${title}:`);
  for (const row of rows.slice(0, 30)) console.error(`- ${row}`);
};

if (missingIndexRefs.length || distMissing.length || iosMissing.length || onlyInDist.length || onlyInIos.length) {
  console.error('[ios-web-bundle-sync] FAIL: iOS bundled web assets are stale or incomplete.');
  fail('index asset extraction failed', missingIndexRefs);
  fail('dist/index.html references missing dist assets', distMissing);
  fail('ios/App/App/public/index.html references missing iOS assets', iosMissing);
  fail('assets in dist/index.html but not iOS public index', onlyInDist);
  fail('assets in iOS public index but not dist/index.html', onlyInIos);
  console.error('[ios-web-bundle-sync] Run: npm run cap:sync:app-store');
  process.exit(1);
}

console.log(`[ios-web-bundle-sync] PASS: ${distRefs.length} index asset reference(s) match iOS public bundle.`);