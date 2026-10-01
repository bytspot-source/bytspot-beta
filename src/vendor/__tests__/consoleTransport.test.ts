import assert from 'node:assert/strict';
import test from 'node:test';
import {
  demoConsoleTransport,
  httpConsoleTransport,
  patchDraftProblems,
  readPassCode,
  reviveAnalytics,
  reviveBooking,
  reviveBookings,
  reviveEarnings,
  revivePatch,
  revivePatches,
  revivePayouts,
  reviveSlots,
  reviveTeam,
  safeDashboardUrl,
  sameLocalDay,
} from '../consoleTransport.ts';
import type { AuthorizedFetch } from '../setupTransport.ts';

function stubFetch(reply: (path: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const authorized: AuthorizedFetch = async (path, init) => {
    calls.push({ path, init });
    const { status, body } = reply(path, init);
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  };
  return { authorized, calls };
}

test('a team keeps only the fields the console shows', () => {
  const team = reviveTeam({
    seats: [
      {
        id: 'seat_1',
        personId: 'p_1',
        email: 'a@example.com',
        role: 'staff',
        state: 'INVITED',
        invitedAt: '2026-10-01T00:00:00Z',
        inviteExpired: true,
        locationIds: ['loc_1', 7],
        bookableIds: 'nope',
        refreshToken: 'must not survive',
      },
    ],
    canInvite: ['staff', 3],
  });
  assert.equal(team.seats[0].inviteExpired, true);
  assert.deepEqual(team.seats[0].locationIds, ['loc_1']);
  assert.deepEqual(team.seats[0].bookableIds, []);
  assert.equal('refreshToken' in team.seats[0], false);
  assert.deepEqual(team.canInvite, ['staff']);
});

test('slots with an unreadable start are dropped rather than drawn at the epoch', () => {
  const slots = reviveSlots({
    window: { id: 'win_1', title: 'Table', weekdays: [5], openMins: 1080, closeMins: 1320, quantity: 2, published: true },
    timezone: 'America/New_York',
    slots: [
      { startsAt: '2026-10-02T22:00:00Z', startMins: 1080, weekday: 5, state: 'OPEN', quantity: 2, committed: 1, remaining: 1 },
      { startsAt: 'garbage', state: 'OPEN' },
    ],
  });
  assert.equal(slots.slots.length, 1);
  assert.equal(slots.slots[0].remaining, 1);
  assert.equal(slots.window.published, true);
});

test('no offers reads as no win rate, not zero', () => {
  assert.equal(reviveAnalytics({ winRate: null }).winRate, null);
  assert.equal(reviveAnalytics({ winRate: 40 }).winRate, 40);
});

test('payout lines default to completed and keep their currency', () => {
  const payouts = revivePayouts({
    payout: { reference: 'acct_1', status: 'active', last4: '4242' },
    totals: { netCents: 900, feeCents: 100, bookings: 1, refunds: 0 },
    lines: [{ id: 'chk_1', title: 'Table', paidAt: '2026-10-01T00:00:00Z', status: 'weird', amountCents: 1000, currency: 'usd' }],
  });
  assert.equal(payouts.payout?.status, 'active');
  assert.equal(payouts.lines[0].status, 'completed');
  assert.equal(revivePayouts({ payout: { status: 'active' } }).payout, undefined);
});

test('only an https Stripe link opens', () => {
  assert.equal(safeDashboardUrl('https://connect.stripe.com/express/abc'), 'https://connect.stripe.com/express/abc');
  assert.equal(safeDashboardUrl('http://connect.stripe.com/x'), undefined);
  assert.equal(safeDashboardUrl('https://stripe.com.evil.example/x'), undefined);
  assert.equal(safeDashboardUrl('javascript:alert(1)'), undefined);
});

test('the http transport sends to the API paths and surfaces its reasons', async () => {
  const { authorized, calls } = stubFetch((path) =>
    path === '/vendor/seats' ? { status: 403, body: { blockers: ['Your role cannot hand out that seat'] } } : { status: 200, body: { days: 7 } },
  );
  const api = httpConsoleTransport(authorized);
  const invite = await api.invite({ email: 'a@example.com', role: 'owner', locationIds: [], bookableIds: [] });
  assert.equal(invite.status, 403);
  assert.deepEqual(invite.blockers, ['Your role cannot hand out that seat']);
  assert.equal((await api.analytics(7)).value?.days, 7);
  await api.moveSlot('win 1', new Date('2026-10-02T22:00:00Z'), 'BLOCK_SLOT');
  assert.deepEqual(
    calls.map((call) => call.path),
    ['/vendor/seats', '/vendor/analytics?days=7', '/vendor/windows/win%201/slots'],
  );
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { startsAt: '2026-10-02T22:00:00.000Z', operation: 'BLOCK_SLOT' });
});

test('a dashboard link that is not Stripe is treated as a failure', async () => {
  const { authorized } = stubFetch(() => ({ status: 200, body: { url: 'https://evil.example/' } }));
  assert.equal((await httpConsoleTransport(authorized).payoutDashboard()).value, undefined);
});

test('the demo team starts empty and removing a seat drops it', async () => {
  const demo = demoConsoleTransport();
  assert.equal((await demo.team()).value?.seats.length, 0);
  const invited = await demo.invite({ email: 'a@example.com', role: 'staff', locationIds: [], bookableIds: [] });
  const id = invited.value!.seats[0].id;
  assert.equal((await demo.moveSeat(id, 'REVOKE_SEAT')).value?.seats.length, 0);
});

test('a booking keeps only what the console shows, and unknown states read as closed', () => {
  const booking = reviveBooking({
    id: 'off_1',
    title: 'Chef counter',
    where: 'Main room',
    locationId: 'loc_1',
    startsAt: '2026-10-02T23:00:00Z',
    durationMins: 90,
    partySize: 2,
    guestName: 'Ada',
    priceCents: 4000,
    payAt: 'bytspot',
    paid: 'paid',
    state: 'upcoming',
    pass: 'ISSUED',
    passCode: 'ABCD2345',
    guestEmail: 'ada@example.com',
  });
  assert.equal(booking?.guestName, 'Ada');
  assert.equal(booking?.paid, 'paid');
  assert.equal(booking && 'passCode' in booking, false);
  assert.equal(booking && 'guestEmail' in booking, false);

  const odd = reviveBooking({ id: 'off_2', startsAt: '2026-10-02T23:00:00Z', state: 'weird', pass: 'weird', paid: 'weird' });
  assert.equal(odd?.state, 'past');
  assert.equal(odd?.pass, 'REVOKED');
  assert.equal(odd?.paid, 'at_venue');

  assert.equal(reviveBooking({ id: 'off_3', startsAt: 'garbage' }), undefined);
  assert.equal(reviveBookings({ bookings: [{ id: 'x', startsAt: 'garbage' }, { id: 'y', startsAt: '2026-10-02T23:00:00Z' }] }).length, 1);
});

test('earnings drop days that are not dates', () => {
  const earnings = reviveEarnings({
    days: 7,
    totals: { appNetCents: 4500, venueCents: 4000, bookings: 2 },
    daily: [{ date: '2026-10-01', appNetCents: 4500, bookings: 1 }, { date: '<script>', venueCents: 1 }],
    upcomingVenueCents: 8000,
  });
  assert.equal(earnings.daily.length, 1);
  assert.equal(earnings.totals.feeCents, 0);
  assert.equal(earnings.upcomingVenueCents, 8000);
});

test('a pass reads the same typed or scanned, and anything else is refused', () => {
  assert.equal(readPassCode('abcd-2345'), 'ABCD2345');
  assert.equal(readPassCode('BYTSPOT-PASS:ABCD2345'), 'ABCD2345');
  assert.equal(readPassCode('https://bytspot.app/p/ABCD2345'), undefined);
  assert.equal(readPassCode(''), undefined);
});

test('today is the place\'s today', () => {
  const lateEvening = new Date('2026-10-02T03:30:00Z');
  const nextMorning = new Date('2026-10-02T14:00:00Z');
  assert.equal(sameLocalDay(lateEvening, nextMorning, 'America/New_York'), false);
  assert.equal(sameLocalDay(lateEvening, nextMorning, 'UTC'), true);
});

test('bookings, check-in, passes and earnings go to their API paths', async () => {
  const { authorized, calls } = stubFetch((path) =>
    path === '/vendor/passes/verify'
      ? { status: 404, body: { blockers: ['No booking here has that pass'] } }
      : { status: 200, body: { bookings: [], booking: { id: 'off 1', startsAt: '2026-10-02T23:00:00Z', state: 'checked_in' } } },
  );
  const api = httpConsoleTransport(authorized);
  assert.deepEqual((await api.bookings('past')).value, []);
  assert.equal((await api.moveBooking('off 1', 'CHECK_IN')).value?.state, 'checked_in');
  assert.deepEqual((await api.verifyPass('ABCD2345')).blockers, ['No booking here has that pass']);
  await api.earnings(90);
  assert.deepEqual(
    calls.map((call) => call.path),
    ['/vendor/bookings?when=past', '/vendor/bookings/off%201/state', '/vendor/passes/verify', '/vendor/earnings?days=90'],
  );
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { operation: 'CHECK_IN' });
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { code: 'ABCD2345' });
});

test('the demo build has no bookings and knows no passes', async () => {
  const demo = demoConsoleTransport();
  assert.deepEqual((await demo.bookings('upcoming')).value, []);
  assert.equal((await demo.verifyPass('ABCD2345')).status, 404);
  assert.equal((await demo.earnings(7)).value?.days, 7);
});

test('a patch is kept only with a real code and an https link', () => {
  const base = { id: 'pat_1', code: 'ABCD2345', url: 'https://bytspot.app/at/ABCD2345', label: 'Front door', place: 'Main room', locationId: 'loc_1', scans: 3 };
  const patch = revivePatch({ ...base, kind: 'partner', partnerName: 'Hotel Indigo', createdBySeatId: 'seat_1' });
  assert.equal(patch?.kind, 'partner');
  assert.equal(patch?.partnerName, 'Hotel Indigo');
  assert.equal(patch?.scans, 3);
  assert.equal(patch && 'createdBySeatId' in patch, false);
  assert.equal(revivePatch({ ...base, kind: 'weird' })?.kind, 'patch');
  assert.equal(revivePatch({ ...base, url: 'javascript:alert(1)' }), undefined);
  assert.equal(revivePatch({ ...base, url: 'http://bytspot.app/at/ABCD2345' }), undefined);
  assert.equal(revivePatch({ ...base, code: 'abc' }), undefined);
  assert.equal(revivePatches({ patches: [base, { ...base, id: '' }] }).length, 1);
});

test('a patch needs a place and a label, and a partner link a partner', () => {
  assert.deepEqual(patchDraftProblems({ kind: 'patch', locationId: 'loc_1', label: 'Door' }), []);
  assert.deepEqual(patchDraftProblems({ kind: 'patch', locationId: '', label: ' ' }), ['Choose one of your places', 'Say where it goes']);
  assert.deepEqual(patchDraftProblems({ kind: 'partner', locationId: 'loc_1', label: 'Desk' }), ['Name the partner']);
});

test('patches go to their API paths, and a partner name is sent only for a partner', async () => {
  const { authorized, calls } = stubFetch(() => ({
    status: 200,
    body: { patches: [], patch: { id: 'pat_1', code: 'ABCD2345', url: 'https://bytspot.app/at/ABCD2345' } },
  }));
  const api = httpConsoleTransport(authorized);
  assert.deepEqual((await api.patches('partner')).value, []);
  assert.equal((await api.createPatch({ kind: 'patch', locationId: 'loc_1', label: ' Door ', partnerName: 'Ignored' })).value?.code, 'ABCD2345');
  assert.equal((await api.archivePatch('pat 1', 'patch')).value, true);
  assert.deepEqual(
    calls.map((call) => call.path),
    ['/vendor/patches?kind=partner', '/vendor/patches', '/vendor/patches/pat%201/archive'],
  );
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { kind: 'patch', locationId: 'loc_1', label: 'Door' });
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)), { kind: 'patch' });
});
