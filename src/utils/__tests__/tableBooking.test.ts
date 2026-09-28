import test from 'node:test';
import assert from 'node:assert/strict';
import { tableBookingFrom } from '../tableBooking.ts';
import { parsePlan, planItemStatus } from '../planRpc.ts';

test('a listed OpenTable or Resy link becomes a button, labelled by provider', () => {
  assert.deepEqual(tableBookingFrom({ provider: 'opentable', label: 'x', url: 'https://www.opentable.com/r/example' }),
    { provider: 'opentable', label: 'OpenTable', url: 'https://www.opentable.com/r/example' });
  assert.deepEqual(tableBookingFrom({ provider: 'resy', url: 'https://resy.com/cities/atl/example' })?.label, 'Resy');
});

test('a malformed or foreign link never becomes a button', () => {
  for (const value of [
    null, 'https://resy.com/x', {},
    { provider: 'sevenrooms', url: 'https://sevenrooms.com/x' },
    { provider: 'opentable', url: 'http://www.opentable.com/r/x' },
    { provider: 'opentable', url: 'https://resy.com/x' },
    { provider: 'resy', url: 'https://resy.com.evil.example/x' },
    { provider: 'resy', url: 'javascript:alert(1)' },
  ]) assert.equal(tableBookingFrom(value), undefined, JSON.stringify(value));
});

test('a Plan item keeps its booking link and the guest\u2019s own report apart from booked', () => {
  const plan = parsePlan({
    id: 'p', title: 'Friday', intent: 'Out', creatorUserId: 'u', state: 'confirmed', startsAt: null, partySize: null,
    needs: [], openNeeds: [], readiness: { going: 1, maybe: 0, pending: 0 },
    items: [
      { id: 'a', title: 'Example Grill', needKind: 'dining', booked: false, status: 'available',
        tableBooking: { provider: 'resy', url: 'https://resy.com/cities/atl/example' },
        guestBooking: { reportedAt: '2026-09-28T12:00:00.000Z', bookedFor: '2026-10-02T23:30:00.000Z' } },
      { id: 'b', title: 'Walk', needKind: 'dining', booked: false, status: 'available', guestBooking: { reportedAt: 'nope' } },
    ],
  });
  assert.equal(plan.items[0].booked, false);
  assert.equal(plan.items[0].tableBooking?.label, 'Resy');
  assert.deepEqual(plan.items[0].guestBooking, { bookedFor: '2026-10-02T23:30:00.000Z' });
  assert.equal(plan.items[1].tableBooking, undefined);
  assert.equal(plan.items[1].guestBooking, undefined);
  assert.equal(planItemStatus(plan.items[0]), 'Booked (by you)');
  assert.equal(planItemStatus(plan.items[1]), 'Not booked');
  assert.equal(planItemStatus({ ...plan.items[0], booked: true }), 'Booked');
  assert.equal(planItemStatus({ ...plan.items[0], status: 'cancelled' }), 'Cancelled');
});
