export type ProviderReviewStatus = 'approved' | 'manual_verification';

export type ProviderReviewState = {
  status: ProviderReviewStatus;
  label: 'Approved' | 'Pending Verification';
  reasons: string[];
  checks: {
    businessLegalName: boolean;
    taxId: boolean;
    verifiedAddress: boolean;
    stripeConnectActive: boolean;
  };
  updatedAt: string;
};

export type ProviderReviewInput = {
  businessInfo?: {
    legalName?: string;
    address?: { street?: string; city?: string; state?: string; zipCode?: string };
    taxId?: string;
  };
  listing?: {
    location?: { address?: string; coordinates?: { lat?: number; lng?: number } };
  };
  payout?: {
    stripeConnect?: { status?: string; onboardingStarted?: boolean };
  };
};

export type ProviderBackendStatus = 'draft' | 'pending' | 'approved' | 'rejected' | string | null | undefined;

export const PROVIDER_REVIEW_STORAGE_KEY = 'bytspot_provider_review_state';

function hasText(value: unknown, minLength = 2) {
  return typeof value === 'string' && value.trim().length >= minLength;
}

function hasValidTaxId(value: unknown) {
  if (typeof value !== 'string') return false;
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length === 9;
}

function hasValidAddress(data: ProviderReviewInput) {
  const address = data.businessInfo?.address;
  const coordinates = data.listing?.location?.coordinates;
  return Boolean(
    hasText(address?.street, 4) &&
    hasText(address?.city, 2) &&
    hasText(address?.state, 2) &&
    hasValidZip(address?.zipCode) &&
    hasText(data.listing?.location?.address, 4) &&
    Number.isFinite(coordinates?.lat) &&
    Number.isFinite(coordinates?.lng),
  );
}

function hasValidZip(value: unknown) {
  return typeof value === 'string' && /^[0-9]{5}(?:-[0-9]{4})?$/.test(value.trim());
}

export function evaluateProviderApplication(data: ProviderReviewInput, now = new Date()): ProviderReviewState {
  const checks = {
    businessLegalName: hasText(data.businessInfo?.legalName, 3),
    taxId: hasValidTaxId(data.businessInfo?.taxId),
    verifiedAddress: hasValidAddress(data),
    stripeConnectActive: data.payout?.stripeConnect?.status === 'active',
  };

  const reasons: string[] = [];
  if (!checks.businessLegalName) reasons.push('Business Legal Name is missing or too short.');
  if (!checks.taxId) reasons.push('Tax ID/EIN must contain 9 digits.');
  if (!checks.verifiedAddress) reasons.push('Business and listing address metadata must be complete and geocoded.');
  if (!checks.stripeConnectActive) reasons.push('Stripe Connect must be active before automatic approval.');

  const approved = Object.values(checks).every(Boolean);
  return {
    status: approved ? 'approved' : 'manual_verification',
    label: approved ? 'Approved' : 'Pending Verification',
    reasons,
    checks,
    updatedAt: now.toISOString(),
  };
}

export function resolveProviderReviewState(
  backendStatus: ProviderBackendStatus,
  data?: ProviderReviewInput | null,
  now = new Date(),
): ProviderReviewState {
  const metadataState = data
    ? evaluateProviderApplication(data, now)
    : {
        status: 'manual_verification' as const,
        label: 'Pending Verification' as const,
        reasons: ['Provider application metadata has not been loaded yet.'],
        checks: { businessLegalName: false, taxId: false, verifiedAddress: false, stripeConnectActive: false },
        updatedAt: now.toISOString(),
      };

  if (backendStatus === 'approved') {
    return { ...metadataState, status: 'approved', label: 'Approved', reasons: [], updatedAt: now.toISOString() };
  }
  if (backendStatus === 'rejected') {
    return {
      ...metadataState,
      status: 'manual_verification',
      label: 'Pending Verification',
      reasons: ['Backend provider approval status is rejected. Contact Bytspot support before publishing marketplace services.'],
      updatedAt: now.toISOString(),
    };
  }
  return metadataState;
}

export function persistProviderReviewState(state: ProviderReviewState) {
  localStorage.setItem(PROVIDER_REVIEW_STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem('bytspot_provider_operational_status', state.status);
  window.dispatchEvent(new CustomEvent('bytspot:provider-review-updated', { detail: state }));
}

export function readProviderReviewState(): ProviderReviewState | null {
  try {
    const raw = localStorage.getItem(PROVIDER_REVIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProviderReviewState;
    return parsed?.status === 'approved' || parsed?.status === 'manual_verification' ? parsed : null;
  } catch {
    return null;
  }
}