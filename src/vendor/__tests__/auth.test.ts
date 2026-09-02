import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeSignIn,
  currentAuthStep,
  isPlausibleEmail,
  isWellFormedCode,
  openVerifiedSession,
  openableMemberships,
  preferredMembership,
  refreshAccess,
  refusalForStatus,
  rememberSeller,
  startSignIn,
  tokenExpired,
  tokenNeedsRefresh,
  type AuthTransport,
  type VendorMembership,
  type VendorPrincipal,
} from '../auth.ts';
import { vendorAuthContract } from '../vendorConsole.ts';
import type { Seat, Seller } from '../seller.ts';

const NOW = 1_700_000_000;

const seller = (over: Partial<Seller> = {}): Seller => ({
  id: 'sel_1',
  legalName: 'Midtown Table',
  state: 'ACTIVE',
  businessMode: 'standard',
  satisfied: ['legalName', 'contactEmail', 'activeLocation', 'payoutAccount'],
  ...over,
});

const seat = (over: Partial<Seat> = {}): Seat => ({
  id: 'seat_1',
  sellerId: 'sel_1',
  personId: 'per_1',
  role: 'owner',
  state: 'ACTIVE',
  locationIds: [],
  bookableIds: [],
  ...over,
});

const principal = (over: Partial<VendorPrincipal> = {}): VendorPrincipal => ({
  personId: 'per_1',
  email: 'owner@midtown.example',
  expiresAtSecs: NOW + 900,
  ...over,
});

function transport(over: Partial<AuthTransport> = {}): AuthTransport {
  return {
    requestCode: async () => ({ status: 200, challengeId: 'chal_1' }),
    submitCode: async () => ({
      status: 200,
      accessToken: 'at_live',
      expiresInSecs: 900,
      person: { id: 'per_1', email: 'owner@midtown.example' },
      memberships: [{ seller: seller(), seat: seat() }],
    }),
    refresh: async () => ({ status: 200, accessToken: 'at_next', expiresInSecs: 900 }),
    signOut: async () => undefined,
    ...over,
  };
}

test('a wrong code and an unknown email are the same answer', async () => {
  // Four distinguishable failures would be an account enumeration oracle, so
  // every one of them collapses to the same refusal.
  assert.equal(refusalForStatus(400), 'invalid-code');
  assert.equal(refusalForStatus(401), 'invalid-code');
  assert.equal(refusalForStatus(404), 'invalid-code');
  assert.equal(refusalForStatus(410), 'invalid-code');
  // These say nothing about whether the account exists, so they may differ.
  assert.equal(refusalForStatus(429), 'rate-limited');
  assert.equal(refusalForStatus(423), 'locked');
  assert.equal(refusalForStatus(403), 'no-seats');

  for (const refusal of vendorAuthContract().refusals) {
    assert.doesNotMatch(refusal.message, /no such|not found|unknown (email|account)/i);
  }

  // A malformed address never reaches the network, so the rate limit is spent
  // only on addresses that could exist.
  let calls = 0;
  const counted = transport({
    requestCode: async () => {
      calls += 1;
      return { status: 200, challengeId: 'chal_1' };
    },
  });
  assert.deepEqual(await startSignIn('nope', counted), { ok: false, reason: 'invalid-code' });
  assert.equal(calls, 0);
  assert.equal(isPlausibleEmail('owner@midtown.example'), true);
  assert.equal(isPlausibleEmail('owner@midtown'), false);

  const started = await startSignIn('  Owner@Midtown.Example  ', counted);
  assert.equal(started.ok, true);
  assert.equal(calls, 1);
  assert.equal(started.ok && started.started.challengeId, 'chal_1');
  assert.equal(started.ok && started.started.resendAfterSecs, vendorAuthContract().code.resendCooldownSecs);
});

test('a code is exchanged for an identity, and the identity is not a seat', async () => {
  const { length } = vendorAuthContract().code;
  assert.equal(isWellFormedCode('1'.repeat(length)), true);
  assert.equal(isWellFormedCode('1'.repeat(length - 1)), false);
  assert.equal(isWellFormedCode('12345a'), false);

  // A malformed code is refused locally, so a guess does not consume an attempt.
  let submits = 0;
  const counted = transport({
    submitCode: async () => {
      submits += 1;
      return { status: 200 };
    },
  });
  await completeSignIn({ challengeId: 'chal_1', code: 'abc' }, counted);
  assert.equal(submits, 0);

  const result = await completeSignIn({ challengeId: 'chal_1', code: '123456' }, transport(), {
    nowSecs: () => NOW,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.principal.personId, 'per_1');
  assert.equal(result.token.expiresAtSecs, NOW + 900);
  // The token is a separate object from the identity it proved, so it can be
  // replaced on refresh without the console losing who is signed in.
  assert.equal(result.principal.expiresAtSecs, result.token.expiresAtSecs);

  // A valid code with no seats is refused rather than dropped into an empty
  // console, because there is nothing to do until an owner invites them.
  const orphan = await completeSignIn({ challengeId: 'chal_1', code: '123456' }, transport({
    submitCode: async () => ({
      status: 200,
      accessToken: 'at_live',
      person: { id: 'per_9', email: 'nobody@example.com' },
      memberships: [],
    }),
  }));
  assert.deepEqual(orphan, { ok: false, reason: 'no-seats' });

  // A membership whose seat belongs to another business is discarded, not shown.
  const crossed = await completeSignIn({ challengeId: 'chal_1', code: '123456' }, transport({
    submitCode: async () => ({
      status: 200,
      accessToken: 'at_live',
      person: { id: 'per_1', email: 'owner@midtown.example' },
      memberships: [{ seller: seller(), seat: seat({ sellerId: 'sel_other' }) }],
    }),
  }));
  assert.deepEqual(crossed, { ok: false, reason: 'no-seats' });
});

test('a token proves who is asking, which a seat on its own cannot', () => {
  const membership: VendorMembership = { seller: seller(), seat: seat() };

  const opened = openVerifiedSession(principal(), membership, NOW);
  assert.equal(opened.ok, true);
  assert.equal(opened.ok && opened.session.seat.id, 'seat_1');

  // The gap this closes: the seat is perfectly valid, but it is not theirs.
  const impostor = openVerifiedSession(principal({ personId: 'per_2' }), membership, NOW);
  assert.deepEqual(impostor, { ok: false, reason: 'wrong-person' });

  // Identity is checked before the seat's own rules, so an expired token never
  // reaches the ontology at all.
  const stale = openVerifiedSession(principal({ expiresAtSecs: NOW - 1 }), membership, NOW);
  assert.deepEqual(stale, { ok: false, reason: 'expired-session' });

  // Once identity holds, the seat's own refusals come through unchanged.
  assert.deepEqual(
    openVerifiedSession(principal(), { seller: seller(), seat: seat({ state: 'REVOKED' }) }, NOW),
    { ok: false, reason: 'seat-not-granting' },
  );
  assert.deepEqual(
    openVerifiedSession(principal(), { seller: seller({ state: 'CLOSED' }), seat: seat() }, NOW),
    { ok: false, reason: 'seller-closed' },
  );
  // A suspended business still opens a console; it just withholds capability.
  const suspended = openVerifiedSession(principal(), { seller: seller({ state: 'SUSPENDED' }), seat: seat() }, NOW);
  assert.equal(suspended.ok, true);
  assert.equal(suspended.ok && suspended.session.capabilities.has('SELL'), false);
});

test('the business picker only offers doors that will open', () => {
  const person = principal();
  const memberships: VendorMembership[] = [
    { seller: seller({ id: 'sel_1', legalName: 'Midtown' }), seat: seat({ sellerId: 'sel_1' }) },
    { seller: seller({ id: 'sel_2', state: 'CLOSED' }), seat: seat({ id: 'seat_2', sellerId: 'sel_2' }) },
    {
      seller: seller({ id: 'sel_3' }),
      seat: seat({ id: 'seat_3', sellerId: 'sel_3', state: 'REVOKED' }),
    },
    {
      seller: seller({ id: 'sel_4', state: 'SUSPENDED' }),
      seat: seat({ id: 'seat_4', sellerId: 'sel_4' }),
    },
  ];

  // A closed business and a revoked seat are filtered; a suspended business is
  // not, because a vendor still needs to check in guests who already paid.
  assert.deepEqual(
    openableMemberships(person, memberships, NOW).map((item) => item.seller.id),
    ['sel_1', 'sel_4'],
  );

  // A remembered choice is honoured only while it still opens, so a suspended
  // or closed business cannot trap someone who holds two seats.
  assert.equal(preferredMembership(person, memberships, NOW, 'sel_4')?.seller.id, 'sel_4');
  assert.equal(preferredMembership(person, memberships, NOW, 'sel_2')?.seller.id, 'sel_1');
  assert.equal(preferredMembership(person, memberships, NOW, undefined)?.seller.id, 'sel_1');
  assert.equal(preferredMembership(person, [], NOW), undefined);
});

test('the access token is refreshed before it expires, and never persisted', async () => {
  const { accessTtlSecs, refreshBeforeExpirySecs } = vendorAuthContract().token;
  const token = { value: 'at_live', expiresAtSecs: NOW + accessTtlSecs };

  assert.equal(tokenExpired(token, NOW), false);
  assert.equal(tokenExpired(token, NOW + accessTtlSecs), true);
  assert.equal(tokenNeedsRefresh(token, NOW), false);
  assert.equal(tokenNeedsRefresh(token, NOW + accessTtlSecs - refreshBeforeExpirySecs), true);

  const refreshed = await refreshAccess(transport(), { nowSecs: () => NOW });
  assert.equal(refreshed.ok, true);
  assert.equal(refreshed.ok && refreshed.token.expiresAtSecs, NOW + 900);

  // A failed refresh is always expired-session: the refresh cookie is the last
  // thing between the console and a sign-in screen, so there is no half-state.
  for (const status of [400, 401, 403, 500]) {
    const failed = await refreshAccess(transport({ refresh: async () => ({ status }) }));
    assert.deepEqual(failed, { ok: false, reason: 'expired-session' });
  }

  // Only the allowlisted key may be written, and it is not a credential.
  const written = new Map<string, string>();
  const storage = { setItem: (key: string, value: string) => void written.set(key, value) };
  assert.equal(rememberSeller('sel_1', storage), true);
  assert.deepEqual([...written.keys()], ['bytspot.vendor.lastSellerId']);
  for (const value of written.values()) {
    assert.doesNotMatch(value, /^at_|token|whsec_/i);
  }

  // Storage being unavailable costs a default, not a console.
  assert.equal(
    rememberSeller('sel_1', {
      setItem: () => {
        throw new Error('denied');
      },
    }),
    false,
  );
});

test('the flow cannot reach the console without passing through a seat', () => {
  assert.equal(currentAuthStep({}), 'email');
  assert.equal(currentAuthStep({ challengeId: 'chal_1' }), 'code');
  assert.equal(currentAuthStep({ principal: principal() }), 'seat');
  assert.equal(currentAuthStep({ principal: principal(), challengeId: 'chal_1' }), 'seat');

  const opened = openVerifiedSession(principal(), { seller: seller(), seat: seat() }, NOW);
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  assert.equal(currentAuthStep({ principal: principal(), session: opened.session }), 'console');
  // A session alone is enough, because there is no way to hold one without a
  // principal having been verified first.
  assert.equal(currentAuthStep({ session: opened.session }), 'console');
});
