import {
  canGrantStaffRole,
  canRunAvailabilityOperation,
  canRunDemandOperation,
  canRunLocationOperation,
  canRunSeatOperation,
  canRunSellerOperation,
  effectiveSeatCapabilities,
  getBookableSeller,
  getBookableStaffRole,
  grantableStaffRoles,
  locationCanPublish,
  seatGrants,
  sellerCanPublish,
  sellerCanUseConsole,
  unmetSellerRequirements,
  type BookableAvailabilityOperationId,
  type BookableCapabilityId,
  type BookableDemandOperationId,
  type BookableLocationOperationId,
  type BookableLocationState,
  type BookableSeatOperationId,
  type BookableSeatState,
  type BookableSellerOperationId,
  type BookableSellerRequirement,
  type BookableSellerState,
  type BookableStaffRoleId,
  type BookableStaffScope,
} from '../utils/bookableTemplates.ts';
import type { VendorBusinessMode } from './vendorConsole.ts';

/** A business. Identity only: what it sells lives on its Bookables. */
export interface Seller {
  id: string;
  legalName: string;
  state: BookableSellerState;
  businessMode: VendorBusinessMode;
  /** Requirement ids already satisfied, so the gap reads as a checklist. */
  satisfied: string[];
}

/**
 * One person's seat in one business. The assignment lists are only consulted
 * for an assigned-scope role, and an empty list means nothing rather than
 * everything.
 */
export interface Seat {
  id: string;
  sellerId: string;
  personId: string;
  role: BookableStaffRoleId;
  state: BookableSeatState;
  locationIds: string[];
  bookableIds: string[];
  invitedAt?: Date;
}

/**
 * A seat resolved against the business it belongs to. Every vendor-side check
 * takes one of these rather than a bare role, because a role on its own cannot
 * know that the business behind it was suspended this morning.
 */
export interface VendorSession {
  seller: Seller;
  seat: Seat;
  capabilities: Set<BookableCapabilityId>;
  scope: BookableStaffScope;
}

export type SessionRefusal =
  | 'wrong-seller'
  | 'seat-not-granting'
  | 'seller-closed'
  | 'invite-expired';

/**
 * The success branch declares `reason?: never` because this project compiles
 * without strictNullChecks, so a caller cannot narrow on `ok` alone. Declaring
 * the absent field keeps the union honest and still lets a caller read it.
 */
export type SessionResult =
  | { ok: true; session: VendorSession; reason?: never }
  | { ok: false; reason: SessionRefusal };

function inviteExpired(seat: Seat, now: Date): boolean {
  if (seat.state !== 'INVITED' || !seat.invitedAt) return false;
  const { inviteExpiryHours } = getBookableSeller().seats;
  return now.getTime() - seat.invitedAt.getTime() > inviteExpiryHours * 3_600_000;
}

/**
 * The one place a role becomes an authority. Capabilities are the role narrowed
 * by what the seller's own state still allows, so suspending a business silences
 * every seat inside it, owner included, without any role being edited.
 */
export function openSession(seller: Seller, seat: Seat, now: Date = new Date()): SessionResult {
  if (seat.sellerId !== seller.id) return { ok: false, reason: 'wrong-seller' };
  if (!sellerCanUseConsole(seller.state)) return { ok: false, reason: 'seller-closed' };
  if (inviteExpired(seat, now)) return { ok: false, reason: 'invite-expired' };
  if (!seatGrants(seat.state)) return { ok: false, reason: 'seat-not-granting' };

  return {
    ok: true,
    session: {
      seller,
      seat,
      capabilities: new Set(effectiveSeatCapabilities(seat.role, seat.state, seller.state)),
      scope: getBookableStaffRole(seat.role)?.scope ?? 'assigned',
    },
  };
}

export function sessionCan(session: VendorSession, capability: BookableCapabilityId): boolean {
  return session.capabilities.has(capability);
}

/** Capabilities the role holds that the business's state is currently withholding. */
export function withheldBySellerState(session: VendorSession): BookableCapabilityId[] {
  const role = getBookableStaffRole(session.seat.role);
  if (!role) return [];
  return role.capabilities.filter((capability) => !session.capabilities.has(capability));
}

/** Scoping. An assigned seat with no assignment sees nothing, never everything. */
export function canSeeLocation(session: VendorSession, locationId: string): boolean {
  if (session.scope === 'all') return true;
  return session.seat.locationIds.includes(locationId);
}

export function canSeeBookable(session: VendorSession, bookableId: string): boolean {
  if (session.scope === 'all') return true;
  return session.seat.bookableIds.includes(bookableId);
}

export function visibleByLocation<T extends { id: string }>(session: VendorSession, rows: T[]): T[] {
  return rows.filter((row) => canSeeLocation(session, row.id));
}

export function visibleByBookable<T extends { bookableId: string }>(session: VendorSession, rows: T[]): T[] {
  return rows.filter((row) => canSeeBookable(session, row.bookableId));
}

export type OperationRefusal = 'forbidden' | 'out-of-scope' | 'illegal-state';

export type OperationVerdict = { ok: true } | { ok: false; reason: OperationRefusal };

function verdict(allowed: boolean, inScope: boolean, roleAllows: boolean): OperationVerdict {
  if (!roleAllows) return { ok: false, reason: 'forbidden' };
  if (!inScope) return { ok: false, reason: 'out-of-scope' };
  return allowed ? { ok: true } : { ok: false, reason: 'illegal-state' };
}

/**
 * Three checks in a fixed order, and the order is the point: capability first so
 * a refusal never reveals which slots exist, then scope, then state.
 */
export function authorizeAvailability(
  session: VendorSession,
  operation: BookableAvailabilityOperationId,
  state: Parameters<typeof canRunAvailabilityOperation>[2],
  bookableId: string,
): OperationVerdict {
  const roleAllows = sessionCan(session, 'SCHEDULE');
  return verdict(
    canRunAvailabilityOperation(session.seat.role, operation, state),
    canSeeBookable(session, bookableId),
    roleAllows,
  );
}

export function authorizeLocation(
  session: VendorSession,
  operation: BookableLocationOperationId,
  state: BookableLocationState,
  locationId: string,
): OperationVerdict {
  return verdict(
    canRunLocationOperation(session.seat.role, operation, state),
    canSeeLocation(session, locationId),
    sessionCan(session, 'SELL'),
  );
}

export function authorizeDemand(
  session: VendorSession,
  operation: BookableDemandOperationId,
  state: Parameters<typeof canRunDemandOperation>[2],
  bookableId: string,
): OperationVerdict {
  return verdict(
    canRunDemandOperation(session.seat.role, operation, state),
    canSeeBookable(session, bookableId),
    sessionCan(session, 'SELL'),
  );
}

/**
 * Publishing is the composite gate: the seat, the business and the location must
 * all agree. Any one of them being unready is enough to stop inventory.
 */
export function publishBlockers(
  session: VendorSession,
  location: { id: string; label: string; state: BookableLocationState },
): string[] {
  const blockers: string[] = [];
  if (!sessionCan(session, 'PUBLISH')) {
    blockers.push(
      sellerCanPublish(session.seller.state)
        ? `A ${getBookableStaffRole(session.seat.role)?.label ?? session.seat.role} seat cannot publish`
        : `Business is ${session.seller.state.toLowerCase()}`,
    );
  }
  if (!canSeeLocation(session, location.id)) blockers.push(`${location.label} is not assigned to you`);
  if (!locationCanPublish(location.state)) blockers.push(`${location.label} is ${location.state.toLowerCase()}`);
  return blockers;
}

/** What is still missing before the business can go live. */
export function goLiveBlockers(seller: Seller): BookableSellerRequirement[] {
  return unmetSellerRequirements('ACTIVE', seller.satisfied);
}

export function submitBlockers(seller: Seller): BookableSellerRequirement[] {
  return unmetSellerRequirements('PENDING', seller.satisfied);
}

export type SellerMoveVerdict =
  | { ok: true; state: BookableSellerState; reason?: never; missing?: never }
  | { ok: false; reason: 'forbidden' | 'illegal-state' | 'requirements-unmet'; missing?: BookableSellerRequirement[] };

/**
 * A business cannot move itself forward on an incomplete profile, which is what
 * makes the requirement list a checklist rather than a rejection notice.
 */
export function moveSeller(
  session: VendorSession,
  operation: BookableSellerOperationId,
): SellerMoveVerdict {
  const target = getBookableSeller().identity.operations.find((item) => item.id === operation);
  if (!target || target.actor !== 'seller') return { ok: false, reason: 'forbidden' };
  if (target.requiresRole && target.requiresRole !== session.seat.role) return { ok: false, reason: 'forbidden' };
  if (!canRunSellerOperation(session.seat.role, operation, session.seller.state)) {
    return { ok: false, reason: 'illegal-state' };
  }
  const missing = unmetSellerRequirements(target.to, session.seller.satisfied);
  if (missing.length > 0) return { ok: false, reason: 'requirements-unmet', missing };
  return { ok: true, state: target.to };
}

export type SeatMoveVerdict =
  | { ok: true; state: BookableSeatState; reason?: never }
  | { ok: false; reason: 'forbidden' | 'illegal-state' | 'unrevocable' };

/**
 * Seat management under the same two-part rule as everything else, plus the two
 * shapes that would leave a business unowned: a second owner, or none.
 */
export function moveSeat(
  session: VendorSession,
  target: Seat,
  operation: BookableSeatOperationId,
): SeatMoveVerdict {
  const { seats } = getBookableSeller();
  const move = seats.operations.find((item) => item.id === operation);
  if (!move) return { ok: false, reason: 'forbidden' };
  if (target.sellerId !== session.seller.id) return { ok: false, reason: 'forbidden' };
  if (operation === 'REVOKE_SEAT' && target.role === seats.unrevocableRole) {
    return { ok: false, reason: 'unrevocable' };
  }
  if (!canRunSeatOperation({ granter: session.seat.role, target: target.role, operation, state: target.state })) {
    if (!canGrantStaffRole(session.seat.role, target.role)) return { ok: false, reason: 'forbidden' };
    return { ok: false, reason: 'illegal-state' };
  }
  return { ok: true, state: move.to };
}

/** Roles this seat may invite. Empty for anything that cannot act as the business. */
export function invitableRoles(session: VendorSession): BookableStaffRoleId[] {
  if (!sessionCan(session, 'SELL')) return [];
  return grantableStaffRoles(session.seat.role);
}

export type InviteVerdict =
  | { ok: true; seat: Seat; reason?: never }
  | { ok: false; reason: 'forbidden' | 'sole-role' | 'unassigned' };

/**
 * An invite is the only seat operation with no prior state, because it creates
 * the seat. An assigned-scope invite with no assignment is refused rather than
 * quietly granted the whole business.
 */
export function inviteSeat(
  session: VendorSession,
  request: { id: string; personId: string; role: BookableStaffRoleId; locationIds?: string[]; bookableIds?: string[] },
  peers: Seat[] = [],
  now: Date = new Date(),
): InviteVerdict {
  const { seats } = getBookableSeller();
  if (!invitableRoles(session).includes(request.role)) return { ok: false, reason: 'forbidden' };
  if (
    request.role === seats.soleRole &&
    peers.some((seat) => seat.role === seats.soleRole && seat.state !== 'REVOKED')
  ) {
    return { ok: false, reason: 'sole-role' };
  }

  const locationIds = request.locationIds ?? [];
  const bookableIds = request.bookableIds ?? [];
  if (getBookableStaffRole(request.role)?.scope === 'assigned' && locationIds.length + bookableIds.length === 0) {
    return { ok: false, reason: 'unassigned' };
  }
  // A seat can never be assigned something the granter cannot see itself.
  if (
    !locationIds.every((id) => canSeeLocation(session, id)) ||
    !bookableIds.every((id) => canSeeBookable(session, id))
  ) {
    return { ok: false, reason: 'forbidden' };
  }

  return {
    ok: true,
    seat: {
      id: request.id,
      sellerId: session.seller.id,
      personId: request.personId,
      role: request.role,
      state: 'INVITED',
      locationIds,
      bookableIds,
      invitedAt: now,
    },
  };
}
