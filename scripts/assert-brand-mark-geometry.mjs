import fs from 'node:fs';

// Brand mark drift gate.
//
// The mark is drawn four times -- three SVGs and one native Swift reproduction --
// because asset-catalog SVG rendering drops gradient fills in Release builds, so
// iOS cannot read the SVG. Nothing but this gate keeps the four in agreement,
// and they had already diverged: the favicon carried a 52x60 concentric gem
// while the other three carried a 28x36 one offset 10 units above centre.
//
//   node scripts/assert-brand-mark-geometry.mjs
//
// Geometry is expressed in the shared 120-unit viewBox. Swift stores the same
// numbers as size * (n / 120.0) fractions.

const CANONICAL = {
  outerRingRadius: 48,
  outerRingStroke: 3,
  middleRingRadius: 38,
  middleRingStroke: 2,
  hexPath: 'M60 30 L86 45 L86 75 L60 90 L34 75 L34 45 Z',
  hexWidth: 52,
  hexHeight: 60,
  hexBorderStroke: 1.5,
  dotRadius: 8,
  glowRadius: 12,
  centred: true,
};

const failures = [];
const fail = (surface, detail) => failures.push(`${surface}: ${detail}`);

function hexBounds(path) {
  const points = [...path.matchAll(/([ML])(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g)].map((m) => [Number(m[2]), Number(m[3])]);
  if (points.length !== 6) return null;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    centreX: (Math.max(...xs) + Math.min(...xs)) / 2,
    centreY: (Math.max(...ys) + Math.min(...ys)) / 2,
  };
}

function checkSvg(surface, file) {
  const src = fs.readFileSync(file, 'utf8');
  const paths = [...src.matchAll(/d="(M60[^"]+Z)"/g)].map((m) => m[1]);
  if (paths.length !== 2) {
    fail(surface, `expected 2 hexagon paths (fill + border), found ${paths.length}`);
    return;
  }
  for (const path of paths) {
    if (path !== CANONICAL.hexPath) fail(surface, `hexagon path is "${path}", canonical is "${CANONICAL.hexPath}"`);
    const bounds = hexBounds(path);
    if (!bounds) {
      fail(surface, `hexagon path is not six points: "${path}"`);
      continue;
    }
    if (bounds.width !== CANONICAL.hexWidth || bounds.height !== CANONICAL.hexHeight) {
      fail(surface, `hexagon is ${bounds.width}x${bounds.height}, canonical is ${CANONICAL.hexWidth}x${CANONICAL.hexHeight}`);
    }
    if (CANONICAL.centred && (bounds.centreX !== 60 || bounds.centreY !== 60)) {
      fail(surface, `hexagon centre is (${bounds.centreX}, ${bounds.centreY}), canonical is concentric at (60, 60)`);
    }
  }
  // The dot and its glow ride with the gem, so they must be concentric too.
  for (const [name, radius] of [['dot', CANONICAL.dotRadius], ['glow', CANONICAL.glowRadius]]) {
    const match = src.match(new RegExp(`cx="60"\\s+cy="(\\d+)"\\s+r="${radius}"`));
    if (!match) fail(surface, `no r="${radius}" ${name} circle at cx="60"`);
    else if (Number(match[1]) !== 60) fail(surface, `${name} is at cy="${match[1]}", canonical is concentric at cy="60"`);
  }
  for (const [name, radius] of [['outer ring', CANONICAL.outerRingRadius], ['middle ring', CANONICAL.middleRingRadius]]) {
    if (!new RegExp(`cx="60"\\s+cy="60"\\s+r="${radius}"`).test(src) && !new RegExp(`r="${radius}"`).test(src)) {
      fail(surface, `no ${name} at r="${radius}"`);
    }
  }
}

function checkSwift(surface, file) {
  const src = fs.readFileSync(file, 'utf8');
  const mark = src.split('private struct NativeBytspotMark: View {')[1]?.split('\nprivate struct')[0];
  if (!mark) {
    fail(surface, 'NativeBytspotMark not found');
    return;
  }
  const frac = (re) => {
    const m = mark.match(re);
    return m ? Number(m[1]) : null;
  };
  const expectations = [
    ['outer ring diameter', /outerRingGradient, lineWidth: size \* \(3\.0 \/ 120\.0\)\)\s*\n\s*\.frame\(width: size \* \(([\d.]+) \/ 120\.0\)/, CANONICAL.outerRingRadius * 2],
    ['outer ring stroke', /outerRingGradient, lineWidth: size \* \(([\d.]+) \/ 120\.0\)/, CANONICAL.outerRingStroke],
    ['middle ring diameter', /middleRingGradient, lineWidth: size \* \(2\.0 \/ 120\.0\)\)\s*\n\s*\.frame\(width: size \* \(([\d.]+) \/ 120\.0\)/, CANONICAL.middleRingRadius * 2],
    ['middle ring stroke', /middleRingGradient, lineWidth: size \* \(([\d.]+) \/ 120\.0\)/, CANONICAL.middleRingStroke],
    ['hexagon width', /Hexagon\(\)\.fill\(hexFillGradient\)\s*\n\s*\.frame\(width: size \* \(([\d.]+) \/ 120\.0\)/, CANONICAL.hexWidth],
    ['hexagon height', /Hexagon\(\)\.fill\(hexFillGradient\)\s*\n\s*\.frame\(width: size \* \([\d.]+ \/ 120\.0\), height: size \* \(([\d.]+) \/ 120\.0\)/, CANONICAL.hexHeight],
    ['hexagon border stroke', /hexBorderGradient, lineWidth: size \* \(([\d.]+) \/ 120\.0\)/, CANONICAL.hexBorderStroke],
    ['dot diameter', /centerDotGradient\)\s*\n\s*\.frame\(width: size \* \(([\d.]+) \/ 120\.0\)/, CANONICAL.dotRadius * 2],
    ['glow diameter', /centerGlowGradient\)\s*\n\s*\.frame\(width: size \* \(([\d.]+) \/ 120\.0\)/, CANONICAL.glowRadius * 2],
  ];
  for (const [name, re, expected] of expectations) {
    const actual = frac(re);
    if (actual === null) fail(surface, `could not read ${name}`);
    else if (actual !== expected) fail(surface, `${name} is ${actual}/120, canonical is ${expected}/120`);
  }
  // Concentric: the gem, dot and glow must carry no vertical offset.
  if (CANONICAL.centred && /\.offset\(y: -?size \* \([\d.]+ \/ 120\.0\)\)/.test(mark)) {
    fail(surface, 'a mark layer still carries a vertical offset; canonical geometry is concentric');
  }
}

checkSvg('public/favicon.svg', 'public/favicon.svg');
checkSvg('src/components/BrandLogo.tsx', 'src/components/BrandLogo.tsx');
checkSvg('src/components/PrintableMarketingAssets.tsx', 'src/components/PrintableMarketingAssets.tsx');
checkSwift('ios/App/App/BytspotNativeAppRoot.swift', 'ios/App/App/BytspotNativeAppRoot.swift');

if (failures.length) {
  console.error('Brand mark geometry drift:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log('Brand mark geometry consistent across 4 surfaces (favicon, BrandLogo, print, native).');
