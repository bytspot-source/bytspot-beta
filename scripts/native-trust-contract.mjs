import fs from 'node:fs';
import path from 'node:path';

// Single-source "Physidigital Trust Contract" generator + drift gate.
//
// Leaf values (numbers, enums, tier cascade) are text-extracted from the React
// source of truth so they cannot be hand-copied wrong. The ladder structure and
// capability matrix are the net-new cross-platform design that Swift/Kotlin read
// instead of re-porting scattered literals.
//
//   node scripts/native-trust-contract.mjs            regenerate the JSON
//   node scripts/native-trust-contract.mjs --check    fail (exit 1) on drift
//
// Mirrors the assert-ios-web-bundle-sync.mjs gate convention.

const root = process.cwd();
const OUT = path.join(root, 'contracts/native-trust-contract.json');
const SRC = {
  virtualPatch: 'src/utils/virtualPatch.ts',
  mapSection: 'src/components/MapSection.tsx',
  mapParking: 'src/utils/mapParking.ts',
  patchTiers: 'src/utils/patchTiers.ts',
  mapTypes: 'src/components/map/mapTypes.ts',
  venueDetails: 'src/components/VenueDetails.tsx',
};

const fail = (msg) => {
  console.error(`[native-trust-contract] FAIL: ${msg}`);
  process.exit(1);
};

const read = (rel) => {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) fail(`source of truth missing: ${rel}`);
  return fs.readFileSync(file, 'utf8');
};

// `5 * 60 * 1000` -> 300000. Only digits/whitespace/`*` allowed.
const evalProduct = (rel, name, expr) => {
  if (!/^[0-9*\s]+$/.test(expr)) fail(`${name} in ${rel} is not a plain product: "${expr}"`);
  return expr.split('*').reduce((acc, part) => acc * Number(part.trim()), 1);
};

const matchNumber = (rel, body, name) => {
  const m = body.match(new RegExp(`${name}\\s*=\\s*([0-9.][0-9.*\\s]*?)\\s*;`));
  if (!m) fail(`could not extract ${name} from ${rel}`);
  return m[1].includes('*') ? evalProduct(rel, name, m[1]) : Number(m[1]);
};

// Pull every '...'-quoted token from a `type X = '...' | '...'` union.
const matchUnion = (rel, body, name) => {
  const m = body.match(new RegExp(`${name}\\s*=\\s*([^;]+);`));
  if (!m) fail(`could not extract union ${name} from ${rel}`);
  const tokens = [...m[1].matchAll(/'([^']+)'/g)].map((t) => t[1]);
  if (!tokens.length) fail(`union ${name} in ${rel} had no string members`);
  return tokens;
};

const matchArray = (rel, body, name) => {
  const m = body.match(new RegExp(`${name}[^=]*=\\s*\\[([^\\]]+)\\]`));
  if (!m) fail(`could not extract array ${name} from ${rel}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((t) => t[1]);
};

const matchMinCents = (rel, body, tier) => {
  const m = body.match(new RegExp(`${tier}:\\s*\\{[^}]*minCents:\\s*([0-9]+)`));
  if (!m) fail(`could not extract minCents for ${tier} from ${rel}`);
  return Number(m[1]);
};

// ── Extract leaf truths from the React source of truth ──────────────────────
const vp = read(SRC.virtualPatch);
const ms = read(SRC.mapSection);
const mp = read(SRC.mapParking);
const pt = read(SRC.patchTiers);
const mt = read(SRC.mapTypes);
const vd = read(SRC.venueDetails);

const holdWindowMs = matchNumber(SRC.virtualPatch, vp, 'VIRTUAL_PATCH_HOLD_WINDOW_MS');
const webTrustLevels = matchUnion(SRC.virtualPatch, vp, 'VirtualPatchTrustLevel');
const checkoutDecisions = matchUnion(SRC.virtualPatch, vp, 'VirtualPatchCheckoutDecision');
const membershipModes = matchUnion(SRC.virtualPatch, vp, 'VirtualPatchMembershipMode');
const proximityRadiusMeters = matchNumber(SRC.mapSection, ms, 'VERIFIED_ZONE_RADIUS_METERS');
const mapModes = matchUnion(SRC.mapSection, ms, 'type MapMode');
const dedupeDegrees = matchNumber(SRC.mapParking, mp, 'PROXIMITY_DEG');
const tierOrder = matchArray(SRC.patchTiers, pt, 'BYTSPOT_PATCH_TIERS');
const tierResolutionPriority = matchUnion(SRC.patchTiers, pt, 'BytspotTierResolutionSource');
const tierMinCents = Object.fromEntries(tierOrder.map((t) => [t, matchMinCents(SRC.patchTiers, pt, t)]));
const mapFunctionTokens = matchUnion(SRC.mapTypes, mt, 'type MapFunction');

// Native membership gating for the Map Functions sheet. The backend's legacy
// isPremium field maps to canonical Platinum membership. The beta-shipped
// MapMenuSlideUp surfaces three free functions; AI Navigation, Spot Radar, and
// Traffic Intelligence are reserved as premium privileges. The token sets are a
// native design decision (no single React leaf), so they are validated against
// the verbatim MapFunction union below rather than copied blind.
const freeMapFunctions = ['smart-parking', 'live-venue-data', 'trending-hotspots'];
const premiumMapFunctions = ['ai-navigation', 'spot-radar', 'traffic-intelligence'];
const requiredMembershipTier = 'platinum';

// Every gated/free function MUST be a real MapFunction token, and the two sets
// must be disjoint — otherwise the native sheet could gate (or free) a function
// the web union never declared, or contradict itself. Fail generation on drift.
for (const fn of [...freeMapFunctions, ...premiumMapFunctions]) {
  if (!mapFunctionTokens.includes(fn)) {
    fail(`map function "${fn}" is not a member of the MapFunction union in ${SRC.mapTypes}`);
  }
}
const overlap = freeMapFunctions.filter((fn) => premiumMapFunctions.includes(fn));
if (overlap.length) fail(`map functions cannot be both free and premium: ${overlap.join(', ')}`);

// Net-new native robustness margins for the L2 proximity gate. The web gate is
// a single scalar (VERIFIED_ZONE_RADIUS_METERS) with no accuracy/hysteresis
// notion, so these have no React leaf to extract — they harden the *native*
// fix against GPS noise (accuracy floor) and boundary oscillation (a Schmitt
// trigger: arm at `withinMeters`, only release at the wider `exitMeters`).
// NativeMapParitySelfTests asserts the Swift constants against these values.
const proximityHysteresisMeters = 15;
const proximityAccuracyFloorMeters = 65;

// Net-new advisory "descent profile" rings for the L2 approach. Strictly OUTSIDE
// the arm radius (discovery ⊃ preStage ⊃ arm) and ADVISORY ONLY: crossing a ring
// never grants trust — it only pre-warms the hybrid bridge so the L2→L3 handoff
// is instant. The reducer/gate ignore them entirely. Like the hysteresis/accuracy
// margins these have no React leaf; NativeMapParitySelfTests locks the Swift
// constants and proves the rings grant no trust.
const proximityPreStageMeters = 250;
const proximityDiscoveryMeters = 600;

// Descent-ring invariant: the advisory rings must nest strictly OUTSIDE the L2
// arm radius (discovery > preStage > withinMeters). If a ring ever collapsed
// into/under the grant radius an advisory pre-warm could be mistaken for
// proximity, so fail generation rather than emit a trust-leaking profile.
if (!(proximityDiscoveryMeters > proximityPreStageMeters && proximityPreStageMeters > proximityRadiusMeters)) {
  fail(`descent rings must nest strictly outside the arm radius (discovery ${proximityDiscoveryMeters} > preStage ${proximityPreStageMeters} > arm ${proximityRadiusMeters})`);
}

// ── Compose the Trust Ladder (net-new structure, source-derived leaves) ──────
// Ascending assurance. `mapsToWebTrustLevel` ties rungs back to the verbatim
// VirtualPatchTrustLevel union; `proximate` is the rung that re-homes the
// VERIFIED_ZONE_RADIUS_METERS gate the Swift port dropped.
const trustLadder = [
  { level: 0, id: 'anonymous', mapsToWebTrustLevel: null, gate: null },
  { level: 1, id: 'static-discovery', mapsToWebTrustLevel: 'static-discovery', gate: 'qr-or-url-seen' },
  {
    level: 2,
    id: 'proximate',
    mapsToWebTrustLevel: null,
    gate: {
      withinMeters: proximityRadiusMeters,
      exitMeters: proximityRadiusMeters + proximityHysteresisMeters,
      hysteresisMeters: proximityHysteresisMeters,
      accuracyFloorMeters: proximityAccuracyFloorMeters,
      // Advisory descent rings (no trust effect) — see proximityPreStageMeters.
      preStageMeters: proximityPreStageMeters,
      discoveryMeters: proximityDiscoveryMeters,
    },
  },
  { level: 3, id: 'signed-token', mapsToWebTrustLevel: null, gate: 'server-rotating-token-verified' },
  { level: 4, id: 'nfc-counter-verified', mapsToWebTrustLevel: 'nfc-counter-verified', gate: 'hardware-read-counter' },
];

// capability -> minimum ladder level required to perform it.
const capabilities = {
  viewVenue: 0,
  saveToWallet: 1,
  initiateDirectScan: 2,
  createCheckoutHold: 3,
  burnOneTimeAccess: 4,
};

// Load-bearing gate→action bindings. Each native action MUST withhold itself
// unless `requiresCapability` is satisfied — i.e. the gate is functional, not a
// cosmetic label. Native self-tests assert these so the binding can't regress.
const enforcement = {
  directScan: { action: 'openHybrid(.access)', requiresCapability: 'initiateDirectScan', loadBearing: true },
};
// Fail fast if a binding references a capability that no longer exists.
for (const [name, rule] of Object.entries(enforcement)) {
  if (!(rule.requiresCapability in capabilities)) {
    fail(`enforcement.${name} references unknown capability "${rule.requiresCapability}"`);
  }
}

// Irreversibility invariant. Capabilities whose effect cannot be taken back once
// performed — funds authorized into a hold, a one-time access token consumed —
// must require trust strictly ABOVE L2 (proximate). Mere physical proximity (or a
// spoofed/lucky GPS fix that satisfies the L2 gate) must never be sufficient to
// trigger an irreversible action: those demand at least a signed token (L3). This
// is the contract-level fail-safe behind the native self-tests.
const PROXIMATE_LEVEL = 2; // Trust Ladder L2 — physical proximity only.
const irreversibleCapabilities = ['createCheckoutHold', 'burnOneTimeAccess'];
for (const name of irreversibleCapabilities) {
  if (!(name in capabilities)) fail(`irreversibleCapabilities references unknown capability "${name}"`);
  if (capabilities[name] <= PROXIMATE_LEVEL) {
    fail(`irreversible capability "${name}" is reachable at L${capabilities[name]} (≤ L2 proximate); irreversible actions must require trust above L2.`);
  }
}
const invariants = {
  // No irreversible capability may be reachable at or below this rung.
  noIrreversibleCapabilityAtOrBelowLevel: PROXIMATE_LEVEL,
  irreversibleCapabilities,
};

// ── Native Venue Details surface (WS-C) ─────────────────────────────────────
// The read surface itself is L0 (viewVenue) — viewing a venue grants/needs no
// trust. Each action either requires a ladder capability, hands off to a not-
// yet-native (or higher-trust) web surface, or is a plain device intent. The
// single write path (check-in) is extracted verbatim from VenueDetails.tsx so
// the native action can't target a router/method the web never calls; it is a
// reversible authenticated write (idempotent), so it needs a session but grants
// and requires no trust rung — advisory, not a ladder capability. bookRide is
// the L3 createCheckoutHold bridge into the (future) native checkout surface.
//
// Action `kind` taxonomy: `device` (transient OS intent — maps/tel/share),
// `local` (local persistent favorite, no server/trust — savedSpots), `capability`
// (requires a ladder rung), `authedWrite` (session-gated reversible server write,
// no trust rung), `handoff` (defers to web / another surface). `save` is the
// React heart/favorite (local savedSpots) — trust-free; the real wallet write is
// `getTickets` (the access-pass flow → saveToWallet L1).
const venueCheckinEndpoint = (() => {
  const m = vd.match(/trpc\.(venues\.checkin)\.mutate/);
  if (!m) fail(`could not find trpc.venues.checkin.mutate in ${SRC.venueDetails}`);
  return m[1];
})();
const venueDetailSurfaceCapability = 'viewVenue';
if (capabilities[venueDetailSurfaceCapability] !== 0) {
  fail(`venue detail read surface must be L0 (${venueDetailSurfaceCapability} is L${capabilities[venueDetailSurfaceCapability]})`);
}
const venueDetailActions = [
  { id: 'navigate', kind: 'device' },
  { id: 'call', kind: 'device' },
  { id: 'share', kind: 'device' },
  { id: 'save', kind: 'local' },
  { id: 'getTickets', kind: 'capability', capability: 'saveToWallet' },
  { id: 'checkIn', kind: 'authedWrite', endpoint: venueCheckinEndpoint, idempotent: true },
  { id: 'concierge', kind: 'handoff' },
  { id: 'bookRide', kind: 'capability', capability: 'createCheckoutHold' },
];
for (const a of venueDetailActions) {
  if (a.kind === 'capability' && !(a.capability in capabilities)) {
    fail(`venueDetail action "${a.id}" references unknown capability "${a.capability}"`);
  }
}

const contract = {
  $schema: 'bytspot.native-trust-contract/v1',
  version: 1,
  description: 'Single source of truth for the native (Swift/Kotlin) physidigital trust gates. Generated from React source; do not hand-edit.',
  generatedFrom: SRC,
  trustLadder,
  capabilities,
  enforcement,
  invariants,
  checkout: { holdWindowMs, decisions: checkoutDecisions, membershipModes },
  tiers: { order: tierOrder, minCents: tierMinCents, resolutionPriority: tierResolutionPriority },
  parking: { dedupeDegrees, dedupeApproxMeters: 30 },
  webTrustLevels,
  mapModes,
  // Platinum-gated Map Functions sheet. `all` is the verbatim MapFunction union;
  // `free` surfaces without elevated access; `premium` requires canonical
  // Platinum or Black membership. Native reads this so the sheet's
  // lock affordance can't drift from the web function set.
  mapFunctions: {
    all: mapFunctionTokens,
    free: freeMapFunctions,
    premium: premiumMapFunctions,
    requiredMembershipTier,
  },
  // Native Venue Details read surface (WS-C). `surfaceCapability` is the L0 view
  // gate; `checkinEndpoint` is the verbatim venues.checkin write path; `actions`
  // bind each CTA to a ladder capability, a handoff, an authed write, or a plain
  // device intent. Native reads this so the detail surface can't gate (or free)
  // an action against the wrong trust rung.
  venueDetail: {
    surfaceCapability: venueDetailSurfaceCapability,
    checkinEndpoint: venueCheckinEndpoint,
    checkinIdempotent: true,
    actions: venueDetailActions,
  },
};

const serialized = `${JSON.stringify(contract, null, 2)}\n`;
const isCheck = process.argv.includes('--check');

if (isCheck) {
  if (!fs.existsSync(OUT)) fail(`contract not generated yet: ${path.relative(root, OUT)} (run: npm run gen:native-trust-contract)`);
  const current = fs.readFileSync(OUT, 'utf8');
  if (current !== serialized) fail(`contract drifted from React source of truth. Run: npm run gen:native-trust-contract, then update native consumers.`);
  console.log(`[native-trust-contract] PASS: contract matches React source (proximity ${proximityRadiusMeters}m arm / ${proximityRadiusMeters + proximityHysteresisMeters}m release, accuracy floor ${proximityAccuracyFloorMeters}m, advisory rings ${proximityPreStageMeters}m/${proximityDiscoveryMeters}m, hold ${holdWindowMs / 60000}m, ${trustLadder.length} ladder rungs, ${irreversibleCapabilities.length} irreversible caps > L${PROXIMATE_LEVEL}, ${premiumMapFunctions.length} premium map functions of ${mapFunctionTokens.length}, ${venueDetailActions.length} venue-detail actions).`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, serialized);
  console.log(`[native-trust-contract] wrote ${path.relative(root, OUT)} (${trustLadder.length} rungs, ${Object.keys(capabilities).length} capabilities).`);
}
