import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAvailabilityOperation,
  availabilityOperationsFor,
  buildAvailabilityGrid,
  formatSlotTime,
  isWithinLeadTime,
  printableSkuCount,
  sellableSlots,
  type AvailabilityWindow,
  type SlotCommitments,
} from '../availability.ts';
import {
  availabilityDefaultsFor,
  canCommitToSlot,
  canRunAvailabilityOperation,
  canSetSlotQuantity,
  getBookableAvailability,
  minimumQuantityForSlot,
  remainingInSlot,
  resolveSlotState,
} from '../../utils/bookableTemplates.ts';

// A Friday, so the weekly window lands predictably.
const FRIDAY = new Date('2026-09-04T00:00:00');
const FRI_SAT: AvailabilityWindow = { weekdays: [5, 6], openMins: 19 * 60, closeMins: 24 * 60, quantity: 5 };

test('a window times a slot times a quantity is how many SKUs exist', () => {
  const slots = buildAvailabilityGrid({ domain: 'dining', window: FRI_SAT, days: 7, from: FRIDAY, now: FRIDAY });

  // Fri and Sat, 7 PM to midnight, 30-minute slots: 10 slots a night.
  assert.equal(slots.length, 20);
  assert.equal(printableSkuCount(slots), 100);
  assert.equal(slots[0].startMins, 19 * 60);
  assert.equal(formatSlotTime(slots[0].startMins), '7 PM');
  assert.equal(formatSlotTime(slots[1].startMins), '7:30 PM');

  // The last slot has to finish inside the window rather than run past close.
  const lastOfNight = slots.filter((slot) => slot.weekday === 5)[9];
  assert.equal(formatSlotTime(lastOfNight.startMins), '11:30 PM');
  assert.equal(lastOfNight.startMins + 30, FRI_SAT.closeMins);

  // Days outside the window print nothing at all.
  assert.equal(slots.every((slot) => slot.weekday === 5 || slot.weekday === 6), true);
  assert.equal(buildAvailabilityGrid({ domain: 'dining', window: { ...FRI_SAT, weekdays: [] }, days: 7, from: FRIDAY }).length, 0);
});

test('a slot holds capacity and never holds a booking', () => {
  assert.equal(remainingInSlot({ quantity: 5, committed: 0 }), 5);
  assert.equal(remainingInSlot({ quantity: 5, committed: 3 }), 2);
  assert.equal(remainingInSlot({ quantity: 5, committed: 5 }), 0);
  // Overcommitment can never read as negative capacity.
  assert.equal(remainingInSlot({ quantity: 5, committed: 9 }), 0);

  assert.equal(resolveSlotState({ quantity: 5, committed: 0 }), 'OPEN');
  assert.equal(resolveSlotState({ quantity: 5, committed: 5 }), 'FULL');
  assert.equal(resolveSlotState({ quantity: 5, committed: 0, closed: true }), 'CLOSED');

  // A vendor closing a slot outranks demand, so blocked beats full.
  assert.equal(resolveSlotState({ quantity: 5, committed: 5, blocked: true }), 'BLOCKED');
  // And time outranks everything.
  const past = new Date(FRIDAY.getTime() - 60_000);
  assert.equal(resolveSlotState({ quantity: 5, committed: 0, blocked: true, startsAt: past }, FRIDAY), 'PASSED');

  // Only an OPEN slot may take a commitment.
  assert.equal(canCommitToSlot({ quantity: 5, committed: 4 }), true);
  assert.equal(canCommitToSlot({ quantity: 5, committed: 5 }), false);
  assert.equal(canCommitToSlot({ quantity: 5, committed: 0, blocked: true }), false);
  assert.equal(canCommitToSlot({ quantity: 5, committed: 0, startsAt: past }, FRIDAY), false);
});

test('quantity can rise freely but never below what is already sold', () => {
  const slot = { quantity: 5, committed: 3 };
  assert.equal(minimumQuantityForSlot(slot), 3);

  assert.equal(canSetSlotQuantity(slot, 3), true);
  assert.equal(canSetSlotQuantity(slot, 99), true);
  // Dropping below three would strand a guest who already holds a SKU.
  assert.equal(canSetSlotQuantity(slot, 2), false);
  assert.equal(canSetSlotQuantity(slot, 0), false);
  assert.equal(canSetSlotQuantity(slot, -1), false);
  assert.equal(canSetSlotQuantity(slot, 2.5), false);
  assert.equal(canSetSlotQuantity(slot, 1000), false);

  // With nothing sold the floor is zero, which is how a vendor takes a slot off sale.
  assert.equal(canSetSlotQuantity({ quantity: 5, committed: 0 }, 0), true);
});

test('a hold expiring hands capacity back instead of stranding it', () => {
  const slots = buildAvailabilityGrid({
    domain: 'dining',
    window: FRI_SAT,
    days: 1,
    from: FRIDAY,
    now: FRIDAY,
    commitments: { '2026-09-04T1140': { committed: 5 } },
  });
  const full = slots.find((slot) => slot.id === '2026-09-04T1140');
  assert.ok(full);
  assert.equal(full.state, 'FULL');
  assert.equal(full.remaining, 0);

  const released = applyAvailabilityOperation({ '2026-09-04T1140': { committed: 5 } }, full, 'manager', 'RELEASE');
  assert.ok(released);
  assert.equal(released['2026-09-04T1140'].committed, 4);

  const after = buildAvailabilityGrid({ domain: 'dining', window: FRI_SAT, days: 1, from: FRIDAY, now: FRIDAY, commitments: released });
  const reopened = after.find((slot) => slot.id === '2026-09-04T1140');
  assert.equal(reopened?.state, 'OPEN');
  assert.equal(reopened?.remaining, 1);
});

test('a nightly stay, a rolling table and a fixed door time are three shapes', () => {
  assert.equal(availabilityDefaultsFor('dining').slotKind, 'rolling');
  assert.equal(availabilityDefaultsFor('stay').slotKind, 'daily');
  assert.equal(availabilityDefaultsFor('events').slotKind, 'fixed');

  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  // A stay prints one slot a night, not one every thirty minutes.
  const nights = buildAvailabilityGrid({
    domain: 'stay',
    window: { weekdays: everyDay, openMins: 15 * 60, closeMins: 24 * 60, quantity: 3 },
    days: 5,
    from: FRIDAY,
    now: FRIDAY,
  });
  assert.equal(nights.length, 5);
  assert.equal(printableSkuCount(nights), 15);

  // An event is one named start time, however long the window is.
  const doors = buildAvailabilityGrid({
    domain: 'events',
    window: { weekdays: [6], openMins: 19 * 60, closeMins: 23 * 60, quantity: 200 },
    days: 14,
    from: FRIDAY,
    now: FRIDAY,
  });
  assert.equal(doors.length, 2);
  assert.equal(printableSkuCount(doors), 400);
});

test('the horizon and lead time are the two limits a vendor cannot exceed', () => {
  // Parking is bookable 14 days out, so asking for 60 gives 14.
  const parking = buildAvailabilityGrid({
    domain: 'stall',
    window: { weekdays: [0, 1, 2, 3, 4, 5, 6], openMins: 9 * 60, closeMins: 10 * 60, quantity: 2 },
    days: 60,
    from: FRIDAY,
    now: FRIDAY,
  });
  assert.equal(availabilityDefaultsFor('stall').horizonDays, 14);
  assert.equal(new Set(parking.map((slot) => slot.startsAt.toDateString())).size, 14);

  // A slot inside the lead time stays OPEN on the calendar but is not sellable.
  const soon = buildAvailabilityGrid({ domain: 'dining', window: FRI_SAT, days: 1, from: FRIDAY, now: FRIDAY });
  const first = soon[0];
  assert.equal(first.state, 'OPEN');
  const justBefore = new Date(first.startsAt.getTime() - 30 * 60_000);
  assert.equal(isWithinLeadTime(first, 'dining', justBefore), true);
  assert.equal(sellableSlots(soon, 'dining', justBefore).includes(first), false);
  assert.equal(sellableSlots(soon, 'dining', FRIDAY).includes(first), true);
});

test('the calendar obeys the same two-part check as the SKU machine', () => {
  // Every scheduling operation needs SCHEDULE, which staff and door lack.
  for (const operation of getBookableAvailability().operations) {
    assert.equal(operation.requiresCapability, 'SCHEDULE');
  }
  assert.deepEqual(availabilityOperationsFor('door', 'OPEN'), []);
  assert.deepEqual(availabilityOperationsFor('staff', 'OPEN'), []);
  assert.ok(availabilityOperationsFor('serviceProvider', 'OPEN').length > 0);

  // State still decides after the seat is allowed through.
  assert.equal(canRunAvailabilityOperation('owner', 'OPEN_SLOT', 'CLOSED'), true);
  assert.equal(canRunAvailabilityOperation('owner', 'OPEN_SLOT', 'OPEN'), false);
  assert.equal(canRunAvailabilityOperation('owner', 'RELEASE', 'FULL'), true);
  assert.equal(canRunAvailabilityOperation('owner', 'RELEASE', 'OPEN'), false);
  // A passed slot is terminal, so nothing at all can be run on it.
  for (const operation of getBookableAvailability().operations) {
    assert.equal(canRunAvailabilityOperation('owner', operation.id, 'PASSED'), false);
  }
});

test('applying an operation refuses anything the contract forbids', () => {
  const commitments: SlotCommitments = {};
  const slots = buildAvailabilityGrid({ domain: 'dining', window: FRI_SAT, days: 1, from: FRIDAY, now: FRIDAY });
  const open = slots[0];

  const blocked = applyAvailabilityOperation(commitments, open, 'manager', 'BLOCK_SLOT');
  assert.equal(blocked?.[open.id].blocked, true);

  // The door may not touch the calendar even for a legal transition.
  assert.equal(applyAvailabilityOperation(commitments, open, 'door', 'BLOCK_SLOT'), null);
  assert.equal(applyAvailabilityOperation(commitments, open, 'staff', 'CLOSE_SLOT'), null);

  // Opening an already-open slot is not a transition the contract allows.
  assert.equal(applyAvailabilityOperation(commitments, open, 'owner', 'OPEN_SLOT'), null);

  // SET_QUANTITY still runs the oversell guard.
  const sold = { ...open, committed: 3, state: 'OPEN' as const };
  assert.equal(applyAvailabilityOperation(commitments, sold, 'owner', 'SET_QUANTITY', 2), null);
  assert.ok(applyAvailabilityOperation(commitments, sold, 'owner', 'SET_QUANTITY', 4));
  assert.equal(applyAvailabilityOperation(commitments, sold, 'owner', 'SET_QUANTITY'), null);
});
