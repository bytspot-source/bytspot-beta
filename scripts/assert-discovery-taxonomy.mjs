import fs from 'node:fs';
import path from 'node:path';

// Discovery taxonomy drift gate.
//
// contracts/discovery-taxonomy.json is hand-authored and is the source of
// truth. This script VERIFIES the hand-written Swift and TypeScript against
// it — it never generates either. Swift stays readable and reviewable; nothing
// is emitted into the iOS build.
//
//   node scripts/assert-discovery-taxonomy.mjs
//
// It fails, naming the offender, when:
//   * the Swift rails or their order drift from the contract
//   * an alias exists on one side and not the other
//   * the capability vocabulary, rings or action colours drift
//   * a rail label is duplicated or a token has no label

const root = process.cwd();
const CONTRACT = path.join(root, 'contracts/discovery-taxonomy.json');
const SWIFT = path.join(root, 'ios/App/App/NativeDiscoverListing.swift');
const TS = path.join(root, 'src/utils/discoveryRails.ts');

const failures = [];
const fail = (msg) => failures.push(msg);

const contract = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
const swift = fs.readFileSync(SWIFT, 'utf8');

const swiftList = (name) => {
  const match = swift.match(new RegExp(`static let ${name} = \\[([\\s\\S]*?)\\]`));
  if (!match) return null;
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
};

// ── Rails ───────────────────────────────────────────────────────────────────
const expectedTokens = contract.rails.map((rail) => rail.token);
const expectedLabels = contract.rails.map((rail) => rail.label);

const swiftLabels = swiftList('railLabels');
const swiftTokens = swiftList('railTokens');

if (!swiftLabels) fail('could not read railLabels from NativeDiscoverListing.swift');
if (!swiftTokens) fail('could not read railTokens from NativeDiscoverListing.swift');

if (swiftLabels && String(swiftLabels) !== String(expectedLabels)) {
  fail(`rail labels drifted.\n  contract: ${expectedLabels.join(' → ')}\n  swift:    ${swiftLabels.join(' → ')}`);
}
if (swiftTokens && String(swiftTokens) !== String(expectedTokens)) {
  fail(`rail tokens drifted.\n  contract: ${expectedTokens.join(', ')}\n  swift:    ${swiftTokens.join(', ')}`);
}
if (new Set(expectedTokens).size !== expectedTokens.length) fail('contract repeats a rail token');
if (new Set(expectedLabels).size !== expectedLabels.length) fail('contract repeats a rail label');
if (!expectedTokens.includes(contract.fallbackRail)) {
  fail(`fallbackRail "${contract.fallbackRail}" is not one of the rails`);
}

// ── Aliases ─────────────────────────────────────────────────────────────────
// Parsed from the `switch normalized` in rail(category:), where each case lists
// its aliases and returns the rail they file under.
const aliasBlock = swift.match(/static func rail\(category: String\)[\s\S]*?switch normalized \{([\s\S]*?)\n\s*default:/);
if (!aliasBlock) {
  fail('could not read the alias switch from rail(category:)');
} else {
  const swiftAliases = {};
  for (const line of aliasBlock[1].split('\n')) {
    const cased = line.match(/case (.+?): return "([a-z_]+)"/);
    if (!cased) continue;
    for (const alias of [...cased[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])) {
      swiftAliases[alias] = cased[2];
    }
  }

  for (const [alias, rail] of Object.entries(contract.aliases)) {
    if (!(alias in swiftAliases)) fail(`alias "${alias}" → ${rail} is in the contract but missing from Swift`);
    else if (swiftAliases[alias] !== rail) {
      fail(`alias "${alias}" files under ${rail} in the contract but ${swiftAliases[alias]} in Swift`);
    }
    if (!expectedTokens.includes(rail)) fail(`alias "${alias}" points at unknown rail "${rail}"`);
  }
  for (const [alias, rail] of Object.entries(swiftAliases)) {
    if (!(alias in contract.aliases)) {
      fail(`alias "${alias}" → ${rail} is in Swift but missing from the contract (add it, or the two platforms will file this category differently)`);
    }
  }
}

// ── Capability indicator ────────────────────────────────────────────────────
const order = contract.cardIndicator.order;
const caseLine = swift.match(/enum NativeDiscoverBookableCapability[^\n]*\{\s*\n\s*(?:\/\/[^\n]*\n\s*)*case ([^\n]+)/);
if (!caseLine) {
  fail('could not read the NativeDiscoverBookableCapability cases');
} else {
  const swiftCases = caseLine[1].split(',').map((token) => token.trim());
  if (String(swiftCases.sort()) !== String([...order].sort())) {
    fail(`capability cases drifted.\n  contract: ${order.join(', ')}\n  swift:    ${swiftCases.join(', ')}`);
  }
}

// Swift groups cases that share a result (`case .redirect, .details: return .dot`),
// so match the capability anywhere in the case list rather than alone.
const swiftReturns = (capability, returned) =>
  new RegExp(`case (?:\\.[a-z]+, )*\\.${capability}(?:, \\.[a-z]+)*: return ${returned}`).test(swift);

for (const capability of order) {
  const spec = contract.cardIndicator.capabilities[capability];
  if (!spec) {
    fail(`capability "${capability}" is in the order but has no definition`);
    continue;
  }
  if (!swiftReturns(capability, `"${spec.label}"`)) {
    fail(`capability "${capability}" should read "${spec.label}" in Swift statusLabel`);
  }
  if (!swiftReturns(capability, `\\.${spec.ring}`)) {
    fail(`capability "${capability}" should use the ${spec.ring} ring in Swift`);
  }
}

const hexes = new Set(Object.values(contract.cardIndicator.capabilities).map((c) => c.actionHex).filter(Boolean));
for (const hex of hexes) {
  if (!swift.includes(hex)) fail(`action colour ${hex} is in the contract but not in Swift`);
}

for (const [ring, pattern] of Object.entries(contract.cardIndicator.ringDashPatterns)) {
  if (!pattern.length) continue;
  if (!swiftReturns(ring, `\\[${pattern.join(', ')}\\]`)) {
    fail(`ring "${ring}" should carry dash pattern [${pattern.join(', ')}] in Swift`);
  }
}

// ── Chassis ─────────────────────────────────────────────────────────────────
const chassis = [...contract.chassis.premium, ...contract.chassis.plain].sort();
if (String(chassis) !== String([...order].sort())) {
  fail('every capability must be assigned exactly one chassis (premium or plain)');
}
if (!contract.chassis.partyOverride.reason?.trim()) {
  fail('the party chassis override must state why it exists, or the next reader will delete it');
}

// ── TypeScript reads the contract rather than copying it ────────────────────
const ts = fs.readFileSync(TS, 'utf8');
if (!ts.includes("contracts/discovery-taxonomy.json")) {
  fail('src/utils/discoveryRails.ts must import the contract, not restate it');
}
for (const token of expectedTokens) {
  if (ts.includes(`'${token}'`) && !ts.includes('DiscoveryCapability')) {
    fail(`discoveryRails.ts hardcodes rail "${token}" instead of reading it from the contract`);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error('[discovery-taxonomy] FAIL');
  for (const failure of failures) console.error(`  • ${failure}`);
  console.error('\nThe contract is contracts/discovery-taxonomy.json. Swift is hand-written and');
  console.error('verified against it — fix whichever side is wrong, nothing is generated.');
  process.exit(1);
}

console.log(`[discovery-taxonomy] PASS: ${expectedTokens.length} rails, ${Object.keys(contract.aliases).length} category aliases, ${order.length} capabilities, ${contract.chassis.premium.length} premium / ${contract.chassis.plain.length} plain.`);
