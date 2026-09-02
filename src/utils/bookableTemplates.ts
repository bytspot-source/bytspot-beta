import catalog from '../../contracts/bookable-templates.json' with { type: 'json' };

export type BookableCapabilityId =
  | 'BOOK'
  | 'RESERVE'
  | 'RSVP'
  | 'BUY'
  | 'SELL'
  | 'PAY'
  | 'REFUND'
  | 'CANCEL'
  | 'CHECK_IN'
  | 'VERIFY'
  | 'PUBLISH'
  | 'CREATE_HANG'
  | 'INVITE'
  | 'SHARE'
  | 'SCHEDULE';

export type BookableSkuState =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'RESERVED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

/** The stable ontology. PASS is deliberately absent: it is issued by an action, not always true. */
export type BookableNoun = 'PIN' | 'HANG' | 'HOST' | 'ROOM' | 'STAY' | 'STALL' | 'SELLER' | 'SKU' | 'PERSON' | 'CIRCLE';
export type BookableDerivedObjectId = 'PASS';
export type BookableObjectId = BookableNoun | BookableDerivedObjectId;
export type BookableActorRole =
  | 'guest'
  | 'host'
  | 'buyer'
  | 'seller'
  | 'member'
  | 'organizer'
  | 'attendee'
  | 'driver'
  | 'customer';
export type BookableDomainId =
  | 'dining'
  | 'nightlife'
  | 'wellness'
  | 'automotive'
  | 'stay'
  | 'stall'
  | 'green'
  | 'coffee'
  | 'shopping'
  | 'events'
  | 'fitness';

/**
 * Keeps the union above and the JSON in step. TypeScript forces this record to
 * be exhaustive over the union, and the validator checks it against the
 * catalog, so a domain cannot be added on one side only.
 */
const DOMAIN_ID_GUARD: Record<BookableDomainId, true> = {
  dining: true,
  nightlife: true,
  wellness: true,
  automotive: true,
  stay: true,
  stall: true,
  green: true,
  coffee: true,
  shopping: true,
  events: true,
  fitness: true,
};
export type BookableServiceTier = 'black' | 'platinum' | 'green';

/** What the ETA label actually means. One string used to carry all six. */
export type BookableEtaKind = 'readiness' | 'dispatch' | 'hold' | 'nextSlot' | 'policy' | 'none';

export interface BookableTiming {
  etaKind: BookableEtaKind;
  etaLabel: string;
  holdSecs: number;
}

export interface BookableCapability {
  id: BookableCapabilityId;
  verb: string;
  appliesTo: BookableObjectId[];
}

export interface BookableDerivedObject {
  id: BookableDerivedObjectId;
  label: string;
  issuedBy: BookableCapabilityId[];
  issuedFrom: BookableNoun[];
  consumedBy: BookableCapabilityId[];
  states: string[];
}

/** An entity declares what it can do, so a capability check needs an actor. */
export interface BookableEntityCapabilities {
  entity: BookableNoun;
  capabilities: BookableCapabilityId[];
}

export type BookableStaffRoleId = 'owner' | 'manager' | 'staff' | 'door' | 'serviceProvider';
export type BookableStaffScope = 'all' | 'assigned';

/** A seat in a business. Always a capability subset of SELLER, never a superset. */
export interface BookableStaffRole {
  id: BookableStaffRoleId;
  label: string;
  summary: string;
  scope: BookableStaffScope;
  capabilities: BookableCapabilityId[];
}

export type BookableSellerState = 'DRAFT' | 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
export type BookableSellerOperationId =
  | 'SUBMIT_SELLER'
  | 'WITHDRAW_SELLER'
  | 'CLOSE_SELLER'
  | 'APPROVE_SELLER'
  | 'SUSPEND_SELLER'
  | 'REINSTATE_SELLER';
export type BookableSeatState = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type BookableSeatOperationId =
  | 'INVITE_SEAT'
  | 'ACCEPT_SEAT'
  | 'SUSPEND_SEAT'
  | 'RESTORE_SEAT'
  | 'REVOKE_SEAT';

/** Some transitions belong to the business, some only to the platform. */
export interface BookableSellerOperation {
  id: BookableSellerOperationId;
  label: string;
  actor: 'seller' | 'platform';
  requiresRole?: BookableStaffRoleId;
  from: BookableSellerState[];
  to: BookableSellerState;
}

export interface BookableSellerTransition {
  from: BookableSellerState;
  to: BookableSellerState[];
}

/** The ceiling a seller's own state puts on every seat inside it. */
export interface BookableSellerStateCapabilities {
  state: BookableSellerState;
  allows: BookableCapabilityId[];
}

export interface BookableSellerRequirement {
  id: string;
  label: string;
  blocks: BookableSellerState;
}

export interface BookableSeatOperation {
  id: BookableSeatOperationId;
  label: string;
  from: BookableSeatState[];
  to: BookableSeatState;
  actor?: string;
}

export interface BookableSeatTransition {
  from: BookableSeatState;
  to: BookableSeatState[];
}

export interface BookableSellerIdentity {
  states: BookableSellerState[];
  transitions: BookableSellerTransition[];
  terminalStates: BookableSellerState[];
  publishableStates: BookableSellerState[];
  consoleStates: BookableSellerState[];
  stateCapabilities: BookableSellerStateCapabilities[];
  requirements: BookableSellerRequirement[];
  operations: BookableSellerOperation[];
}

export interface BookableSeats {
  grantsFrom: string;
  states: BookableSeatState[];
  transitions: BookableSeatTransition[];
  terminalStates: BookableSeatState[];
  grantingStates: BookableSeatState[];
  soleRole: BookableStaffRoleId;
  unrevocableRole: BookableStaffRoleId;
  scopedFields: string[];
  operations: BookableSeatOperation[];
  inviteExpiryHours: number;
}

/**
 * SELLER's lifecycle and its seats. A seat never exceeds the business it works
 * for, so a suspended seller silences every seat inside it without any role
 * being edited.
 */
export interface BookableSeller {
  noun: BookableNoun;
  identity: BookableSellerIdentity;
  seats: BookableSeats;
}

/**
 * The consumer lens over the same inventory the vendor publishes. A category is
 * not the product: the SKU underneath it is. Categories are keyed by the
 * CardType ids the Discover rail already ships with.
 */
export interface BookableDiscoverCategory {
  id: string;
  label: string;
  emoji: string;
  icon: string;
  domains: BookableDomainId[];
  cta: string;
  minimumFeedCount: number;
  vendorGated?: boolean;
}

export type BookableSlotState = 'CLOSED' | 'OPEN' | 'FULL' | 'BLOCKED' | 'PASSED';
export type BookableSlotKind = 'rolling' | 'daily' | 'fixed';
export type BookableRecurrenceKind = 'weekly' | 'dateRange' | 'oneOff';
export type BookableAvailabilityOperationId =
  | 'OPEN_SLOT'
  | 'CLOSE_SLOT'
  | 'BLOCK_SLOT'
  | 'SET_QUANTITY'
  | 'RELEASE';

export interface BookableAvailabilityOperation {
  id: BookableAvailabilityOperationId;
  label: string;
  requiresCapability: BookableCapabilityId;
  from: BookableSlotState[];
  to: BookableSlotState | null;
}

export interface BookableAvailabilityDefaults {
  slotKind: BookableSlotKind;
  slotMinutes: number;
  leadTimeMins: number;
  horizonDays: number;
  maxQuantityPerSlot: number;
}

export interface BookableAvailabilityDomainDefaults {
  domain: BookableDomainId;
  slotKind: BookableSlotKind;
  slotMinutes: number;
  leadTimeMins: number;
  horizonDays: number;
}

/**
 * The printer's multiplier. A slot is not a SKU and never holds a booking; it
 * holds the capacity that SKUs are printed from.
 */
export interface BookableAvailability {
  recurrenceKinds: BookableRecurrenceKind[];
  slotKinds: BookableSlotKind[];
  slotStates: BookableSlotState[];
  slotTransitions: { from: BookableSlotState; to: BookableSlotState[] }[];
  operations: BookableAvailabilityOperation[];
  blockReasons: string[];
  defaults: BookableAvailabilityDefaults;
  domainDefaults: BookableAvailabilityDomainDefaults[];
}

export interface BookableSkuTransition {
  from: BookableSkuState;
  to: BookableSkuState[];
}

export type BookableLocationKindId = 'fixed' | 'zone' | 'mobile' | 'visiting';
export type BookableFulfillment = 'guestTravels' | 'vendorTravels';
export type BookableLocationState = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'CLOSED';
export type BookableLocationOperationId = 'ACTIVATE_LOCATION' | 'PAUSE_LOCATION' | 'CLOSE_LOCATION';

export interface BookableLocationKind {
  id: BookableLocationKindId;
  label: string;
  question: string;
  fulfillment: BookableFulfillment;
  requiresAddress: boolean;
  requiresRadius: boolean;
}

export interface BookableLocationOperation {
  id: BookableLocationOperationId;
  label: string;
  requiresCapability: BookableCapabilityId;
  from: BookableLocationState[];
  to: BookableLocationState;
}

/**
 * A Location is not a new core noun. It is a PIN a SELLER holds, and its kind
 * decides who travels, which is what etaKind was already describing from the
 * other end.
 */
export interface BookableLocations {
  derivesFrom: BookableNoun;
  heldBy: BookableNoun;
  kinds: BookableLocationKind[];
  fulfillments: BookableFulfillment[];
  states: BookableLocationState[];
  transitions: { from: BookableLocationState; to: BookableLocationState[] }[];
  publishableStates: BookableLocationState[];
  operations: BookableLocationOperation[];
  etaKindFulfillment: { etaKind: BookableEtaKind; requires: BookableFulfillment | 'any' }[];
  defaults: { kind: BookableLocationKindId; radiusMiles: number; maxRadiusMiles: number };
  domainKinds: { domain: BookableDomainId; kinds: BookableLocationKindId[] }[];
}

export type BookableDemandState = 'OPEN' | 'MATCHED' | 'OFFERED' | 'BOOKED' | 'EXPIRED' | 'WITHDRAWN';
export type BookableDemandOperationId = 'OFFER' | 'WITHDRAW_OFFER' | 'DECLINE';
export type BookableMatchRuleId = 'category' | 'location' | 'party' | 'budget' | 'capacity';

export interface BookableDemandOperation {
  id: BookableDemandOperationId;
  label: string;
  requiresCapability: BookableCapabilityId;
  from: BookableDemandState[];
  to: BookableDemandState;
}

export interface BookableMatchRule {
  id: BookableMatchRuleId;
  label: string;
  missReason: string;
}

/**
 * The other half of the printer. A need stays unresolved until real capacity can
 * absorb it, so a match must name the slot that would fill it.
 */
export interface BookableDemand {
  raisedBy: BookableNoun;
  answeredBy: BookableNoun;
  resolvesTo: BookableNoun;
  states: BookableDemandState[];
  transitions: { from: BookableDemandState; to: BookableDemandState[] }[];
  terminalStates: BookableDemandState[];
  actionableStates: BookableDemandState[];
  operations: BookableDemandOperation[];
  matchRules: BookableMatchRule[];
  defaults: {
    expiryMins: number;
    flexibilityMins: number;
    radiusMiles: number;
    maxRadiusMiles: number;
    maxPartySize: number;
  };
}

export interface BookableDomain {
  id: BookableDomainId;
  label: string;
  noun: BookableNoun;
  variants: string[];
}

export interface BookableTemplate {
  id: string;
  name: string;
  hook: string;
  domain: BookableDomainId;
  schema: string;
  noun: BookableNoun;
  tier: BookableServiceTier;
  category: string;
  clipCategory: string;
  discoverType: string;
  title: string;
  description: string;
  tagline: string;
  timing: BookableTiming;
  includedHighlights: string[];
  priceCents: number;
  durationMins: number;
  maxGuests: number;
  patchRequired: boolean;
  cta: string;
  icon: string;
  capabilities: BookableCapabilityId[];
  actionables: string[];
}

export interface BookableTemplateCatalog {
  id: string;
  version: number;
  native: {
    swiftType: string;
    kotlinType: string;
    decodeKeyStrategy: string;
    bundlePath: string;
  };
  principle: string;
  coreNouns: BookableNoun[];
  derivedObjects: BookableDerivedObject[];
  capabilities: BookableCapability[];
  actorRoles: BookableActorRole[];
  entityCapabilities: BookableEntityCapabilities[];
  staffRoles: BookableStaffRole[];
  seller: BookableSeller;
  discoverCategories: BookableDiscoverCategory[];
  availability: BookableAvailability;
  locations: BookableLocations;
  demand: BookableDemand;
  skuStates: BookableSkuState[];
  skuTransitions: BookableSkuTransition[];
  hangStates: string[];
  tierCategories: Record<BookableServiceTier, string[]>;
  tierFloors: Record<BookableServiceTier, number>;
  etaKinds: BookableEtaKind[];
  domains: BookableDomain[];
  templates: BookableTemplate[];
}

export interface BookableServiceFormSeed {
  templateId: string;
  domain: BookableDomainId;
  schema: string;
  noun: BookableNoun;
  capabilities: BookableCapabilityId[];
  tier: BookableServiceTier;
  title: string;
  description: string;
  tagline: string;
  etaLabel: string;
  includedHighlights: string[];
  category: string;
  priceDollars: string;
  durationMins: string;
  maxGuests: string;
  status: 'draft';
  patchRequired: boolean;
}

export interface BookableDiscoverProjection {
  type: string;
  name: string;
  serviceCategory: string;
  serviceSubtitle: string;
  ctaText: string;
  price: string;
  availableSpots: number;
  features: string[];
}

export interface BookableClipLocalService {
  id: string;
  title: string;
  subtitle: string;
  action: string;
  iconName: string;
  tintName: 'gold' | 'cyan' | 'emerald';
  priceLabel: string;
  amountCents: number;
  currency: 'USD';
  source: 'curated';
  category: string;
  activityHighlights: string[];
}

export type BookableServiceFormFields = {
  tier: BookableServiceTier;
  title: string;
  description: string;
  tagline: string;
  etaLabel: string;
  includedHighlights: string[];
  highlightDraft: string;
  category: string;
  priceDollars: string;
  durationMins: string;
  maxGuests: string;
  status: 'draft';
  patchRequired: boolean;
};

const BOOKABLE_TEMPLATE_CATALOG = catalog as BookableTemplateCatalog;

const CAPABILITY_IDS = new Set(BOOKABLE_TEMPLATE_CATALOG.capabilities.map((item) => item.id));
const NOUNS = new Set(BOOKABLE_TEMPLATE_CATALOG.coreNouns);

/**
 * Every state machine in the catalog owes the same four guarantees: each state is
 * declared, each target is reachable, a terminal state is genuinely terminal and
 * nothing else is a dead end.
 */
function assertMachine<S extends string>(
  name: string,
  states: S[],
  transitions: { from: S; to: S[] }[],
  terminalStates: S[],
  errors: string[],
): void {
  const declared = new Set(states);
  const seen = new Set<S>();
  for (const row of transitions) {
    if (seen.has(row.from)) errors.push(`${name} declares ${row.from} twice`);
    seen.add(row.from);
    if (!declared.has(row.from)) errors.push(`${name} transition from unknown state ${row.from}`);
    for (const to of row.to) {
      if (!declared.has(to)) errors.push(`${name} transition ${row.from} points at unknown state ${to}`);
    }
    if (terminalStates.includes(row.from) && row.to.length) {
      errors.push(`${name} state ${row.from} must be terminal`);
    }
    if (!terminalStates.includes(row.from) && !row.to.length) {
      errors.push(`${name} state ${row.from} is a dead end but is not declared terminal`);
    }
  }
  for (const state of declared) {
    if (!seen.has(state)) errors.push(`${name} state ${state} has no declared transitions`);
  }
}
const SKU_STATES = new Set(BOOKABLE_TEMPLATE_CATALOG.skuStates);
const ETA_KINDS = new Set(BOOKABLE_TEMPLATE_CATALOG.etaKinds);
const ENTITY_CAPABILITIES = new Map<BookableNoun, Set<BookableCapabilityId>>(
  BOOKABLE_TEMPLATE_CATALOG.entityCapabilities.map((row) => [row.entity, new Set(row.capabilities)]),
);
const STAFF_ROLE_CAPABILITIES = new Map<BookableStaffRoleId, Set<BookableCapabilityId>>(
  BOOKABLE_TEMPLATE_CATALOG.staffRoles.map((role) => [role.id, new Set(role.capabilities)]),
);
const SELLER_STATE_CAPABILITIES = new Map<BookableSellerState, Set<BookableCapabilityId>>(
  BOOKABLE_TEMPLATE_CATALOG.seller.identity.stateCapabilities.map((row) => [row.state, new Set(row.allows)]),
);

/** Highest floor first, so the price ladder reads black -> platinum -> green. */
const TIERS_BY_FLOOR_DESC = (Object.keys(BOOKABLE_TEMPLATE_CATALOG.tierFloors) as BookableServiceTier[])
  .sort((a, b) => BOOKABLE_TEMPLATE_CATALOG.tierFloors[b] - BOOKABLE_TEMPLATE_CATALOG.tierFloors[a]);

export function isBookableServiceTier(value: unknown): value is BookableServiceTier {
  return value === 'black' || value === 'platinum' || value === 'green';
}

/**
 * Tiers that own this category. Price alone is not a classifier: a $12 Parking
 * stall is Platinum because Platinum owns Parking, not because it is cheap.
 */
export function bookableTierCandidates(category?: string | null): BookableServiceTier[] {
  const needle = (category ?? '').trim().toLowerCase();
  if (!needle) return [...TIERS_BY_FLOOR_DESC];
  const owners = TIERS_BY_FLOOR_DESC.filter((tier) =>
    (BOOKABLE_TEMPLATE_CATALOG.tierCategories[tier] ?? []).some((item) => item.toLowerCase() === needle),
  );
  return owners.length ? owners : [...TIERS_BY_FLOOR_DESC];
}

/**
 * Resolve a tier from an explicit value, else category ownership, else the price
 * ladder restricted to the categories' owning tiers.
 */
export function resolveBookableTier(service: {
  tier?: string | null;
  priceCents: number;
  category?: string | null;
}): BookableServiceTier {
  if (isBookableServiceTier(service.tier)) return service.tier;
  const candidates = bookableTierCandidates(service.category);
  const matched = candidates.find((tier) => service.priceCents >= BOOKABLE_TEMPLATE_CATALOG.tierFloors[tier]);
  return matched ?? candidates[candidates.length - 1];
}

export function bookableTierFloorCents(tier: BookableServiceTier): number {
  return BOOKABLE_TEMPLATE_CATALOG.tierFloors[tier];
}

export function getBookableTemplateCatalog(): BookableTemplateCatalog {
  return BOOKABLE_TEMPLATE_CATALOG;
}

export function listBookableDomains(): BookableDomain[] {
  return BOOKABLE_TEMPLATE_CATALOG.domains;
}

export function listBookableTemplates(domain?: BookableDomainId): BookableTemplate[] {
  if (!domain) return BOOKABLE_TEMPLATE_CATALOG.templates;
  return BOOKABLE_TEMPLATE_CATALOG.templates.filter((template) => template.domain === domain);
}

export function getBookableTemplate(id: string): BookableTemplate | undefined {
  return BOOKABLE_TEMPLATE_CATALOG.templates.find((template) => template.id === id);
}

export function centsToPriceDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatBookablePrice(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function bookableTemplateToFormSeed(template: BookableTemplate): BookableServiceFormSeed {
  const etaLabel = template.tier === 'green' ? '' : template.timing.etaLabel;
  return {
    templateId: template.id,
    domain: template.domain,
    schema: template.schema,
    noun: template.noun,
    capabilities: [...template.capabilities],
    tier: template.tier,
    title: template.title,
    description: template.description,
    tagline: template.tagline,
    etaLabel,
    includedHighlights: [...template.includedHighlights],
    category: template.category,
    priceDollars: centsToPriceDollars(template.priceCents),
    durationMins: String(template.durationMins),
    maxGuests: String(template.maxGuests),
    status: 'draft',
    patchRequired: template.patchRequired,
  };
}

export function bookableTemplateToServiceFormFields(template: BookableTemplate): BookableServiceFormFields {
  const seed = bookableTemplateToFormSeed(template);
  return {
    tier: seed.tier,
    title: seed.title,
    description: seed.description,
    tagline: seed.tagline,
    etaLabel: seed.etaLabel,
    includedHighlights: seed.includedHighlights,
    highlightDraft: '',
    category: seed.category,
    priceDollars: seed.priceDollars,
    durationMins: seed.durationMins,
    maxGuests: seed.maxGuests,
    status: seed.status,
    patchRequired: seed.patchRequired,
  };
}

export function applyBookableTemplateToForm<T extends Record<string, unknown>>(
  form: T,
  template: BookableTemplate,
): T & BookableServiceFormFields {
  return {
    ...form,
    ...bookableTemplateToServiceFormFields(template),
  };
}

export function bookableTemplateToClipLocalService(template: BookableTemplate): BookableClipLocalService {
  const tintName = template.tier === 'black' ? 'gold' : template.tier === 'green' ? 'emerald' : 'cyan';
  return {
    id: template.id,
    title: template.title,
    subtitle: template.tagline,
    action: template.cta,
    iconName: template.icon,
    tintName,
    priceLabel: `From $${Math.round(template.priceCents / 100)}`,
    amountCents: template.priceCents,
    currency: 'USD',
    source: 'curated',
    category: template.clipCategory,
    activityHighlights: [...template.includedHighlights],
  };
}

export function bookableTemplateToDiscoverProjection(template: BookableTemplate): BookableDiscoverProjection {
  return {
    type: template.discoverType,
    name: template.title,
    serviceCategory: template.category,
    serviceSubtitle: template.tagline,
    ctaText: template.cta,
    price: formatBookablePrice(template.priceCents),
    availableSpots: template.maxGuests,
    features: [...template.includedHighlights],
  };
}

export function listBookableEntityCapabilities(entity: BookableNoun): BookableCapabilityId[] {
  return BOOKABLE_TEMPLATE_CATALOG.entityCapabilities.find((row) => row.entity === entity)?.capabilities ?? [];
}

/** Whether the ontology entity is permitted this capability at all. */
export function entityCanExecute(entity: BookableNoun, capability: BookableCapabilityId): boolean {
  return ENTITY_CAPABILITIES.get(entity)?.has(capability) ?? false;
}

export function getBookableDerivedObject(id: BookableDerivedObjectId): BookableDerivedObject | undefined {
  return BOOKABLE_TEMPLATE_CATALOG.derivedObjects.find((item) => item.id === id);
}

export function listBookableStaffRoles(): BookableStaffRole[] {
  return BOOKABLE_TEMPLATE_CATALOG.staffRoles;
}

export function getBookableStaffRole(id: BookableStaffRoleId): BookableStaffRole | undefined {
  return BOOKABLE_TEMPLATE_CATALOG.staffRoles.find((role) => role.id === id);
}

/** Whether the seat is permitted this capability at all. */
export function staffRoleCan(role: BookableStaffRoleId, capability: BookableCapabilityId): boolean {
  return STAFF_ROLE_CAPABILITIES.get(role)?.has(capability) ?? false;
}

/**
 * A seat acts on behalf of the business, so both must be permitted and the SKU
 * state must still allow it. The door can verify a pass but can never refund,
 * and no seat can outrank the SELLER it works for.
 */
export function canStaffExecute(
  role: BookableStaffRoleId,
  capability: BookableCapabilityId,
  state: BookableSkuState,
  declared: BookableCapabilityId[],
): boolean {
  if (!staffRoleCan(role, capability)) return false;
  return canActorExecute('SELLER', capability, state, declared);
}

export function getBookableSeller(): BookableSeller {
  return BOOKABLE_TEMPLATE_CATALOG.seller;
}

/**
 * The ceiling the business puts on every seat inside it. A suspended seller
 * still honours what it sold, so CHECK_IN and REFUND survive while SELL does not.
 */
export function sellerStateAllows(
  state: BookableSellerState,
  capability: BookableCapabilityId,
): boolean {
  return SELLER_STATE_CAPABILITIES.get(state)?.has(capability) ?? false;
}

export function sellerCanPublish(state: BookableSellerState): boolean {
  return BOOKABLE_TEMPLATE_CATALOG.seller.identity.publishableStates.includes(state);
}

/** A closed business has no console to sign into. */
export function sellerCanUseConsole(state: BookableSellerState): boolean {
  return BOOKABLE_TEMPLATE_CATALOG.seller.identity.consoleStates.includes(state);
}

/** Only an ACTIVE seat grants anything; an unaccepted invite carries nothing. */
export function seatGrants(state: BookableSeatState): boolean {
  return BOOKABLE_TEMPLATE_CATALOG.seller.seats.grantingStates.includes(state);
}

/**
 * A seat's real capability set: the role, narrowed by whatever the business's
 * own state still permits, and empty unless the seat itself is granting.
 */
export function effectiveSeatCapabilities(
  role: BookableStaffRoleId,
  seatState: BookableSeatState,
  sellerState: BookableSellerState,
): BookableCapabilityId[] {
  if (!seatGrants(seatState)) return [];
  return (getBookableStaffRole(role)?.capabilities ?? []).filter((capability) =>
    sellerStateAllows(sellerState, capability),
  );
}

/**
 * Two conditions, and both are load-bearing. Granting is an act of the business,
 * which is what SELL already means for locations and demand, so a shift lead
 * cannot hire. And nobody can hand out a seat equal to or greater than their
 * own, so a manager can never mint an owner. Neither needs a new capability:
 * both fall out of the role capability sets that already exist.
 */
export function canGrantStaffRole(granter: BookableStaffRoleId, target: BookableStaffRoleId): boolean {
  const mine = STAFF_ROLE_CAPABILITIES.get(granter);
  const theirs = STAFF_ROLE_CAPABILITIES.get(target);
  if (!mine || !theirs) return false;
  if (!mine.has('SELL')) return false;
  if (theirs.size >= mine.size) return false;
  for (const capability of theirs) {
    if (!mine.has(capability)) return false;
  }
  return true;
}

export function grantableStaffRoles(granter: BookableStaffRoleId): BookableStaffRoleId[] {
  return BOOKABLE_TEMPLATE_CATALOG.staffRoles
    .map((role) => role.id)
    .filter((role) => canGrantStaffRole(granter, role));
}

/**
 * Seat management is a two-part check like every other operation: the granter
 * must outrank the target, then the seat's own state must allow the move.
 */
export function canRunSeatOperation(options: {
  granter: BookableStaffRoleId;
  target: BookableStaffRoleId;
  operation: BookableSeatOperationId;
  state?: BookableSeatState;
}): boolean {
  const { seats } = BOOKABLE_TEMPLATE_CATALOG.seller;
  const operation = seats.operations.find((item) => item.id === options.operation);
  if (!operation) return false;
  if (!canGrantStaffRole(options.granter, options.target)) return false;
  // The owner seat cannot be removed, because that orphans every SKU it printed.
  if (options.operation === 'REVOKE_SEAT' && options.target === seats.unrevocableRole) return false;
  if (options.operation === 'INVITE_SEAT') return options.state === undefined;
  if (options.state === undefined) return false;
  return operation.from.includes(options.state);
}

export function canRunSellerOperation(
  role: BookableStaffRoleId,
  id: BookableSellerOperationId,
  state: BookableSellerState,
): boolean {
  const operation = BOOKABLE_TEMPLATE_CATALOG.seller.identity.operations.find((item) => item.id === id);
  if (!operation) return false;
  // A platform transition is never reachable from a vendor seat.
  if (operation.actor !== 'seller') return false;
  if (operation.requiresRole && operation.requiresRole !== role) return false;
  return operation.from.includes(state);
}

/** What is still missing before the business can reach a given state. */
export function unmetSellerRequirements(
  target: BookableSellerState,
  satisfied: string[],
): BookableSellerRequirement[] {
  const met = new Set(satisfied);
  return BOOKABLE_TEMPLATE_CATALOG.seller.identity.requirements.filter(
    (requirement) => requirement.blocks === target && !met.has(requirement.id),
  );
}

export function listDiscoverCategories(options?: { includeVendorGated?: boolean }): BookableDiscoverCategory[] {
  const categories = BOOKABLE_TEMPLATE_CATALOG.discoverCategories;
  if (options?.includeVendorGated) return categories;
  // Vendor-gated rails are hidden from a consumer-only build.
  return categories.filter((category) => !category.vendorGated);
}

export function getDiscoverCategory(id: string): BookableDiscoverCategory | undefined {
  return BOOKABLE_TEMPLATE_CATALOG.discoverCategories.find((category) => category.id === id);
}

/** What a consumer can actually book after tapping a rail. */
export function templatesForDiscoverCategory(id: string): BookableTemplate[] {
  return BOOKABLE_TEMPLATE_CATALOG.templates.filter((template) => template.discoverType === id);
}

/** The rail a published SKU surfaces in, so supply and demand stay reversible. */
export function discoverCategoryForTemplate(templateId: string): BookableDiscoverCategory | undefined {
  const template = getBookableTemplate(templateId);
  if (!template) return undefined;
  return getDiscoverCategory(template.discoverType);
}

export function discoverCategoriesForDomain(domain: BookableDomainId): BookableDiscoverCategory[] {
  return BOOKABLE_TEMPLATE_CATALOG.discoverCategories.filter((category) => category.domains.includes(domain));
}

export function getBookableCatalog(): BookableTemplateCatalog {
  return BOOKABLE_TEMPLATE_CATALOG;
}

export function getBookableAvailability(): BookableAvailability {
  return BOOKABLE_TEMPLATE_CATALOG.availability;
}

/** A Bookable inherits its shape from its domain unless the vendor overrides it. */
export function availabilityDefaultsFor(domain: BookableDomainId): BookableAvailabilityDefaults {
  const { defaults, domainDefaults } = BOOKABLE_TEMPLATE_CATALOG.availability;
  const override = domainDefaults.find((item) => item.domain === domain);
  if (!override) return defaults;
  return {
    slotKind: override.slotKind,
    slotMinutes: override.slotMinutes,
    leadTimeMins: override.leadTimeMins,
    horizonDays: override.horizonDays,
    maxQuantityPerSlot: defaults.maxQuantityPerSlot,
  };
}

/** One slot's worth of capacity. Committed counts RESERVED plus CONFIRMED SKUs. */
export interface BookableSlotCapacity {
  quantity: number;
  committed: number;
  blocked?: boolean;
  closed?: boolean;
}

/**
 * How many SKUs the slot can still print. An expiring hold lowers committed,
 * which is what returns capacity instead of stranding it.
 */
export function remainingInSlot(slot: BookableSlotCapacity): number {
  return Math.max(0, slot.quantity - slot.committed);
}

/**
 * Slot state is derived, never stored, so capacity and state can never
 * disagree. Blocked outranks full because a vendor closing a slot has to win
 * over demand.
 */
export function resolveSlotState(
  slot: BookableSlotCapacity & { startsAt?: Date },
  now: Date = new Date(),
): BookableSlotState {
  if (slot.startsAt && slot.startsAt.getTime() <= now.getTime()) return 'PASSED';
  if (slot.blocked) return 'BLOCKED';
  if (slot.closed) return 'CLOSED';
  return remainingInSlot(slot) > 0 ? 'OPEN' : 'FULL';
}

/** The oversell guard. Capacity is all that stands between a vendor and a double booking. */
export function canCommitToSlot(slot: BookableSlotCapacity & { startsAt?: Date }, now?: Date): boolean {
  return resolveSlotState(slot, now) === 'OPEN';
}

/** Quantity can be raised freely but never below what is already sold. */
export function minimumQuantityForSlot(slot: BookableSlotCapacity): number {
  return slot.committed;
}

export function canSetSlotQuantity(slot: BookableSlotCapacity, next: number): boolean {
  const { maxQuantityPerSlot } = BOOKABLE_TEMPLATE_CATALOG.availability.defaults;
  if (!Number.isInteger(next) || next < 0 || next > maxQuantityPerSlot) return false;
  return next >= minimumQuantityForSlot(slot);
}

export function getAvailabilityOperation(
  id: BookableAvailabilityOperationId,
): BookableAvailabilityOperation | undefined {
  return BOOKABLE_TEMPLATE_CATALOG.availability.operations.find((operation) => operation.id === id);
}

/**
 * A vendor operation needs the seat to hold the capability and the slot to be
 * in a state the operation accepts, the same two-part check the SKU machine uses.
 */
export function canRunAvailabilityOperation(
  role: BookableStaffRoleId,
  id: BookableAvailabilityOperationId,
  state: BookableSlotState,
): boolean {
  const operation = getAvailabilityOperation(id);
  if (!operation) return false;
  if (!staffRoleCan(role, operation.requiresCapability)) return false;
  return operation.from.includes(state);
}

export function getBookableLocations(): BookableLocations {
  return BOOKABLE_TEMPLATE_CATALOG.locations;
}

export function getBookableDemand(): BookableDemand {
  return BOOKABLE_TEMPLATE_CATALOG.demand;
}

export function getLocationKind(id: BookableLocationKindId): BookableLocationKind | undefined {
  return BOOKABLE_TEMPLATE_CATALOG.locations.kinds.find((kind) => kind.id === id);
}

/** The first kind is the default the wizard offers. */
export function locationKindsForDomain(domain: BookableDomainId): BookableLocationKind[] {
  const row = BOOKABLE_TEMPLATE_CATALOG.locations.domainKinds.find((item) => item.domain === domain);
  const ids = row?.kinds ?? [BOOKABLE_TEMPLATE_CATALOG.locations.defaults.kind];
  return ids.map((id) => getLocationKind(id)).filter((kind): kind is BookableLocationKind => Boolean(kind));
}

/** Who travels is a property of the location, not of the domain. */
export function fulfillmentForLocationKind(id: BookableLocationKindId): BookableFulfillment | undefined {
  return getLocationKind(id)?.fulfillment;
}

/**
 * The cross-check that keeps timing and geography honest: a dispatch ETA is only
 * meaningful when the vendor is the one moving.
 */
export function etaKindAllowsFulfillment(etaKind: BookableEtaKind, fulfillment: BookableFulfillment): boolean {
  const row = BOOKABLE_TEMPLATE_CATALOG.locations.etaKindFulfillment.find((item) => item.etaKind === etaKind);
  if (!row) return false;
  return row.requires === 'any' || row.requires === fulfillment;
}

/** Inventory cannot be published from a location that is not live. */
export function locationCanPublish(state: BookableLocationState): boolean {
  return BOOKABLE_TEMPLATE_CATALOG.locations.publishableStates.includes(state);
}

export function canRunLocationOperation(
  role: BookableStaffRoleId,
  id: BookableLocationOperationId,
  state: BookableLocationState,
): boolean {
  const operation = BOOKABLE_TEMPLATE_CATALOG.locations.operations.find((item) => item.id === id);
  if (!operation) return false;
  if (!staffRoleCan(role, operation.requiresCapability)) return false;
  return operation.from.includes(state);
}

export function isDemandActionable(state: BookableDemandState): boolean {
  return BOOKABLE_TEMPLATE_CATALOG.demand.actionableStates.includes(state);
}

export function nextDemandStates(from: BookableDemandState): BookableDemandState[] {
  return BOOKABLE_TEMPLATE_CATALOG.demand.transitions.find((row) => row.from === from)?.to ?? [];
}

export function canRunDemandOperation(
  role: BookableStaffRoleId,
  id: BookableDemandOperationId,
  state: BookableDemandState,
): boolean {
  const operation = BOOKABLE_TEMPLATE_CATALOG.demand.operations.find((item) => item.id === id);
  if (!operation) return false;
  if (!staffRoleCan(role, operation.requiresCapability)) return false;
  return operation.from.includes(state);
}

export function matchRule(id: BookableMatchRuleId): BookableMatchRule | undefined {
  return BOOKABLE_TEMPLATE_CATALOG.demand.matchRules.find((rule) => rule.id === id);
}

export function canExecuteSkuCapability(
  state: BookableSkuState,
  capability: BookableCapabilityId,
  declared: BookableCapabilityId[],
): boolean {
  if (!declared.includes(capability)) return false;
  if (state === 'CANCELLED' || state === 'COMPLETED' || state === 'NO_SHOW') return false;
  if (capability === 'PUBLISH') return state === 'DRAFT';
  if (capability === 'RESERVE' || capability === 'RSVP') return state === 'PUBLISHED';
  if (capability === 'BOOK' || capability === 'PAY' || capability === 'BUY') {
    return state === 'PUBLISHED' || state === 'RESERVED';
  }
  if (capability === 'CHECK_IN' || capability === 'VERIFY') return state === 'CONFIRMED';
  if (capability === 'CANCEL' || capability === 'REFUND') {
    return state === 'PUBLISHED' || state === 'RESERVED' || state === 'CONFIRMED' || state === 'CHECKED_IN';
  }
  if (capability === 'INVITE' || capability === 'SHARE' || capability === 'SCHEDULE') {
    return state === 'PUBLISHED' || state === 'RESERVED' || state === 'CONFIRMED';
  }
  return false;
}

/**
 * ACTOR -> ACTION -> TARGET -> CAPABILITY. The actor must be permitted the
 * capability and the SKU must be in a state that allows it, so a PERSON can
 * never PUBLISH and a SELLER can never RSVP.
 */
export function canActorExecute(
  actor: BookableNoun,
  capability: BookableCapabilityId,
  state: BookableSkuState,
  declared: BookableCapabilityId[],
): boolean {
  if (!entityCanExecute(actor, capability)) return false;
  return canExecuteSkuCapability(state, capability, declared);
}

export function nextSkuStates(from: BookableSkuState): BookableSkuState[] {
  return BOOKABLE_TEMPLATE_CATALOG.skuTransitions.find((row) => row.from === from)?.to ?? [];
}

export function canTransitionSku(from: BookableSkuState, to: BookableSkuState): boolean {
  return nextSkuStates(from).includes(to);
}

/** null when the template holds no inventory, so there is nothing to expire. */
export function bookableHoldExpiresAtMs(template: BookableTemplate, reservedAtMs: number): number | null {
  if (template.timing.holdSecs <= 0) return null;
  return reservedAtMs + template.timing.holdSecs * 1000;
}

/** An expired hold returns the SKU to PUBLISHED, not CANCELLED. */
export function bookableHoldStateAt(
  template: BookableTemplate,
  reservedAtMs: number,
  nowMs: number,
): Extract<BookableSkuState, 'RESERVED' | 'PUBLISHED'> {
  const expiresAt = bookableHoldExpiresAtMs(template, reservedAtMs);
  if (expiresAt === null) return 'RESERVED';
  return nowMs >= expiresAt ? 'PUBLISHED' : 'RESERVED';
}

export function assertBookableTemplateCatalog(input: BookableTemplateCatalog = BOOKABLE_TEMPLATE_CATALOG): string[] {
  const errors: string[] = [];
  if (input.id !== 'bytspot.bookable-templates') errors.push('catalog id must be bytspot.bookable-templates');
  if (input.native.decodeKeyStrategy !== 'useDefaultKeys') {
    errors.push('native.decodeKeyStrategy must be useDefaultKeys so Swift Codable and Kotlin serialization share camelCase keys');
  }
  if (input.native.swiftType !== 'BookableTemplateCatalog' || input.native.kotlinType !== 'BookableTemplateCatalog') {
    errors.push('native Swift and Kotlin types must both be BookableTemplateCatalog');
  }

  for (const tier of ['black', 'platinum', 'green'] as BookableServiceTier[]) {
    if (typeof input.tierFloors?.[tier] !== 'number') errors.push(`tierFloors is missing ${tier}`);
    if (!input.tierCategories?.[tier]?.length) errors.push(`tierCategories is missing ${tier}`);
  }
  const reservedTransitions = input.skuTransitions.find((row) => row.from === 'RESERVED')?.to ?? [];
  if (!reservedTransitions.includes('PUBLISHED')) {
    errors.push('skuTransitions must allow RESERVED -> PUBLISHED so an expired hold returns to inventory');
  }

  if (input.coreNouns.includes('PASS' as BookableNoun)) {
    errors.push('PASS is issued by an action, so it belongs in derivedObjects and not coreNouns');
  }
  const objectIds = new Set<string>([...input.coreNouns, ...input.derivedObjects.map((item) => item.id)]);
  for (const capability of input.capabilities) {
    for (const target of capability.appliesTo) {
      if (!objectIds.has(target)) errors.push(`capability ${capability.id} applies to unknown object ${target}`);
    }
  }
  for (const derived of input.derivedObjects) {
    if (!derived.states.length) errors.push(`derived object ${derived.id} must declare states`);
    for (const capability of [...derived.issuedBy, ...derived.consumedBy]) {
      if (!CAPABILITY_IDS.has(capability)) errors.push(`derived object ${derived.id} references unknown capability ${capability}`);
    }
    for (const noun of derived.issuedFrom) {
      if (!NOUNS.has(noun)) errors.push(`derived object ${derived.id} is issued from unknown noun ${noun}`);
    }
  }

  const claimedByEntity = new Set<BookableCapabilityId>();
  const seenEntities = new Set<BookableNoun>();
  for (const row of input.entityCapabilities) {
    if (seenEntities.has(row.entity)) errors.push(`duplicate entityCapabilities row for ${row.entity}`);
    seenEntities.add(row.entity);
    if (!NOUNS.has(row.entity)) errors.push(`entityCapabilities entity ${row.entity} is not a core noun`);
    if (!row.capabilities.length) errors.push(`entityCapabilities ${row.entity} must declare capabilities`);
    for (const capability of row.capabilities) {
      if (!CAPABILITY_IDS.has(capability)) errors.push(`entityCapabilities ${row.entity} unknown capability ${capability}`);
      claimedByEntity.add(capability);
    }
  }
  for (const capability of input.capabilities) {
    if (!claimedByEntity.has(capability.id)) {
      errors.push(`capability ${capability.id} is unreachable: no entity declares it`);
    }
  }
  const entityDeclares = (entity: BookableNoun, capability: BookableCapabilityId) =>
    input.entityCapabilities.find((row) => row.entity === entity)?.capabilities.includes(capability) ?? false;
  if (!entityDeclares('SELLER', 'PUBLISH')) errors.push('SELLER must be able to PUBLISH inventory');
  if (entityDeclares('PERSON', 'PUBLISH')) errors.push('PERSON must not be able to PUBLISH inventory');

  const sellerCapabilities = new Set(
    input.entityCapabilities.find((row) => row.entity === 'SELLER')?.capabilities ?? [],
  );
  const seenRoles = new Set<BookableStaffRoleId>();
  for (const role of input.staffRoles) {
    if (seenRoles.has(role.id)) errors.push(`duplicate staff role ${role.id}`);
    seenRoles.add(role.id);
    if (!role.capabilities.length) errors.push(`staff role ${role.id} must declare capabilities`);
    if (role.scope !== 'all' && role.scope !== 'assigned') errors.push(`staff role ${role.id} unknown scope ${role.scope}`);
    for (const capability of role.capabilities) {
      if (!CAPABILITY_IDS.has(capability)) errors.push(`staff role ${role.id} unknown capability ${capability}`);
      if (!sellerCapabilities.has(capability)) {
        errors.push(`staff role ${role.id} declares ${capability}, which SELLER cannot do`);
      }
    }
  }
  if (!seenRoles.has('owner')) errors.push('staffRoles must include owner');
  const owner = input.staffRoles.find((role) => role.id === 'owner');
  for (const capability of sellerCapabilities) {
    if (!owner?.capabilities.includes(capability)) errors.push(`owner must hold every SELLER capability, missing ${capability}`);
  }
  const door = input.staffRoles.find((role) => role.id === 'door');
  if (door?.capabilities.includes('REFUND')) errors.push('door must never be able to REFUND');
  if (!door?.capabilities.includes('VERIFY')) errors.push('door must be able to VERIFY a pass');

  const { identity, seats } = input.seller;
  if (input.seller.noun !== 'SELLER') errors.push('seller must be the SELLER noun, not a new one');
  assertMachine('seller', identity.states, identity.transitions, identity.terminalStates, errors);
  assertMachine('seat', seats.states, seats.transitions, seats.terminalStates, errors);

  // A business that is not live must not be able to back published inventory.
  if (identity.publishableStates.length !== 1 || identity.publishableStates[0] !== 'ACTIVE') {
    errors.push('only an ACTIVE seller may back published inventory');
  }
  for (const state of identity.terminalStates) {
    if (identity.consoleStates.includes(state)) errors.push(`closed seller ${state} must not keep console access`);
  }

  const sellerStates = new Set(identity.states);
  const ceilings = new Map<BookableSellerState, Set<BookableCapabilityId>>();
  for (const row of identity.stateCapabilities) {
    if (!sellerStates.has(row.state)) errors.push(`stateCapabilities names unknown seller state ${row.state}`);
    ceilings.set(row.state, new Set(row.allows));
    for (const capability of row.allows) {
      if (!sellerCapabilities.has(capability)) {
        errors.push(`seller state ${row.state} allows ${capability}, which SELLER cannot do`);
      }
    }
  }
  for (const state of identity.states) {
    if (!ceilings.has(state)) errors.push(`seller state ${state} declares no capability ceiling`);
  }
  // The ceiling is what makes a seat a subset of the business, so it has to bite.
  const active = ceilings.get('ACTIVE') ?? new Set();
  for (const capability of sellerCapabilities) {
    if (!active.has(capability)) errors.push(`an ACTIVE seller must allow ${capability}`);
  }
  for (const [state, allows] of ceilings) {
    if (state === 'ACTIVE') continue;
    for (const capability of allows) {
      if (!active.has(capability)) errors.push(`seller state ${state} allows ${capability} that ACTIVE does not`);
    }
  }
  const suspended = ceilings.get('SUSPENDED') ?? new Set();
  // Suspension must stop new business without abandoning what was already sold.
  for (const capability of ['SELL', 'PUBLISH'] as BookableCapabilityId[]) {
    if (suspended.has(capability)) errors.push(`a SUSPENDED seller must not be able to ${capability}`);
  }
  for (const capability of ['CHECK_IN', 'VERIFY', 'REFUND'] as BookableCapabilityId[]) {
    if (!suspended.has(capability)) errors.push(`a SUSPENDED seller must still be able to ${capability}`);
  }
  if ((ceilings.get('CLOSED') ?? new Set()).size > 0) errors.push('a CLOSED seller must allow nothing');
  for (const state of ['DRAFT', 'PENDING'] as BookableSellerState[]) {
    if ((ceilings.get(state) ?? new Set()).has('SELL')) errors.push(`a ${state} seller must not be able to SELL`);
  }

  for (const requirement of identity.requirements) {
    if (!sellerStates.has(requirement.blocks)) {
      errors.push(`requirement ${requirement.id} blocks unknown seller state ${requirement.blocks}`);
    }
    if (!requirement.label) errors.push(`requirement ${requirement.id} needs a label a vendor can read`);
  }
  if (!identity.requirements.some((requirement) => requirement.blocks === 'ACTIVE')) {
    errors.push('going live must require something, or approval means nothing');
  }

  for (const operation of identity.operations) {
    if (operation.actor !== 'seller' && operation.actor !== 'platform') {
      errors.push(`seller operation ${operation.id} has unknown actor ${operation.actor}`);
    }
    // A vendor seat must never be able to approve or reinstate its own business.
    if (operation.to === 'ACTIVE' && operation.actor !== 'platform') {
      errors.push(`seller operation ${operation.id} makes a business live without the platform`);
    }
    if (operation.actor === 'seller' && operation.requiresRole !== 'owner') {
      errors.push(`seller operation ${operation.id} must be owner-only`);
    }
    for (const from of operation.from) {
      const row = identity.transitions.find((item) => item.from === from);
      if (!row?.to.includes(operation.to)) {
        errors.push(`seller operation ${operation.id} moves ${from} -> ${operation.to}, which is not a transition`);
      }
    }
  }

  if (seats.grantsFrom !== 'staffRoles') errors.push('seats must grant from staffRoles, not a parallel role list');
  if (!seenRoles.has(seats.soleRole)) errors.push(`seats.soleRole ${seats.soleRole} is not a staff role`);
  if (seats.unrevocableRole !== 'owner') errors.push('the owner seat is the one that must not be revocable');
  if (seats.grantingStates.length !== 1 || seats.grantingStates[0] !== 'ACTIVE') {
    errors.push('only an ACTIVE seat may grant capability');
  }
  for (const state of seats.terminalStates) {
    if (seats.grantingStates.includes(state)) errors.push(`revoked seat ${state} must not grant capability`);
  }
  if (seats.inviteExpiryHours <= 0) errors.push('an invite must expire');

  const seatStates = new Set(seats.states);
  for (const operation of seats.operations) {
    if (!seatStates.has(operation.to)) errors.push(`seat operation ${operation.id} moves to unknown state ${operation.to}`);
    for (const from of operation.from) {
      const row = seats.transitions.find((item) => item.from === from);
      if (!row?.to.includes(operation.to)) {
        errors.push(`seat operation ${operation.id} moves ${from} -> ${operation.to}, which is not a transition`);
      }
    }
  }
  // An invite creates the seat, so it is the only operation with no prior state.
  const invite = seats.operations.find((operation) => operation.id === 'INVITE_SEAT');
  if (invite && invite.from.length > 0) errors.push('INVITE_SEAT creates a seat and so has no prior state');
  if (invite && invite.to !== 'INVITED') errors.push('INVITE_SEAT must produce an INVITED seat, not an active one');

  // Nobody may mint a peer or a superior. Granting also needs SELL, so a role
  // that cannot act as the business cannot hire, and both conditions are read
  // straight off the capability sets rather than tracked separately.
  for (const role of input.staffRoles) {
    const mine = new Set(role.capabilities);
    const grantable = mine.has('SELL')
      ? input.staffRoles.filter(
          (target) =>
            target.capabilities.length < mine.size &&
            target.capabilities.every((capability) => mine.has(capability)),
        )
      : [];
    if (role.id !== 'owner' && grantable.some((target) => target.id === 'owner')) {
      errors.push(`staff role ${role.id} can grant owner, which escalates`);
    }
    if (role.id === 'owner' && grantable.length === 0) {
      errors.push('owner must be able to grant at least one seat, or no business can hire');
    }
  }

  const domainIds = new Set(input.domains.map((domain) => domain.id));
  const seenTemplateIds = new Set<string>();

  const declaredDomainIds = Object.keys(DOMAIN_ID_GUARD) as BookableDomainId[];
  for (const domain of domainIds) {
    if (!declaredDomainIds.includes(domain)) errors.push(`domain ${domain} is missing from BookableDomainId`);
  }
  for (const domain of declaredDomainIds) {
    if (!domainIds.has(domain)) errors.push(`BookableDomainId declares ${domain}, which the catalog does not define`);
  }

  const availability = input.availability;
  const slotStates = new Set(availability.slotStates);
  const slotKinds = new Set(availability.slotKinds);
  for (const expected of ['CLOSED', 'OPEN', 'FULL', 'BLOCKED', 'PASSED'] as BookableSlotState[]) {
    if (!slotStates.has(expected)) errors.push(`availability is missing slot state ${expected}`);
  }

  const slotFrom = new Set<BookableSlotState>();
  for (const transition of availability.slotTransitions) {
    if (!slotStates.has(transition.from)) errors.push(`unknown slot state ${transition.from}`);
    slotFrom.add(transition.from);
    for (const to of transition.to) {
      if (!slotStates.has(to)) errors.push(`unknown slot transition target ${to}`);
    }
  }
  for (const state of slotStates) {
    if (!slotFrom.has(state)) errors.push(`slot state ${state} declares no transitions`);
  }
  // Time only moves one way, so a passed slot can never reopen.
  const passed = availability.slotTransitions.find((transition) => transition.from === 'PASSED');
  if (passed?.to.length) errors.push('PASSED must be terminal: a slot cannot reopen after its time');
  for (const transition of availability.slotTransitions) {
    if (transition.from !== 'PASSED' && !transition.to.includes('PASSED')) {
      errors.push(`slot state ${transition.from} must be able to reach PASSED`);
    }
  }

  const seenOperations = new Set<BookableAvailabilityOperationId>();
  for (const operation of availability.operations) {
    if (seenOperations.has(operation.id)) errors.push(`duplicate availability operation ${operation.id}`);
    seenOperations.add(operation.id);
    if (!CAPABILITY_IDS.has(operation.requiresCapability)) {
      errors.push(`availability operation ${operation.id} needs a known capability`);
    }
    if (!operation.from.length) errors.push(`availability operation ${operation.id} must accept a state`);
    for (const state of operation.from) {
      if (!slotStates.has(state)) errors.push(`availability operation ${operation.id} unknown from state ${state}`);
    }
    if (operation.to !== null) {
      if (!slotStates.has(operation.to)) {
        errors.push(`availability operation ${operation.id} unknown to state ${operation.to}`);
      }
      // An operation that moves a slot somewhere the state machine forbids
      // would let the calendar drift out of the ontology.
      for (const state of operation.from) {
        const allowed = availability.slotTransitions.find((transition) => transition.from === state);
        if (!allowed?.to.includes(operation.to)) {
          errors.push(`availability operation ${operation.id} moves ${state} to ${operation.to}, which is not a slot transition`);
        }
      }
    }
  }
  // Every scheduling operation must be a SELLER capability, or no seat could run it.
  for (const operation of availability.operations) {
    if (!entityDeclares('SELLER', operation.requiresCapability)) {
      errors.push(`availability operation ${operation.id} requires ${operation.requiresCapability}, which SELLER cannot do`);
    }
  }

  const { defaults, domainDefaults } = availability;
  if (!slotKinds.has(defaults.slotKind)) errors.push(`availability defaults use unknown slotKind ${defaults.slotKind}`);
  for (const [key, value] of Object.entries(defaults)) {
    if (key === 'slotKind') continue;
    if (!Number.isInteger(value) || (value as number) < 1) errors.push(`availability defaults ${key} must be a positive integer`);
  }
  const seenDomainDefaults = new Set<BookableDomainId>();
  for (const override of domainDefaults) {
    if (seenDomainDefaults.has(override.domain)) errors.push(`duplicate availability default for ${override.domain}`);
    seenDomainDefaults.add(override.domain);
    if (!domainIds.has(override.domain)) errors.push(`availability default points at unknown domain ${override.domain}`);
    if (!slotKinds.has(override.slotKind)) errors.push(`availability default ${override.domain} unknown slotKind ${override.slotKind}`);
    if (override.slotMinutes < 1) errors.push(`availability default ${override.domain} needs a positive slotMinutes`);
    if (override.slotKind === 'daily' && override.slotMinutes !== 1440) {
      errors.push(`availability default ${override.domain} is daily so slotMinutes must be 1440`);
    }
  }

  const locations = input.locations;
  const locationStates = new Set<BookableLocationState>(locations.states);
  const locationKindIds = new Set<BookableLocationKindId>();
  const fulfillments = new Set(locations.fulfillments);

  // A Location must stay a PIN a SELLER holds. The moment it becomes its own
  // core noun, geography stops being the same thing the guest is sent to.
  if (locations.derivesFrom !== 'PIN') errors.push(`locations must derive from PIN, not ${locations.derivesFrom}`);
  if (locations.heldBy !== 'SELLER') errors.push(`locations must be held by SELLER, not ${locations.heldBy}`);

  for (const kind of locations.kinds) {
    if (locationKindIds.has(kind.id)) errors.push(`duplicate location kind ${kind.id}`);
    locationKindIds.add(kind.id);
    if (!fulfillments.has(kind.fulfillment)) errors.push(`location kind ${kind.id} unknown fulfillment ${kind.fulfillment}`);
    if (!kind.question.trim()) errors.push(`location kind ${kind.id} needs a question a vendor can answer`);
    // Travelling to a guest without a radius is an unbounded promise.
    if (kind.fulfillment === 'vendorTravels' && !kind.requiresRadius) {
      errors.push(`location kind ${kind.id} travels to the guest so it must require a radius`);
    }
  }
  if (!locationKindIds.has(locations.defaults.kind as BookableLocationKindId)) {
    errors.push(`locations default kind ${locations.defaults.kind} is not a declared kind`);
  }
  if (locations.defaults.radiusMiles > locations.defaults.maxRadiusMiles) {
    errors.push('locations default radius exceeds the maximum radius');
  }
  for (const state of locations.publishableStates) {
    if (!locationStates.has(state)) errors.push(`locations publishable state ${state} is not a declared state`);
  }
  if (locations.publishableStates.includes('DRAFT') || locations.publishableStates.includes('CLOSED')) {
    errors.push('a draft or closed location must not be able to back published inventory');
  }
  assertMachine('location', locations.states, locations.transitions, ['CLOSED'], errors);
  for (const operation of locations.operations) {
    if (!CAPABILITY_IDS.has(operation.requiresCapability)) {
      errors.push(`location operation ${operation.id} unknown capability ${operation.requiresCapability}`);
    }
    if (!entityDeclares('SELLER', operation.requiresCapability)) {
      errors.push(`location operation ${operation.id} requires ${operation.requiresCapability}, which SELLER cannot do`);
    }
    for (const from of operation.from) {
      if (!locationStates.has(from)) errors.push(`location operation ${operation.id} unknown from-state ${from}`);
      if (!locations.transitions.find((row) => row.from === from)?.to.includes(operation.to)) {
        errors.push(`location operation ${operation.id} moves ${from} to ${operation.to}, which is not a location transition`);
      }
    }
  }

  const seenEtaFulfillment = new Set<BookableEtaKind>();
  for (const row of locations.etaKindFulfillment) {
    if (seenEtaFulfillment.has(row.etaKind)) errors.push(`duplicate etaKindFulfillment for ${row.etaKind}`);
    seenEtaFulfillment.add(row.etaKind);
    if (!input.etaKinds.includes(row.etaKind)) errors.push(`etaKindFulfillment names unknown etaKind ${row.etaKind}`);
    if (row.requires !== 'any' && !fulfillments.has(row.requires)) {
      errors.push(`etaKindFulfillment ${row.etaKind} unknown fulfillment ${row.requires}`);
    }
  }
  for (const etaKind of input.etaKinds) {
    if (!seenEtaFulfillment.has(etaKind)) errors.push(`etaKind ${etaKind} has no declared fulfillment`);
  }

  const seenDomainKinds = new Set<BookableDomainId>();
  for (const row of locations.domainKinds) {
    if (seenDomainKinds.has(row.domain)) errors.push(`duplicate location kinds for domain ${row.domain}`);
    seenDomainKinds.add(row.domain);
    if (!domainIds.has(row.domain)) errors.push(`location kinds point at unknown domain ${row.domain}`);
    if (!row.kinds.length) errors.push(`domain ${row.domain} needs at least one location kind`);
    for (const kind of row.kinds) {
      if (!locationKindIds.has(kind)) errors.push(`domain ${row.domain} points at unknown location kind ${kind}`);
    }
  }
  for (const domain of domainIds) {
    // A domain with no location kind cannot answer "where?", so it cannot publish.
    if (!seenDomainKinds.has(domain)) errors.push(`domain ${domain} has no location kind and so cannot say where it is`);
  }

  const demand = input.demand;
  const demandStates = new Set<BookableDemandState>(demand.states);
  if (demand.raisedBy !== 'PERSON') errors.push(`demand must be raised by PERSON, not ${demand.raisedBy}`);
  if (demand.answeredBy !== 'SELLER') errors.push(`demand must be answered by SELLER, not ${demand.answeredBy}`);
  // Demand that resolves to anything but a SKU would be a second booking path.
  if (demand.resolvesTo !== 'SKU') errors.push(`demand must resolve to a SKU, not ${demand.resolvesTo}`);
  assertMachine('demand', demand.states, demand.transitions, demand.terminalStates, errors);
  for (const state of demand.actionableStates) {
    if (!demandStates.has(state)) errors.push(`demand actionable state ${state} is not a declared state`);
    if (demand.terminalStates.includes(state)) errors.push(`demand state ${state} cannot be both terminal and actionable`);
  }
  for (const operation of demand.operations) {
    if (!CAPABILITY_IDS.has(operation.requiresCapability)) {
      errors.push(`demand operation ${operation.id} unknown capability ${operation.requiresCapability}`);
    }
    if (!entityDeclares('SELLER', operation.requiresCapability)) {
      errors.push(`demand operation ${operation.id} requires ${operation.requiresCapability}, which SELLER cannot do`);
    }
    for (const from of operation.from) {
      if (!demandStates.has(from)) errors.push(`demand operation ${operation.id} unknown from-state ${from}`);
      if (!demand.transitions.find((row) => row.from === from)?.to.includes(operation.to)) {
        errors.push(`demand operation ${operation.id} moves ${from} to ${operation.to}, which is not a demand transition`);
      }
    }
  }
  const seenRuleIds = new Set<BookableMatchRuleId>();
  for (const rule of demand.matchRules) {
    if (seenRuleIds.has(rule.id)) errors.push(`duplicate match rule ${rule.id}`);
    seenRuleIds.add(rule.id);
    // The reason is what the vendor reads, so an empty one loses the signal.
    if (!rule.missReason.trim()) errors.push(`match rule ${rule.id} needs a reason a vendor can act on`);
  }
  // Capacity is the rule that reads availability, so a match without it would be
  // a category guess dressed up as an answer.
  if (!seenRuleIds.has('capacity')) errors.push('demand matching must include the capacity rule');
  if (demand.matchRules[demand.matchRules.length - 1]?.id !== 'capacity') {
    errors.push('the capacity rule must be evaluated last');
  }
  if (demand.defaults.radiusMiles > demand.defaults.maxRadiusMiles) {
    errors.push('demand default radius exceeds the maximum radius');
  }
  for (const [key, value] of Object.entries(demand.defaults)) {
    if (!Number.isInteger(value) || value < 1) errors.push(`demand defaults ${key} must be a positive integer`);
  }

  const seenCategoryIds = new Set<string>();
  const reachableDomains = new Set<BookableDomainId>();
  for (const category of input.discoverCategories) {
    if (seenCategoryIds.has(category.id)) errors.push(`duplicate discover category ${category.id}`);
    seenCategoryIds.add(category.id);
    if (!category.domains.length) errors.push(`discover category ${category.id} must map to a domain`);
    if (!Number.isInteger(category.minimumFeedCount) || category.minimumFeedCount < 1) {
      errors.push(`discover category ${category.id} needs a minimumFeedCount of at least 1`);
    }
    if (!category.label.trim() || !category.cta.trim()) {
      errors.push(`discover category ${category.id} needs a label and a CTA`);
    }
    for (const domain of category.domains) {
      if (!domainIds.has(domain)) errors.push(`discover category ${category.id} points at unknown domain ${domain}`);
      reachableDomains.add(domain);
    }
    // A rail with no bookable inventory is a tab that goes nowhere.
    if (!input.templates.some((template) => template.discoverType === category.id)) {
      errors.push(`discover category ${category.id} resolves to no bookable inventory`);
    }
  }
  for (const domain of domainIds) {
    // Supply a consumer cannot reach is supply a vendor published for nothing.
    if (!reachableDomains.has(domain)) errors.push(`domain ${domain} is not reachable from any discover category`);
  }

  for (const domain of input.domains) {
    if (!NOUNS.has(domain.noun)) errors.push(`domain ${domain.id} uses unknown noun ${domain.noun}`);
  }

  for (const template of input.templates) {
    if (seenTemplateIds.has(template.id)) errors.push(`duplicate template id ${template.id}`);
    seenTemplateIds.add(template.id);
    if (!domainIds.has(template.domain)) errors.push(`${template.id} domain ${template.domain} is not in domains`);
    if (!NOUNS.has(template.noun)) errors.push(`${template.id} uses unknown noun ${template.noun}`);
    const domain = input.domains.find((item) => item.id === template.domain);
    if (domain && !domain.variants.includes(template.schema)) {
      errors.push(`${template.id} schema ${template.schema} is not a ${template.domain} variant`);
    }
    if (!seenCategoryIds.has(template.discoverType)) {
      errors.push(`${template.id} discoverType ${template.discoverType} is not a discover category`);
    } else {
      const category = input.discoverCategories.find((item) => item.id === template.discoverType);
      // The round trip must close: the rail that shows a SKU has to claim the
      // domain that produced it.
      if (category && !category.domains.includes(template.domain)) {
        errors.push(`${template.id} surfaces in ${template.discoverType}, which does not claim domain ${template.domain}`);
      }
    }

    const allowedCategories = input.tierCategories[template.tier] ?? [];
    if (!allowedCategories.includes(template.category)) {
      errors.push(`${template.id} category ${template.category} is not valid for ${template.tier}`);
    }
    if (template.priceCents <= 0) errors.push(`${template.id} must publish a price greater than 0`);
    if (template.durationMins < 15) errors.push(`${template.id} duration must be at least 15 minutes`);
    if (template.maxGuests < 1) errors.push(`${template.id} maxGuests must be at least 1`);

    const resolvedTier = resolveBookableTier({ priceCents: template.priceCents, category: template.category });
    if (resolvedTier !== template.tier) {
      errors.push(
        `${template.id} declares ${template.tier} but category ${template.category} at ${template.priceCents} resolves to ${resolvedTier}`,
      );
    }

    const timing = template.timing;
    if (!timing) {
      errors.push(`${template.id} is missing timing`);
      continue;
    }
    if (!ETA_KINDS.has(timing.etaKind)) errors.push(`${template.id} unknown etaKind ${timing.etaKind}`);
    if (!Number.isInteger(timing.holdSecs) || timing.holdSecs < 0) {
      errors.push(`${template.id} holdSecs must be a non-negative integer`);
    }
    if (template.tier === 'green' && (timing.etaLabel.trim() || timing.etaKind !== 'none')) {
      errors.push(`${template.id} Green templates must not dispatch an ETA`);
    }
    if (template.tier !== 'green' && (!timing.etaLabel.trim() || timing.etaKind === 'none')) {
      errors.push(`${template.id} ${template.tier} templates require an ETA label and a concrete etaKind`);
    }
    if (timing.etaKind === 'hold' && timing.holdSecs <= 0) {
      errors.push(`${template.id} etaKind hold requires holdSecs greater than 0`);
    }
    if (template.capabilities.includes('RESERVE') && timing.holdSecs <= 0) {
      errors.push(`${template.id} declares RESERVE so it must set holdSecs`);
    }
    for (const capability of template.capabilities) {
      if (!CAPABILITY_IDS.has(capability)) errors.push(`${template.id} unknown capability ${capability}`);
    }
    if (!template.capabilities.includes('BOOK') && !template.capabilities.includes('RESERVE') && !template.capabilities.includes('RSVP')) {
      errors.push(`${template.id} must declare BOOK, RESERVE, or RSVP`);
    }
  }

  for (const transition of input.skuTransitions) {
    if (!SKU_STATES.has(transition.from)) errors.push(`unknown sku state ${transition.from}`);
    for (const to of transition.to) {
      if (!SKU_STATES.has(to)) errors.push(`unknown sku transition target ${to}`);
    }
  }

  return errors;
}
