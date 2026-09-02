import type { BookableDemandOperationId, BookableDemandState, BookableDomainId } from '../utils/bookableTemplates.ts';
import type { AvailabilitySlot } from './availability.ts';
import type { Demand, DemandSupply } from './demand.ts';
import type { VendorLocation } from './locations.ts';
import type { AuthorizedFetch, SetupResult } from './setupTransport.ts';

/**
 * The demand a business can answer, and the capacity it would answer from.
 *
 * Both sides come from one read because matching compares them against each
 * other: demand fetched at one moment and supply at another would produce
 * matches against slots that had already sold, and the vendor would be shown an
 * offer they cannot honour.
 */
export interface DemandFeedSnapshot {
  demand: Demand[];
  supply: DemandSupply[];
}

export interface DemandTransport {
  loadFeed: () => Promise<SetupResult<DemandFeedSnapshot>>;
  /**
   * Answers one request.
   *
   * Carries the bookable as well as the operation, because a business with two
   * bookables that both fit is offering one of them specifically, and the guest
   * is told which.
   */
  respond: (
    demandId: string,
    bookableId: string,
    operation: BookableDemandOperationId,
  ) => Promise<SetupResult<DemandFeedSnapshot>>;
}

/**
 * JSON has no date type, so every instant arrives as a string.
 *
 * This matters more than the usual revival: matching compares `earliest` and
 * `latest` against slot times with `<` and `>`, and two ISO strings compare
 * lexically without throwing. The feed would silently mismatch rather than
 * fail, so an unparseable instant is rejected here instead.
 */
function instant(raw: unknown): Date | undefined {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? undefined : raw;
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function reviveDemand(raw: unknown): Demand | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const entry = raw as Record<string, unknown>;
  const earliest = instant(entry.earliest);
  const latest = instant(entry.latest);
  const raisedAt = instant(entry.raisedAt);
  if (!earliest || !latest || !raisedAt) return undefined;
  if (typeof entry.id !== 'string' || typeof entry.category !== 'string') return undefined;

  return {
    id: entry.id,
    category: entry.category,
    state: entry.state as BookableDemandState,
    partySize: Number(entry.partySize),
    earliest,
    latest,
    lat: Number(entry.lat),
    lng: Number(entry.lng),
    radiusMiles: Number(entry.radiusMiles),
    budgetCents: entry.budgetCents === undefined ? undefined : Number(entry.budgetCents),
    note: typeof entry.note === 'string' ? entry.note : undefined,
    raisedAt,
  };
}

function reviveSlot(raw: unknown): AvailabilitySlot | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const entry = raw as Record<string, unknown>;
  const startsAt = instant(entry.startsAt);
  if (!startsAt || typeof entry.id !== 'string') return undefined;

  const quantity = Number(entry.quantity);
  const committed = Number(entry.committed);
  return {
    id: entry.id,
    startsAt,
    startMins: Number(entry.startMins),
    weekday: Number(entry.weekday),
    quantity,
    committed,
    blocked: Boolean(entry.blocked),
    closed: Boolean(entry.closed),
    state: entry.state as AvailabilitySlot['state'],
    // Derived rather than trusted: a server that sent a stale remaining would
    // have the console offer a slot that is already full.
    remaining: Math.max(0, quantity - committed),
    minimumQuantity: Number(entry.minimumQuantity ?? 1),
  };
}

function reviveSupply(raw: unknown): DemandSupply | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const entry = raw as Record<string, unknown>;
  if (typeof entry.bookableId !== 'string' || !entry.location) return undefined;

  const location = entry.location as VendorLocation;
  const slots = Array.isArray(entry.slots) ? entry.slots : [];
  return {
    bookableId: entry.bookableId,
    title: typeof entry.title === 'string' ? entry.title : entry.bookableId,
    domain: entry.domain as BookableDomainId,
    location: {
      ...location,
      lat: Number(location.lat),
      lng: Number(location.lng),
      radiusMiles: location.radiusMiles === undefined ? undefined : Number(location.radiusMiles),
    },
    priceCents: Number(entry.priceCents),
    maxGuests: Number(entry.maxGuests),
    slots: slots.map(reviveSlot).filter((slot): slot is AvailabilitySlot => slot !== undefined),
  };
}

export function reviveFeed(json: Record<string, unknown>): DemandFeedSnapshot {
  const demand = Array.isArray(json.demand) ? json.demand : [];
  const supply = Array.isArray(json.supply) ? json.supply : [];
  return {
    // An entry we cannot read is dropped rather than coerced. A request whose
    // window did not parse would match everything or nothing, and both look
    // like a working feed.
    demand: demand.map(reviveDemand).filter((item): item is Demand => item !== undefined),
    supply: supply.map(reviveSupply).filter((item): item is DemandSupply => item !== undefined),
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function httpDemandTransport(authorized: AuthorizedFetch): DemandTransport {
  const send = async (path: string, init: RequestInit): Promise<SetupResult<DemandFeedSnapshot>> => {
    const response = await authorized(path, init);
    const json = await readJson(response);
    if (!response.ok) {
      const blockers = Array.isArray(json.blockers)
        ? json.blockers.filter((item): item is string => typeof item === 'string')
        : undefined;
      return { status: response.status, blockers };
    }
    return { status: response.status, value: reviveFeed(json) };
  };

  return {
    loadFeed: () => send('/vendor/demand', { method: 'GET' }),
    respond: (demandId, bookableId, operation) =>
      send(`/vendor/demand/${encodeURIComponent(demandId)}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation, bookableId }),
      }),
  };
}
