import {
  availabilityDefaultsFor,
  canRunAvailabilityOperation,
  canSetSlotQuantity,
  getBookableAvailability,
  minimumQuantityForSlot,
  remainingInSlot,
  resolveSlotState,
  type BookableAvailabilityOperationId,
  type BookableDomainId,
  type BookableSlotKind,
  type BookableSlotState,
  type BookableStaffRoleId,
} from '../utils/bookableTemplates.ts';

/** A vendor's answer to "when?", before it is multiplied into slots. */
export interface AvailabilityWindow {
  /** 0 is Sunday, matching Date.getDay. */
  weekdays: number[];
  /** Minutes from midnight, local to the vendor. */
  openMins: number;
  closeMins: number;
  quantity: number;
}

export interface AvailabilitySlot {
  id: string;
  startsAt: Date;
  startMins: number;
  weekday: number;
  quantity: number;
  committed: number;
  blocked: boolean;
  closed: boolean;
  state: BookableSlotState;
  remaining: number;
  minimumQuantity: number;
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function formatSlotTime(mins: number): string {
  const hour = Math.floor(mins / 60) % 24;
  const minute = mins % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${display} ${suffix}` : `${display}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** Commitments already taken against a slot, keyed by slot id. */
export type SlotCommitments = Record<string, { committed?: number; blocked?: boolean; closed?: boolean }>;

function startMinutesFor(window: AvailabilityWindow, kind: BookableSlotKind, slotMinutes: number): number[] {
  if (kind === 'daily') return [window.openMins];
  // A fixed slot is one named start time, so the window's open is the slot.
  if (kind === 'fixed') return [window.openMins];
  const starts: number[] = [];
  for (let mins = window.openMins; mins + slotMinutes <= window.closeMins; mins += slotMinutes) {
    starts.push(mins);
  }
  return starts;
}

/**
 * The printer's multiplier made concrete: a window times a slot length times a
 * quantity is how many SKUs exist. Slot state is derived here rather than
 * stored, so capacity and state can never disagree.
 */
export function buildAvailabilityGrid(options: {
  domain: BookableDomainId;
  window: AvailabilityWindow;
  days: number;
  from?: Date;
  now?: Date;
  commitments?: SlotCommitments;
  slotMinutes?: number;
}): AvailabilitySlot[] {
  const defaults = availabilityDefaultsFor(options.domain);
  const slotMinutes = options.slotMinutes ?? defaults.slotMinutes;
  const from = options.from ?? new Date();
  const now = options.now ?? from;
  const commitments = options.commitments ?? {};
  const horizon = Math.min(options.days, defaults.horizonDays);

  const slots: AvailabilitySlot[] = [];
  for (let dayOffset = 0; dayOffset < horizon; dayOffset += 1) {
    const day = new Date(from);
    day.setDate(day.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);
    const weekday = day.getDay();
    if (!options.window.weekdays.includes(weekday)) continue;

    for (const startMins of startMinutesFor(options.window, defaults.slotKind, slotMinutes)) {
      const startsAt = new Date(day);
      startsAt.setMinutes(startMins);
      const id = `${startsAt.toISOString().slice(0, 10)}T${startMins}`;
      const commitment = commitments[id] ?? {};
      const capacity = {
        quantity: options.window.quantity,
        committed: Math.min(commitment.committed ?? 0, options.window.quantity),
        blocked: commitment.blocked ?? false,
        closed: commitment.closed ?? false,
        startsAt,
      };
      slots.push({
        id,
        startsAt,
        startMins,
        weekday,
        quantity: capacity.quantity,
        committed: capacity.committed,
        blocked: capacity.blocked,
        closed: capacity.closed,
        state: resolveSlotState(capacity, now),
        remaining: remainingInSlot(capacity),
        minimumQuantity: minimumQuantityForSlot(capacity),
      });
    }
  }
  return slots;
}

/**
 * The lead time is the vendor's promise to themselves: a slot inside it is
 * still open on the calendar but too close to sell.
 */
export function isWithinLeadTime(slot: AvailabilitySlot, domain: BookableDomainId, now: Date = new Date()): boolean {
  const { leadTimeMins } = availabilityDefaultsFor(domain);
  return slot.startsAt.getTime() - now.getTime() < leadTimeMins * 60_000;
}

export function sellableSlots(slots: AvailabilitySlot[], domain: BookableDomainId, now?: Date): AvailabilitySlot[] {
  return slots.filter((slot) => slot.state === 'OPEN' && !isWithinLeadTime(slot, domain, now));
}

/** How many SKUs the window actually prints, which is what a vendor is really asking. */
export function printableSkuCount(slots: AvailabilitySlot[]): number {
  return slots.reduce((total, slot) => (slot.state === 'PASSED' ? total : total + slot.quantity), 0);
}

export function availabilityOperationsFor(
  role: BookableStaffRoleId,
  state: BookableSlotState,
): { id: BookableAvailabilityOperationId; label: string }[] {
  return getBookableAvailability()
    .operations.filter((operation) => canRunAvailabilityOperation(role, operation.id, state))
    .map((operation) => ({ id: operation.id, label: operation.label }));
}

/** Applies a vendor operation to the commitment map, refusing anything the contract forbids. */
export function applyAvailabilityOperation(
  commitments: SlotCommitments,
  slot: AvailabilitySlot,
  role: BookableStaffRoleId,
  operation: BookableAvailabilityOperationId,
  quantity?: number,
): SlotCommitments | null {
  if (!canRunAvailabilityOperation(role, operation, slot.state)) return null;
  const current = commitments[slot.id] ?? {};
  const next: SlotCommitments = { ...commitments };

  switch (operation) {
    case 'OPEN_SLOT':
      next[slot.id] = { ...current, blocked: false, closed: false };
      return next;
    case 'CLOSE_SLOT':
      next[slot.id] = { ...current, blocked: false, closed: true };
      return next;
    case 'BLOCK_SLOT':
      next[slot.id] = { ...current, blocked: true };
      return next;
    case 'RELEASE':
      // Releasing a hold hands capacity back rather than deleting the booking.
      next[slot.id] = { ...current, committed: Math.max(0, (current.committed ?? 0) - 1) };
      return next;
    case 'SET_QUANTITY':
      // Quantity lives on the window, so the caller applies it; this only
      // refuses the values the contract will not accept.
      if (quantity === undefined || !canSetSlotQuantity(slot, quantity)) return null;
      return next;
    default:
      return null;
  }
}
