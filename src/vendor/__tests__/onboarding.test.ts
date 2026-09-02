import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getBookableSeller,
  sellerCanUseConsole,
  type BookableSellerState,
} from '../../utils/bookableTemplates.ts';
import {
  canAdvanceOnboarding,
  gateReplacesConsole,
  nextOnboardingItem,
  onboardingActions,
  onboardingCopy,
  onboardingItems,
  onboardingProgress,
  onboardingStage,
  shouldShowOnboarding,
  willStallAfterApproval,
} from '../onboarding.ts';
import { openSession, type Seat, type Seller } from '../seller.ts';
import { vendorOnboardingContract, vendorPrimaryNav, vendorSecondaryNav } from '../vendorConsole.ts';
import type { VendorViewer } from '../vendorConsole.ts';

const seller = (over: Partial<Seller> = {}): Seller => ({
  id: 'sel_1',
  legalName: 'Midtown Table',
  state: 'DRAFT',
  businessMode: 'standard',
  satisfied: [],
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

function session(sellerOver: Partial<Seller> = {}, seatOver: Partial<Seat> = {}) {
  const opened = openSession(seller(sellerOver), seat(seatOver));
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error('unreachable');
  return opened.session;
}

const ALL = getBookableSeller().identity.requirements.map((item) => item.id);

test('every requirement has a step and every step closes a requirement', () => {
  // The bijection is what stops a requirement becoming a wall with no door.
  const steps = vendorOnboardingContract().steps.map((item) => item.requirement);
  assert.deepEqual([...steps].sort(), [...ALL].sort());
});

test('a cottage business can reach every requirement it must satisfy', () => {
  // The bug this exists for: activeLocation blocks ACTIVE for every business,
  // but the Locations tab is standard-only, so a cottage seller was told what
  // was missing and given nowhere to supply it. The gate is not a tab, so the
  // requirement stays reachable; a step whose only home is a standard-only tab
  // must therefore name what a cottage business gets instead.
  const viewer: VendorViewer = {
    role: 'owner',
    businessMode: 'cottage',
    capabilities: new Set(['SELL', 'PUBLISH', 'SCHEDULE', 'VERIFY']),
  };
  const reachableTabs = new Set([...vendorPrimaryNav(viewer), ...vendorSecondaryNav(viewer)].map((item) => item.id));
  assert.equal(reachableTabs.has('locations'), false, 'precondition: cottage has no Locations tab');

  for (const step of vendorOnboardingContract().steps) {
    if (!step.managedIn || reachableTabs.has(step.managedIn)) continue;
    assert.ok(
      step.cottageKind,
      `${step.requirement} is managed only in ${step.managedIn}, which a cottage business cannot open`,
    );
  }

  // And the checklist itself must still offer all four, in either mode.
  const cottage = seller({ businessMode: 'cottage' });
  assert.deepEqual(
    onboardingItems(cottage).map((item) => item.requirement.id).sort(),
    [...ALL].sort(),
  );
});

test('steps are ordered by the lifecycle rather than authored', () => {
  const states = getBookableSeller().identity.states;
  const ranks = onboardingItems(seller()).map((item) => states.indexOf(item.blocks));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  // Which for this catalog means review comes before going live.
  assert.deepEqual(
    onboardingItems(seller()).map((item) => item.blocks),
    ['PENDING', 'PENDING', 'ACTIVE', 'ACTIVE'],
  );
});

test('setup is derived, so a requirement that stops being met comes back', () => {
  const complete = seller({ state: 'ACTIVE', satisfied: ALL });
  assert.equal(shouldShowOnboarding(complete), false);
  assert.deepEqual(onboardingProgress(complete), { done: 4, total: 4 });

  // A live business whose only location closed is unfinished again. Nothing was
  // reset: the same function reads the same seller and reaches a new answer.
  const lapsed = { ...complete, satisfied: ALL.filter((id) => id !== 'activeLocation') };
  assert.equal(shouldShowOnboarding(lapsed), true);
  assert.equal(nextOnboardingItem(lapsed)?.requirement.id, 'activeLocation');
  assert.equal(onboardingStage(lapsed), 'checklist');

  // But it keeps its console, because it still has guests to admit.
  assert.equal(gateReplacesConsole(lapsed), false);
});

test('the gate replaces the console only where nothing operational is allowed', () => {
  // Derived from stateCapabilities, so this follows the catalog rather than a
  // hardcoded pair of state names.
  assert.equal(gateReplacesConsole(seller({ state: 'DRAFT' })), true);
  assert.equal(gateReplacesConsole(seller({ state: 'PENDING' })), true);
  assert.equal(gateReplacesConsole(seller({ state: 'ACTIVE' })), false);
  // A suspended business can still check people in, so it keeps its tabs.
  assert.equal(gateReplacesConsole(seller({ state: 'SUSPENDED' })), false);
});

test('a business under review is not offered a checklist', () => {
  const pending = seller({ state: 'PENDING', satisfied: ['legalName', 'contactEmail'] });
  assert.equal(onboardingStage(pending), 'awaiting-review');
  assert.equal(onboardingCopy('PENDING')?.checklist, false);
  // Withdraw is the only thing it can do, and submit is gone.
  assert.deepEqual(onboardingActions(session({ state: 'PENDING' })).map((item) => item.id), ['WITHDRAW_SELLER']);
});

test('submitting is gated on what blocks review, not on everything', () => {
  // The two ACTIVE requirements are still open, and that is fine: they block
  // going live, not being reviewed.
  const ready = session({ satisfied: ['legalName', 'contactEmail'] });
  assert.equal(onboardingStage(ready.seller), 'ready-to-submit');

  const submit = onboardingActions(ready).find((item) => item.id === 'SUBMIT_SELLER');
  assert.equal(submit?.verdict.ok, true);

  // And the vendor is warned that approval alone will not make them sellable.
  assert.deepEqual(willStallAfterApproval(ready.seller).map((item) => item.id), ['activeLocation', 'payoutAccount']);
});

test('an incomplete business is refused with the list rather than a bare no', () => {
  const empty = session();
  const submit = onboardingActions(empty).find((item) => item.id === 'SUBMIT_SELLER');
  assert.equal(submit?.verdict.ok, false);
  assert.equal(submit?.verdict.reason, 'requirements-unmet');
  // The refusal carries what to fix, which is what makes it a checklist.
  assert.deepEqual((submit?.verdict.missing ?? []).map((item) => item.id), ['legalName', 'contactEmail']);
});

test('only the owner can advance, and the rest are told so', () => {
  assert.equal(canAdvanceOnboarding(session()), true);
  for (const role of ['manager', 'door', 'serviceProvider'] as const) {
    const other = session({ satisfied: ['legalName', 'contactEmail'] }, { role, bookableIds: ['bk_1'] });
    assert.equal(canAdvanceOnboarding(other), false, `${role} must not advance the business`);
    // The action is still refused by the ontology, not merely hidden by the UI.
    for (const action of onboardingActions(other)) assert.equal(action.verdict.ok, false);
  }
});

test('every state a console can open in has something to say', () => {
  for (const state of getBookableSeller().identity.consoleStates as BookableSellerState[]) {
    const copy = onboardingCopy(state);
    assert.ok(copy, `no onboarding copy for ${state}`);
    assert.ok(copy.title.length > 0 && copy.body.length > 0);
  }
  // And nothing describes a state with no console behind it.
  for (const item of vendorOnboardingContract().states) {
    assert.equal(sellerCanUseConsole(item.state), true, `${item.state} has copy but no console`);
  }
});
