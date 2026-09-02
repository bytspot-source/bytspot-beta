import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAvailabilityGrid } from '../availability.ts';
import {
  demandLostToCapacity,
  demandWindow,
  evaluateDemand,
  matchDemand,
  respondToDemand,
  slotsForDemand,
  unmetDemand,
  type Demand,
  type DemandSupply,
} from '../demand.ts';
import type { VendorLocation } from '../locations.ts';
import { canRunDemandOperation, getBookableDemand, isDemandActionable } from '../../utils/bookableTemplates.ts';

// A Friday, so the Fri/Sat window lands predictably.
const FRIDAY = new Date('2026-09-04T00:00:00');

const MIDTOWN: VendorLocation = {
  id: 'loc_1',
  label: 'Midtown',
  kind: 'fixed',
  state: 'ACTIVE',
  address: '1 Peachtree St',
  lat: 33.7866,
  lng: -84.3833,
};

function diningSupply(overrides: Partial<DemandSupply> = {}): DemandSupply {
  return {
    bookableId: 'bk_1',
    title: 'Table for 4',
    domain: 'dining',
    location: MIDTOWN,
    priceCents: 5000,
    maxGuests: 4,
    slots: buildAvailabilityGrid({
      domain: 'dining',
      window: { weekdays: [5, 6], openMins: 19 * 60, closeMins: 24 * 60, quantity: 4 },
      days: 3,
      from: FRIDAY,
      now: FRIDAY,
    }),
    ...overrides,
  };
}

function demand(overrides: Partial<Demand> = {}): Demand {
  return {
    id: 'd1',
    category: 'dining',
    state: 'OPEN',
    partySize: 2,
    earliest: new Date('2026-09-04T20:00:00'),
    latest: new Date('2026-09-04T21:00:00'),
    lat: 33.79,
    lng: -84.39,
    radiusMiles: 5,
    raisedAt: FRIDAY,
    ...overrides,
  };
}

test('a match must name the slot that would fill it, not just the category', () => {
  const evaluation = evaluateDemand(demand(), diningSupply(), FRIDAY);

  assert.equal(evaluation.matched, true);
  assert.deepEqual(evaluation.misses, []);
  // The whole point: a match carries real capacity, soonest first.
  assert.ok(evaluation.slots.length > 0);
  assert.equal(evaluation.slots[0].state, 'OPEN');
  assert.ok(evaluation.slots.every((slot) => slot.remaining >= 2));
  for (let index = 1; index < evaluation.slots.length; index += 1) {
    assert.ok(evaluation.slots[index].startsAt >= evaluation.slots[index - 1].startsAt);
  }
});

test('the same demand stops matching the moment capacity goes', () => {
  const supply = diningSupply();
  const open = evaluateDemand(demand(), supply, FRIDAY);
  assert.equal(open.matched, true);

  // Sell out the window and the category still fits, but the answer is gone.
  const soldOut = diningSupply({
    slots: buildAvailabilityGrid({
      domain: 'dining',
      window: { weekdays: [5, 6], openMins: 19 * 60, closeMins: 24 * 60, quantity: 4 },
      days: 3,
      from: FRIDAY,
      now: FRIDAY,
      commitments: Object.fromEntries(supply.slots.map((slot) => [slot.id, { committed: 4 }])),
    }),
  });
  const closed = evaluateDemand(demand(), soldOut, FRIDAY);
  assert.equal(closed.matched, false);
  assert.deepEqual(closed.misses.map((item) => item.rule), ['capacity']);
  assert.equal(closed.misses[0].reason, 'No capacity in that window');

  // Blocking a slot removes it just as effectively as selling it.
  const blocked = diningSupply({
    slots: buildAvailabilityGrid({
      domain: 'dining',
      window: { weekdays: [5, 6], openMins: 19 * 60, closeMins: 24 * 60, quantity: 4 },
      days: 3,
      from: FRIDAY,
      now: FRIDAY,
      commitments: Object.fromEntries(supply.slots.map((slot) => [slot.id, { blocked: true }])),
    }),
  });
  assert.equal(evaluateDemand(demand(), blocked, FRIDAY).matched, false);
});

test('a party is never split across slots to manufacture a match', () => {
  const supply = diningSupply();
  // Four seats a slot, so a party of four fits and a party of five never does.
  assert.equal(evaluateDemand(demand({ partySize: 4 }), supply, FRIDAY).matched, true);

  const tooBig = evaluateDemand(demand({ partySize: 5 }), supply, FRIDAY);
  assert.equal(tooBig.matched, false);
  assert.deepEqual(tooBig.misses.map((item) => item.rule), ['party', 'capacity']);

  // Two seats left will not take a party of three even though the slot is OPEN.
  const partlySold = diningSupply({
    slots: buildAvailabilityGrid({
      domain: 'dining',
      window: { weekdays: [5, 6], openMins: 19 * 60, closeMins: 24 * 60, quantity: 4 },
      days: 3,
      from: FRIDAY,
      now: FRIDAY,
      commitments: Object.fromEntries(supply.slots.map((slot) => [slot.id, { committed: 2 }])),
    }),
  });
  assert.equal(evaluateDemand(demand({ partySize: 2 }), partlySold, FRIDAY).matched, true);
  assert.equal(evaluateDemand(demand({ partySize: 3 }), partlySold, FRIDAY).matched, false);
});

test('every rule the contract declares is enforced and carries its reason', () => {
  const supply = diningSupply();
  const declared = getBookableDemand().matchRules;

  const cases: Record<string, Demand> = {
    // Fitness is a rail this dining bookable does not appear in.
    category: demand({ category: 'fitness' }),
    location: demand({ lat: 34.9 }),
    party: demand({ partySize: 40 }),
    budget: demand({ budgetCents: 1000 }),
    capacity: demand({ earliest: new Date('2026-09-07T20:00:00'), latest: new Date('2026-09-07T21:00:00') }),
  };

  for (const rule of declared) {
    const evaluation = evaluateDemand(cases[rule.id], supply, FRIDAY);
    assert.equal(evaluation.matched, false, `${rule.id} should have blocked the match`);
    const hit = evaluation.misses.find((item) => item.rule === rule.id);
    assert.ok(hit, `${rule.id} is declared but never enforced`);
    assert.equal(hit.reason, rule.missReason);
  }

  // Misses are collected, not short-circuited, so a vendor sees the whole story.
  const doomed = evaluateDemand(demand({ partySize: 40, budgetCents: 1 }), supply, FRIDAY);
  assert.deepEqual(doomed.misses.map((item) => item.rule), ['party', 'budget', 'capacity']);
});

test('the guest window is widened by the flexibility the contract allows', () => {
  const target = demand({
    earliest: new Date('2026-09-04T20:00:00'),
    latest: new Date('2026-09-04T20:00:00'),
  });
  const { flexibilityMins } = getBookableDemand().defaults;
  const window = demandWindow(target);
  assert.equal(window.from.getTime(), target.earliest.getTime() - flexibilityMins * 60_000);
  assert.equal(window.to.getTime(), target.latest.getTime() + flexibilityMins * 60_000);

  // A single-minute request still reaches the slots either side of it.
  const slots = slotsForDemand(target, diningSupply(), FRIDAY);
  assert.ok(slots.length > 1);
  assert.ok(slots.every((slot) => slot.startsAt >= window.from && slot.startsAt <= window.to));

  // No flexibility means only exactly aligned slots count.
  const strict = slotsForDemand(target, diningSupply(), FRIDAY).filter(
    (slot) => slot.startsAt.getTime() === target.earliest.getTime(),
  );
  assert.equal(strict.length, 1);
});

test('demand nobody could answer keeps the reason instead of being dropped', () => {
  const supply = [diningSupply()];
  const demands = [
    demand({ id: 'match' }),
    demand({ id: 'party', partySize: 8 }),
    demand({ id: 'wrongDay', earliest: new Date('2026-09-07T20:00:00'), latest: new Date('2026-09-07T21:00:00') }),
    demand({ id: 'faraway', lat: 34.9 }),
    demand({ id: 'wrongRail', category: 'fitness' }),
  ];

  assert.deepEqual(matchDemand(demands, supply, FRIDAY).map((item) => item.demand.id), ['match']);

  const unmet = unmetDemand(demands, supply, FRIDAY);
  assert.deepEqual(unmet.map((item) => item.demand.id).sort(), ['faraway', 'party', 'wrongDay', 'wrongRail']);
  for (const item of unmet) {
    assert.ok(item.reasons.length > 0, `${item.demand.id} was dropped without a reason`);
  }

  // The one number worth showing: demand a vendor can win back by opening more.
  const fixable = demandLostToCapacity(demands, supply, FRIDAY);
  assert.deepEqual(fixable.map((item) => item.demand.id), ['wrongDay']);
  assert.deepEqual(fixable[0].reasons.map((item) => item.rule), ['capacity']);
});

test('only actionable demand reaches a vendor, and only a seller can answer it', () => {
  const supply = [diningSupply()];
  for (const state of getBookableDemand().terminalStates) {
    assert.equal(isDemandActionable(state), false);
    assert.deepEqual(matchDemand([demand({ state })], supply, FRIDAY), []);
    assert.deepEqual(unmetDemand([demand({ state, partySize: 40 })], supply, FRIDAY), []);
  }
  for (const state of getBookableDemand().actionableStates) {
    assert.equal(isDemandActionable(state), true);
  }

  // Answering demand needs SELL, which staff and door do not hold.
  assert.equal(canRunDemandOperation('owner', 'OFFER', 'MATCHED'), true);
  assert.equal(canRunDemandOperation('manager', 'OFFER', 'MATCHED'), true);
  assert.equal(canRunDemandOperation('staff', 'OFFER', 'MATCHED'), false);
  assert.equal(canRunDemandOperation('door', 'OFFER', 'MATCHED'), false);
  assert.equal(canRunDemandOperation('serviceProvider', 'OFFER', 'MATCHED'), false);

  // State decides after the seat is allowed through.
  assert.equal(canRunDemandOperation('owner', 'OFFER', 'OPEN'), false);
  assert.equal(canRunDemandOperation('owner', 'WITHDRAW_OFFER', 'OFFERED'), true);
  for (const state of getBookableDemand().terminalStates) {
    for (const operation of getBookableDemand().operations) {
      assert.equal(canRunDemandOperation('owner', operation.id, state), false);
    }
  }
});

test('responding follows the contract or does not happen at all', () => {
  const matched = demand({ state: 'MATCHED' });

  assert.equal(respondToDemand(matched, 'owner', 'OFFER')?.state, 'OFFERED');
  assert.equal(respondToDemand(matched, 'owner', 'DECLINE')?.state, 'OPEN');
  assert.equal(respondToDemand({ ...matched, state: 'OFFERED' }, 'owner', 'WITHDRAW_OFFER')?.state, 'OPEN');

  // A seat without SELL cannot answer, and an illegal transition is refused.
  assert.equal(respondToDemand(matched, 'door', 'OFFER'), null);
  assert.equal(respondToDemand(matched, 'staff', 'DECLINE'), null);
  assert.equal(respondToDemand(demand({ state: 'OPEN' }), 'owner', 'OFFER'), null);
  assert.equal(respondToDemand(demand({ state: 'BOOKED' }), 'owner', 'DECLINE'), null);

  // The original is never mutated, so a refused response leaves no trace.
  assert.equal(matched.state, 'MATCHED');
});
