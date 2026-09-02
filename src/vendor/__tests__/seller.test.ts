import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeAvailability,
  authorizeDemand,
  authorizeLocation,
  canSeeBookable,
  canSeeLocation,
  goLiveBlockers,
  invitableRoles,
  inviteSeat,
  moveSeat,
  moveSeller,
  openSession,
  publishBlockers,
  sessionCan,
  submitBlockers,
  visibleByBookable,
  withheldBySellerState,
  type Seat,
  type Seller,
  type VendorSession,
} from '../seller.ts';
import {
  canGrantStaffRole,
  effectiveSeatCapabilities,
  getBookableSeller,
  grantableStaffRoles,
  listBookableStaffRoles,
  seatGrants,
  sellerCanPublish,
  sellerStateAllows,
  type BookableSellerState,
  type BookableStaffRoleId,
} from '../../utils/bookableTemplates.ts';

const NOW = new Date('2026-09-04T12:00:00Z');
const ALL_REQUIREMENTS = ['legalName', 'contactEmail', 'activeLocation', 'payoutAccount'];

function seller(overrides: Partial<Seller> = {}): Seller {
  return {
    id: 'sel_1',
    legalName: 'Midtown Table',
    state: 'ACTIVE',
    businessMode: 'standard',
    satisfied: ALL_REQUIREMENTS,
    ...overrides,
  };
}

function seat(overrides: Partial<Seat> = {}): Seat {
  return {
    id: 'seat_1',
    sellerId: 'sel_1',
    personId: 'per_1',
    role: 'owner',
    state: 'ACTIVE',
    locationIds: [],
    bookableIds: [],
    ...overrides,
  };
}

function session(sellerOverrides: Partial<Seller> = {}, seatOverrides: Partial<Seat> = {}): VendorSession {
  const result = openSession(seller(sellerOverrides), seat(seatOverrides), NOW);
  assert.equal(result.ok, true);
  return (result as { ok: true; session: VendorSession }).session;
}

test('a seat is a subset of the business at the level of identity, not just capability', () => {
  // An ACTIVE business lets the owner seat hold everything the role declares.
  const live = session();
  assert.equal(sessionCan(live, 'SELL'), true);
  assert.equal(sessionCan(live, 'PUBLISH'), true);
  assert.deepEqual(withheldBySellerState(live), []);

  // Suspension silences the owner without a single role being edited.
  const suspended = session({ state: 'SUSPENDED' });
  assert.equal(sessionCan(suspended, 'SELL'), false);
  assert.equal(sessionCan(suspended, 'PUBLISH'), false);
  // What was already sold must still be honoured.
  assert.equal(sessionCan(suspended, 'CHECK_IN'), true);
  assert.equal(sessionCan(suspended, 'REFUND'), true);
  assert.deepEqual(withheldBySellerState(suspended).sort(), ['BOOK', 'PUBLISH', 'RESERVE', 'SCHEDULE', 'SELL']);

  // A business still in setup can build a calendar and nothing else.
  const draft = session({ state: 'DRAFT' });
  assert.deepEqual([...draft.capabilities], ['SCHEDULE']);

  // No seat can exceed the business, checked against every role and state.
  for (const role of listBookableStaffRoles()) {
    for (const state of getBookableSeller().identity.states) {
      for (const capability of effectiveSeatCapabilities(role.id, 'ACTIVE', state)) {
        assert.ok(role.capabilities.includes(capability), `${role.id} gained ${capability} it never declared`);
        assert.ok(sellerStateAllows(state, capability), `${state} seller leaked ${capability}`);
      }
    }
  }
});

test('a seat that is not ACTIVE opens no session at all', () => {
  for (const state of getBookableSeller().seats.states) {
    const result = openSession(seller(), seat({ state }), NOW);
    assert.equal(result.ok, seatGrants(state), `seat state ${state} behaved wrongly`);
    if (!result.ok) assert.equal(result.reason, 'seat-not-granting');
    // An unaccepted invite must carry nothing, no matter how senior the role.
    assert.deepEqual(effectiveSeatCapabilities('owner', state, 'ACTIVE').length > 0, seatGrants(state));
  }

  // An invite that was never accepted expires rather than waiting forever.
  const { inviteExpiryHours } = getBookableSeller().seats;
  const stale = new Date(NOW.getTime() - (inviteExpiryHours + 1) * 3_600_000);
  const expired = openSession(seller(), seat({ state: 'INVITED', invitedAt: stale }), NOW);
  assert.deepEqual(expired, { ok: false, reason: 'invite-expired' });

  // A closed business has no console, and a seat cannot cross businesses.
  assert.deepEqual(openSession(seller({ state: 'CLOSED' }), seat(), NOW), { ok: false, reason: 'seller-closed' });
  assert.deepEqual(openSession(seller({ id: 'sel_2' }), seat(), NOW), { ok: false, reason: 'wrong-seller' });
});

test('an assigned seat with no assignment sees nothing, never everything', () => {
  // Scope comes from the contract, so this is the role's own declaration.
  const provider = session({}, { role: 'serviceProvider', state: 'ACTIVE' });
  assert.equal(provider.scope, 'assigned');
  assert.equal(canSeeLocation(provider, 'loc_1'), false);
  assert.equal(canSeeBookable(provider, 'bk_1'), false);

  const assigned = session({}, { role: 'serviceProvider', locationIds: ['loc_1'], bookableIds: ['bk_1'] });
  assert.equal(canSeeLocation(assigned, 'loc_1'), true);
  assert.equal(canSeeLocation(assigned, 'loc_2'), false);
  assert.equal(canSeeBookable(assigned, 'bk_1'), true);
  assert.equal(canSeeBookable(assigned, 'bk_2'), false);

  // An all-scope seat needs no assignment list to see the business.
  const manager = session({}, { role: 'manager' });
  assert.equal(manager.scope, 'all');
  assert.equal(canSeeLocation(manager, 'loc_9'), true);

  const rows = [{ bookableId: 'bk_1' }, { bookableId: 'bk_2' }];
  assert.deepEqual(visibleByBookable(assigned, rows), [{ bookableId: 'bk_1' }]);
  assert.deepEqual(visibleByBookable(manager, rows), rows);
});

test('authorization refuses on capability before it ever reveals scope or state', () => {
  const provider = session({}, { role: 'serviceProvider', bookableIds: ['bk_1'], locationIds: ['loc_1'] });

  // A service provider schedules its own bookable and nothing else.
  assert.deepEqual(authorizeAvailability(provider, 'BLOCK_SLOT', 'OPEN', 'bk_1'), { ok: true });
  assert.deepEqual(authorizeAvailability(provider, 'BLOCK_SLOT', 'OPEN', 'bk_2'), {
    ok: false,
    reason: 'out-of-scope',
  });
  // It cannot sell, so demand and locations refuse before scope is consulted.
  assert.deepEqual(authorizeDemand(provider, 'OFFER', 'MATCHED', 'bk_1'), { ok: false, reason: 'forbidden' });
  assert.deepEqual(authorizeLocation(provider, 'PAUSE_LOCATION', 'ACTIVE', 'loc_1'), {
    ok: false,
    reason: 'forbidden',
  });

  const owner = session();
  assert.deepEqual(authorizeDemand(owner, 'OFFER', 'MATCHED', 'bk_1'), { ok: true });
  assert.deepEqual(authorizeDemand(owner, 'OFFER', 'BOOKED', 'bk_1'), { ok: false, reason: 'illegal-state' });
  assert.deepEqual(authorizeLocation(owner, 'ACTIVATE_LOCATION', 'DRAFT', 'loc_1'), { ok: true });

  // Suspending the business turns every selling operation into a refusal.
  const suspended = session({ state: 'SUSPENDED' });
  assert.deepEqual(authorizeDemand(suspended, 'OFFER', 'MATCHED', 'bk_1'), { ok: false, reason: 'forbidden' });
  assert.deepEqual(authorizeAvailability(suspended, 'BLOCK_SLOT', 'OPEN', 'bk_1'), { ok: false, reason: 'forbidden' });
});

test('publishing needs the seat, the business and the location to all agree', () => {
  const live = { id: 'loc_1', label: 'Midtown', state: 'ACTIVE' as const };

  assert.deepEqual(publishBlockers(session(), live), []);

  // Any one of the three being unready is enough to stop inventory.
  assert.deepEqual(publishBlockers(session({ state: 'PENDING' }), live), ['Business is pending']);
  assert.deepEqual(publishBlockers(session(), { ...live, state: 'PAUSED' }), ['Midtown is paused']);
  assert.deepEqual(publishBlockers(session({}, { role: 'staff' }), live), ['A Staff seat cannot publish']);

  // A seat is told it lacks the seat right only when the business itself is fine.
  const suspendedManager = publishBlockers(session({ state: 'SUSPENDED' }, { role: 'manager' }), live);
  assert.deepEqual(suspendedManager, ['Business is suspended']);

  // And the blockers stack, so a vendor sees the whole gap in one pass.
  const everything = publishBlockers(session({ state: 'DRAFT' }, { role: 'serviceProvider', bookableIds: ['bk_1'] }), {
    ...live,
    state: 'DRAFT',
  });
  assert.equal(everything.length, 3);

  for (const state of getBookableSeller().identity.states) {
    if (state === 'CLOSED') continue;
    const blockers = publishBlockers(session({ state }), live);
    assert.equal(blockers.length === 0, sellerCanPublish(state), `${state} publish behaviour is wrong`);
  }
});

test('going live is a checklist, and a business cannot approve itself', () => {
  const empty = seller({ state: 'DRAFT', satisfied: [] });
  assert.deepEqual(submitBlockers(empty).map((item) => item.id), ['legalName', 'contactEmail']);
  assert.deepEqual(goLiveBlockers(empty).map((item) => item.id), ['activeLocation', 'payoutAccount']);

  // An incomplete profile cannot move forward, and says exactly what is missing.
  const draft = session({ state: 'DRAFT', satisfied: [] });
  const refused = moveSeller(draft, 'SUBMIT_SELLER');
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.reason, 'requirements-unmet');
  assert.deepEqual(
    refused.ok === false ? refused.missing?.map((item) => item.id) : [],
    ['legalName', 'contactEmail'],
  );

  assert.deepEqual(moveSeller(session({ state: 'DRAFT' }), 'SUBMIT_SELLER'), { ok: true, state: 'PENDING' });
  assert.deepEqual(moveSeller(session({ state: 'PENDING' }), 'WITHDRAW_SELLER'), { ok: true, state: 'DRAFT' });
  assert.deepEqual(moveSeller(session(), 'CLOSE_SELLER'), { ok: true, state: 'CLOSED' });

  // Approval, suspension and reinstatement belong to the platform alone.
  for (const operation of ['APPROVE_SELLER', 'SUSPEND_SELLER', 'REINSTATE_SELLER'] as const) {
    assert.deepEqual(moveSeller(session({ state: 'PENDING' }), operation), { ok: false, reason: 'forbidden' });
  }
  // Only the owner steers the business, even from an all-scope manager seat.
  assert.deepEqual(moveSeller(session({ state: 'DRAFT' }, { role: 'manager' }), 'SUBMIT_SELLER'), {
    ok: false,
    reason: 'forbidden',
  });
  assert.deepEqual(moveSeller(session(), 'SUBMIT_SELLER'), { ok: false, reason: 'illegal-state' });
});

test('nobody can mint a peer or a superior, and only a business can hire', () => {
  // Ranking is by capability subset, so escalation is structurally impossible.
  assert.deepEqual(grantableStaffRoles('owner'), ['manager', 'staff', 'door', 'serviceProvider']);
  assert.deepEqual(grantableStaffRoles('manager'), ['staff', 'door', 'serviceProvider']);
  // Hiring is an act of the business, which is what SELL already means.
  assert.deepEqual(grantableStaffRoles('staff'), []);
  assert.deepEqual(grantableStaffRoles('door'), []);
  assert.deepEqual(grantableStaffRoles('serviceProvider'), []);

  for (const role of listBookableStaffRoles()) {
    assert.equal(canGrantStaffRole(role.id, role.id), false, `${role.id} can clone itself sideways`);
    if (role.id !== 'owner') assert.equal(canGrantStaffRole(role.id, 'owner'), false, `${role.id} escalates`);
  }

  assert.deepEqual(invitableRoles(session()), ['manager', 'staff', 'door', 'serviceProvider']);
  // A suspended business cannot hire, because the seat loses SELL with it.
  assert.deepEqual(invitableRoles(session({ state: 'SUSPENDED' })), []);
  assert.deepEqual(invitableRoles(session({ state: 'DRAFT' })), []);
});

test('an invite cannot outrank its granter, exceed its scope, or arrive unassigned', () => {
  const owner = session();

  const invited = inviteSeat(owner, { id: 'seat_2', personId: 'per_2', role: 'manager' }, [seat()], NOW);
  assert.equal(invited.ok, true);
  assert.equal(invited.ok && invited.seat.state, 'INVITED');
  assert.equal(invited.ok && invited.seat.sellerId, 'sel_1');
  assert.equal(invited.ok && invited.seat.invitedAt?.getTime(), NOW.getTime());

  // A manager cannot invite a manager, and nobody invites a second owner.
  const manager = session({}, { role: 'manager' });
  assert.deepEqual(inviteSeat(manager, { id: 'x', personId: 'p', role: 'manager' }, [], NOW), {
    ok: false,
    reason: 'forbidden',
  });
  assert.deepEqual(inviteSeat(owner, { id: 'x', personId: 'p', role: 'owner' }, [seat()], NOW), {
    ok: false,
    reason: 'forbidden',
  });

  // An assigned-scope seat with no assignment is refused rather than granted all.
  assert.deepEqual(inviteSeat(owner, { id: 'x', personId: 'p', role: 'serviceProvider' }, [], NOW), {
    ok: false,
    reason: 'unassigned',
  });
  assert.equal(
    inviteSeat(owner, { id: 'x', personId: 'p', role: 'serviceProvider', bookableIds: ['bk_1'] }, [], NOW).ok,
    true,
  );

  // A granter cannot assign what it cannot see itself.
  const scoped = session({}, { role: 'manager', locationIds: ['loc_1'] });
  assert.equal(scoped.scope, 'all');
  const narrow = session({}, { role: 'serviceProvider', bookableIds: ['bk_1'] });
  assert.deepEqual(inviteSeat(narrow, { id: 'x', personId: 'p', role: 'door' }, [], NOW), {
    ok: false,
    reason: 'forbidden',
  });
});

test('the owner seat cannot be revoked, because that orphans every SKU it printed', () => {
  const owner = session();
  const target = seat({ id: 'seat_2', role: 'manager', state: 'ACTIVE' });

  assert.deepEqual(moveSeat(owner, target, 'SUSPEND_SEAT'), { ok: true, state: 'SUSPENDED' });
  assert.deepEqual(moveSeat(owner, { ...target, state: 'SUSPENDED' }, 'RESTORE_SEAT'), { ok: true, state: 'ACTIVE' });
  assert.deepEqual(moveSeat(owner, target, 'REVOKE_SEAT'), { ok: true, state: 'REVOKED' });
  assert.deepEqual(moveSeat(owner, { ...target, state: 'INVITED' }, 'ACCEPT_SEAT'), { ok: true, state: 'ACTIVE' });

  // The one seat that must survive.
  assert.deepEqual(moveSeat(owner, seat({ id: 'seat_9', role: 'owner' }), 'REVOKE_SEAT'), {
    ok: false,
    reason: 'unrevocable',
  });

  // Illegal transitions and cross-business moves are refused.
  assert.deepEqual(moveSeat(owner, { ...target, state: 'REVOKED' }, 'SUSPEND_SEAT'), {
    ok: false,
    reason: 'illegal-state',
  });
  assert.deepEqual(moveSeat(owner, { ...target, sellerId: 'sel_2' }, 'REVOKE_SEAT'), {
    ok: false,
    reason: 'forbidden',
  });

  // A staff seat manages nobody.
  const staff = session({}, { role: 'staff' });
  assert.deepEqual(moveSeat(staff, seat({ id: 'seat_3', role: 'door' }), 'REVOKE_SEAT'), {
    ok: false,
    reason: 'forbidden',
  });
});

test('every seller and seat state is reachable and terminal states stay terminal', () => {
  const { identity, seats } = getBookableSeller();

  for (const machine of [
    { name: 'seller', states: identity.states as string[], transitions: identity.transitions, initial: 'DRAFT' },
    { name: 'seat', states: seats.states as string[], transitions: seats.transitions, initial: 'INVITED' },
  ]) {
    const reachable = new Set([machine.initial]);
    for (let pass = 0; pass < machine.states.length; pass += 1) {
      for (const row of machine.transitions as { from: string; to: string[] }[]) {
        if (reachable.has(row.from)) row.to.forEach((state) => reachable.add(state));
      }
    }
    for (const state of machine.states) {
      assert.ok(reachable.has(state), `${machine.name} state ${state} is unreachable`);
    }
  }

  // CLOSED and REVOKED are one-way doors.
  assert.deepEqual(identity.transitions.find((row) => row.from === 'CLOSED')?.to, []);
  assert.deepEqual(seats.transitions.find((row) => row.from === 'REVOKED')?.to, []);
  const closedSeller = openSession(seller({ state: 'CLOSED' }), seat(), NOW);
  assert.equal(closedSeller.ok, false);
});

test('the capability ceiling is monotone, so no state outranks ACTIVE', () => {
  const states = getBookableSeller().identity.states;
  const allCapabilities = listBookableStaffRoles().flatMap((role) => role.capabilities);

  for (const state of states) {
    for (const capability of allCapabilities) {
      if (!sellerStateAllows(state, capability)) continue;
      assert.ok(
        sellerStateAllows('ACTIVE', capability),
        `${state} allows ${capability} that an ACTIVE business does not`,
      );
    }
  }

  // A closed business allows nothing at all, from any seat.
  for (const role of listBookableStaffRoles()) {
    assert.deepEqual(effectiveSeatCapabilities(role.id, 'ACTIVE', 'CLOSED'), []);
  }

  // Only ACTIVE can publish, checked against the state list rather than a literal.
  const publishable = states.filter((state: BookableSellerState) => sellerCanPublish(state));
  assert.deepEqual(publishable, ['ACTIVE']);

  // Money never moves in a business that has not been approved.
  for (const state of ['DRAFT', 'PENDING'] as BookableSellerState[]) {
    assert.equal(sellerStateAllows(state, 'SELL'), false);
    assert.equal(sellerStateAllows(state, 'REFUND'), false);
  }
});

test('a role gains nothing by being read through a session instead of the contract', () => {
  // The session layer must never be a second, looser source of truth.
  for (const role of listBookableStaffRoles()) {
    const opened = openSession(seller(), seat({ role: role.id, state: 'ACTIVE' }), NOW);
    assert.equal(opened.ok, true);
    if (!opened.ok) continue;
    const viaSession = [...opened.session.capabilities].sort();
    const viaContract = role.capabilities
      .filter((capability) => sellerStateAllows('ACTIVE', capability))
      .sort();
    assert.deepEqual(viaSession, viaContract, `${role.id} resolves differently through a session`);
    assert.equal(opened.session.scope, role.scope);
  }

  const roles: BookableStaffRoleId[] = ['owner', 'manager', 'staff', 'door', 'serviceProvider'];
  assert.deepEqual(
    roles.filter((role) => sessionCan(session({}, { role }), 'REFUND')),
    ['owner'],
  );
});
