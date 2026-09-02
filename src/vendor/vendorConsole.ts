import console_ from '../../contracts/vendor-console.json' with { type: 'json' };
import {
  getBookableLocations,
  getBookableSeller,
  getLocationKind,
  getBookableStaffRole,
  listBookableDomains,
  listBookableTemplates,
  listDiscoverCategories,
  discoverCategoriesForDomain,
  sellerCanUseConsole,
  type BookableDiscoverCategory,
  staffRoleCan,
  type BookableCapabilityId,
  type BookableDomainId,
  type BookableLocationState,
  type BookableLocationKindId,
  type BookableSellerState,
  type BookableStaffRoleId,
  type BookableTemplate,
} from '../utils/bookableTemplates.ts';

export type VendorBusinessMode = 'standard' | 'cottage';

export interface VendorBookableType {
  id: string;
  label: string;
  question: string;
  domain: BookableDomainId;
  variants: string[];
  icon: string;
  cottageDefault?: boolean;
}

export interface VendorNavItem {
  id: string;
  label: string;
  icon: string;
  requiresCapability?: BookableCapabilityId;
  requiresFinancials?: boolean;
  requiresPayouts?: boolean;
  /** For tabs that mint credentials rather than merely read money. */
  requiresOwner?: boolean;
  standardOnly?: boolean;
}

export type VendorAuthStepId = 'email' | 'code' | 'seat' | 'console';

export type VendorAuthRefusalId =
  | 'invalid-code'
  | 'locked'
  | 'rate-limited'
  | 'no-seats'
  | 'expired-session';

export interface VendorAuthContract {
  flow: VendorAuthStepId[];
  steps: { id: VendorAuthStepId; title: string; field: string }[];
  code: { length: number; ttlSecs: number; maxAttempts: number; resendCooldownSecs: number };
  token: {
    accessTtlSecs: number;
    refreshTtlSecs: number;
    refreshBeforeExpirySecs: number;
    accessStorage: 'memory';
    refreshStorage: 'httponly-cookie';
    cookieSameSite: 'Strict';
    cookieSecure: boolean;
  };
  persistableKeys: string[];
  refusals: { id: VendorAuthRefusalId; message: string }[];
}

export type VendorWebhookUiOperationId = 'REGISTER' | 'PAUSE' | 'RESUME' | 'ROTATE';

export interface VendorWebhookUiContract {
  urlScheme: string;
  secretRevealedOnce: boolean;
  operations: {
    id: VendorWebhookUiOperationId;
    label: string;
    from: string[];
    to: string;
  }[];
}

export type VendorOnboardingStepKind = 'text' | 'email' | 'location' | 'payout';

export interface VendorOnboardingStep {
  /** The one requirement this step closes. Requirements and steps are a bijection. */
  requirement: string;
  title: string;
  question: string;
  field: string;
  kind: VendorOnboardingStepKind;
  /** The tab that owns the thing afterwards, if any owns it. */
  managedIn?: string;
  /** What a cottage business gets by default, where the standard tab is hidden. */
  cottageKind?: BookableLocationKindId;
}

export interface VendorOnboardingContract {
  steps: VendorOnboardingStep[];
  states: { state: BookableSellerState; title: string; body: string; checklist: boolean }[];
}

export interface VendorConsoleContract {
  id: string;
  version: number;
  model: {
    chain: string[];
    printer: { config: string; multiplier: string; prints: string };
    fulfillmentIsPassState: string;
    vendorFacingNouns: string[];
  };
  copy: VendorCopy;
  bookableTypes: VendorBookableType[];
  unsupportedTypes: { id: string; label: string; wouldNeed: { domain: string; variant: string } }[];
  navigation: { primary: VendorNavItem[]; secondary: VendorNavItem[] };
  createBookableSteps: { id: string; title: string; field: string }[];
  auth: VendorAuthContract;
  webhookUi: VendorWebhookUiContract;
  onboarding: VendorOnboardingContract;
}

export const VENDOR_CONSOLE = console_ as unknown as VendorConsoleContract;

/**
 * What a seat may see. Financial and payout visibility are separate from
 * capabilities because reading money and moving money are different rights:
 * a manager runs the business without seeing the payout account.
 */
export interface VendorViewer {
  role: BookableStaffRoleId;
  businessMode: VendorBusinessMode;
  /**
   * The seat's effective capabilities once the business's own state has narrowed
   * them. Supplied by a session; without one the role's own list is used, which
   * is the widest a seat could ever be.
   */
  capabilities?: ReadonlySet<BookableCapabilityId>;
}

export function canSeeFinancials(role: BookableStaffRoleId): boolean {
  return role === 'owner' || role === 'manager';
}

export function canManagePayouts(role: BookableStaffRoleId): boolean {
  return role === 'owner';
}

function viewerCan(viewer: VendorViewer, capability: BookableCapabilityId): boolean {
  return viewer.capabilities ? viewer.capabilities.has(capability) : staffRoleCan(viewer.role, capability);
}

function isVisible(item: VendorNavItem, viewer: VendorViewer): boolean {
  if (item.standardOnly && viewer.businessMode === 'cottage') return false;
  if (item.requiresFinancials && !canSeeFinancials(viewer.role)) return false;
  if (item.requiresPayouts && !canManagePayouts(viewer.role)) return false;
  if (item.requiresOwner && viewer.role !== 'owner') return false;
  if (item.requiresCapability && !viewerCan(viewer, item.requiresCapability)) return false;
  return true;
}

export function vendorAuthContract(): VendorAuthContract {
  return VENDOR_CONSOLE.auth;
}

export function vendorAuthMessage(refusal: VendorAuthRefusalId): string {
  return VENDOR_CONSOLE.auth.refusals.find((item) => item.id === refusal)?.message ?? 'Sign-in failed.';
}

export function vendorOnboardingContract(): VendorOnboardingContract {
  return VENDOR_CONSOLE.onboarding;
}

export function vendorWebhookUiContract(): VendorWebhookUiContract {
  return VENDOR_CONSOLE.webhookUi;
}

export function vendorPrimaryNav(viewer: VendorViewer): VendorNavItem[] {
  return VENDOR_CONSOLE.navigation.primary.filter((item) => isVisible(item, viewer));
}

export function vendorSecondaryNav(viewer: VendorViewer): VendorNavItem[] {
  return VENDOR_CONSOLE.navigation.secondary.filter((item) => isVisible(item, viewer));
}

export function vendorLandingView(viewer: VendorViewer): string {
  return vendorPrimaryNav(viewer)[0]?.id ?? 'home';
}

export function listVendorBookableTypes(mode: VendorBusinessMode = 'standard'): VendorBookableType[] {
  const types = VENDOR_CONSOLE.bookableTypes;
  if (mode !== 'cottage') return types;
  // A home baker should not have to scroll past hotel rooms to find their own trade.
  return [...types].sort((a, b) => Number(b.cottageDefault ?? false) - Number(a.cottageDefault ?? false));
}

export function getVendorBookableType(id: string): VendorBookableType | undefined {
  return VENDOR_CONSOLE.bookableTypes.find((type) => type.id === id);
}

/**
 * The starter Bookables for one answer to "what are you selling?". A variant
 * with no preset is not a dead end: the vendor starts blank and fills it in.
 */
export function templatesForBookableType(id: string): BookableTemplate[] {
  const type = getVendorBookableType(id);
  if (!type) return [];
  return listBookableTemplates(type.domain).filter((template) => type.variants.includes(template.schema));
}

/** Variants the vendor can only build from scratch, because no template prints them yet. */
export function blankOnlyVariants(id: string): string[] {
  const type = getVendorBookableType(id);
  if (!type) return [];
  const printed = new Set(templatesForBookableType(id).map((template) => template.schema));
  return type.variants.filter((variant) => !printed.has(variant));
}

export function staffRoleLabel(role: BookableStaffRoleId): string {
  return getBookableStaffRole(role)?.label ?? role;
}

/** The consumer rails a vendor's answer to "what are you selling?" surfaces in. */
export function discoverCategoriesForBookableType(id: string): BookableDiscoverCategory[] {
  const type = getVendorBookableType(id);
  if (!type) return [];
  return discoverCategoriesForDomain(type.domain);
}

/** The vendor answers that can fill a given consumer rail. */
export function bookableTypesForDiscoverCategory(id: string): VendorBookableType[] {
  const category = listDiscoverCategories({ includeVendorGated: true }).find((item) => item.id === id);
  if (!category) return [];
  return VENDOR_CONSOLE.bookableTypes.filter((type) => category.domains.includes(type.domain));
}

/**
 * The words a vendor actually reads.
 *
 * `model.chain` is the engineering vocabulary. It is precise and it is useless
 * on screen: a vendor asked to "configure a bookable" has to learn our data
 * model before they can list a table, and a guest shown "SKU" learns nothing at
 * all. Every id a screen renders passes through here first.
 */
export interface VendorCopy {
  /** Nouns that must never reach visible text. Asserted against the source. */
  internalOnly: string[];
  nouns: Record<string, string>;
  locationStates: Record<string, { label: string; detail: string }>;
}

export function vendorCopy(): VendorCopy {
  return VENDOR_CONSOLE.copy;
}

/**
 * What a vendor is told a place's state means, rather than the state name.
 *
 * `PAUSED` is not "paused" to a vendor; it means guests cannot book right now
 * but the bookings already taken still stand. That distinction is the whole
 * question they are asking when they look at the badge.
 */
export function locationStateCopy(state: BookableLocationState): { label: string; detail: string } {
  return VENDOR_CONSOLE.copy.locationStates[state] ?? { label: state, detail: '' };
}

/** The vendor's word for an internal noun, for copy assembled at runtime. */
export function vendorNoun(internal: string): string {
  return VENDOR_CONSOLE.copy.nouns[internal] ?? internal.toLowerCase();
}

function copyContractErrors(copy: VendorCopy, chain: string[]): string[] {
  const errors: string[] = [];

  // Every link in the chain needs a vendor word, or a screen rendering that
  // step has nothing to fall back on but the internal noun.
  for (const noun of chain) {
    if (!copy.nouns[noun]) errors.push(`no vendor-facing word for ${noun}`);
  }

  // A "translation" that returns the internal word is not a translation.
  for (const [internal, vendorWord] of Object.entries(copy.nouns)) {
    if (vendorWord.toUpperCase() === internal && copy.internalOnly.includes(internal)) {
      errors.push(`${internal} is marked internal but its vendor word is the same`);
    }
    if (!vendorWord.trim()) errors.push(`${internal} has an empty vendor word`);
  }

  for (const state of getBookableLocations().states) {
    const entry = copy.locationStates[state];
    if (!entry) {
      errors.push(`no vendor-facing copy for location state ${state}`);
      continue;
    }
    // The label may legitimately be the state's own word — "Paused" is what a
    // vendor would say. What it must never be is the raw token, and it must
    // always come with what the state actually means for guests, because that
    // is the question the badge is being asked.
    if (entry.label === state) errors.push(`location state ${state} shows the raw token`);
    if (!entry.detail.trim()) errors.push(`location state ${state} has no explanation`);
  }

  return errors;
}

export function assertVendorConsoleContract(input: VendorConsoleContract = VENDOR_CONSOLE): string[] {
  const errors: string[] = [];
  if (input.id !== 'bytspot.vendor-console') errors.push('contract id must be bytspot.vendor-console');

  if (input.model.printer.prints !== 'SKU' || input.model.printer.config !== 'BOOKABLE') {
    errors.push('a Bookable must be the printer and a SKU must be what it prints');
  }
  if (input.model.vendorFacingNouns.includes('SKU')) {
    errors.push('SKU is internal: a vendor is never shown the word');
  }

  const seenTypes = new Set<string>();
  for (const type of input.bookableTypes) {
    if (seenTypes.has(type.id)) errors.push(`duplicate bookable type ${type.id}`);
    seenTypes.add(type.id);
    if (!type.variants.length) errors.push(`bookable type ${type.id} must map to at least one variant`);
    const domain = listBookableDomains().find((item) => item.id === type.domain);
    if (!domain) {
      errors.push(`bookable type ${type.id} points at unknown domain ${type.domain}`);
      continue;
    }
    for (const variant of type.variants) {
      // The variant must exist in the ontology. It does not need a preset:
      // a vendor can always start blank.
      if (!domain.variants.includes(variant)) {
        errors.push(`bookable type ${type.id} offers ${type.domain}.${variant}, which is not a domain variant`);
      }
    }
    if (!templatesForBookableType(type.id).length && !blankOnlyVariants(type.id).length) {
      errors.push(`bookable type ${type.id} can neither print a template nor start blank`);
    }
  }

  for (const type of input.unsupportedTypes) {
    if (seenTypes.has(type.id)) errors.push(`${type.id} is listed as both supported and unsupported`);
    if (!listBookableDomains().some((domain) => domain.id === type.wouldNeed.domain)) {
      errors.push(`${type.id} would need unknown domain ${type.wouldNeed.domain}`);
    }
  }

  // Supply and demand are two lenses on one catalog, so they have to line up.
  // A rail no vendor can publish into stays empty, and a vendor answer that
  // reaches no rail publishes inventory nobody can find.
  for (const category of listDiscoverCategories({ includeVendorGated: true })) {
    if (!bookableTypesForDiscoverCategory(category.id).length) {
      errors.push(`discover rail ${category.id} cannot be published from the vendor console`);
    }
  }
  for (const type of input.bookableTypes) {
    if (!discoverCategoriesForBookableType(type.id).length) {
      errors.push(`bookable type ${type.id} surfaces in no discover rail`);
    }
  }

  const navIds = new Set<string>();
  for (const item of [...input.navigation.primary, ...input.navigation.secondary]) {
    if (navIds.has(item.id)) errors.push(`duplicate nav id ${item.id}`);
    navIds.add(item.id);
  }

  // Every business runs the same core loop, so the primary tabs must not
  // depend on business mode.
  for (const item of input.navigation.primary) {
    if (item.standardOnly) errors.push(`primary nav ${item.id} must not be standard-only`);
  }

  const owner: VendorViewer = { role: 'owner', businessMode: 'standard' };
  if (vendorPrimaryNav(owner).length !== input.navigation.primary.length) {
    errors.push('an owner must see every primary tab');
  }
  const door: VendorViewer = { role: 'door', businessMode: 'standard' };
  const doorIds = vendorSecondaryNav(door).map((item) => item.id);
  if (!doorIds.includes('scanner')) errors.push('door must reach the pass scanner');
  for (const forbidden of ['payouts', 'staff', 'business', 'locations']) {
    if (doorIds.includes(forbidden)) errors.push(`door must not reach ${forbidden}`);
  }
  const doorPrimary = vendorPrimaryNav(door).map((item) => item.id);
  for (const forbidden of ['earnings', 'demand', 'bookables']) {
    if (doorPrimary.includes(forbidden)) errors.push(`door must not reach ${forbidden}`);
  }

  if (input.createBookableSteps[0]?.id !== 'type') errors.push('the wizard must start by asking what is being sold');
  if (input.createBookableSteps[input.createBookableSteps.length - 1]?.id !== 'publish') {
    errors.push('the wizard must end at publish');
  }

  errors.push(...authContractErrors(input.auth));
  errors.push(...webhookUiContractErrors(input.webhookUi));
  errors.push(...onboardingContractErrors(input.onboarding));
  errors.push(...copyContractErrors(input.copy, input.model.chain));

  return errors;
}

/**
 * Requirements live in the shared catalog and steps live here, so the two can
 * drift apart in either direction. A requirement with no step is a wall with no
 * door: the business is told what is missing and given nowhere to supply it,
 * which is how a cottage seller ended up permanently unable to go live.
 */
function onboardingContractErrors(onboarding: VendorOnboardingContract): string[] {
  const errors: string[] = [];
  if (!onboarding) return ['the console must declare how a business gets set up'];

  const requirements = getBookableSeller().identity.requirements;
  const stepFor = new Map(onboarding.steps.map((step) => [step.requirement, step]));

  for (const requirement of requirements) {
    if (!stepFor.has(requirement.id)) {
      errors.push(`requirement ${requirement.id} blocks ${requirement.blocks} with no step that closes it`);
    }
  }
  for (const step of onboarding.steps) {
    if (!requirements.some((item) => item.id === step.requirement)) {
      errors.push(`onboarding step ${step.requirement} closes no requirement`);
    }
  }
  if (stepFor.size !== onboarding.steps.length) errors.push('two steps cannot close the same requirement');

  // The gate is not a tab, so it stays reachable in cottage mode where the tab
  // that owns the thing afterwards is hidden. A step whose only home were a
  // standard-only tab would be unreachable for exactly the businesses that have
  // the fewest other ways to fix it.
  const navById = new Map(
    [...VENDOR_CONSOLE.navigation.primary, ...VENDOR_CONSOLE.navigation.secondary].map((item) => [item.id, item]),
  );
  for (const step of onboarding.steps) {
    if (!step.managedIn) continue;
    if (!navById.has(step.managedIn)) errors.push(`step ${step.requirement} is managed in unknown tab ${step.managedIn}`);
    if (navById.get(step.managedIn)?.standardOnly && !step.cottageKind) {
      errors.push(`step ${step.requirement} is only managed in a standard-only tab and names no cottage default`);
    }
    if (step.cottageKind && !getLocationKind(step.cottageKind)) {
      errors.push(`step ${step.requirement} defaults to unknown location kind ${step.cottageKind}`);
    }
  }

  // Every state a console can be open in needs copy, or a business lands on a
  // gate with nothing written on it.
  for (const state of getBookableSeller().identity.consoleStates) {
    if (!onboarding.states.some((item) => item.state === state)) errors.push(`no onboarding copy for a ${state} business`);
  }
  for (const item of onboarding.states) {
    if (!sellerCanUseConsole(item.state)) errors.push(`${item.state} has onboarding copy but no console to show it in`);
  }

  // PENDING is the platform's turn. Offering a checklist there would invite a
  // vendor to fix something that is not what is holding them up.
  if (onboarding.states.find((item) => item.state === 'PENDING')?.checklist) {
    errors.push('a business under review has nothing to tick off');
  }

  return errors;
}

/**
 * The storage rules are the part worth checking mechanically. A token that ends
 * up in localStorage is readable by any injected script, and a persistable-key
 * allowlist is only worth having if something fails when it grows a token.
 */
function authContractErrors(auth: VendorAuthContract): string[] {
  const errors: string[] = [];
  if (!auth) return ['the console must declare an auth flow'];

  if (auth.token.accessStorage !== 'memory') errors.push('the access token must never leave memory');
  if (auth.token.refreshStorage !== 'httponly-cookie') errors.push('the refresh token must be httpOnly');
  if (auth.token.cookieSameSite !== 'Strict') errors.push('the refresh cookie must be SameSite=Strict');
  if (!auth.token.cookieSecure) errors.push('the refresh cookie must be Secure');

  for (const key of auth.persistableKeys) {
    if (/token|secret|code|password|key/i.test(key)) {
      errors.push(`${key} is persistable but reads like a credential`);
    }
  }

  // A short-lived access token is only short-lived if it is refreshed sooner.
  if (auth.token.refreshBeforeExpirySecs >= auth.token.accessTtlSecs) {
    errors.push('the refresh margin must be shorter than the access token itself');
  }
  if (auth.token.refreshTtlSecs <= auth.token.accessTtlSecs) {
    errors.push('a refresh token must outlive the access token it mints');
  }

  if (auth.code.maxAttempts < 1) errors.push('a code needs at least one attempt');
  if (auth.code.length < 6) errors.push('a one-time code shorter than six digits is guessable');
  if (auth.code.ttlSecs > 900) errors.push('a one-time code must not outlive its usefulness');

  // The flow has to end where the console begins, and pick a seat before it.
  if (auth.flow[0] !== 'email') errors.push('sign-in must start from an email');
  if (auth.flow[auth.flow.length - 1] !== 'console') errors.push('sign-in must end at the console');
  if (auth.flow.indexOf('seat') >= auth.flow.indexOf('console')) {
    errors.push('a seat must be chosen before the console opens');
  }
  for (const step of auth.flow) {
    if (!auth.steps.some((item) => item.id === step)) errors.push(`flow step ${step} has no screen`);
  }

  // An unknown email and a wrong code must be indistinguishable.
  for (const required of ['invalid-code', 'no-seats', 'expired-session'] as const) {
    if (!auth.refusals.some((item) => item.id === required)) errors.push(`missing refusal ${required}`);
  }
  const leaky = auth.refusals.find((item) => /no such|not found|unknown (email|account)/i.test(item.message));
  if (leaky) errors.push(`refusal ${leaky.id} reveals whether an account exists`);

  return errors;
}

function webhookUiContractErrors(ui: VendorWebhookUiContract): string[] {
  const errors: string[] = [];
  if (!ui) return ['the console must declare its webhook operations'];

  if (ui.urlScheme !== 'https') errors.push('a webhook receiver must be https');
  if (!ui.secretRevealedOnce) errors.push('a signing secret must be readable only once');

  // REGISTER is the only operation that creates the row, so it alone has no
  // prior state. Everything else must name the states it can move from.
  for (const operation of ui.operations) {
    if (operation.id === 'REGISTER') {
      if (operation.from.length) errors.push('REGISTER creates the endpoint, so it has no prior state');
    } else if (!operation.from.length) {
      errors.push(`${operation.id} must name the states it moves from`);
    }
  }
  // A disabled endpoint has to have a way back, or a bad afternoon is permanent.
  if (!ui.operations.some((operation) => operation.from.includes('DISABLED') && operation.to === 'ACTIVE')) {
    errors.push('a disabled endpoint must be recoverable');
  }

  return errors;
}
