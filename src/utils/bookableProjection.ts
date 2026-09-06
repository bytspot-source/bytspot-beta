// Bookable projection (Phase 3, B1) — the one place a live listing's honesty
// gate is decided. See bytspot-plan-prime-path-contract.md §4 (capability
// matrix), §8 (`control` is a derivation of `capability`, never a parallel
// classifier), and bytspot-bookable-design.md (Bookable is a projection handle,
// not a new inventory noun).
//
// Read-only: this module maps supply sources into a canonical `Bookable`. It
// never settles, holds, or persists — that is B2/B3. It exists so the card layer
// and Prime Path derive control, CTA, and eligibility from a single function
// instead of re-classifying supply independently.

import type { NormalizedTableSlot } from './orderingRpc.ts';
import type { BookableCapabilityId, BookableServiceTier, BookableTemplate } from './bookableTemplates.ts';

// The four-state, card-level capability. Distinct from the ontology verb catalog
// (`BookableCapabilityId`: BOOK/RESERVE/RSVP/…): the catalog says what a SKU
// *can* do; this says what Bytspot *will* do for a specific live listing.
export type BookableCapability = 'book' | 'request' | 'redirect' | 'details';

// `control` is a pure derivation of `capability`. book/request settle or hold on
// Bytspot rails → vendor; redirect hands off and details does nothing → local.
export type BookableControl = 'local' | 'vendor';

export type BookableSourceKind = 'party_ticket' | 'coffee' | 'table' | 'deep_link';

export interface BookableTier {
  name: string;
  priceCents: number;
  capacity: number;
  membershipFloor: BookableServiceTier | null;
}

export interface Bookable {
  /** Canonical handle. Upstream ids are confined to `fulfillment`, never the id. */
  id: string;
  sourceKind: BookableSourceKind;
  capability: BookableCapability;
  /** Derived from `capability`. Never set independently. */
  control: BookableControl;
  /** Named third party for `redirect`; null for own inventory. */
  provider: string | null;
  tier: BookableTier;
  /** Upstream ids / URLs. Never leaks into `id`. */
  fulfillment: Record<string, unknown>;
  /** Derived: `redirect` and `details` can never be Prime Path (contract §3, §4). */
  primePathEligible: boolean;
}

const CONTROL_BY_CAPABILITY: Record<BookableCapability, BookableControl> = {
  book: 'vendor',
  request: 'vendor',
  redirect: 'local',
  details: 'local',
};

export function controlFromCapability(capability: BookableCapability): BookableControl {
  return CONTROL_BY_CAPABILITY[capability];
}

export function isPrimePathEligible(capability: BookableCapability): boolean {
  return capability !== 'redirect' && capability !== 'details';
}

// Ontology verb → card capability. Only verbs that settle or hold on our rails
// earn a vendor gate; everything else is a reference. `redirect` is never derived
// from a verb — a hand-off is a fact about the supply source, not the SKU.
export function capabilityFromVerbs(verbs: readonly BookableCapabilityId[]): BookableCapability {
  if (verbs.some((verb) => verb === 'BOOK' || verb === 'BUY' || verb === 'PAY' || verb === 'RESERVE')) return 'book';
  if (verbs.includes('RSVP')) return 'request';
  return 'details';
}

// Honest CTA label for a capability. `details` deliberately has no second CTA —
// it renders as a Reference — so this returns null and callers must not
// synthesize a Book button. This is the single source of CTA copy; both the
// Bookable projection and the card layer derive their label from here so the two
// can never disagree about what a listing lets a user do.
export function capabilityCTA(capability: BookableCapability, opts: { provider?: string | null } = {}): string | null {
  switch (capability) {
    case 'book': return 'Book';
    case 'request': return 'Request';
    case 'redirect': return opts.provider ? `Book on ${opts.provider} ↗` : null;
    case 'details': return null;
  }
}

export function primaryCTA(bookable: Bookable): string | null {
  return capabilityCTA(bookable.capability, { provider: bookable.provider });
}

export function isReference(bookable: Bookable): boolean {
  return bookable.capability === 'details';
}

// Deterministic, upstream-id-free handle. A projection has no database, so the id
// is derived from a stable key by hashing — keeping raw upstream ids/URLs out of
// the visible id while staying stable for the same input (contract: BYT-… id,
// upstream ids confined to fulfillment).
function bookableId(sourceKind: BookableSourceKind, stableKey: string): string {
  let hash = 5381;
  for (let i = 0; i < stableKey.length; i += 1) hash = ((hash * 33) ^ stableKey.charCodeAt(i)) >>> 0;
  return `BYT-${sourceKind}-${hash.toString(36)}`;
}

function build(input: {
  sourceKind: BookableSourceKind;
  stableKey: string;
  capability: BookableCapability;
  provider: string | null;
  tier: BookableTier;
  fulfillment: Record<string, unknown>;
}): Bookable {
  if (input.capability === 'redirect' && !input.provider) {
    // A redirect with no named provider would render "Book on null ↗" — the exact
    // dishonest CTA the capability matrix exists to prevent.
    throw new Error('bookableProjection: redirect capability requires a named provider');
  }
  return {
    id: bookableId(input.sourceKind, input.stableKey),
    sourceKind: input.sourceKind,
    capability: input.capability,
    control: controlFromCapability(input.capability),
    provider: input.capability === 'redirect' ? input.provider : null,
    tier: input.tier,
    fulfillment: input.fulfillment,
    primePathEligible: isPrimePathEligible(input.capability),
  };
}

// ── Projections ────────────────────────────────────────────────────────────

// Authoring preview only: a template is design-time, not live inventory. Named
// `…Preview` so it is never mistaken for a listing a user can actually book.
export function templateToBookablePreview(template: BookableTemplate): Bookable {
  return build({
    sourceKind: 'party_ticket',
    stableKey: template.id,
    capability: capabilityFromVerbs(template.capabilities),
    provider: null,
    tier: { name: template.title, priceCents: template.priceCents, capacity: template.maxGuests, membershipFloor: template.tier },
    fulfillment: { templateId: template.id, domain: template.domain, noun: template.noun },
  });
}

export interface PartyTierInput {
  partyId: string;
  tier: { name: string; priceCents: number; capacity: number; membershipFloor: BookableServiceTier | null };
  rsvp?: boolean;
}

export function partyTierToBookable(input: PartyTierInput): Bookable {
  return build({
    sourceKind: 'party_ticket',
    stableKey: `${input.partyId}:${input.tier.name}`,
    capability: input.rsvp ? 'request' : 'book',
    provider: null,
    tier: { name: input.tier.name, priceCents: input.rsvp ? 0 : input.tier.priceCents, capacity: input.tier.capacity, membershipFloor: input.tier.membershipFloor },
    fulfillment: { partyId: input.partyId, ticketTierName: input.tier.name },
  });
}

export interface CoffeeInput {
  reservationId: string;
  title: string;
  membershipFloor?: BookableServiceTier | null;
}

// Coffee is a hold-ask, never a payment (contract §2.3): capability stays request.
export function coffeeToBookable(input: CoffeeInput): Bookable {
  return build({
    sourceKind: 'coffee',
    stableKey: input.reservationId,
    capability: 'request',
    provider: null,
    tier: { name: input.title, priceCents: 0, capacity: 1, membershipFloor: input.membershipFloor ?? null },
    fulfillment: { coffeeReservationId: input.reservationId },
  });
}

// A table slot from the (now fail-closed) ordering adapter. Own inventory settles
// on our rails → book; a third-party slot is a hand-off → redirect, and the
// provider on the normalized slot names the destination CTA.
export function tableSlotToBookable(slot: NormalizedTableSlot, opts: { ownInventory: boolean }): Bookable {
  const capability: BookableCapability = opts.ownInventory ? 'book' : 'redirect';
  return build({
    sourceKind: 'table',
    stableKey: `${slot.provider}:${slot.id}`,
    capability,
    provider: opts.ownInventory ? null : slot.provider,
    tier: { name: slot.timeLabel, priceCents: 0, capacity: slot.partySize, membershipFloor: null },
    fulfillment: { provider: slot.provider, slotId: slot.id, ...(slot.deeplinkUrl ? { deeplinkUrl: slot.deeplinkUrl } : {}) },
  });
}

export interface DeepLinkInput {
  title: string;
  provider: string;
  url: string;
  capacity?: number;
}

// A deep link produces no booking, no Pass, no outcome — it exits before Booking
// (contract §3). Always redirect; never Prime Path.
export function deepLinkToBookable(input: DeepLinkInput): Bookable {
  return build({
    sourceKind: 'deep_link',
    stableKey: `${input.provider}:${input.url}`,
    capability: 'redirect',
    provider: input.provider,
    tier: { name: input.title, priceCents: 0, capacity: input.capacity ?? 0, membershipFloor: null },
    fulfillment: { provider: input.provider, url: input.url },
  });
}
