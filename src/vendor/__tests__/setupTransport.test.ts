import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { payoutBlockersFor } from '../profile.ts';
import {
  demoWindowsTransport,
  httpSetupTransport,
  httpWindowsTransport,
  windowDraftProblems,
  type AuthorizedFetch,
} from '../setupTransport.ts';

function stubFetch(reply: (path: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const authorized: AuthorizedFetch = async (path, init) => {
    calls.push({ path, init });
    const { status, body } = reply(path, init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { authorized, calls };
}

test('the transport keeps only the payout fields we are willing to hold', async () => {
  // Copying the object wholesale would let a server that started returning bank
  // details park them in our state, which is the arrangement the hosted flow
  // exists to avoid. So the revive is an allowlist, not a spread.
  const { authorized } = stubFetch(() => ({
    status: 200,
    body: {
      payout: {
        reference: 'acct_1',
        status: 'active',
        last4: '4242',
        accountNumber: '000123456789',
        routingNumber: '111000025',
      },
    },
  }));

  const result = await httpSetupTransport(authorized).readPayout();
  assert.deepEqual(Object.keys(result.value ?? {}).sort(), ['detail', 'last4', 'reference', 'status']);
  assert.equal((result.value as unknown as Record<string, unknown>).accountNumber, undefined);
  // And what survives is something we would accept.
  assert.deepEqual(payoutBlockersFor(result.value!), []);
});

test('an unrecognised payout status is treated as not yet usable', async () => {
  // Optimism here would let a business go live on an account a processor has
  // not cleared, so anything we do not recognise falls back to pending.
  const { authorized } = stubFetch(() => ({
    status: 200,
    body: { payout: { reference: 'acct_1', status: 'totally-fine' } },
  }));
  const result = await httpSetupTransport(authorized).readPayout();
  assert.equal(result.value?.status, 'pending');

  const { authorized: noRef } = stubFetch(() => ({ status: 200, body: { payout: { status: 'active' } } }));
  assert.equal((await httpSetupTransport(noRef).readPayout()).value, undefined);
});

test('numbers arrive as numbers, so a radius compares rather than concatenates', async () => {
  const { authorized } = stubFetch(() => ({
    status: 200,
    body: {
      legalName: 'Midtown Table',
      locations: [{ id: 'loc_1', label: 'M', kind: 'mobile', state: 'ACTIVE', lat: '33.75', lng: '-84.39', radiusMiles: '12' }],
    },
  }));

  const result = await httpSetupTransport(authorized).loadProfile();
  const location = result.value?.locations[0];
  assert.equal(typeof location?.lat, 'number');
  assert.equal(typeof location?.radiusMiles, 'number');
  assert.equal(location?.radiusMiles, 12);
});

test('a refusal comes back with what the server said was wrong', async () => {
  const { authorized } = stubFetch(() => ({ status: 422, body: { blockers: ['Needs a street address', 42] } }));
  const result = await httpSetupTransport(authorized).saveField('legalName', 'x');
  assert.equal(result.status, 422);
  assert.equal(result.value, undefined);
  // Non-strings are dropped rather than rendered as "42".
  assert.deepEqual(result.blockers, ['Needs a street address']);
});

test('writes carry the session as a header and never as a cookie', async () => {
  const { authorized, calls } = stubFetch(() => ({ status: 200, body: { locations: [] } }));
  await httpSetupTransport(authorized).saveField('contactEmail', 'owner@example.com');

  assert.equal(calls[0].path, '/vendor/profile');
  assert.equal(calls[0].init?.method, 'POST');
  // The value goes in the body: a query string lands in server logs and browser
  // history, and this one is a vendor's contact address.
  assert.match(String(calls[0].init?.body), /owner@example\.com/);
  assert.doesNotMatch(calls[0].path, /owner|@/);

  // The refresh cookie is Path-scoped to the auth routes precisely so it is not
  // attached here, and sending credentials would undo that.
  const hook = readFileSync(new URL('../useVendorAuth.ts', import.meta.url), 'utf8');
  assert.match(hook, /credentials: 'omit'/);
  // The ref holds an AccessToken, so the header must carry its value, not the object.
  assert.match(hook, /Authorization', `Bearer \$\{token\.current\.value\}`/);
});

test('the console is handed a call, never the token', () => {
  // A screen given the token could copy it into state, a log line or a DOM
  // attribute. A screen given a function cannot.
  const hook = readFileSync(new URL('../useVendorAuth.ts', import.meta.url), 'utf8');
  const returned = hook.slice(hook.lastIndexOf('return {'));
  assert.doesNotMatch(returned, /\btoken\b/, 'the auth hook must not return the token');
  assert.match(returned, /authorizedFetch/);

  // And the gate passes the capability down rather than the credential.
  const gate = readFileSync(new URL('../AuthGate.tsx', import.meta.url), 'utf8');
  assert.match(gate, /children\(auth\.session, \(\) => void auth\.signOut\(\), auth\.authorizedFetch\)/);
});

test('a state change is sent as the operation pressed, not the state to land in', async () => {
  const { authorized, calls } = stubFetch(() => ({
    status: 200,
    body: { legalName: 'Midtown Table', locations: [] },
  }));

  await httpSetupTransport(authorized).moveLocation('loc_a/b', 'PAUSE_LOCATION');

  // Posting a target state would assert the transition is legal instead of
  // asking, so the server gets the operation and applies its own table.
  assert.equal(calls[0].path, '/vendor/locations/loc_a%2Fb/state');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { operation: 'PAUSE_LOCATION' });
});

test('a refused state change surfaces the reason rather than a bare failure', async () => {
  const { authorized } = stubFetch(() => ({
    status: 422,
    body: { blockers: ['Cannot pause a place with bookings today'] },
  }));

  const result = await httpSetupTransport(authorized).moveLocation('loc_1', 'PAUSE_LOCATION');
  assert.equal(result.value, undefined);
  assert.deepEqual(result.blockers, ['Cannot pause a place with bookings today']);
});

const windowDraft = {
  skuTemplateId: 'dining.table',
  locationId: 'loc_1',
  weekdays: [5, 6],
  openMins: 17 * 60,
  closeMins: 22 * 60,
  quantity: 4,
};

test('a window draft is refused locally for what the API would refuse', () => {
  assert.deepEqual(windowDraftProblems(windowDraft), []);
  assert.deepEqual(windowDraftProblems({ ...windowDraft, locationId: '' }), ['Choose one of your places']);
  assert.deepEqual(windowDraftProblems({ ...windowDraft, weekdays: [] }), ['Pick at least one day']);
  assert.deepEqual(windowDraftProblems({ ...windowDraft, closeMins: windowDraft.openMins }), [
    'Closing has to come after opening',
  ]);
  assert.deepEqual(windowDraftProblems({ ...windowDraft, quantity: 0 }), ['Sell at least one per slot']);
});

test('windows are created at /vendor/windows and published by operation, not by flag', async () => {
  const { authorized, calls } = stubFetch((path) => ({
    status: path === '/vendor/windows' ? 201 : 200,
    body: { id: 'win_1', ...windowDraft, title: 'Table', published: path.endsWith('/publish') },
  }));
  const transport = httpWindowsTransport(authorized);

  const created = await transport.create(windowDraft);
  assert.equal(calls[0]?.path, '/vendor/windows');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.equal(created.value?.published, false);

  const live = await transport.setPublished('win_1', true);
  assert.equal(calls[1]?.path, '/vendor/windows/win_1/publish');
  assert.equal(live.value?.published, true);

  await transport.setPublished('win_1', false);
  assert.equal(calls[2]?.path, '/vendor/windows/win_1/unpublish');
});

test('a refused publish surfaces the API checklist', async () => {
  const { authorized } = stubFetch(() => ({
    status: 409,
    body: { error: 'Not ready to publish', blockers: ['Activate this place first', 42] },
  }));
  const result = await httpWindowsTransport(authorized).setPublished('win_1', true);
  assert.equal(result.status, 409);
  assert.deepEqual(result.blockers, ['Activate this place first']);
});

test('a window with no published flag reads as a draft', async () => {
  const { authorized } = stubFetch(() => ({ status: 200, body: { windows: [{ id: 'win_1', published: 'yes' }] } }));
  const listed = await httpWindowsTransport(authorized).list();
  assert.equal(listed.value?.[0]?.published, false);
});

test('the demo windows transport drafts first and publishes on request', async () => {
  const demo = demoWindowsTransport();
  const created = await demo.create(windowDraft);
  assert.equal(created.value?.published, false);
  const live = await demo.setPublished(created.value!.id, true);
  assert.equal(live.value?.published, true);
  assert.equal((await demo.list()).value?.length, 1);
});
