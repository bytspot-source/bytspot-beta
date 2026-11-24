import assert from 'node:assert/strict';
import test from 'node:test';
import { ticketRefund, ticketsTransport, type TicketsClient } from '../guestTickets.ts';

const now = new Date('2026-12-01T12:00:00Z');

test('a paid ticket offers Cancel & refund until the cutoff, then says who to contact', () => {
  const open = ticketRefund({ payment: 'paid', refundableUntil: '2026-12-03T17:00:00Z', timezone: 'America/New_York' }, now);
  assert.equal(open.canCancel, true);
  assert.match(open.line ?? '', /^Free cancellation until Thu, Dec 3, 12:00 PM\. You get the full price back\.$/);

  const closed = ticketRefund({ payment: 'paid', refundableUntil: undefined, timezone: null }, now);
  assert.deepEqual(closed, { canCancel: false, line: 'Refunds closed 24 hours before the start. Contact the business.' });
  assert.equal(ticketRefund({ payment: 'paid', refundableUntil: '2026-12-01T11:59:00Z', timezone: null }, now).canCancel, false);
});

test('a ticket still paying or already refunded shows no cancel line', () => {
  assert.deepEqual(ticketRefund({ payment: 'paying', refundableUntil: '2026-12-03T17:00:00Z', timezone: null }, now), { canCancel: false });
  assert.deepEqual(ticketRefund({ payment: 'refunded', refundableUntil: undefined, timezone: null }, now), { canCancel: false });
});

test('cancel sends only the order id', async () => {
  let sent: unknown;
  const client = { tickets: {
    get: { query: async () => { throw new Error('unused'); } },
    checkout: { mutate: async () => ({ url: '' }) },
    mine: { query: async () => [] },
    cancel: { mutate: async (input: { orderId: string }) => { sent = input; return { orderId: input.orderId, refundedCents: 3000 }; } },
  } } as unknown as TicketsClient;
  assert.deepEqual(await ticketsTransport(client).cancel('ord_1'), { orderId: 'ord_1', refundedCents: 3000 });
  assert.deepEqual(sent, { orderId: 'ord_1' });
});
