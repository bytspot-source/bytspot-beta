import assert from 'node:assert/strict';
import test from 'node:test';
import {
  demoConsoleTransport,
  httpConsoleTransport,
  reviveAnalytics,
  revivePayouts,
  reviveSlots,
  reviveTeam,
  safeDashboardUrl,
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
