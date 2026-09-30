import type { BookableSlotState, BookableStaffRoleId, BookableSeatState } from '../utils/bookableTemplates.ts';
import type { PayoutAccount } from './profile.ts';
import type { AuthorizedFetch, SetupResult, VendorWindow } from './setupTransport.ts';

/**
 * Staff, Availability, Analytics, Payouts and Settings, against the API.
 *
 * Every screen gets a function, never the token, and every response is
 * revived field by field so a server that started sending more than this
 * console shows cannot put it into state.
 */

export interface TeamSeat {
  id: string;
  personId: string;
  email: string;
  name?: string;
  role: BookableStaffRoleId;
  state: BookableSeatState;
  locationIds: string[];
  bookableIds: string[];
  invitedAt?: Date;
  inviteExpired: boolean;
  you: boolean;
}

export interface Team {
  seats: TeamSeat[];
  canInvite: BookableStaffRoleId[];
}

export interface InviteDraft {
  email: string;
  role: BookableStaffRoleId;
  locationIds: string[];
  bookableIds: string[];
}

export type SeatMoveId = 'SUSPEND_SEAT' | 'RESTORE_SEAT' | 'REVOKE_SEAT';

export interface LiveSlot {
  startsAt: Date;
  startMins: number;
  weekday: number;
  state: BookableSlotState;
  quantity: number;
  committed: number;
  remaining: number;
}

export interface WindowSlots {
  window: VendorWindow;
  timezone?: string;
  slots: LiveSlot[];
}

export type SlotMoveId = 'OPEN_SLOT' | 'CLOSE_SLOT' | 'BLOCK_SLOT';

export interface ScheduleDraft {
  weekdays: number[];
  openMins: number;
  closeMins: number;
  quantity: number;
}

export interface Analytics {
  days: number;
  requests: number;
  offers: number;
  declined: number;
  booked: number;
  winRate: number | null;
  paidCents: number;
  netCents: number;
  refunds: number;
  payAtVenueCents: number;
  top: { windowId: string; title: string; booked: number; valueCents: number }[];
}

export interface PayoutLine {
  id: string;
  title: string;
  paidAt: Date;
  status: 'completed' | 'refunded';
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  refundReason?: string;
}

export interface Payouts {
  payout?: PayoutAccount;
  totals: { netCents: number; feeCents: number; bookings: number; refunds: number };
  lines: PayoutLine[];
}

export interface ConsoleTransport {
  team: () => Promise<SetupResult<Team>>;
  invite: (draft: InviteDraft) => Promise<SetupResult<Team>>;
  moveSeat: (id: string, operation: SeatMoveId) => Promise<SetupResult<Team>>;
  slots: (windowId: string) => Promise<SetupResult<WindowSlots>>;
  moveSlot: (windowId: string, startsAt: Date, operation: SlotMoveId, reason?: string) => Promise<SetupResult<WindowSlots>>;
  saveSchedule: (windowId: string, schedule: ScheduleDraft) => Promise<SetupResult<WindowSlots>>;
  analytics: (days: number) => Promise<SetupResult<Analytics>>;
  payouts: () => Promise<SetupResult<Payouts>>;
  payoutDashboard: () => Promise<SetupResult<string>>;
  signOutEverywhere: () => Promise<SetupResult<true>>;
}

type Json = Record<string, unknown>;

const num = (value: unknown): number => (Number.isFinite(Number(value)) ? Number(value) : 0);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
const date = (value: unknown): Date | undefined => {
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export function reviveTeam(json: Json): Team {
  const seats = Array.isArray(json.seats) ? (json.seats as Json[]) : [];
  return {
    seats: seats.map((seat) => ({
      id: str(seat.id),
      personId: str(seat.personId),
      email: str(seat.email),
      name: typeof seat.name === 'string' ? seat.name : undefined,
      role: str(seat.role) as BookableStaffRoleId,
      state: str(seat.state) as BookableSeatState,
      locationIds: strings(seat.locationIds),
      bookableIds: strings(seat.bookableIds),
      invitedAt: date(seat.invitedAt),
      inviteExpired: seat.inviteExpired === true,
      you: seat.you === true,
    })),
    canInvite: strings(json.canInvite) as BookableStaffRoleId[],
  };
}

function reviveWindow(json: Json): VendorWindow {
  return {
    id: str(json.id),
    skuTemplateId: str(json.skuTemplateId),
    title: str(json.title) || str(json.skuTemplateId),
    domain: str(json.domain),
    locationId: str(json.locationId),
    weekdays: Array.isArray(json.weekdays) ? json.weekdays.map(Number).filter(Number.isInteger) : [],
    openMins: num(json.openMins),
    closeMins: num(json.closeMins),
    quantity: num(json.quantity),
    priceCents: num(json.priceCents),
    maxGuests: num(json.maxGuests),
    durationMins: typeof json.durationMins === 'number' ? json.durationMins : undefined,
    intent: str(json.intent) || 'request',
    published: json.published === true,
    coverUrl: typeof json.coverUrl === 'string' ? json.coverUrl : undefined,
  };
}

export function reviveSlots(json: Json): WindowSlots {
  const slots = Array.isArray(json.slots) ? (json.slots as Json[]) : [];
  return {
    window: reviveWindow((json.window ?? {}) as Json),
    timezone: typeof json.timezone === 'string' ? json.timezone : undefined,
    slots: slots
      .map((slot) => ({
        startsAt: date(slot.startsAt),
        startMins: num(slot.startMins),
        weekday: num(slot.weekday),
        state: str(slot.state) as BookableSlotState,
        quantity: num(slot.quantity),
        committed: num(slot.committed),
        remaining: num(slot.remaining),
      }))
      .filter((slot): slot is LiveSlot => slot.startsAt !== undefined),
  };
}

export function reviveAnalytics(json: Json): Analytics {
  const top = Array.isArray(json.top) ? (json.top as Json[]) : [];
  return {
    days: num(json.days),
    requests: num(json.requests),
    offers: num(json.offers),
    declined: num(json.declined),
    booked: num(json.booked),
    winRate: json.winRate === null || json.winRate === undefined ? null : num(json.winRate),
    paidCents: num(json.paidCents),
    netCents: num(json.netCents),
    refunds: num(json.refunds),
    payAtVenueCents: num(json.payAtVenueCents),
    top: top.map((row) => ({
      windowId: str(row.windowId),
      title: str(row.title),
      booked: num(row.booked),
      valueCents: num(row.valueCents),
    })),
  };
}

function revivePayout(raw: unknown): PayoutAccount | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const payout = raw as Json;
  if (typeof payout.reference !== 'string') return undefined;
  return {
    reference: payout.reference,
    status: payout.status === 'active' || payout.status === 'restricted' ? payout.status : 'pending',
    last4: typeof payout.last4 === 'string' ? payout.last4 : undefined,
    detail: typeof payout.detail === 'string' ? payout.detail : undefined,
  };
}

export function revivePayouts(json: Json): Payouts {
  const totals = (json.totals ?? {}) as Json;
  const lines = Array.isArray(json.lines) ? (json.lines as Json[]) : [];
  return {
    payout: revivePayout(json.payout),
    totals: {
      netCents: num(totals.netCents),
      feeCents: num(totals.feeCents),
      bookings: num(totals.bookings),
      refunds: num(totals.refunds),
    },
    lines: lines.map((line) => ({
      id: str(line.id),
      title: str(line.title),
      paidAt: date(line.paidAt) ?? new Date(0),
      status: line.status === 'refunded' ? 'refunded' : 'completed',
      amountCents: num(line.amountCents),
      feeCents: num(line.feeCents),
      netCents: num(line.netCents),
      currency: str(line.currency) || 'usd',
      refundReason: typeof line.refundReason === 'string' ? line.refundReason : undefined,
    })),
  };
}

/** Only an https link to the processor is opened; anything else is refused. */
export function safeDashboardUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && /(^|\.)stripe\.com$/.test(url.hostname) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function formatCents(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

async function readJson(response: Response): Promise<Json> {
  try {
    return (await response.json()) as Json;
  } catch {
    return {};
  }
}

export function httpConsoleTransport(authorized: AuthorizedFetch): ConsoleTransport {
  const send = async <T,>(path: string, init: RequestInit, map: (json: Json) => T | undefined): Promise<SetupResult<T>> => {
    const response = await authorized(path, init);
    const json = await readJson(response);
    if (!response.ok) {
      const blockers = Array.isArray(json.blockers) ? strings(json.blockers) : undefined;
      return { status: response.status, blockers };
    }
    const value = map(json);
    return value === undefined ? { status: 502, blockers: ['That did not load. Try again'] } : { status: response.status, value };
  };
  const post = (body: unknown) => ({
    method: 'POST' as const,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const get = { method: 'GET' as const };
  const windowPath = (id: string) => `/vendor/windows/${encodeURIComponent(id)}`;

  return {
    team: () => send('/vendor/seats', get, reviveTeam),
    invite: (draft) => send('/vendor/seats', post(draft), reviveTeam),
    moveSeat: (id, operation) => send(`/vendor/seats/${encodeURIComponent(id)}/state`, post({ operation }), reviveTeam),
    slots: (windowId) => send(`${windowPath(windowId)}/slots`, get, reviveSlots),
    moveSlot: (windowId, startsAt, operation, reason) =>
      send(`${windowPath(windowId)}/slots`, post({ startsAt: startsAt.toISOString(), operation, reason }), reviveSlots),
    saveSchedule: (windowId, schedule) => send(`${windowPath(windowId)}/schedule`, post(schedule), reviveSlots),
    analytics: (days) => send(`/vendor/analytics?days=${encodeURIComponent(String(days))}`, get, reviveAnalytics),
    payouts: () => send('/vendor/payouts', get, revivePayouts),
    payoutDashboard: () => send('/vendor/payouts/dashboard', post({}), (json) => safeDashboardUrl(json.url)),
    signOutEverywhere: async () => {
      const response = await authorized('/vendor/auth/sign-out-everywhere', post({}));
      return response.ok ? { status: response.status, value: true } : { status: response.status, blockers: ['That did not go through. Try again'] };
    },
  };
}

/** In memory, for the demo build only. Holds no seeded businesses or people. */
export function demoConsoleTransport(): ConsoleTransport {
  let team: Team = { seats: [], canInvite: ['manager', 'staff', 'door', 'serviceProvider'] };
  const empty: Analytics = {
    days: 30, requests: 0, offers: 0, declined: 0, booked: 0, winRate: null,
    paidCents: 0, netCents: 0, refunds: 0, payAtVenueCents: 0, top: [],
  };
  return {
    team: async () => ({ status: 200, value: team }),
    invite: async (draft) => {
      team = {
        ...team,
        seats: [
          ...team.seats,
          {
            id: `demo_seat_${team.seats.length + 1}`,
            personId: `demo_person_${team.seats.length + 1}`,
            email: draft.email,
            role: draft.role,
            state: 'INVITED',
            locationIds: draft.locationIds,
            bookableIds: draft.bookableIds,
            invitedAt: new Date(),
            inviteExpired: false,
            you: false,
          },
        ],
      };
      return { status: 201, value: team };
    },
    moveSeat: async (id, operation) => {
      const to: BookableSeatState = operation === 'SUSPEND_SEAT' ? 'SUSPENDED' : operation === 'RESTORE_SEAT' ? 'ACTIVE' : 'REVOKED';
      team = {
        ...team,
        seats: team.seats.map((seat) => (seat.id === id ? { ...seat, state: to } : seat)).filter((seat) => seat.state !== 'REVOKED'),
      };
      return { status: 200, value: team };
    },
    slots: async () => ({ status: 404, blockers: ['Publish a service to see its times'] }),
    moveSlot: async () => ({ status: 404, blockers: ['Publish a service to see its times'] }),
    saveSchedule: async () => ({ status: 404, blockers: ['Publish a service to see its times'] }),
    analytics: async (days) => ({ status: 200, value: { ...empty, days } }),
    payouts: async () => ({ status: 200, value: { totals: { netCents: 0, feeCents: 0, bookings: 0, refunds: 0 }, lines: [] } }),
    payoutDashboard: async () => ({ status: 409, blockers: ['Finish payout setup first'] }),
    signOutEverywhere: async () => ({ status: 204, value: true }),
  };
}
