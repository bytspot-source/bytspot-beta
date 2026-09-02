import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { completeSignIn, openableMemberships, startSignIn } from '../auth.ts';
import { demoAuthTransport, demoSetupTransport, VENDOR_DEMO_MODE } from '../demoTransport.ts';
import { acceptableCandidates, autoApplicable } from '../geocoding.ts';
import { gateReplacesConsole, shouldShowOnboarding } from '../onboarding.ts';
import { reconcileSeller, satisfiedRequirements } from '../profile.ts';
import * as stub from '../demoTransport.stub.ts';

test('the stub and the real transport cannot drift apart', () => {
  // Both sit behind one alias, so a symbol added to one and not the other would
  // only fail in whichever build was not being tested.
  assert.deepEqual(Object.keys(stub).sort(), [
    'VENDOR_DEMO_MODE',
    'demoAuthTransport',
    'demoDemandTransport',
    'demoSetupTransport',
  ]);
  assert.equal(stub.VENDOR_DEMO_MODE, false);
  // Every stubbed export must be unusable rather than quietly permissive.
  assert.throws(() => stub.demoAuthTransport(), /not part of this build/);
  assert.throws(() => stub.demoSetupTransport(), /not part of this build/);
  assert.throws(() => stub.demoDemandTransport(), /not part of this build/);

  // Under the node test runner no vite env exists, so the real module reports
  // false as well: the flag is opt-in, never opt-out.
  assert.equal(VENDOR_DEMO_MODE, false);
});

test('the bypass is chosen at build time and never at runtime', () => {
  const config = readFileSync(new URL('../../../vite.vendor.config.ts', import.meta.url), 'utf8');

  // Resolution-time substitution, not tree-shaking. Relying on the optimiser
  // left the seeded businesses in the production bundle.
  assert.match(config, /@vendor-demo/);
  assert.match(config, /vendor-demo'\s*\?\s*'.*demoTransport\.ts'\s*:\s*'.*demoTransport\.stub\.ts'/s);

  // Nothing may select the demo path by asking whether the API answered: a
  // bypass that engages on an outage is the same bug as no auth at all. The
  // comments are stripped first, since they discuss exactly what is banned.
  const app = readFileSync(new URL('../VendorApp.tsx', import.meta.url), 'utf8');
  assert.match(app, /VENDOR_DEMO_MODE \? demoAuthTransport\(\) : httpAuthTransport\(\)/);

  const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const banned of [/catch/, /navigator\.onLine/, /VENDOR_DEMO_MODE\s*\|\|/, /!VENDOR_DEMO_MODE/]) {
    assert.doesNotMatch(code, banned, `${banned} would make the bypass reachable at runtime`);
  }
  // Five uses and no more: the import, one choice per transport, and the banner
  // that makes a demo build impossible to mistake for a real one.
  assert.equal(code.match(/VENDOR_DEMO_MODE/g)?.length, 5);
  assert.match(code, /vendor-eyebrow[\s\S]{0,80}VENDOR_DEMO_MODE/);

  // Both transports are chosen the same way. A write path that reached the live
  // API from a demo build would post a vendor's real details into it.
  assert.match(code, /VENDOR_DEMO_MODE \? demoSetupTransport\([a-zA-Z.]*\) : httpSetupTransport\(/);
  assert.match(code, /VENDOR_DEMO_MODE \? demoDemandTransport\([a-zA-Z.]*\) : httpDemandTransport\(/);
});

test('the demo console opens, and still refuses what production would refuse', async () => {
  const transport = demoAuthTransport();

  // A malformed address never reaches the transport, demo or not.
  assert.deepEqual(await startSignIn('nope', transport), { ok: false, reason: 'invalid-code' });

  const started = await startSignIn('anyone@example.com', transport);
  assert.equal(started.ok, true);
  if (!started.ok) return;

  // A malformed code is still refused, so a validation bug cannot hide behind
  // the demo waving everything through.
  assert.deepEqual(await completeSignIn({ challengeId: started.started.challengeId, code: '1' }, transport), {
    ok: false,
    reason: 'invalid-code',
  });
  // And the refusal path stays reachable.
  assert.deepEqual(await completeSignIn({ challengeId: started.started.challengeId, code: '000000' }, transport), {
    ok: false,
    reason: 'invalid-code',
  });
  assert.deepEqual(await startSignIn('ratelimited@example.com', transport), { ok: false, reason: 'rate-limited' });
  assert.deepEqual(await startSignIn('nobody@example.com', transport), { ok: false, reason: 'no-seats' });

  const signedIn = await completeSignIn({ challengeId: started.started.challengeId, code: '123456' }, transport);
  assert.equal(signedIn.ok, true);
  if (!signedIn.ok) return;

  // The seeded businesses exist to reach states that are otherwise hard to
  // demonstrate, so each one has to actually be in that state.
  const states = signedIn.memberships.map((item) => item.seller.state);
  for (const state of ['ACTIVE', 'SUSPENDED', 'DRAFT', 'PENDING']) {
    assert.ok(states.includes(state as never), `no seeded business is ${state}`);
  }
  assert.ok(signedIn.memberships.some((item) => item.seat.role === 'serviceProvider'));
  assert.ok(signedIn.memberships.some((item) => item.seller.businessMode === 'cottage'));

  // Both sides of the gate must be reachable: one business where setup replaces
  // the console, and one that is live but has a requirement lapse, which keeps
  // its tabs and only shows the gap.
  assert.ok(signedIn.memberships.some((item) => gateReplacesConsole(item.seller)));
  assert.ok(
    signedIn.memberships.some((item) => shouldShowOnboarding(item.seller) && !gateReplacesConsole(item.seller)),
    'no seeded business exercises a live-but-incomplete console',
  );

  // Every seeded seat must open, or the picker would offer a dead door.
  const openable = openableMemberships(signedIn.principal, signedIn.memberships, Math.floor(Date.now() / 1000));
  assert.equal(openable.length, signedIn.memberships.length);

  // An assigned-scope seat must arrive with work, or it would see nothing.
  for (const membership of signedIn.memberships) {
    if (membership.seat.role !== 'serviceProvider') continue;
    assert.ok(membership.seat.bookableIds.length > 0);
  }

  // The seat must belong to the person the demo signed in as, so the demo
  // exercises the same identity check production does.
  for (const membership of signedIn.memberships) {
    assert.equal(membership.seat.personId, signedIn.principal.personId);
    assert.equal(membership.seat.sellerId, membership.seller.id);
  }
});

test('the demo reproduces the geocoding failure that matters, not just the success', () => {
  return (async () => {
    const setup = demoSetupTransport();

    // The dangerous default: a street the provider cannot find comes back as
    // the middle of the town, with no error attached. If the demo only ever
    // returned exact matches, the refusal path would never be walked.
    const vague = await setup.geocode('nowhere in particular', 'fixed');
    assert.equal(vague.value?.length, 1);
    assert.equal(vague.value?.[0].precision, 'locality');
    assert.deepEqual(acceptableCandidates('fixed', vague.value ?? []), []);
    // Same result, different kind: usable as the centre of a travel radius.
    assert.equal(acceptableCandidates('visiting', vague.value ?? []).length, 1);

    // Ambiguity, which must be a question rather than a guess.
    const ambiguous = await setup.geocode('100 Main St', 'fixed');
    assert.equal(ambiguous.value?.length, 2);
    assert.equal(autoApplicable('fixed', ambiguous.value ?? []), undefined);

    // And the one case that applies itself.
    const exact = await setup.geocode('1 Peachtree St', 'fixed');
    assert.ok(autoApplicable('fixed', exact.value ?? []));

    // A payout is pending before it is active, or the waiting state is never
    // seen by anyone building against the demo.
    assert.equal((await setup.readPayout()).value?.status, 'pending');
    assert.equal((await setup.readPayout()).value?.status, 'active');
  })();
});

test('every seeded business can prove what it claims', () => {
  return (async () => {
    const transport = demoAuthTransport();
    const started = await startSignIn('owner@demo.bytspot.app', transport);
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const signedIn = await completeSignIn({ challengeId: started.started.challengeId, code: '123456' }, transport);
    assert.equal(signedIn.ok, true);
    if (!signedIn.ok) return;

    for (const membership of signedIn.memberships) {
      const profile = (await demoSetupTransport(membership.seller).loadProfile()).value!;
      // The console derives satisfied from the records, so a seed that claims a
      // requirement it cannot back would strip the tick and drop a live
      // business into setup the moment the profile loaded.
      assert.deepEqual(
        satisfiedRequirements(profile).sort(),
        [...membership.seller.satisfied].sort(),
        `${membership.seller.legalName} claims what its profile cannot prove`,
      );
      assert.deepEqual(
        reconcileSeller(membership.seller, profile).satisfied.sort(),
        [...membership.seller.satisfied].sort(),
      );
    }

    // And the gate still appears for exactly the businesses that are unfinished.
    const gated = signedIn.memberships.filter((m) => shouldShowOnboarding(m.seller)).map((m) => m.seller.legalName);
    assert.ok(gated.includes('Home Bakery'), 'the cottage draft must still be gated');
    assert.ok(!gated.includes('Midtown Table'), 'a finished business must not be sent back to setup');
  })();
});

test('the demo refuses a state change the catalog does not allow', async () => {
  const auth = demoAuthTransport();
  const started = await startSignIn('owner@demo.bytspot.app', auth);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const signedIn = await completeSignIn({ challengeId: started.started.challengeId, code: '123456' }, auth);
  assert.equal(signedIn.ok, true);
  if (!signedIn.ok) return;

  const membership = signedIn.memberships.find((item) => item.seller.state === 'ACTIVE');
  assert.ok(membership);
  const transport = demoSetupTransport(membership.seller);
  const before = await transport.loadProfile();
  const live = before.value?.locations.find((item) => item.state === 'ACTIVE');
  assert.ok(live, 'the seeded business should have a live place to pause');

  const paused = await transport.moveLocation(live.id, 'PAUSE_LOCATION');
  assert.equal(paused.value?.locations.find((item) => item.id === live.id)?.state, 'PAUSED');

  // PAUSE is not legal from PAUSED, and the demo must not accept what
  // production would reject or the console would look fine until it shipped.
  const again = await transport.moveLocation(live.id, 'PAUSE_LOCATION');
  assert.equal(again.value, undefined);
  assert.ok(again.blockers?.length);
});
