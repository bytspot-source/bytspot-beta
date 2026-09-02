import {
  getBookableSeller,
  type BookableSellerRequirement,
} from '../utils/bookableTemplates.ts';
import { activeLocations, locationSetupBlockers, type VendorLocation } from './locations.ts';
import type { Seller } from './seller.ts';

/**
 * A payout destination, as far as this origin is ever allowed to know it.
 *
 * There is no account number here and there must never be one. Bank details
 * entered into this console would live in the DOM, in a devtools snapshot, in
 * any error report that serialises component state, and in the memory of a page
 * we also let vendors paste webhook URLs into. The processor's hosted flow
 * collects them; we are handed back a reference and a status we did not compute.
 * `last4` is display text the processor gives us, not a fragment we derived.
 */
export interface PayoutAccount {
  /** The processor's account reference. Opaque to us. */
  reference: string;
  status: 'pending' | 'active' | 'restricted';
  last4?: string;
  /** Why the processor is holding it, when it tells us. */
  detail?: string;
}

/** The writable half of a business. What the gate collects and the API stores. */
export interface VendorProfile {
  legalName?: string;
  contactEmail?: string;
  locations: VendorLocation[];
  payout?: PayoutAccount;
}

export const EMPTY_PROFILE: VendorProfile = { locations: [] };

/**
 * Only an active account can receive money. A pending one is the state a
 * processor parks an account in while it decides, so treating it as satisfied
 * would let a business go live and then fail to be paid.
 */
export function payoutIsUsable(payout?: PayoutAccount): boolean {
  return payout?.status === 'active';
}

/**
 * The one rule that decides whether a requirement is met, applied to the records
 * themselves.
 *
 * `satisfied` is derived here rather than appended to as forms are submitted,
 * because a stored list can disagree with the records it claims to summarise: a
 * business whose only location was closed would still be carrying the tick that
 * said it had one. Deriving means the tick disappears when the reason does.
 */
export function requirementIsMet(requirementId: string, profile: VendorProfile): boolean {
  if (requirementId === 'legalName') return Boolean(profile.legalName?.trim());
  if (requirementId === 'contactEmail') return isEmail(profile.contactEmail);
  if (requirementId === 'activeLocation') {
    return activeLocations(profile.locations).some((location) => locationSetupBlockers(location).length === 0);
  }
  if (requirementId === 'payoutAccount') return payoutIsUsable(profile.payout);
  // An unknown requirement is never quietly satisfied. assertVendorConsoleContract
  // rejects one with no step, so reaching here means the catalog moved.
  return false;
}

export function satisfiedRequirements(profile: VendorProfile): string[] {
  return getBookableSeller()
    .identity.requirements.filter((requirement) => requirementIsMet(requirement.id, profile))
    .map((requirement) => requirement.id);
}

/**
 * A seller whose `satisfied` list is recomputed from the records it holds. The
 * server sends its own list, and this is what keeps the console honest between
 * a write landing and the next refresh.
 */
export function reconcileSeller(seller: Seller, profile: VendorProfile): Seller {
  return { ...seller, satisfied: satisfiedRequirements(profile) };
}

export function unmetFor(profile: VendorProfile): BookableSellerRequirement[] {
  return getBookableSeller().identity.requirements.filter(
    (requirement) => !requirementIsMet(requirement.id, profile),
  );
}

/**
 * Deliberately permissive: this exists to catch a typo before a code is sent to
 * an address that cannot receive one, not to adjudicate RFC 5321. Anything
 * stricter rejects real addresses.
 */
function isEmail(value?: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 254;
}

export type ProfileEditRefusal = 'invalid' | 'incomplete';

export type ProfileEdit =
  | { field: 'legalName'; value: string }
  | { field: 'contactEmail'; value: string }
  | { field: 'location'; value: VendorLocation }
  | { field: 'payout'; value: PayoutAccount };

export type ProfileEditVerdict =
  | { ok: true; profile: VendorProfile; reason?: never; blockers?: never }
  | { ok: false; reason: ProfileEditRefusal; blockers: string[] };

/**
 * Validation happens before the write, not after, so a rejected edit never
 * reaches the API and never half-updates the profile in front of the vendor.
 */
export function applyProfileEdit(profile: VendorProfile, edit: ProfileEdit): ProfileEditVerdict {
  if (edit.field === 'legalName') {
    const value = edit.value.trim();
    if (!value) return { ok: false, reason: 'invalid', blockers: ['A business needs a name'] };
    return { ok: true, profile: { ...profile, legalName: value } };
  }

  if (edit.field === 'contactEmail') {
    const value = edit.value.trim();
    if (!isEmail(value)) return { ok: false, reason: 'invalid', blockers: ['That is not an address we can reach'] };
    return { ok: true, profile: { ...profile, contactEmail: value } };
  }

  if (edit.field === 'location') {
    const blockers = locationSetupBlockers(edit.value);
    if (blockers.length) return { ok: false, reason: 'incomplete', blockers };
    // Same id replaces rather than duplicates, so re-saving a location edits it.
    const rest = profile.locations.filter((item) => item.id !== edit.value.id);
    return { ok: true, profile: { ...profile, locations: [...rest, edit.value] } };
  }

  const payoutBlockers = payoutBlockersFor(edit.value);
  if (payoutBlockers.length) return { ok: false, reason: 'invalid', blockers: payoutBlockers };
  return { ok: true, profile: { ...profile, payout: edit.value } };
}

/**
 * A payout record we would refuse to hold. The bank-shaped check is the point:
 * if a raw account number ever arrives here, something upstream started
 * collecting one, and the right response is to refuse the write rather than to
 * store it and file a ticket.
 */
export function payoutBlockersFor(payout: PayoutAccount): string[] {
  const blockers: string[] = [];
  if (!payout.reference?.trim()) blockers.push('Needs a processor reference');
  if (payout.last4 && !/^\d{4}$/.test(payout.last4)) blockers.push('last4 must be exactly four digits');

  for (const [key, value] of Object.entries(payout as unknown as Record<string, unknown>)) {
    if (/account_?number|routing|iban|sort_?code|swift|bic|cvv|pan/i.test(key)) {
      blockers.push(`${key} must never reach this origin`);
    }
    // A long digit run in a field meant for a reference is a bank number that
    // took a wrong turn, whatever it happens to be called.
    if (key !== 'last4' && typeof value === 'string' && /\d{9,}/.test(value.replace(/[\s-]/g, ''))) {
      blockers.push(`${key} looks like a bank number`);
    }
  }
  return blockers;
}
