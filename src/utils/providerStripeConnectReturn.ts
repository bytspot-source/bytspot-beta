import { trpc } from './trpc';

export const PROVIDER_PAYOUT_DRAFT_STORAGE_KEY = 'bytspot_provider_payout_draft';

const STRIPE_CONNECT_RETURN_PATH = '/provider/connect/return';
const STRIPE_CONNECT_REFRESH_PATH = '/provider/connect/refresh';
const LEGACY_HOST_STRIPE_CONNECT_RETURN_PATH = '/host/connect/return';
const LEGACY_HOST_STRIPE_CONNECT_REFRESH_PATH = '/host/connect/refresh';
// Deprecated Host return aliases are supported during the Provider rollout.
// Remove after 2026-05-20 once external links have been updated.

type OnboardingRecord = Record<string, any>;
type SyncSource = 'stripe' | 'local_draft' | 'existing_payout' | 'none';

export function isProviderStripeConnectPath(path = typeof window !== 'undefined' ? window.location.pathname : '') {
  return path === STRIPE_CONNECT_RETURN_PATH ||
    path === STRIPE_CONNECT_REFRESH_PATH ||
    path === LEGACY_HOST_STRIPE_CONNECT_RETURN_PATH ||
    path === LEGACY_HOST_STRIPE_CONNECT_REFRESH_PATH;
}

function readStoredPayoutDraft() {
  try {
    const raw = localStorage.getItem(PROVIDER_PAYOUT_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function hasRequiredPayoutFields(payout: any) {
  const bank = payout?.bankAccount ?? {};
  return Boolean(
    String(bank.accountHolder ?? '').trim() &&
    String(bank.routingNumber ?? '').length === 9 &&
    String(bank.accountNumber ?? '').length >= 4,
  );
}

export async function syncProviderStripeConnectReturn(onboardingData: OnboardingRecord, currentStep = 1) {
  const existingPayout = onboardingData?.payout ?? null;
  const payoutDraft = readStoredPayoutDraft();
  let syncResult: any = null;
  let syncError: unknown = null;

  try {
    syncResult = await trpc.vendors.syncOnboarding.mutate();
  } catch (err) {
    syncError = err;
    // Keep the user moving with the locally saved payout draft; dashboard sync can retry later.
  }

  const vendor = syncResult?.vendor ?? null;
  const account = syncResult?.account ?? null;
  const basePayout = payoutDraft ?? existingPayout;
  const source: SyncSource = syncResult ? 'stripe' : payoutDraft ? 'local_draft' : existingPayout ? 'existing_payout' : 'none';
  if (!basePayout) return { onboardingData, currentStep, payoutUpdated: false, syncResult, syncError, source };

  const accountId = vendor?.stripeAccountId ?? account?.id ?? basePayout?.stripeConnect?.accountId;
  const active = vendor?.onboardingStatus === 'active' || Boolean(account?.chargesEnabled && account?.payoutsEnabled);
  const payout = {
    ...basePayout,
    stripeConnect: {
      ...basePayout?.stripeConnect,
      displayName: vendor?.displayName ?? basePayout?.stripeConnect?.displayName ?? 'Bytspot Provider',
      onboardingStarted: true,
      accountId,
      status: active ? 'active' : 'pending',
    },
  };
  const nextStep = hasRequiredPayoutFields(payout) ? Math.max(Number(currentStep) || 1, 9) : Math.max(Number(currentStep) || 1, 8);
  try {
    localStorage.setItem(PROVIDER_PAYOUT_DRAFT_STORAGE_KEY, JSON.stringify(payout));
  } catch {
    // Non-fatal: the merged onboarding payload is still returned to the caller.
  }
  return { onboardingData: { ...onboardingData, payout }, currentStep: nextStep, payoutUpdated: true, syncResult, syncError, source };
}