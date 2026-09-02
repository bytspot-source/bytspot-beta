import assert from 'node:assert/strict';
import test from 'node:test';
import { httpDemandTransport, reviveFeed } from '../demandTransport.ts';
import type { AuthorizedFetch } from '../setupTransport.ts';

function stubFetch(reply: (path: string, init?: RequestInit) => { status: number; body: unknown }) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const authorized: AuthorizedFetch = async (path, init) => {
    calls.push({ path, init });
    const { status, body } = reply(path, init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { authorized, calls };
}

const REQUEST = {
  id: 'd1',
  category: 'dining',
  state: 'OPEN',
  partySize: 2,
  earliest: '2026-09-04T20:00:00.000Z',
  latest: '2026-09-04T21:00:00.000Z',
  lat: 33.79,
  lng: -84.39,
  radiusMiles: 5,
  raisedAt: '2026-09-02T10:00:00.000Z',
};

test('instants arrive as dates, because the matcher compares them', () => {
  const feed = reviveFeed({ demand: [REQUEST], supply: [] });

  // Two ISO strings compare lexically without throwing, so a window left as a
  // string would silently mismatch rather than fail.
  assert.ok(feed.demand[0].earliest instanceof Date);
  assert.ok(feed.demand[0].latest instanceof Date);
  assert.ok(feed.demand[0].raisedAt instanceof Date);
  assert.equal(feed.demand[0].earliest.getTime(), Date.parse(REQUEST.earliest));
});

test('a request whose window did not parse is dropped, not coerced', () => {
  const feed = reviveFeed({
    demand: [REQUEST, { ...REQUEST, id: 'd2', earliest: 'next tuesday' }, { ...REQUEST, id: 'd3', raisedAt: null }],
    supply: [],
  });

  // An unparseable window would match everything or nothing, and both look
  // exactly like a working feed.
  assert.deepEqual(
    feed.demand.map((item) => item.id),
    ['d1'],
  );
});

test('numbers arrive as numbers, so a radius compares rather than concatenates', () => {
  const feed = reviveFeed({
    demand: [{ ...REQUEST, partySize: '4', radiusMiles: '8', lat: '33.79', lng: '-84.39' }],
    supply: [
      {
        bookableId: 'bk_1',
        title: 'Table for 4',
        domain: 'dining',
        priceCents: '4500',
        maxGuests: '4',
        location: { id: 'loc_1', label: 'M', kind: 'fixed', state: 'ACTIVE', lat: '33.78', lng: '-84.38' },
        slots: [],
      },
    ],
  });

  assert.equal(feed.demand[0].partySize, 4);
  assert.equal(feed.demand[0].radiusMiles, 8);
  assert.equal(feed.supply[0].maxGuests, 4);
  assert.equal(feed.supply[0].location.lat, 33.78);
});

test('a slot remaining count is derived, never trusted', () => {
  const feed = reviveFeed({
    demand: [],
    supply: [
      {
        bookableId: 'bk_1',
        title: 'T',
        domain: 'dining',
        priceCents: 0,
        maxGuests: 4,
        location: { id: 'loc_1', label: 'M', kind: 'fixed', state: 'ACTIVE', lat: 33.78, lng: -84.38 },
        slots: [
          {
            id: 's1',
            startsAt: '2026-09-04T20:00:00.000Z',
            startMins: 1200,
            weekday: 5,
            quantity: 4,
            committed: 4,
            blocked: false,
            closed: false,
            state: 'OPEN',
            // A stale count from the server would have the console offer a slot
            // that is already full.
            remaining: 3,
            minimumQuantity: 1,
          },
        ],
      },
    ],
  });

  assert.equal(feed.supply[0].slots[0].remaining, 0);
  assert.ok(feed.supply[0].slots[0].startsAt instanceof Date);
});

test('demand and supply come from one read, so they describe the same moment', async () => {
  const { authorized, calls } = stubFetch(() => ({ status: 200, body: { demand: [REQUEST], supply: [] } }));

  const result = await httpDemandTransport(authorized).loadFeed();

  assert.equal(calls.length, 1, 'two reads would let supply drift from demand');
  assert.equal(calls[0].path, '/vendor/demand');
  assert.equal(result.value?.demand.length, 1);
});

test('a response names the bookable being offered, not just the operation', async () => {
  const { authorized, calls } = stubFetch(() => ({ status: 200, body: { demand: [], supply: [] } }));

  await httpDemandTransport(authorized).respond('d 1', 'bk_1', 'OFFER');

  // A business with two bookables that both fit is offering one of them
  // specifically, and the guest is told which.
  assert.equal(calls[0].path, '/vendor/demand/d%201/respond');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { operation: 'OFFER', bookableId: 'bk_1' });
});

test('a refused response surfaces the reason rather than a bare failure', async () => {
  const { authorized } = stubFetch(() => ({
    status: 409,
    body: { blockers: ['Someone else took that slot'] },
  }));

  const result = await httpDemandTransport(authorized).respond('d1', 'bk_1', 'OFFER');
  assert.equal(result.value, undefined);
  assert.deepEqual(result.blockers, ['Someone else took that slot']);
});
