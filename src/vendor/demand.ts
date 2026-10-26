import {
  canRunDemandOperation,
  getBookableDemand,
  listDiscoverCategories,
  matchRule,
  type BookableDemandOperationId,
  type BookableDemandState,
  type BookableDomainId,
  type BookableMatchRuleId,
  type BookableStaffRoleId,
} from '../utils/bookableTemplates.ts';
import { sellableSlots, type AvailabilitySlot } from './availability.ts';
import { distanceMiles, isWithinReach, type VendorLocation } from './locations.ts';

/** A guest's unresolved need, before any vendor has answered it. */
export interface Demand {
  id: string;
  /** A consumer rail id, so demand and Discover speak the same language. */
  category: string;
  state: BookableDemandState;
  partySize: number;
  /** The window the guest asked for, already widened by their flexibility. */
  earliest: Date;
  latest: Date;
  lat: number;
  lng: number;
  radiusMiles: number;
  budgetCents?: number;
  note?: string;
  raisedAt: Date;
}

/** What a Bookable offers, reduced to the fields matching actually reads. */
export interface DemandSupply {
  bookableId: string;
  title: string;
  domain: BookableDomainId;
  location: VendorLocation;
  priceCents: number;
  maxGuests: number;
  slots: AvailabilitySlot[];
}

export interface DemandMiss {
  rule: BookableMatchRuleId;
  reason: string;
}

export interface DemandMatch {
  demand: Demand;
  bookableId: string;
  title: string;
  /** The slots that could actually absorb this party, soonest first. */
  slots: AvailabilitySlot[];
  distanceMiles: number;
}

export interface DemandEvaluation {
  demand: Demand;
  bookableId: string;
  matched: boolean;
  /** Empty when matched. Ordered, so the first miss is the closest to fixable. */
  misses: DemandMiss[];
  slots: AvailabilitySlot[];
}

function miss(rule: BookableMatchRuleId): DemandMiss {
  return { rule, reason: matchRule(rule)?.missReason ?? rule };
}

/** The window the guest will accept, widened by the contract's flexibility. */
export function demandWindow(demand: Demand, flexibilityMins?: number): { from: Date; to: Date } {
  const slack = (flexibilityMins ?? getBookableDemand().defaults.flexibilityMins) * 60_000;
  return { from: new Date(demand.earliest.getTime() - slack), to: new Date(demand.latest.getTime() + slack) };
}

/**
 * A slot can absorb a party only if it has room for all of it. Splitting a party
 * of six across two tables is a different product, not a match.
 */
export function slotsForDemand(demand: Demand, supply: DemandSupply, now?: Date): AvailabilitySlot[] {
  const { from, to } = demandWindow(demand);
  return sellableSlots(supply.slots, supply.domain, now)
    .filter((slot) => slot.startsAt >= from && slot.startsAt <= to && slot.remaining >= demand.partySize)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/**
 * The rules run in the order the contract declares, and every failure is
 * collected rather than short-circuited: a vendor learns more from "party too
 * big and nothing free" than from the first thing that happened to fail.
 */
export function evaluateDemand(demand: Demand, supply: DemandSupply, now?: Date): DemandEvaluation {
  const misses: DemandMiss[] = [];

  const category = listDiscoverCategories({ includeVendorGated: true }).find((item) => item.id === demand.category);
  if (!category?.domains.includes(supply.domain)) misses.push(miss('category'));

  if (!isWithinReach(supply.location, demand, demand.radiusMiles)) misses.push(miss('location'));

  if (demand.partySize > supply.maxGuests) misses.push(miss('party'));

  if (demand.budgetCents !== undefined && supply.priceCents > demand.budgetCents) misses.push(miss('budget'));

  // Last and only rule that reads availability: without it a match is a
  // category guess dressed up as an answer.
  const slots = slotsForDemand(demand, supply, now);
  if (!slots.length) misses.push(miss('capacity'));

  return { demand, bookableId: supply.bookableId, matched: misses.length === 0, misses, slots };
}

/** Soonest-fillable first, because the vendor's scarcest asset is the next hour. */
export function matchDemand(demands: Demand[], supply: DemandSupply[], now?: Date): DemandMatch[] {
  const matches: DemandMatch[] = [];
  for (const demand of demands) {
    if (!getBookableDemand().actionableStates.includes(demand.state)) continue;
    for (const item of supply) {
      const evaluation = evaluateDemand(demand, item, now);
      if (!evaluation.matched) continue;
      matches.push({
        demand,
        bookableId: item.bookableId,
        title: item.title,
        slots: evaluation.slots,
        distanceMiles: Math.round(10 * distanceMiles(item.location, demand)) / 10,
      });
    }
  }
  return matches.sort((a, b) => a.slots[0].startsAt.getTime() - b.slots[0].startsAt.getTime());
}

export interface UnmetDemand {
  demand: Demand;
  /** The rules that blocked every Bookable, most common first. */
  reasons: { rule: BookableMatchRuleId; reason: string; count: number }[];
}

/**
 * The most valuable half of the feed. Demand nobody could answer is the only
 * signal that tells a vendor what to change, so the reason is kept rather than
 * the row being dropped.
 */
export function unmetDemand(demands: Demand[], supply: DemandSupply[], now?: Date): UnmetDemand[] {
  const unmet: UnmetDemand[] = [];
  for (const demand of demands) {
    if (!getBookableDemand().actionableStates.includes(demand.state)) continue;
    const evaluations = supply.map((item) => evaluateDemand(demand, item, now));
    if (evaluations.some((evaluation) => evaluation.matched)) continue;

    const counts = new Map<BookableMatchRuleId, { reason: string; count: number }>();
    for (const evaluation of evaluations) {
      for (const item of evaluation.misses) {
        const current = counts.get(item.rule);
        counts.set(item.rule, { reason: item.reason, count: (current?.count ?? 0) + 1 });
      }
    }
    unmet.push({
      demand,
      reasons: [...counts.entries()]
        .map(([rule, value]) => ({ rule, ...value }))
        .sort((a, b) => b.count - a.count),
    });
  }
  return unmet;
}

/**
 * Demand a vendor lost to capacity alone is the only kind they can fix by
 * opening more, which makes it the one number worth showing on Home.
 */
export function demandLostToCapacity(demands: Demand[], supply: DemandSupply[], now?: Date): UnmetDemand[] {
  return unmetDemand(demands, supply, now).filter(
    (item) => item.reasons.length > 0 && item.reasons.every((reason) => reason.rule === 'capacity'),
  );
}

export function canRespondToDemand(
  role: BookableStaffRoleId,
  operation: BookableDemandOperationId,
  state: BookableDemandState,
): boolean {
  return canRunDemandOperation(role, operation, state);
}

/** Refuses any response the contract forbids, so the feed cannot outrun the machine. */
export function respondToDemand(
  demand: Demand,
  role: BookableStaffRoleId,
  operation: BookableDemandOperationId,
): Demand | null {
  if (!canRunDemandOperation(role, operation, demand.state)) return null;
  const target = getBookableDemand().operations.find((item) => item.id === operation);
  if (!target) return null;
  return { ...demand, state: target.to };
}
