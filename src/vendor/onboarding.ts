import {
  getBookableSeller,
  sellerCanPublish,
  type BookableSellerOperationId,
  type BookableSellerRequirement,
  type BookableSellerState,
} from '../utils/bookableTemplates.ts';
import { moveSeller, sessionCan, type SellerMoveVerdict, type Seller, type VendorSession } from './seller.ts';
import { vendorOnboardingContract, type VendorOnboardingStep } from './vendorConsole.ts';

/**
 * A requirement paired with the step that closes it and whether it is met.
 * Nothing here is stored: the same rule that keeps a slot's state derived keeps
 * setup derived, so a business cannot be ninety percent onboarded and also
 * missing its payout account.
 */
export interface OnboardingItem {
  requirement: BookableSellerRequirement;
  step: VendorOnboardingStep;
  /** The state this requirement holds the business out of. */
  blocks: BookableSellerState;
  done: boolean;
}

/**
 * Steps are ordered by where the state they block sits in the lifecycle, so the
 * things that gate the earlier transition come first. Inserting a state into the
 * catalog reorders the wizard without this file changing.
 */
function lifecycleRank(state: BookableSellerState): number {
  const index = getBookableSeller().identity.states.indexOf(state);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

export function onboardingItems(seller: Seller): OnboardingItem[] {
  const met = new Set(seller.satisfied);
  const steps = vendorOnboardingContract().steps;

  return getBookableSeller()
    .identity.requirements.map((requirement) => {
      const step = steps.find((item) => item.requirement === requirement.id);
      // assertVendorConsoleContract rejects a requirement with no step, so this
      // is unreachable rather than merely unlikely.
      if (!step) return undefined;
      return { requirement, step, blocks: requirement.blocks, done: met.has(requirement.id) };
    })
    .filter((item): item is OnboardingItem => Boolean(item))
    .sort((a, b) => lifecycleRank(a.blocks) - lifecycleRank(b.blocks));
}

export function onboardingProgress(seller: Seller): { done: number; total: number } {
  const items = onboardingItems(seller);
  return { done: items.filter((item) => item.done).length, total: items.length };
}

/** The first thing still in the way, or nothing if the business is complete. */
export function nextOnboardingItem(seller: Seller): OnboardingItem | undefined {
  return onboardingItems(seller).find((item) => !item.done);
}

/**
 * What the gate should say. This is a view of the seller's own state rather than
 * a state of its own, which is why there is no transition table here: adding one
 * would create a second machine that could disagree with the first.
 */
export type OnboardingStage =
  | 'checklist'
  | 'ready-to-submit'
  | 'awaiting-review'
  | 'live'
  | 'paused';

export function onboardingStage(seller: Seller): OnboardingStage {
  if (seller.state === 'PENDING') return 'awaiting-review';
  if (seller.state === 'SUSPENDED') return 'paused';

  const outstanding = onboardingItems(seller).filter((item) => !item.done);
  if (outstanding.length === 0) return 'live';
  // Everything that gates review is done, so the business can move even though
  // later requirements are still open.
  if (!outstanding.some((item) => item.blocks === 'PENDING')) {
    return seller.state === 'DRAFT' ? 'ready-to-submit' : 'checklist';
  }
  return 'checklist';
}

/**
 * A live business with an unmet requirement is not "onboarding", but it is also
 * not finished, and the gap is worth saying out loud: the alternative is a
 * publish that quietly fails.
 */
export function shouldShowOnboarding(seller: Seller): boolean {
  if (seller.state === 'DRAFT' || seller.state === 'PENDING') return true;
  return onboardingItems(seller).some((item) => !item.done);
}

export function onboardingCopy(state: BookableSellerState) {
  return vendorOnboardingContract().states.find((item) => item.state === state);
}

/**
 * Whether the gate is the whole console rather than a notice above it.
 *
 * Derived from what the business's state still allows rather than from a list of
 * state names: a business that can only SCHEDULE has no guests to admit and no
 * money to read, so every tab behind the gate would describe something it cannot
 * do. A suspended business keeps its console because it can still admit people
 * who already paid, which is exactly the distinction stateCapabilities draws.
 */
export function gateReplacesConsole(seller: Seller): boolean {
  const allowed =
    getBookableSeller().identity.stateCapabilities.find((row) => row.state === seller.state)?.allows ?? [];
  return !allowed.some((capability) => capability !== 'SCHEDULE');
}

/**
 * Approval only lands on a business that has met the requirements for being
 * live, so submitting with those still open is legal but leaves the vendor
 * waiting on something they have to supply themselves. Saying so while they are
 * still in DRAFT is the only useful moment.
 */
export function willStallAfterApproval(seller: Seller): BookableSellerRequirement[] {
  return onboardingItems(seller)
    .filter((item) => !item.done && sellerCanPublish(item.blocks))
    .map((item) => item.requirement);
}

export type OnboardingActionId = Extract<BookableSellerOperationId, 'SUBMIT_SELLER' | 'WITHDRAW_SELLER'>;

export interface OnboardingAction {
  id: OnboardingActionId;
  label: string;
  verdict: SellerMoveVerdict;
}

/**
 * The actions the gate can offer, each already carrying the verdict rather than
 * a boolean. A refused action is still returned so the screen can explain the
 * refusal instead of hiding a button and leaving the vendor guessing.
 */
export function onboardingActions(session: VendorSession): OnboardingAction[] {
  return getBookableSeller()
    .identity.operations.filter(
      (operation): operation is typeof operation & { id: OnboardingActionId } =>
        operation.id === 'SUBMIT_SELLER' || operation.id === 'WITHDRAW_SELLER',
    )
    .filter((operation) => operation.from.includes(session.seller.state))
    .map((operation) => ({ id: operation.id, label: operation.label, verdict: moveSeller(session, operation.id) }));
}

/**
 * Whether this seat can do anything about the gap at all. A manager sees the
 * same checklist and can fix nothing on it, so the screen has to be able to say
 * that rather than offering buttons that always refuse.
 */
export function canAdvanceOnboarding(session: VendorSession): boolean {
  const { requiresRole } = getBookableSeller().identity.operations.find((item) => item.id === 'SUBMIT_SELLER') ?? {};
  return requiresRole ? session.seat.role === requiresRole : sessionCan(session, 'SELL');
}
